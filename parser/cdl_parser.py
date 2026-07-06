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
      DOIT être JJ / IB / L / R
    """

    def __init__(self):
        self.current_cell = None
        self.TOP = None
        self.is_a_cell = False


    def parse(self, filename: str):
        NewCircuit = Circuit()

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

                    tokens = line.split()
                    cell_name = tokens[1]
                    ports = tokens[2:]
                    self.TOP = cell_name
                    self.current_cell = Cell(name=cell_name)
                    self.current_cell.lines.append(lineno)
                    
                    for p in ports:
                        self.current_cell.add_port_net(p)

                    continue

                # ---------------------------
                # Fin de cellule
                # ---------------------------
                if low.startswith(".ends"):
                    self.current_cell.lines.append(lineno)
                    NewCircuit.add_cell(self.current_cell)
                    self.current_cell= None
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
                if head.lower().startswith("xi"):
                    model = tokens[-1]                    # 'JTL'
                    nets = tokens[1:-1]
                    ListNodeToSendDown = []
                    for i in nets: 
                        ListNodeToSendDown.append(self.current_cell.get_node(i,[]))
                    addedCell = Cell(model)
                    addedCell.rebuild(filename,NewCircuit.get_cell(model).lines,NewCircuit,nets,ListNodeToSendDown)
                    addedCell.name = head[1:]
                    self.current_cell.add_cell_instance(addedCell)
                    continue


                                # ===== JJ =====
                if head.lower().startswith("xsjj"):
                    name = re.sub(r"^xsj", "", head, flags=re.I)
                    net_in = tokens[1]
                    net_out = tokens[2]

                    Ic = 100.0
                    for t in tokens:
                        if t.lower().startswith(("ic=", "ics=")):
                            Ic = float(t.split("=", 1)[1].replace("u", ""))
                            break
                    
                    self.current_cell.add_element(
                        JJElement(name, None, None, Ic),net_in,net_out,[]
                    )


                # ===== IB =====
                elif head.lower().startswith("xpcib"):
                    name = re.sub(r"^xpc", "", head, flags=re.I)
                    net_in = tokens[2]
                    net_out = tokens[3]

                    Ib = None
                    for t in tokens:
                        if t.lower().startswith("ib="):
                            Ib = float(t.split("=", 1)[1].replace("u", ""))
                            break

                    if Ib is None:
                        raise ValueError(
                            f"[ligne {lineno}] IB sans ib="
                        )

                    self.current_cell.add_element(
                        BiasIBElement(name, None, None ,Ib),net_in,net_out,[]
                    )

                # ===== Inductance =====
                elif head.lower().startswith("ll"):
                    name = head[1:]
                    net_p = tokens[1]
                    net_n = tokens[2]

                    Lval = None
                    for t in tokens:
                        if t.lower().startswith("l="):
                            Lval = float(
                                t.split("=", 1)[1]
                                .replace("p", "")
                                .replace("n", "")
                            )
                            break

                    if Lval is None:
                        raise ValueError(
                            f"[ligne {lineno}] Inductance sans L="
                        )

                    self.current_cell.add_element(
                        InductorElement(name, None, None, Lval),net_p,net_n,[]
                    )

                # ===== Résistance =====
                elif head.lower().startswith("r"):
                    name = head[1:]
                    net_p = tokens[1]
                    net_n = tokens[2]

                    Rval = None
                    for t in tokens[3:]:
                        if t.lower().startswith("r="):
                            Rval = float(t.split("=", 1)[1])
                            break

                    if Rval is None:
                        Rval = float(tokens[-1])

                    self.current_cell.add_element(
                        ResistorElement(name, None, None, Rval),net_p,net_n,[]
                    )
        NewCircuit.defineTOP(self.TOP)
        return NewCircuit
    
    def parsesol(self, filename: str,Circuit):

        
        buffer_values = []

        
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
                    L_name, P_name = name.split("--")
                    line = f"{L_name} {design} {extracted} {absdiff} {percdiff}"

                    buffer_values.append(
                        line.split()
                    )
                    line = f"L{P_name} 0 0{absdiff} {percdiff}"
                    buffer_values.append(
                        line.split()
                    )
                else:
                    buffer_values.append(line.split())
        for i in buffer_values: 
            print(i)

        for Value in buffer_values:

            #################### JJ extracted Values ################
            if Value[0].startswith("LJ"):
                where = Circuit.findElement(Circuit.TOP,Value[0][1:])
                where.addIndParas(Value[2])
                continue
            if Value[0].startswith("J"):
                where = Circuit.findElement(Circuit.TOP,Value[0])
                where.addJJReal(Value[2])
                continue
            if Value[0].startswith("LRS"):
                m = re.search(r"LRS(\d+)", Value[0])
                value = int(m.group(1))
                where = Circuit.findElement(Circuit.TOP,"J"+str(value))
                where.addJJIndParral(Value[2])
                continue
            if Value[0].startswith("RS"):
                where = Circuit.findElement(Circuit.TOP,"J"+Value[0][2:])
                where.addJJRParral(Value[2])
                continue
            if Value[0].startswith("LP"):
                where = Circuit.findElement(Circuit.TOP,"J"+Value[0][2:])
                where.addJJLp(Value[2])
                continue
            Ind = Value[0][1] 
            #################### R extracted Values ################
            if Value[0].startswith("R") and Ind.isdigit():
                where = Circuit.findElement(Circuit.TOP,Value[0])
                where.addRealR(Value[2])
                continue
            #################### Ind extracted Values ################
            if Value[0].startswith("L") and Ind.isdigit():
                where = Circuit.findElement(Circuit.TOP,Value[0])
                where.addRealL(Value[2])
                continue
            #################### Bias extracted Values ################
            if Value[0].startswith("RIB"):
                where = Circuit.findElement(Circuit.TOP,Value[0][1:])
                where.addRealIB(Value[2])
                continue
            if Value[0].startswith("LIB"):
                where = Circuit.findElement(Circuit.TOP,Value[0][1:])
                where.addRealLIB(Value[2])
                continue
            
            







