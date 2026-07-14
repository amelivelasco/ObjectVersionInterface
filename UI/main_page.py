from datetime import datetime, timezone
from pathlib import Path
import re
import json
from UI.layout_instance import LayoutInstance
from UI.circuit_component import CircuitComponent


class Schematic:
    def __init__(self, sp_file, map_file):
        self.sp_file = Path(sp_file)
        self.map_file = Path(map_file)
    

    def parse_mapping_line(self, line):
        pattern = (
            r"^\s*CircuitComponent\(\s*"
            r"raw=(?P<raw>[^,]+),\s*"
            r"path=(?P<path>[^,]+),\s*"
            r"pid=(?P<pid>[^,]+),\s*"
            r"layout_cell=(?P<layout_cell>[^,]+),\s*"
            r"net_in=(?P<net_in>[^,]+),\s*"
            r"net_out=(?P<net_out>[^)]+)"
            r"\s*\)\s*$"
        )

        match = re.match(pattern, line)

        if not match:
            return None

        def clean_value(value):
            value = value.strip()

            if value in {"None", "null", ""}:
                return None

            return value
            
        return {
            "raw": clean_value(match.group("raw")),
            "path": clean_value(match.group("path")),
            "pid": clean_value(match.group("pid")),
            "layout_cell": clean_value(match.group("layout_cell")),
            "net_in": clean_value(match.group("net_in")),
            "net_out": clean_value(match.group("net_out")),
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
            
    
    def handle_layout_cell(self, layout_cells, component):
        existing_layout = next(
            (
                layout
                for layout in layout_cells
                if layout.layout_cell == component.layout_cell
            ),
            None,
        )

        if existing_layout is None:
            # This layout cell has not been created yet.
            new_layout_cell = LayoutInstance(
                layout_cell=component.layout_cell,
                net_in=component.net_in,
                net_out=component.net_out,
                elements=[component],
            )

            layout_cells.append(new_layout_cell)

        else:
            # Add the component to the existing layout cell.
            existing_layout.elements.append(component)

            # Keep the layout boundaries updated.
            if existing_layout.net_in is None:
                existing_layout.net_in = component.net_in

            existing_layout.net_out = component.net_out
        

    def read_ordered_components(self, spice_data):
        if not self.map_file.exists():
            raise FileNotFoundError(
                f"Ordered elements file not found: {self.map_file}"
            )

        # Used only as a fallback when net information is missing
        # from an ordered_elems.txt entry.
        net_lookup = {
            element["id"]: {
                "net_in": element.get("net_in"),
                "net_out": element.get("net_out"),
            }
            for element in spice_data["elements"]
        }

        ordered_components = []
        layout_cells = []

        with self.map_file.open("r", encoding="utf-8") as file:
            for line_number, line in enumerate(file, start=1):
                line = line.strip()

                if not line:
                    continue
                
                if line.startswith("generated_at:"):
                    continue

                parsed = self.parse_mapping_line(line)

                if parsed is None:
                    raise ValueError(
                        f"Invalid ordered element on line {line_number}: {line}"
                    )
                
                raw = parsed["raw"]
                fallback_nets = net_lookup.get(raw, {})

                net_in = parsed["net_in"]

                if net_in is None:
                    net_in = fallback_nets.get("net_in")

                net_out = parsed["net_out"]

                if net_out is None:
                    net_out = fallback_nets.get("net_out")


                component = CircuitComponent(
                    raw=raw,
                    path=parsed["path"],
                    pid=parsed["pid"],
                    layout_cell=parsed["layout_cell"],
                    net_in=net_in,
                    net_out=net_out,
                )
                
                self.handle_layout_cell(
                    layout_cells,
                    component,
                )
                
                component.original_index = len(ordered_components)

                ordered_components.append(component)
            
        for cell in layout_cells:
            print(
                f"\nLayout cell: "
                f"{cell.layout_cell}"
            )

            print(
                f"Net in: {cell.net_in}"
            )

            print(
                f"Net out: {cell.net_out}"
            )

            for element in cell.elements:
                print(
                    f"  - {element.raw}"
                )

        return ordered_components
    
    def get_component_type(self, component):
        raw = str(component.raw)

        if raw.startswith("L"):
            return ("L", "")

        if raw.startswith("Xsj"):
            return ("JJ", "R")

        if raw.startswith("Xpc"):
            return ("IB", "")

        return "UNKNOWN"


    def get_component_image(self, component):
        (component_type1, component_type2) = self.get_component_type(component)

        relations = {
            "L": "../img/ind_draw.png",
            "JJ": "../img/jj_draw.png",
            "R": "../img/res_draw.png",
            "IB": "../img/biais_draw.png",
        }

        return relations.get(component_type1,
            relations.get(component_type2, ""))

    def load_ordered_components_file(self, ordered_components_file):
        ordered_components_file = Path(ordered_components_file)

        if not ordered_components_file.exists():
            raise FileNotFoundError(
                f"Ordered components file not found: "
                f"{ordered_components_file.resolve()}"
            )

        ordered_components = []

        with ordered_components_file.open(
            "r",
            encoding="utf-8",
        ) as file:
            next(file, None)
            for line_number, line in enumerate(file, start=2):
                line = line.strip()

                if not line:
                    continue

                parsed = self.parse_mapping_line(line)

                if parsed is None:
                    raise ValueError(
                        f"Invalid component on line {line_number}: {line}"
                    )

                component = CircuitComponent(
                    raw=parsed["raw"],
                    path=parsed["path"],
                    pid=parsed["pid"],
                    layout_cell=parsed["layout_cell"],
                    net_in=parsed["net_in"],
                    net_out=parsed["net_out"],
                )

                ordered_components.append(component)
        return ordered_components


    def write_circuit_data(
        self,
        ordered_components_file,
        output_file,
    ):
        ordered_components_file = Path(
            ordered_components_file
        )

        output_file = Path(output_file)

        if not ordered_components_file.exists():
            raise FileNotFoundError(
                f"Ordered components file not found: "
                f"{ordered_components_file.resolve()}"
            )

        ordered_components = (
            self.load_ordered_components_file(
                ordered_components_file
            )
        )

        print(
            "Number of ordered components loaded:",
            len(ordered_components),
        )

        elements = []
        nodes_seen = set()
        nodes = []

        def add_node(net):
            if net is None:
                return

            if net not in nodes_seen:
                nodes_seen.add(net)

                nodes.append({
                    "id": net,
                    "label": net,
                })

        for index, component in enumerate(
            ordered_components
        ):
            print(
                index,
                component.path,
                component.raw,
                component.net_in,
                "->",
                component.net_out,
            )

            add_node(component.net_in)
            add_node(component.net_out)

            (component_type1, component_type2) = self.get_component_type(
                component
            )
            
            elements.append({
                "id": component.raw,
                "raw": component.raw,
                "path": component.path,
                "pid": component.pid,
                "layout_cell": component.layout_cell,
                "type": (component_type1, component_type2),
                "net_in": component.net_in,
                "net_out": component.net_out,
                "image": self.get_component_image(
                    component
                ),
            })
            
            if component_type1 == "JJ":
                resistor_id = re.sub(
                    r"^Xsj",
                    "R",
                    component.raw,
                    count=1,
                    flags=re.IGNORECASE,
                )

                elements.append({
                    "id": resistor_id,
                    "raw": resistor_id,
                    "path": component.path,
                    "pid": component.pid,
                    "layout_cell": component.layout_cell,
                    "type": ("R", ""),
                    "net_in": component.net_in,
                    "net_out": component.net_out,
                    "image": "../img/res_draw.png",
                })

        data = {
            "name": ordered_components_file.stem,
            "generated_at": datetime.now(
                timezone.utc
            ).isoformat(),
            "nodes": nodes,
            "elements": elements,
        }

        js_text = "window.circuitData = "
        js_text += json.dumps(
            data,
            indent=2,
        )
        js_text += ";\n"

        output_file.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        output_file.write_text(
            js_text,
            encoding="utf-8",
        )

        print(
            f"Circuit data written to: "
            f"{output_file.resolve()}"
        )