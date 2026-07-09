import re

from Hierarchy.cell import Cell
from elements.jj import JJElement
from elements.bias_ib import BiasIBElement
from elements.inductor import InductorElement
from elements.resistor import ResistorElement
from Hierarchy.circuit import Circuit
from Hierarchy.node import Node

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
        
    def _handle_subckt(self, line, line_number):
        tokens = line.split()
        cell_name = tokens[1]
        ports = tokens[2:]
        self.TOP = cell_name
        self.current_cell = Cell(name=cell_name)
        self.current_cell.lines.append(line_number)
        
        for p in ports:
            self.current_cell.add_port_net(p)
    
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
        self.current_cell.add_cell_instance(added_cell)
    
    def _handle_xsjj(self, head, tokens):
        name = re.sub(r"^xsj", "", head, flags=re.I)
        net_in = tokens[1]
        net_out = tokens[2]

        ic = 100.0
        for t in tokens:
            if t.lower().startswith(("ic=", "ics=")):
                ic = float(t.split("=", 1)[1].replace("u", ""))
                break
        
        self.current_cell.add_element(
            JJElement(name, None, None, ic),net_in,net_out,[]
        )
    
    def _handle_xpcib(self, head, tokens, line_number):
        name = re.sub(r"^xpc", "", head, flags=re.I)
        net_in = tokens[2]
        net_out = tokens[3]

        ib = None
        for t in tokens:
            if t.lower().startswith("ib="):
                ib = float(t.split("=", 1)[1].replace("u", ""))
                break

        if ib is None:
            raise ValueError(
                f"[ligne {line_number}] ib sans ib="
            )

        self.current_cell.add_element(
            BiasIBElement(name, None, None ,ib),net_in,net_out,[]
        )
    def _handle_ll(self, head, tokens, line_number):
        name = head[1:]
        net_p = tokens[1]
        net_n = tokens[2]

        lval = None
        for t in tokens:
            if t.lower().startswith("l="):
                lval = float(
                    t.split("=", 1)[1]
                    .replace("p", "")
                    .replace("n", "")
                )
                break

        if lval is None:
            raise ValueError(
                f"[ligne {line_number}] Inductance sans L="
            )

        self.current_cell.add_element(
            InductorElement(name, None, None, lval),net_p,net_n,[]
        )
    
    def _handle_r(self, head, tokens):
        name = head[1:]
        net_p = tokens[1]
        net_n = tokens[2]

        rval = None
        for t in tokens[3:]:
            if t.lower().startswith("r="):
                rval = float(t.split("=", 1)[1])
                break

        if rval is None:
            rval = float(tokens[-1])

        self.current_cell.add_element(
            ResistorElement(name, None, None, rval),net_p,net_n,[]
        )
    
    def _instructor(self, head, tokens, filename, new_circuit, line_number):
        if head.lower().startswith("xi"):
            self._handle_xi(head, tokens, filename, new_circuit)
                # ===== JJ =====
        if head.lower().startswith("xsjj"):
            self._handle_xsjj(head, tokens)

                # ===== ib =====
        elif head.lower().startswith("xpcib"):
            self._handle_xpcib(head, tokens, line_number)

                # ===== Inductance =====
        elif head.lower().startswith("ll"):
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
                
            
            







