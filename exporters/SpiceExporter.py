import datetime
import os
from exporters.BaseExporter import BaseExporter

class SpiceExporter(BaseExporter):
    def __init__(self, circuit):
        super().__init__(circuit)
        self.circuit = circuit

    def sol_value(self, section, name, fallback):
        return self.sol_values.get(section, {}).get(str(name).upper(), fallback)
    
    def build_net_list(self, output_path=None, sol_path=None):
        from pathlib import Path

        self.sol_values = self.parse_sol_file(sol_path) if sol_path and Path(sol_path).exists() else {
            "L": {}, "R": {}, "J": {}, "combined_L": {}
        }

        lines = [
            "*.LDD",
            ".GLOBAL GND!",
            "*" * 80,
            "* Library          : BasicCellsHomemade",
            f"* Cell             : {self.circuit.TOP.name}",
            "* View             : schematic",
            "* View Search List : auCdl schematic",
            "* View Stop List   : auCdl",
            "*" * 80,
            self.emit_subckt_line(),
            "*.PININFO DC:O SFQ_in:I VDD:I",
        ]

        self.walk_top_instances(lines)

        if self.sol_values["combined_L"]:
            lines.extend(["", "*" * 80, "* Combined inductors reported by InductEx"])
            lines.extend(f"* {name} = {value:g}p" for name, value in self.sol_values["combined_L"].items())
            lines.append("*" * 80)

        lines.append(f".ends {self.circuit.TOP.name}")

        output_path = Path(output_path) if output_path else Path(self.circuit.output_dir) / "Netlist_from_sol.sp"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

        return str(output_path.resolve())


    def find_single_connected_nets(self):
        """
        Retourne un set de noms de nets connectés à un seul élément.
        """
        ports = []

        for node in self.circuit.list_nodes_top:
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
        return f".subckt {self.circuit.TOP.name} {port_list}"


    def walk_top_instances(self, lines):
        def visit(cell):
            for inst in cell.instances:
                if hasattr(inst, "instances"):
                    visit(inst)
                else:
                    self.add_instance_lines(inst, lines)

        visit(self.circuit.TOP)
    
    def net_name(self, net):
        name = f"net{net.global_name}"
        return "GND!" if name == "net0" else name
    
    def add_instance_lines(self, inst, lines):
        net_in = self.net_name(inst.net_in)
        net_out = self.net_name(inst.net_out)

        if inst.type == "IB":
            self.add_ib_lines(inst, net_in, net_out, lines)
        elif inst.type == "L":
            self.add_l_lines(inst, net_in, net_out, lines)
        elif inst.type == "R":
            self.add_r_lines(inst, net_in, net_out, lines)
        elif inst.type == "JJ":
            self.add_jj_lines(inst, net_in, net_out, lines)
            
    def add_ib_lines(self, inst, net_in, net_out, lines):
        suffix = inst.name[2:] if inst.name.upper().startswith("IB") else inst.name

        # sol.txt gives RIB, not IB directly.
        # Original relation used by your circuit: RIB = 2600 / IB
        rib = self.sol_value("R", f"RIB{suffix}", None)
        ib = 2600.0 / rib if rib not in (None, 0) else inst.Ib

        lines.append(f"Xpc{inst.name} {net_in} VDD {net_out} pwrcell ib={ib:g}u")


    def add_l_lines(self, inst, net_in, net_out, lines):
        value = self.sol_value("L", inst.name, inst.L)
        lines.append(f"L{inst.name} {net_in} {net_out} ind2 l={value:g}p")


    def add_r_lines(self, inst, net_in, net_out, lines):
        value = self.sol_value("R", inst.name, inst.R)
        lines.append(f"R{inst.name} {net_in} {net_out} res r={value:g}")


    def add_jj_lines(self, inst, net_in, net_out, lines):
        value = self.sol_value("J", inst.name, inst.Ic)
        lines.append(f"Xsj{inst.name} {net_in} {net_out} jj_s ics={value:g}u")

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
    def create_sp_from_sol(sol_path, source_sp, output_sp, name_map):
        import re
        from pathlib import Path
        from datetime import datetime

        sol_path, source_sp, output_sp = Path(sol_path), Path(source_sp), Path(output_sp)
        if not sol_path.exists(): raise FileNotFoundError(f"SOL file not found: {sol_path}")
        if not source_sp.exists(): raise FileNotFoundError(f"Source SP file not found: {source_sp}")

        values = SpiceExporter.parse_sol_file(sol_path)
        name_map = {str(k).upper(): str(v).upper() for k, v in name_map.items()}
        lines = source_sp.read_text(encoding="utf-8").splitlines(keepends=True)
        
        now = datetime.now()
        days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        current_date = f"*{days[now.weekday()]} {months[now.month - 1]} {now.day:02d} {now:%H:%M:%S %Y}\n"

        for i, line in enumerate(lines):
            if re.match(r"^\*[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} \d{2}:\d{2}:\d{2} \d{4}", line):
                lines[i] = current_date
                break

        def get_sol_name(component):
            component = component.upper()
            candidates = [component]
            if component.startswith("LL"): candidates.append(component[1:])
            if component.startswith("XSJ"): candidates.append(component[3:])
            if component.startswith("XPC"): candidates.append(component[3:])
            return next((name_map[c] for c in candidates if c in name_map), None)

        def get_original_l(line):
            m = re.search(r"\bl\s*=\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][-+]?\d+)?)([fpnum]?)", line, re.IGNORECASE)
            if not m: return None
            value, suffix = float(m.group(1)), m.group(2).lower()
            return value * {"": 1.0, "f": 1e-3, "p": 1.0, "n": 1e3, "u": 1e6, "m": 1e9}.get(suffix, 1.0)

        rib_names = sorted((n for n in values["R"] if re.fullmatch(r"RIB\d+", n)), key=lambda n: int(n[3:]))
        ib_sol_map = {f"IB{i}": {"rib": rib_name, "lib": f"LIB{rib_name[3:]}"} for i, rib_name in enumerate(rib_names, 1)}

        inductors = {}
        for i, line in enumerate(lines):
            parts = line.strip().split()
            if len(parts) < 4 or not parts[0].upper().startswith("L"): continue
            sol_name = get_sol_name(parts[0])
            if sol_name and re.fullmatch(r"L\d+", sol_name): inductors[sol_name] = {"index": i, "component": parts[0], "original_value": get_original_l(line)}

        combined_inductor_values = {}
        for combined_name, extracted_total in values["combined_L"].items():
            match = re.fullmatch(r"L(\d+)\+\+L?(\d+)", combined_name.upper())
            if not match:
                print(f"WARNING: Unsupported combined inductor name: {combined_name}")
                continue

            first_name, second_name = f"L{match.group(1)}", f"L{match.group(2)}"
            first, second = inductors.get(first_name), inductors.get(second_name)
            if first is None or second is None:
                print(f"WARNING: Cannot split {combined_name}: {first_name} or {second_name} missing")
                continue

            first_original, second_original = first["original_value"], second["original_value"]
            if first_original is None or second_original is None or first_original + second_original == 0:
                print(f"WARNING: Cannot split {combined_name}: invalid original inductance values")
                continue

            original_total = first_original + second_original
            first_ratio, second_ratio = first_original / original_total, second_original / original_total
            first_extracted = extracted_total * first_ratio
            second_extracted = extracted_total - first_extracted
            combined_inductor_values[first_name], combined_inductor_values[second_name] = first_extracted, second_extracted

            print(f"COMBINED {combined_name} = {extracted_total:g}p")
            print(f"  {first_name}: {first_original:g}/{original_total:g} = {first_ratio:.6f} -> {first_extracted:g}p")
            print(f"  {second_name}: {second_original:g}/{original_total:g} = {second_ratio:.6f} -> {second_extracted:g}p")

        new_lines = []
        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith(("*", ".")):
                new_lines.append(line)
                continue

            component = stripped.split()[0]
            sol_name = get_sol_name(component)
            if sol_name is None:
                new_lines.append(line)
                continue

            if sol_name in combined_inductor_values:
                line = re.sub(r"\bl\s*=\s*[-+0-9.eE]+[fpnum]?", f"l={combined_inductor_values[sol_name]:g}p", line, flags=re.IGNORECASE)
            elif sol_name in values["L"]:
                line = re.sub(r"\bl\s*=\s*[-+0-9.eE]+[fpnum]?", f"l={values['L'][sol_name]:g}p", line, flags=re.IGNORECASE)
            elif sol_name in values["R"]:
                line = re.sub(r"\br\s*=\s*[-+0-9.eE]+", f"r={values['R'][sol_name]:g}", line, flags=re.IGNORECASE)
            elif sol_name in values["J"]:
                line = re.sub(r"\bics\s*=\s*[-+0-9.eE]+u?", f"ics={values['J'][sol_name]:g}u", line, flags=re.IGNORECASE)
            elif sol_name.startswith("IB"):
                bias = ib_sol_map.get(sol_name)
                if bias:
                    rib = values["R"].get(bias["rib"])
                    if rib not in (None, 0):
                        ib_value = 2600.0 / rib
                        line = re.sub(r"\bib\s*=\s*[-+0-9.eE]+u?", f"ib={ib_value:g}u", line, flags=re.IGNORECASE)
                        print(f"BIAS {sol_name} -> {bias['rib']}={rib:g} -> ib={ib_value:g}u")

            new_lines.append(line)

        output_sp.parent.mkdir(parents=True, exist_ok=True)
        output_sp.write_text("".join(new_lines), encoding="utf-8")
        print("SPICE netlist created from InductEx solution:", output_sp.resolve())
        return str(output_sp.resolve()), {}