from datetime import datetime
from pathlib import Path
from Hierarchy.cell import Cell
from elements.jj import JJElement
from elements.bias_ib import BiasIBElement
from elements.inductor import InductorElement
from elements.resistor import ResistorElement
from Hierarchy.circuit import Circuit
from Hierarchy.node import Node
import ast
import operator
import re

# Class description: 
# This class is responsible for parsing CDL files and constructing the circuit hierarchy.


class CDLParser:
    """
    Parser CDL strict :
    - tout ce qui est entre .subckt et .ends
      DOIT être JJ / ib / L / R
    """

    def __init__(self):
        self.current_cell = None
        self.TOP = None
        self.is_a_cell = False
        
    def _compute_value(self, raw_value, target_suffix=None):
        expression = str(raw_value).strip().strip("'\"").lower()
        scales = {"t": 1e12, "g": 1e9, "meg": 1e6, "k": 1e3, "m": 1e-3, "u": 1e-6, "n": 1e-9, "p": 1e-12, "f": 1e-15}
        target_scale = scales.get(target_suffix, 1.0)
        pattern = re.compile(r"(?<![a-z0-9_.])((?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(meg|[tgkmunpf])(?![a-z])", re.I)
        expression = pattern.sub(lambda match: str(float(match.group(1)) * scales[match.group(2).lower()] / target_scale), expression)

        operators = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv, ast.Pow: operator.pow, ast.USub: operator.neg, ast.UAdd: operator.pos}

        def evaluate(node):
            if isinstance(node, ast.Expression):
                return evaluate(node.body)
            if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
                return float(node.value)
            if isinstance(node, ast.BinOp) and type(node.op) in operators:
                return operators[type(node.op)](evaluate(node.left), evaluate(node.right))
            if isinstance(node, ast.UnaryOp) and type(node.op) in operators:
                return operators[type(node.op)](evaluate(node.operand))
            raise ValueError(f"Unsupported numeric expression: {raw_value}")

        try:
            return evaluate(ast.parse(expression, mode="eval"))
        except (SyntaxError, ValueError, ZeroDivisionError) as error:
            raise ValueError(f"Invalid SPICE value '{raw_value}'") from error

    @staticmethod
    def _get_x_model_index(tokens):
        for index in range(len(tokens) - 1, 0, -1):
            token = tokens[index].strip()
            if "=" not in token and token.lower() != "params:":
                return index
        raise ValueError(f"Unable to determine model from: {' '.join(tokens)}")
        
    def _handle_subckt(self, line, line_number):
        tokens = line.split()
        cell_name = tokens[1]
        ports = tokens[2:]

        self.TOP = cell_name
        self.current_cell = Cell(name=cell_name)
        self.current_cell.lines.append(line_number)

        # Preserve the exact ports declared after the .subckt name.
        self.current_cell.port_names = ports.copy()

        for port_name in ports:
            self.current_cell.add_port_net(port_name)
    
    def _handle_ends(self, new_circuit, line_number):
        self.current_cell.lines.append(line_number)
        new_circuit.add_cell(self.current_cell)
        self.current_cell= None
        
    def _handle_xi(self, head, tokens, filename, new_circuit, line_number):
        model_index = self._get_x_model_index(tokens)
        model, nets = tokens[model_index], tokens[1:model_index]
        model_cell = new_circuit.get_cell(model)

        if model_cell is None:
            raise ValueError(f"[line {line_number}] Unknown subcircuit model: {model}")

        parent_nodes = [self.current_cell.get_node(net, []) for net in nets]
        added_cell = Cell(model)
        added_cell.rebuild(filename, model_cell.lines, new_circuit, nets, parent_nodes)
        added_cell.name, added_cell.raw_name = head[1:], head
        self.current_cell.add_cell_instance(added_cell)
    
    def _handle_xsjj(self, head, tokens, line_number):
        if len(tokens) < 4:
            raise ValueError(f"[line {line_number}] Invalid JJ: {' '.join(tokens)}")

        name = head[3:] if head.lower().startswith("xsj") else head[1:]
        raw_value = self._get_parameter_value(tokens, {"ics", "ic"})
        ic = 100.0 if raw_value is None else self._compute_value(raw_value, "u")
        

        element = JJElement(name, None, None, ic)
        element.raw_name = head
        self.current_cell.add_element(element, tokens[1], tokens[2], [])
    
    def _handle_xpcib(self, head, tokens, line_number):
        if len(tokens) < 5:
            raise ValueError(f"[line {line_number}] Invalid pwrcell: {' '.join(tokens)}")

        name = head[3:] if head.lower().startswith("xpc") else head[1:]
        raw_value = self._get_parameter_value(tokens, {"ib"})

        if raw_value is None:
            raise ValueError(f"[line {line_number}] pwrcell without ib=")

        element = BiasIBElement(name, None, None, self._compute_value(raw_value, "u"))
        element.raw_name = head
        self.current_cell.add_element(element, tokens[2], tokens[3], [])

    def _handle_ll(self, head, tokens, line_number):
        if len(tokens) < 4:
            raise ValueError(f"[line {line_number}] Invalid inductor: {' '.join(tokens)}")

        raw_value = self._get_parameter_value(tokens, {"l"})
        if raw_value is None:
            raise ValueError(f"[line {line_number}] Inductor without l=")

        element = InductorElement(head[1:], None, None, self._compute_value(raw_value, "p"))
        element.raw_name = head
        self.current_cell.add_element(element, tokens[1], tokens[2], [])
    
    def _handle_r(self, head, tokens, line_number):
        if len(tokens) < 4:
            raise ValueError(f"[line {line_number}] Invalid resistor: {' '.join(tokens)}")

        raw_value = self._get_parameter_value(tokens[3:], {"r"})

        if raw_value is None:
            raw_value = tokens[-1]
            if "=" in raw_value or raw_value.lower() == "res":
                raise ValueError(f"[line {line_number}] Resistor without r=")

        element = ResistorElement(head[1:], None, None, self._compute_value(raw_value))
        element.raw_name = head
        self.current_cell.add_element(element, tokens[1], tokens[2], [])
        
    def create_or_update_xi(self, xi_path, cir_path, gds_path, cell_name):
        xi_path = Path(xi_path)
        cir_name = Path(cir_path).name
        gds_name = Path(gds_path).name
        last_mod = datetime.now().strftime("%d %B %Y")

        content = f"""* IXI File for InductEx example - resistance:rsfq_dcsfq_res
    * RSFQ DC-SFQ circuit with resistance
    * Authors: L Schindler
    * Last mod: {last_mod}
    *******************************************************
    * ----------------------------------------------
    * COMMAND FOR MODEL/SIMULATION CONTROL
    * ----------------------------------------------
    $COMMAND
    MeshFile     "BIG_Cell.msh"
    MeshType     Tetra
    Mode         MQS
    Netlist      "{cir_name}"
    Plot         [ J ]
    Process      "..\\seeqc_v8.ldf"
    Fidelity     High
    Cores        8
    $END

    * ----------------------------------------------
    * MAIN (TOP-LEVEL) STRUCTURE
    * ----------------------------------------------
    $STRUCT
    Name    "{cell_name}"
    $GDS
        Name  "{gds_name}"
    $END
    $END
    """

        xi_path.write_text(content, encoding="utf-8")

        print("XI file:", xi_path.resolve())
        print("  CIR:", cir_name)
        print("  GDS:", gds_name)

        return xi_path
    
    def _instructor(self, head, tokens, filename, new_circuit, line_number):
        head_lower = head.lower()

        if head_lower.startswith("x"):
            model = tokens[self._get_x_model_index(tokens)].lower()

            if head_lower.startswith("xsj") or model in {"jj", "jj_s"}:
                self._handle_xsjj(head, tokens, line_number)
            elif head_lower.startswith("xpc") or model == "pwrcell":
                self._handle_xpcib(head, tokens, line_number)
            else:
                self._handle_xi(head, tokens, filename, new_circuit, line_number)
            return True

        if head_lower.startswith("l"):
            self._handle_ll(head, tokens, line_number)
            return True

        if head_lower.startswith("r"):
            self._handle_r(head, tokens, line_number)
            return True

        return False

    def _iter_logical_lines(self, filename):
        pending_line = pending_number = None

        with open(filename, "r", encoding="utf-8") as file:
            for line_number, raw_line in enumerate(file, start=1):
                line = raw_line.strip()
                if not line:
                    continue

                if line.startswith("+") and pending_line is not None:
                    pending_line += " " + line[1:].strip()
                    continue

                if pending_line is not None:
                    yield pending_number, pending_line

                pending_line, pending_number = line, line_number

        if pending_line is not None:
            yield pending_number, pending_line

    def parse(self, filename: str):
        new_circuit = Circuit()
        self.current_cell, self.TOP, self.is_a_cell = None, None, False

        for line_number, line in self._iter_logical_lines(filename):
            lower_line = line.lower()

            if lower_line.startswith(".subckt"):
                self._handle_subckt(line, line_number)
                continue

            if lower_line.startswith(".ends"):
                if self.current_cell is None:
                    raise ValueError(f"[line {line_number}] .ends without .subckt")
                self._handle_ends(new_circuit, line_number)
                continue

            if self.current_cell is None or line.startswith("*") or line.startswith("."):
                continue

            line = re.split(r"\s+\$", line, maxsplit=1)[0].strip()
            if not line:
                continue

            tokens = line.split()
            if not self._instructor(tokens[0], tokens, filename, new_circuit, line_number):
                raise ValueError(f"[line {line_number}] Unsupported component: {line}")

        if self.current_cell is not None:
            raise ValueError(f"Subcircuit '{self.current_cell.name}' has no .ends")
        if self.TOP is None:
            raise ValueError(f"No .subckt found in {filename}")

        new_circuit.define_top(self.TOP)
        return new_circuit

    def _format_lines(self, filename, buffer_values):
        with open(filename, "r") as f:
            for raw_line in f:
                line = raw_line.strip()

                if not line:
                    continue

                # Only component lines
                if not re.match(r"^[LRJ][A-Z0-9\-]+", line):
                    continue

                parts = line.split()
                name = parts[0]
                design, extracted, absdiff, percdiff = parts[1:]

                # Case: L8--P4
                if "--" in name:
                    l_name, p_name = name.split("--")
                    line = f"{l_name} {design} {extracted} {absdiff} {percdiff}"

                    buffer_values.append(
                        line.split()
                    )
                    line = f"L{p_name} 0 0{absdiff} {percdiff}"
                    buffer_values.append(
                        line.split()
                    )
                else:
                    buffer_values.append(line.split())
    
    def _extract_lj(self, circuit, b_value):
        where = circuit.findElement(circuit.TOP,b_value[0][1:])
        where.addIndParas(b_value[2])
        
    def _extract_j(self, circuit, b_value):
        where = circuit.findElement(circuit.TOP,b_value[0])
        where.addJJReal(b_value[2])
        
    def _extract_lrs(self, circuit, b_value):
        m = re.search(r"LRS(\d+)", b_value[0])
        value = int(m.group(1))
        where = circuit.findElement(circuit.TOP,"J"+str(value))
        where.addJJIndParral(b_value[2])
    
    def _extract_rs(self, circuit, b_value):
        where = circuit.findElement(circuit.TOP,"J"+b_value[0][2:])
        where.addJJRParral(b_value[2])
    
    def _extract_lp(self, circuit, b_value):
        where = circuit.findElement(circuit.TOP,"J"+b_value[0][2:])
        where.addJJLp(b_value[2])
    
    def _extract_r(self, circuit, b_value):
        where = circuit.findElement(circuit.TOP,b_value[0])
        where.addRealR(b_value[2])
    
    def _extract_l(self, circuit, b_value):
        where = circuit.findElement(circuit.TOP,b_value[0])
        where.addRealL(b_value[2])
    
    def _extract_rib(self, circuit, b_value):
        where = circuit.findElement(circuit.TOP,b_value[0][1:])
        where.addRealib(b_value[2])
    
    def _extract_lib(self, circuit, b_value):
        where = circuit.findElement(circuit.TOP,b_value[0][1:])
        where.addRealLib(b_value[2])
        
    def _extract_jj_values(self, circuit, buffer_values):
        for b_value in buffer_values:
            if b_value[0].startswith("LJ"):
                    self._extract_lj(circuit, b_value)
                    continue
            if b_value[0].startswith("J"):
                self._extract_j(circuit, b_value)
                continue
            if b_value[0].startswith("LRS"):
                self._extract_lrs(circuit, b_value)
                continue
            if b_value[0].startswith("RS"):
                self._extract_rs(circuit, b_value)
                continue
            if b_value[0].startswith("LP"):
                self._extract_lp(circuit, b_value)
                
        ind = b_value[0][1] 
        return ind
    
    def _extract_rib_values(self, circuit, buffer_values, ind):
        for b_value in buffer_values:
        #################### R extracted Values ################
            if b_value[0].startswith("R") and ind.isdigit():
                self._extract_r(circuit, b_value)
                continue
            #################### Ind extracted Values ################
            if b_value[0].startswith("L") and ind.isdigit():
                self._extract_l(circuit, b_value)
                continue
            #################### Bias extracted Values ################
            if b_value[0].startswith("Rib"):
                self._extract_rib(circuit, b_value)
                continue
            if b_value[0].startswith("Lib"):
                self._extract_lib(circuit, b_value)
        
    def _format_b_values(self, circuit, buffer_values):
        ind = self._extract_jj_values(circuit, buffer_values)
        self._extract_rib_values(circuit, buffer_values, ind)
    
    def parsesol(self, filename: str, circuit):

        buffer_values = []
        self._format_lines(filename, buffer_values)
        
        for i in buffer_values: 
            print(i)

        self._format_b_values(circuit, buffer_values)
        
    @staticmethod
    def _get_parameter_value(
        tokens,
        parameter_names,
    ):
        normalized_names = {
            str(name).lower()
            for name in parameter_names
        }

        for token in tokens:
            token = token.strip()

            if "=" not in token:
                continue

            parameter, value = token.split(
                "=",
                1,
            )

            if (
                parameter.strip().lower()
                in normalized_names
            ):
                return value.strip()

        return None
                
    def circuit_to_schematic_data(self, circuit):
        elements = []
        nodes = []
        node_seen = set()

        def node_name(node):
            if hasattr(node, "name"):
                return node.name
            return str(node)

        def add_node(name):
            if name not in node_seen:
                node_seen.add(name)
                nodes.append({
                    "id": name,
                    "label": name,
                })

        def get_element_value(inst):

            spice_value = getattr(
                inst,
                "spice_value",
                None,
            )

            if spice_value is not None:
                return str(
                    spice_value
                )

            if hasattr(inst, "Ic"):
                return str(inst.Ic)

            if hasattr(inst, "Ib"):
                return str(inst.Ib)

            if hasattr(inst, "L"):
                return str(inst.L)

            if hasattr(inst, "R"):
                return str(inst.R)

            return None

        def get_image(inst):
            inst_type = getattr(inst, "type", "")

            if inst_type == "JJ":
                return "../img/jj_draw.png"
            if inst_type == "IB":
                return "../img/biais_draw.png"
            if inst_type == "L":
                return "../img/ind_draw.png"
            if inst_type == "R":
                return "../img/res_draw.png"

            return ""

        def walk(cell):
            for inst in cell.instances:

                # Sub-cell
                if hasattr(inst, "instances"):
                    walk(inst)
                    continue

                # Base element
                if not hasattr(inst, "net_in") or not hasattr(inst, "net_out"):
                    continue

                net_in = node_name(inst.net_in)
                net_out = node_name(inst.net_out)

                add_node(net_in)
                add_node(net_out)

                raw_name = getattr(inst, "raw_name", inst.name)

                elements.append({
                    "id": raw_name,
                    "type": getattr(inst, "type", ""),
                    "label": raw_name,
                    "net_in": net_in,
                    "net_out": net_out,
                    "value": get_element_value(inst),
                    "image": get_image(inst),
                })

        walk(circuit.TOP)

        return {
            "name": circuit.TOP.name,
            "nodes": nodes,
            "elements": elements,
        }
            