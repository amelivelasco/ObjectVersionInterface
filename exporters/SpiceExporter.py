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

    def parse_sol_file(self, sol_path):
        """
        Reads extracted component values from an InductEx .sol/.txt file.

        Returns:
            {
                "L": {"L1": 1.99109, "LJ1": 0.126821, ...},
                "R": {"RS1": 3.57226, "RIB5": 15.3272, ...},
                "J": {"J1": 175.56, "J2": 248.34, ...},
                "combined_L": {"L2++13": 4.82862, ...}
            }
        """
        import re

        values = {
            "L": {},
            "R": {},
            "J": {},
            "combined_L": {}
        }

        section = None
        number = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][-+]?\d+)?"

        with open(sol_path, "r", encoding="utf-8", errors="ignore") as f:
            for raw_line in f:
                line = raw_line.strip()

                if line == "Inductance [pH]":
                    section = "L"
                    continue

                if line == "Resistance [Ohm]":
                    section = "R"
                    continue

                if line.startswith("Junction") and "Critical current [uA]" in line:
                    section = "J"
                    continue

                if line.startswith("Job finished"):
                    break

                if section is None:
                    continue

                match = re.match(
                    rf"^(\S+)\s+(?:--|{number})\s+({number})",
                    line
                )

                if not match:
                    continue

                name = match.group(1).upper()
                extracted = float(match.group(2))

                if section == "L" and "++" in name:
                    values["combined_L"][name] = extracted
                else:
                    values[section][name] = extracted

        return values


    @staticmethod
    def parse_sol_file(sol_path):
        import re

        values = {"L": {}, "R": {}, "J": {}, "combined_L": {}}
        section = None
        number = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][-+]?\d+)?"

        with open(sol_path, "r", encoding="utf-8", errors="ignore") as file:
            for raw_line in file:
                line = raw_line.strip()

                if line == "Inductance [pH]":
                    section = "L"
                    continue
                if line == "Resistance [Ohm]":
                    section = "R"
                    continue
                if line.startswith("Junction") and "Critical current [uA]" in line:
                    section = "J"
                    continue
                if line.startswith("Job finished"):
                    break
                if section is None:
                    continue

                match = re.match(rf"^(\S+)\s+(?:--|{number})\s+({number})", line)
                if not match:
                    continue

                name, extracted = match.group(1).upper(), float(match.group(2))
                if section == "L" and "++" in name:
                    values["combined_L"][name] = extracted
                else:
                    values[section][name] = extracted

        return values


    @staticmethod
    def create_sp_from_sol(sol_path, source_sp, output_sp):
        """Uses source_sp topology and replaces values with those extracted from sol.txt."""
        import re
        from pathlib import Path

        sol_path, source_sp, output_sp = Path(sol_path), Path(source_sp), Path(output_sp)

        if not sol_path.exists():
            raise FileNotFoundError(f"SOL file not found: {sol_path}")
        if not source_sp.exists():
            raise FileNotFoundError(f"Cannot create extracted SP because source SP does not exist: {source_sp}")

        values = SpiceExporter.parse_sol_file(sol_path)
        original_lines = source_sp.read_text(encoding="utf-8").splitlines(keepends=True)
        new_lines = []

        for line in original_lines:
            stripped = line.strip()

            if not stripped or stripped.startswith(("*", ".")):
                new_lines.append(line)
                continue

            parts = stripped.split()
            if not parts:
                new_lines.append(line)
                continue

            component = parts[0]
            component_upper = component.upper()

            if component_upper.startswith("XJ"):
                junction_name = component[2:].upper()

                if junction_name in values["J"]:
                    line = re.sub(r"\bics\s*=\s*[-+0-9.eE]+u?", f"ics={values['J'][junction_name]:g}u", line, flags=re.IGNORECASE)

                if junction_name.startswith("J"):
                    series_name = f"LRS{junction_name[1:]}_SERIES"
                    if series_name in values["L"]:
                        line = re.sub(r"\blser\s*=\s*[-+0-9.eE]+p?", f"lser={values['L'][series_name]:g}p", line, flags=re.IGNORECASE)

            elif component_upper in values["R"]:
                line = re.sub(r"\br\s*=\s*[-+0-9.eE]+", f"r={values['R'][component_upper]:g}", line, flags=re.IGNORECASE)

            elif component_upper in values["L"]:
                line = re.sub(r"\bl\s*=\s*[-+0-9.eE]+p?", f"l={values['L'][component_upper]:g}p", line, flags=re.IGNORECASE)

            new_lines.append(line)

        if values["combined_L"]:
            combined_lines = ["\n", "*" * 80 + "\n", "* Combined inductors reported by InductEx\n"]
            combined_lines.extend(f"* {name} = {value:g}p\n" for name, value in values["combined_L"].items())
            combined_lines.append("*" * 80 + "\n")

            for index, line in enumerate(new_lines):
                if line.strip().lower().startswith(".ends"):
                    new_lines[index:index] = combined_lines
                    break

        output_sp.parent.mkdir(parents=True, exist_ok=True)
        output_sp.write_text("".join(new_lines), encoding="utf-8")

        print("SPICE netlist created from InductEx solution:", output_sp.resolve())
        return str(output_sp.resolve())
            