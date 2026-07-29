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
        
    def _compute_value(self, raw_value):
        expression = str(raw_value).strip().strip("'\"")

        operators = {
            ast.Add: operator.add,
            ast.Sub: operator.sub,
            ast.Mult: operator.mul,
            ast.Div: operator.truediv,
            ast.Pow: operator.pow,
            ast.USub: operator.neg,
            ast.UAdd: operator.pos,
        }

        def evaluate(node):
            if isinstance(node, ast.Expression):
                return evaluate(node.body)

            if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
                return float(node.value)

            if isinstance(node, ast.BinOp) and type(node.op) in operators:
                return operators[type(node.op)](
                    evaluate(node.left),
                    evaluate(node.right),
                )

            if isinstance(node, ast.UnaryOp) and type(node.op) in operators:
                return operators[type(node.op)](
                    evaluate(node.operand)
                )

            raise ValueError(f"Unsupported numeric expression: {raw_value}")

        return evaluate(ast.parse(expression, mode="eval"))
        
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
        
    def _handle_xi(self, head, tokens, filename, new_circuit):
        model = tokens[-1]                    # 'JTL'
        nets = tokens[1:-1]
        list_node_to_send_down = []
        for i in nets: 
            list_node_to_send_down.append(self.current_cell.get_node(i,[]))
        added_cell = Cell(model)
        added_cell.rebuild(filename,new_circuit.get_cell(model).lines,new_circuit,nets,list_node_to_send_down)
        added_cell.name = head[1:]
        added_cell.raw_name = head
        self.current_cell.add_cell_instance(added_cell)
    
    def _handle_xsjj(self, head, tokens):
        name = re.sub(r"^xsj", "", head, flags=re.I)
        net_in = tokens[1]
        net_out = tokens[2]

        ic = 100.0
        raw_value = None

        for token in tokens:
            if token.lower().startswith("ics="):
                raw_value = token.split("=", 1)[1].strip().strip("'\"")
                break

        if raw_value is None:
            ic = 100.0
        else:
            expression = raw_value.lower().replace("u", "")
            ic = self._compute_value(expression)
        
        element = JJElement(name, None, None, ic)
        element.raw_name = head
        self.current_cell.add_element(element, net_in, net_out, [])
    
    def _handle_xpcib(self, head, tokens, line_number):
        name = head
        if "|" in head:
            name = head.split("|")[-1]
        name = re.sub(r"^xpc", "", name, flags=re.I)

        net_in = tokens[2]
        net_out = tokens[3]

        raw_value = None

        for token in tokens:
            if token.lower().startswith("ib="):
                raw_value = token.split("=", 1)[1].strip().strip("'\"")
                break

        if raw_value is None:
            raise ValueError(f"[ligne {line_number}] ib sans ib=")

        expression = raw_value.lower().replace("u", "")
        ib = self._compute_value(expression)


        element = BiasIBElement(name, None, None, ib)
        element.raw_name = head
        self.current_cell.add_element(element, net_in, net_out, [])
    def _handle_ll(self, head, tokens, line_number):
        name = head[1:]
        net_p = tokens[1]
        net_n = tokens[2]

        raw_value = None
        for token in tokens:
            if token.lower().startswith("l="):
                raw_value = token.split("=", 1)[1].strip().strip("'\"")
                break

        if raw_value is None:
            raise ValueError(
                f"[ligne {line_number}] Inductance sans L="
            )

        expression = raw_value.lower().replace("p", "").replace("n", "")
        lval = self._compute_value(expression)

        element = InductorElement(name, None, None, lval)
        element.raw_name = head
        self.current_cell.add_element(element, net_p, net_n, [])
    
    def _handle_r(self, head, tokens):
        name = head[1:]
        net_p = tokens[1]
        net_n = tokens[2]

        raw_value = None
        for token in tokens[3:]:
            if token.lower().startswith("r="):
                raw_value = token.split("=", 1)[1]
                break

        if raw_value is None:
            raw_value = tokens[-1]

        rval = self._compute_value(raw_value)

        element = ResistorElement(name, None, None, rval)
        element.raw_name = head
        self.current_cell.add_element(element, net_p, net_n, [])
    
    def _instructor(self, head, tokens, filename, new_circuit, line_number):
        if head.lower().startswith("xi"):
            self._handle_xi(head, tokens, filename, new_circuit)
                # ===== JJ =====
        if head.lower().startswith("xsj"):
            self._handle_xsjj(head, tokens)

                # ===== ib =====
        elif head.lower().startswith("xpcib") or (head.lower().startswith("xpc") and "|ib" in head.lower()):
            self._handle_xpcib(head, tokens, line_number)

                # ===== Inductance =====
        elif head.lower().startswith("l"):
            self._handle_ll(head, tokens, line_number)

                # ===== Résistance =====
        elif head.lower().startswith("r"):
            self._handle_r(head, tokens)
        

    def parse(self, filename: str):
        new_circuit = Circuit()

        with open(filename, "r") as f:
            for lineno, raw in enumerate(f, start=1):
                line = raw.strip()

                # Ignorer lignes vides globalement
                if not line:
                    continue

                low = line.lower()

                # ---------------------------
                # Début de cellule
                # ---------------------------
                if low.startswith(".subckt"):
                    self._handle_subckt(line, lineno)

                    continue

                # ---------------------------
                # Fin de cellule
                # ---------------------------
                if low.startswith(".ends"):
                    self._handle_ends(new_circuit, lineno)
                    continue

                # ---------------------------
                # PININFO (accepté, ignoré)
                # ---------------------------
                if line.startswith("*.PININFO"):
                    continue

                # ---------------------------
                # Parsing des éléments
                # ---------------------------
                tokens = line.split()
                head = tokens[0]

                
                # ===========================
                # INSTANCIATION DE CELLULE (XI…)
                # ===========================
                self._instructor(head, tokens, filename, new_circuit, lineno)
                
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
            