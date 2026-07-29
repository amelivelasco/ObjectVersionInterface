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
            r"net_out=(?P<net_out>[^,\)]+)"
            r"(?:,\s*value=(?P<value>[^)]+))?"
            r"\s*\)\s*$"
        )


        match = re.match(pattern, line)

        if not match:
            return None

        def clean_value(value):
            if value is None:
                return None

            value = value.strip()

            if value in {
                "None",
                "null",
                "",
            }:
                return None

            return value
            
        return {
            "raw": clean_value(match.group("raw")),
            "path": clean_value(match.group("path")),
            "pid": clean_value(match.group("pid")),
            "layout_cell": clean_value(match.group("layout_cell")),
            "net_in": clean_value(match.group("net_in")),
            "net_out": clean_value(match.group("net_out")),
            "value": clean_value(match.group("value")),
        }
        
    def insert_component_by_net(self, ordered_components, new_component):
        ignored_nets = {"VDD", "GND", "GND!", "0", "", None}

        def clean_net(net):
            if net is None:
                return None
            return str(net).strip()

        new_net_in = clean_net(new_component.net_in)
        new_net_out = clean_net(new_component.net_out)

        # Existing component must be followed by the new component:
        #
        # existing.net_in == new.net_out
        if new_net_out not in ignored_nets:
            for index, existing_component in enumerate(ordered_components):
                existing_net_in = clean_net(existing_component.net_in)

                if existing_net_in == new_net_out:
                    ordered_components.insert(index + 1, new_component)
                    return

        # New component must be followed by an existing component:
        #
        # new.net_in == existing.net_out
        if new_net_in not in ignored_nets:
            for index, existing_component in enumerate(ordered_components):
                existing_net_out = clean_net(existing_component.net_out)

                if new_net_in == existing_net_out:
                    ordered_components.insert(index, new_component)
                    return

        ordered_components.append(new_component)
    
    @staticmethod
    def get_instance_path(component):
        path = str(getattr(component, "path", "") or "").strip().removeprefix("MultiplexerAmeli_1/")

        if "/" in path:
            return path.rsplit("/", 1)[0]

        if "|" in path:
            return path.rsplit("|", 1)[0]

        raw = str(getattr(component, "raw", "") or "").strip()

        for prefix in ("Xsj", "Xpc"):
            if raw.startswith(prefix):
                raw = raw[len(prefix):]
                break

        if raw.startswith("L") and "|" in raw:
            raw = raw[1:]

        if "|" in raw:
            return raw.rsplit("|", 1)[0]

        return path or "root"


    def get_layout_instance_id(self, component):
        return (
            f"{self.get_instance_path(component)}::"
            f"{component.layout_cell}"
        )
        
    def refresh_ordered_components_file(self, circuit, first_level_layout_cells):
        current_components = []

        def get_value(elem):
            for attribute in ("L", "Ic", "Ib", "R"):
                if hasattr(elem, attribute):
                    return getattr(elem, attribute)
            return None

        def walk(cell):
            for elem in cell.instances:
                if hasattr(elem, "instances") and elem.instances:
                    walk(elem)
                    continue

                raw = str(getattr(elem, "raw_name", getattr(elem, "original_name", elem.name)))
                layout_inst = getattr(elem, "KLayoutInstance", None)
                pid = layout_inst.property(102) if layout_inst is not None else None
                layout_cell = first_level_layout_cells.get(raw)

                if layout_cell is None and layout_inst is not None:
                    layout_cell = layout_inst.cell.name

                path = str(getattr(elem, "Path_name", None) or getattr(elem, "path", None) or raw)
                path = path.removeprefix("MultiplexerAmeli_1/")
                net_in = getattr(getattr(elem, "net_in", None), "name", None)
                net_out = getattr(getattr(elem, "net_out", None), "name", None)

                current_components.append(
                    CircuitComponent(
                        raw=raw,
                        path=path,
                        pid=pid,
                        layout_cell=layout_cell,
                        net_in=net_in,
                        net_out=net_out,
                        value=get_value(elem),
                    )
                )

        walk(circuit.TOP)

        self.map_file.parent.mkdir(parents=True, exist_ok=True)

        # "w" completely erases the previous file contents.
        with self.map_file.open("w", encoding="utf-8") as file:
            file.write(f"generated_at: {datetime.now(timezone.utc).isoformat()}\n")

            for component in current_components:
                file.write(f"{component}\n")

        print(f"Ordered elements file overwritten: {self.map_file.resolve()}")
        print(f"Current components written: {len(current_components)}")

        return current_components
                
        
    def handle_layout_cell(
        self,
        layout_cells,
        component,
    ):
        component_instance_id = (
            self.get_layout_instance_id(
                component
            )
        )

        existing_layout = next(
            (
                layout
                for layout in layout_cells
                if (
                    layout.elements
                    and self.get_layout_instance_id(
                        layout.elements[0]
                    ) == component_instance_id
                )
            ),
            None,
        )

        if existing_layout is None:
            new_layout_cell = LayoutInstance(
                layout_cell=component.layout_cell,
                net_in=component.net_in,
                net_out=component.net_out,
                elements=[component],
            )

            layout_cells.append(
                new_layout_cell
            )
        else:
            existing_layout.elements.append(
                component
            )

            if existing_layout.net_in is None:
                existing_layout.net_in = (
                    component.net_in
                )

            existing_layout.net_out = (
                component.net_out
            )
        

    def read_ordered_components(self, spice_data):
        if not self.map_file.exists():
            raise FileNotFoundError(
                f"Ordered elements file not found: {self.map_file}"
            )

        net_lookup = {
            element["id"]: {
                "net_in": element.get("net_in"),
                "net_out": element.get("net_out"),
                "value": element.get("value"),
            }
            for element in spice_data["elements"]
        }

        ordered_components = []
        source_index = 0

        with self.map_file.open("r", encoding="utf-8") as file:
            for line_number, line in enumerate(file, start=1):
                line = line.strip()

                if not line or line.startswith("generated_at:"):
                    continue

                parsed = self.parse_mapping_line(line)

                if parsed is None:
                    raise ValueError(
                        f"Invalid mapping line {line_number}: {line}"
                    )

                raw = parsed["raw"]
                fallback = net_lookup.get(raw, {})

                net_in = parsed["net_in"]
                if net_in is None:
                    net_in = fallback.get("net_in")

                net_out = parsed["net_out"]
                if net_out is None:
                    net_out = fallback.get("net_out")

                value = parsed["value"]
                if value is None:
                    value = fallback.get("value")

                component = CircuitComponent(
                    raw=raw,
                    path=parsed["path"],
                    pid=parsed["pid"],
                    layout_cell=parsed["layout_cell"],
                    net_in=net_in,
                    net_out=net_out,
                    value=value,
                )

                # Preserve where the component appeared in the source file.
                component.original_index = line_number

                self.insert_component_by_net(
                    ordered_components,
                    component,
                )
        # Build the layout-cell groups after the components
        # have been placed in their final order.
        layout_cells = []

        for component in ordered_components:
            self.handle_layout_cell(
                layout_cells,
                component,
            )

        for cell in layout_cells:
            print(f"\nLayout cell: {cell.layout_cell}")
            print(f"Net in: {cell.net_in}")
            print(f"Net out: {cell.net_out}")

            for element in cell.elements:
                print(f"  - {element.raw}")

        return ordered_components
    
    @staticmethod
    def get_junction_resistor_id(raw):
        raw = str(raw).strip()

        if raw.lower().startswith("xsj"):
            raw = raw[3:]

        if raw.lower().startswith("j"):
            raw = raw[1:]

        return f"R{raw}"
    
    def get_component_type(self, component):
        raw = str(component.raw).strip()

        if raw.startswith("Xsj") or re.fullmatch(r"J\d+", raw, re.IGNORECASE):
            return ("JJ", "R")

        if raw.startswith("Xpc") or re.fullmatch(r"IB\d+", raw, re.IGNORECASE):
            return ("IB", "")

        if re.fullmatch(r"L.+", raw, re.IGNORECASE):
            return ("L", "")

        if re.fullmatch(r"R.+", raw, re.IGNORECASE):
            return ("R", "")

        return ("UNKNOWN", "")


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
                    value=parsed["value"],
                )

                ordered_components.append(component)
        return ordered_components

    def write_layout_cells(self, ordered_components):
        layout_cells = []

        for component in ordered_components:
            self.handle_layout_cell(
                layout_cells,
                component,
            )
        layout_cells_data = []

        for layout_cell in layout_cells:
            layout_element_ids = []

            for component in layout_cell.elements:
                first_component = (
                    layout_cell.elements[0]
                )
                instance_path = (
                    self.get_instance_path(
                        first_component
                    )
                )
                
                layout_instance = (
                    self.get_layout_instance_id(
                        first_component
                    )
                )
                layout_element_ids.append(
                    component.raw
                )

                component_type1, _ = (
                    self.get_component_type(component)
                )

                # Include the generated resistor in the same
                # layout cell as its JJ.
                if component_type1 == "JJ":
                    resistor_id = self.get_junction_resistor_id(
                        component.raw
                    )

                    layout_element_ids.append(
                        resistor_id
                    )

            layout_cells_data.append({
                "id": layout_instance,
                "layout_instance":
                    layout_instance,
                "layout_cell":
                    layout_cell.layout_cell,
                "instance_path":
                    instance_path,
                "display_name":
                    (
                        f"{layout_cell.layout_cell} "
                        f"({instance_path})"
                    ),
                "net_in":
                    layout_cell.net_in,
                "net_out":
                    layout_cell.net_out,
                "elements":
                    layout_element_ids,
                        })
        return layout_cells_data


    def write_circuit_data(self, ordered_components, output_file):
        output_file = Path(output_file)
        ordered_components = list(ordered_components)

        if not ordered_components:
            raise ValueError("No current ordered components were provided.")

        print("Writing circuit_data.js from current components:", len(ordered_components))
        print("First current component IDs:", [component.raw for component in ordered_components[:10]])

        elements, nodes, nodes_seen = [], [], set()

        def add_node(net):
            if net is None:
                return
            net = str(net).strip()
            if not net or net in nodes_seen:
                return
            nodes_seen.add(net)
            nodes.append({"id": net, "label": net})

        for index, component in enumerate(ordered_components):
            print(index, component.path, component.raw, component.net_in, "->", component.net_out)
            add_node(component.net_in)
            add_node(component.net_out)

            component_type1, component_type2 = self.get_component_type(component)
            layout_instance = self.get_layout_instance_id(component)
            instance_path = self.get_instance_path(component)

            elements.append({
                "id": component.raw, "raw": component.raw, "path": component.path, "pid": component.pid,
                "layout_cell": component.layout_cell, "layout_instance": layout_instance,
                "instance_path": instance_path, "type": (component_type1, component_type2),
                "net_in": component.net_in, "net_out": component.net_out, "value": component.value,
                "image": self.get_component_image(component),
            })

            if component_type1 == "JJ":
                resistor_id = self.get_junction_resistor_id(component.raw)
                elements.append({
                    "id": resistor_id, "raw": resistor_id, "path": component.path, "pid": component.pid,
                    "layout_cell": component.layout_cell, "layout_instance": layout_instance,
                    "instance_path": instance_path, "type": ("R", ""), "net_in": component.net_in,
                    "net_out": component.net_out, "value": None, "image": "../img/res_draw.png",
                })

        data = {
            "name": self.sp_file.stem,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "nodes": nodes,
            "elements": elements,
            "layout_cells": self.write_layout_cells(ordered_components),
        }

        js_text = "window.circuitData = " + json.dumps(data, indent=2) + ";\n"
        output_file.parent.mkdir(parents=True, exist_ok=True)

        temporary_file = output_file.with_suffix(output_file.suffix + ".tmp")
        temporary_file.write_text(js_text, encoding="utf-8")
        temporary_file.replace(output_file)

        print("circuit_data.js completely replaced:", output_file.resolve())
        print("Circuit components written:", len(ordered_components))
        print("Total JS elements written:", len(elements))