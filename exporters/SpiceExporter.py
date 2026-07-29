import os
from exporters.BaseExporter import BaseExporter

class SpiceExporter(BaseExporter):
    def __init__(self, circuit):
        super().__init__(circuit)
        self.circuit = circuit
    
    def build_net_list(self):  # this method writes the netlist in a .sp file instead of a .cir file, which means its purpose is a SPICE netlist and not an InductEx netlist.

        lines = []

        # ===== Header =====
        lines.append("*.LDD")
        lines.append(".GLOBAL GND!")
        lines.append("*" * 80)
        lines.append("* Library          : BasicCellsHomemade")
        lines.append(f"* Cell             : {self.TOP.name}")
        lines.append("* View             : schematic")
        lines.append("* View Search List : auCdl schematic")
        lines.append("* View Stop List   : auCdl")
        lines.append("*" * 80)
        lines.append(self.emit_subckt_line())
        lines.append("*.PININFO DC:O SFQ_in:I VDD:I")

        self.walk_top_instances(lines)
        filename = os.path.join(self.circuit.output_dir, "Splitter/Splitter/Netlist.sp")
        lines.append(f".ends {self.circuit.TOP.name}")

        with open(filename, "a") as f:
                for l in lines:
                    f.write(l + "\n")


    def find_single_connected_nets(self):
        """
        Retourne un set de noms de nets connectés à un seul élément.
        """
        ports = []

        for node in self.list_nodes_top:
            if len(node.connected_elements) == 1:
                # Ignore GND
                if str(node.GlobalName) == "0":
                    continue
                ports.append(f"net{node.GlobalName}")

        return sorted(ports)



    def emit_subckt_line(self):
        ports = self.find_single_connected_nets()
        ports.append("VDD")

        # Ajouter explicitement GND et VDD si nécessaire
        port_list = " ".join(ports)
        return f".subckt {self.TOP.name} {port_list}"


    def walk_top_instances(self,line_to_add):

        def visit(cell):
            for inst in cell.instances:
                if not hasattr(inst, "instances"):
                    visit(inst)
                    continue
                
                self.add_instance_lines(inst, line_to_add)
        visit(self.circuit.TOP)
    
    def net_name(self, net):
        name = f"net{net.GlobalName}"
        return "GND!" if name == "net0" else name
    
    def add_instance_lines(self, inst, lines):
        net_in = self.net_name(inst.net_in)
        net_out = self.net_name(inst.net_out)

        if inst.type == "IB":
            self.add_ib_lines(inst, net_out, lines)
        elif inst.type == "L":
            self.add_l_lines(inst, net_in, net_out, lines)
        elif inst.type == "R":
            self.add_r_lines(inst, net_in, net_out, lines)
        elif inst.type == "JJ":
            self.add_jj_lines(inst, net_in, net_out, lines)
            
    def add_ib_lines(self, inst, net_out, lines):
        node = f"net{inst.list_additional_node[0].GlobalName}"
        lines.append(
        f"R{inst.name} VDD {node} r={inst.RealIB}"
        )
        lines.append(
            f"L{inst.name} {node} {net_out} l={inst.RealLIB}p"
        )
    
    def add_l_lines(self, inst, net_in, net_out, lines):
        lines.append(
            f"L{inst.name} {net_in} {net_out} ind2 l={inst.RealL}p"
        )


    def add_r_lines(self, inst, net_in, net_out, lines):
        lines.append(
            f"R{inst.name} {net_in} {net_out} res r={inst.RealR}"
        )

    def add_jj_lines(self, inst, net_in, net_out, lines):
        node0 = f"net{inst.list_additional_node[0].GlobalName}"
        node1 = f"net{inst.list_additional_node[1].GlobalName}"
        suffix = inst.name[1:]

        if net_out == "GND!":
            lines.append(
                f"Xj{inst.name} {net_in} {node1} jj "
                f"ics={inst.RealJ}u lser={inst.IndPar}p"
            )
            lines.append(
                f"Rs{suffix} {net_in} {node0} res r={inst.RParral}"
            )
            lines.append(
                f"L{inst.name} {node0} {node1} ind2 l={inst.JJIndParral}p"
            )
            lines.append(
                f"Lp{suffix} {node0} {net_out} ind2 l={inst.Lp}p"
            )
            return

        lines.append(
            f"Xj{inst.name} {net_in} {net_out} jj "
            f"ics={inst.RealJ}u lser={inst.IndPar}p"
        )
        lines.append(
            f"Rs{suffix} {net_in} {node0} res r={inst.RParral}"
        )
        lines.append(
            f"L{inst.name} {node0} {net_out} ind2 l={inst.JJIndParral}p"
        )