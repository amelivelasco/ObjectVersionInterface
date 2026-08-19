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
    def _get_sol_section(line):
        if line == "Inductance [pH]": return "L"
        if line == "Resistance [Ohm]": return "R"
        if line.startswith("Junction") and "Critical current [uA]" in line: return "J"
        return None

    @staticmethod
    def _store_sol_value(values, section, name, extracted):
        if section == "L" and "++" in name: values["combined_L"][name] = extracted
        else: values[section][name] = extracted

    @staticmethod
    def parse_sol_file(sol_path):
        import re

        values = {"L": {}, "R": {}, "J": {}, "combined_L": {}}
        section = None
        number = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][-+]?\d+)?"
        pattern = re.compile(rf"^(\S+)\s+(?:--|{number})\s+({number})")

        with open(sol_path, "r", encoding="utf-8", errors="ignore") as file:
            for raw_line in file:
                line = raw_line.strip()
                new_section = SpiceExporter._get_sol_section(line)

                if new_section:
                    section = new_section; continue
                if line.startswith("Job finished"): break
                if section is None: continue

                match = pattern.match(line)
                if not match: continue

                name, extracted = match.group(1).upper(), float(match.group(2))
                SpiceExporter._store_sol_value(values, section, name, extracted)

        return values


    @staticmethod
    def _update_sp_date(lines):
        import re
        from datetime import datetime
        now = datetime.now()
        days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        current_date = f"*{days[now.weekday()]} {months[now.month - 1]} {now.day:02d} {now:%H:%M:%S %Y}\n"

        for i, line in enumerate(lines):
            if re.match(r"^\*[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} \d{2}:\d{2}:\d{2} \d{4}", line):
                lines[i] = current_date; break

    @staticmethod
    def _get_sol_component_name(component, name_map):
        component = component.upper()
        candidates = [component]
        if component.startswith("LL"): candidates.append(component[1:])
        if component.startswith("XSJ"): candidates.append(component[3:])
        if component.startswith("XPC"): candidates.append(component[3:])
        return next((name_map[candidate] for candidate in candidates if candidate in name_map), None)

    @staticmethod
    def _get_original_inductance(line):
        import re
        match = re.search(r"\bl\s*=\s*([+-]?[\d.]+(?:e[+-]?\d+)?)([fpnum]?)", line, re.IGNORECASE)
        if not match: return None

        try: value = float(match.group(1))
        except ValueError: return None

        suffix = match.group(2).lower()
        return value * {"": 1.0, "f": 1e-3, "p": 1.0, "n": 1e3, "u": 1e6, "m": 1e9}.get(suffix, 1.0)

    @staticmethod
    def _build_ib_sol_map(values):
        import re
        rib_names = sorted((name for name in values["R"] if re.fullmatch(r"RIB\d+", name)), key=lambda name: int(name[3:]))
        return {f"IB{i}": {"rib": rib_name, "lib": f"LIB{rib_name[3:]}"} for i, rib_name in enumerate(rib_names, 1)}

    @staticmethod
    def _collect_source_inductors(lines, name_map):
        import re
        inductors = {}

        for i, line in enumerate(lines):
            parts = line.strip().split()
            if len(parts) < 4 or not parts[0].upper().startswith("L"): continue

            sol_name = SpiceExporter._get_sol_component_name(parts[0], name_map)
            if sol_name and re.fullmatch(r"L\d+", sol_name):
                inductors[sol_name] = {"index": i, "component": parts[0], "original_value": SpiceExporter._get_original_inductance(line)}

        return inductors

    @staticmethod
    def _split_combined_inductor(combined_name, extracted_total, inductors):
        import re
        match = re.fullmatch(r"L(\d+)\+\+L?(\d+)", combined_name.upper())
        if not match:
            print(f"WARNING: Unsupported combined inductor name: {combined_name}"); return None

        first_name, second_name = f"L{match.group(1)}", f"L{match.group(2)}"
        first, second = inductors.get(first_name), inductors.get(second_name)
        if first is None or second is None:
            print(f"WARNING: Cannot split {combined_name}: {first_name} or {second_name} missing"); return None

        first_original, second_original = first["original_value"], second["original_value"]
        if first_original is None or second_original is None or first_original + second_original == 0:
            print(f"WARNING: Cannot split {combined_name}: invalid original inductance values"); return None

        original_total = first_original + second_original
        first_ratio, second_ratio = first_original / original_total, second_original / original_total
        first_extracted = extracted_total * first_ratio
        second_extracted = extracted_total - first_extracted

        print(f"COMBINED {combined_name} = {extracted_total:g}p")
        print(f"  {first_name}: {first_original:g}/{original_total:g} = {first_ratio:.6f} -> {first_extracted:g}p")
        print(f"  {second_name}: {second_original:g}/{original_total:g} = {second_ratio:.6f} -> {second_extracted:g}p")
        return first_name, first_extracted, second_name, second_extracted

    @staticmethod
    def _build_combined_inductor_values(values, inductors):
        combined_values = {}

        for combined_name, extracted_total in values["combined_L"].items():
            split = SpiceExporter._split_combined_inductor(combined_name, extracted_total, inductors)
            if not split: continue
            first_name, first_value, second_name, second_value = split
            combined_values[first_name], combined_values[second_name] = first_value, second_value

        return combined_values

    @staticmethod
    def _update_bias_line(line, sol_name, ib_sol_map, values):
        import re
        bias = ib_sol_map.get(sol_name)
        if not bias: return line

        rib = values["R"].get(bias["rib"])
        if rib in (None, 0): return line

        ib_value = 2600.0 / rib
        print(f"BIAS {sol_name} -> {bias['rib']}={rib:g} -> ib={ib_value:g}u")
        return re.sub(r"\bib\s*=\s*[-+0-9.e]+u?", f"ib={ib_value:g}u", line, flags=re.IGNORECASE)

    @staticmethod
    def _update_sp_component_line(line, sol_name, values, combined_values, ib_sol_map):
        import re
        if sol_name in combined_values: return re.sub(r"\bl\s*=\s*[-+0-9.e]+[fpnum]?", f"l={combined_values[sol_name]:g}p", line, flags=re.IGNORECASE)
        if sol_name in values["L"]: return re.sub(r"\bl\s*=\s*[-+0-9.e]+[fpnum]?", f"l={values['L'][sol_name]:g}p", line, flags=re.IGNORECASE)
        if sol_name in values["R"]: return re.sub(r"\br\s*=\s*[-+0-9.e]+", f"r={values['R'][sol_name]:g}", line, flags=re.IGNORECASE)
        if sol_name in values["J"]: return re.sub(r"\bics\s*=\s*[-+0-9.e]+u?", f"ics={values['J'][sol_name]:g}u", line, flags=re.IGNORECASE)
        if sol_name.startswith("IB"): return SpiceExporter._update_bias_line(line, sol_name, ib_sol_map, values)
        return line

    @staticmethod
    def _build_updated_sp_lines(lines, name_map, values, combined_values, ib_sol_map):
        new_lines = []

        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith(("*", ".")):
                new_lines.append(line); continue

            component = stripped.split()[0]
            sol_name = SpiceExporter._get_sol_component_name(component, name_map)
            if sol_name is None:
                new_lines.append(line); continue

            new_lines.append(SpiceExporter._update_sp_component_line(line, sol_name, values, combined_values, ib_sol_map))

        return new_lines

    @staticmethod
    def create_sp_from_sol(sol_path, source_sp, output_sp, name_map):
        from pathlib import Path

        sol_path, source_sp, output_sp = Path(sol_path), Path(source_sp), Path(output_sp)
        if not sol_path.exists(): raise FileNotFoundError(f"SOL file not found: {sol_path}")
        if not source_sp.exists(): raise FileNotFoundError(f"Source SP file not found: {source_sp}")

        values = SpiceExporter.parse_sol_file(sol_path)
        name_map = {str(key).upper(): str(value).upper() for key, value in name_map.items()}
        lines = source_sp.read_text(encoding="utf-8").splitlines(keepends=True)

        SpiceExporter._update_sp_date(lines)
        ib_sol_map = SpiceExporter._build_ib_sol_map(values)
        inductors = SpiceExporter._collect_source_inductors(lines, name_map)
        combined_values = SpiceExporter._build_combined_inductor_values(values, inductors)
        new_lines = SpiceExporter._build_updated_sp_lines(lines, name_map, values, combined_values, ib_sol_map)

        output_sp.parent.mkdir(parents=True, exist_ok=True)
        output_sp.write_text("".join(new_lines), encoding="utf-8")
        print("SPICE netlist created from InductEx solution:", output_sp.resolve())
        return str(output_sp.resolve()), {}