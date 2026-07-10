from pathlib import Path
import re

from UI.circuit_component import CircuitComponent


class Schematic:
    def __init__(self, sp_file, map_file):
        self.sp_file = Path(sp_file)
        self.map_file = Path(map_file)

    def parse_mapping_line(self, line):
        pattern = (
            r"raw=(?P<raw>\S+)\s+"
            r"path=(?P<path>\S+)\s+"
            r"pid=(?P<pid>\S+)\s+"
            r"layout_cell=(?P<layout_cell>\S+)"
        )

        match = re.search(pattern, line)

        if not match:
            return None

        return {
            "raw": match.group("raw"),
            "path": match.group("path"),
            "pid": match.group("pid"),
            "layout_cell": match.group("layout_cell"),
        }

    def insert_component_by_net(self, ordered_components, new_component):
        best_index = None
        best_score = 0

        for index, existing_component in enumerate(ordered_components):
            shared_nets = new_component.nets.intersection(existing_component.nets)
            score = len(shared_nets)

            if score > best_score:
                best_score = score
                best_index = index

        if best_index is None:
            ordered_components.append(new_component)
        else:
            ordered_components.insert(best_index + 1, new_component)

        ordered_components.append(new_component)
    
    def read_ordered_components(self, spice_data):
        if not self.map_file.exists():
            raise FileNotFoundError(f"Mapping audit file not found: {self.map_file}")

        net_lookup = {
            element["id"]: {
                "net_in": element.get("net_in"),
                "net_out": element.get("net_out"),
            }
            for element in spice_data["elements"]
        }

        components = []

        with self.map_file.open("r", encoding="utf-8") as f:
            for line in f:
                parsed = self.parse_mapping_line(line)

                if parsed is None:
                    continue

                raw = parsed["raw"]
                net_info = net_lookup.get(raw, {})

                component = CircuitComponent(
                    raw=raw,
                    path=parsed["path"],
                    pid=parsed["pid"],
                    layout_cell=parsed["layout_cell"],
                    net_in=net_info.get("net_in"),
                    net_out=net_info.get("net_out"),
                )

                component.original_index = len(components)
                components.append(component)

        remaining = components[:]
        ordered_components = []

        def component_group(component):
            """
            path=I0/L1   -> I0
            path=I12/J5  -> I12
            path=I6/IB1  -> I6
            """
            path = str(component.path)

            if "/" in path:
                return path.split("/", 1)[0]

            return "TOP"

        def has_next(component):
            """
            True if this component's output can continue into another component.
            """
            return any(
                other.net_in == component.net_out
                for other in remaining
                if other is not component
            )

        def choose_chain_start():
            """
            Pick an element whose net_in is not produced by another remaining element.
            Example starts:
                VDD -> I0|net4
                Sel1 -> I0|net119
                S1 -> I0|net110
                net4 -> I6|net27
            """
            output_nets = {
                component.net_out
                for component in remaining
                if component.net_out is not None
            }

            possible_starts = [
                component
                for component in remaining
                if component.net_in not in output_nets
            ]

            if not possible_starts:
                possible_starts = remaining

            possible_starts.sort(
                key=lambda component: component.original_index
            )

            return possible_starts[0]

        def choose_next(current_component, candidates):
            """
            Choose the best next component where:
                current_component.net_out == candidate.net_in
            """

            current_group = component_group(current_component)

            def score(candidate):
                candidate_group = component_group(candidate)

                same_group_score = 0 if candidate_group == current_group else 1
                continuation_score = 0 if has_next(candidate) else 1
                original_index_score = candidate.original_index

                return (
                    same_group_score,
                    continuation_score,
                    original_index_score,
                )

            candidates.sort(key=score)
            return candidates[0]

        while remaining:
            current = choose_chain_start()
            remaining.remove(current)
            ordered_components.append(current)

            while True:
                candidates = [
                    component
                    for component in remaining
                    if component.net_in == current.net_out
                ]

                if not candidates:
                    break

                next_component = choose_next(current, candidates)

                remaining.remove(next_component)
                ordered_components.append(next_component)

                current = next_component

        return ordered_components
    
    def draw_circuit(self, ordered_list: list[CircuitComponent]):
        relations = {
            "L": "img/ind_draw.png",
            "J": "img/jj_draw.png",
            "IB": "img/biais_draw.png"
        }
        
        for elem in ordered_list:
            prefix = elem.pid[0]
                            
        
