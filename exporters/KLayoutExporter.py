from pathlib import Path

import klayout.db as pya
import os
from math import sqrt
from exporters.BaseExporter import BaseExporter

class KLayoutExporter(BaseExporter):
    def __init__(self, circuit, layout_path):
        super().__init__(circuit)
        self.circuit = circuit
        self.layout_path = layout_path
        self.layout = pya.Layout() # pya is the KLayout Python API. 
        self.output_dir = ""
        self.list_nodes_top = circuit.list_nodes_top
        
        self.layout.read(self.layout_path) # The KLayout is used to read and manipulate GDSII files, which are standard file formats for representing integrated circuit layouts.

        self.layout_top = self.layout.top_cell() # is this reassignment necessary?   
        
                 
    def find_layout_instance_by_pid(self, layout_cell, target_name):
        print(f"\nSearching for: {target_name}")
        print(f"Inside layout cell: {layout_cell.name}")

        found_names = []

        for klayout_inst in layout_cell.each_inst():
            pid = klayout_inst.property(102)
            cell_name = klayout_inst.cell.name

            found_names.append((pid, cell_name))

            print(
                "  layout instance:",
                f"pid={pid}",
                f"cell={cell_name}"
            )

            if str(pid).lower() == str(target_name).lower():
                return klayout_inst

        print(f"NOT FOUND: {target_name}")
        print("Available layout instances were:")
        for pid, cell_name in found_names:
            print(f"  pid={pid}, main_cell_name={layout_cell.name} cell={cell_name}")

        return None

    def get_first_level_layout_cell(self, raw_name):
        """
        Returns the layout cell directly below the top-level layout.

        Examples:
            LI0|L1  -> NDROM2
            LI12|L2 -> NDROM2
            I6|J7   -> confluenceBufferUpgrade
        """

        layout_path = self._raw_name_to_layout_path(
            raw_name
        )

        if not layout_path:
            return None

        # For I0/L1, only use I0.
        first_level_pid = layout_path[0]

        for layout_inst in self.layout_top.each_inst():
            pid = layout_inst.property(102)

            if (
                str(pid).lower()
                == str(first_level_pid).lower()
            ):
                return layout_inst.cell.name

        print(
            f"WARNING: first-level layout instance "
            f"'{first_level_pid}' was not found "
            f"inside '{self.layout_top.name}'"
        )

        return None
    

    def report_mapping_audit(self, output_path=None):
        report_lines = []

        # Maps each raw component name to the first cell
        # directly below the top-level circuit.
        first_level_cells = {}

        def add_line(text=""):
            print(text)
            report_lines.append(text)

        add_line("\n=== LAYOUT MAPPING AUDIT ===")

        total = 0
        mapped = 0
        unmapped = 0

        def walk(cell):
            nonlocal total, mapped, unmapped

            for inst in cell.instances:
                if (
                    hasattr(inst, "instances")
                    and inst.instances
                ):
                    walk(inst)
                    continue

                total += 1

                raw_name = getattr(
                    inst,
                    "raw_name",
                    inst.name,
                )

                layout_inst = getattr(
                    inst,
                    "KLayoutInstance",
                    None,
                )

                layout_path = (
                    self._raw_name_to_layout_path(
                        raw_name
                    )
                )

                if layout_inst is None:
                    unmapped += 1

                    add_line(
                        f"FAIL | raw={raw_name:<18} "
                        f"path={'/'.join(layout_path):<15} "
                        f"reason=not mapped"
                    )

                    continue

                first_level_cell_name = (
                    self.get_first_level_layout_cell(
                        raw_name
                    )
                )

                if first_level_cell_name is None:
                    unmapped += 1

                    add_line(
                        f"FAIL | raw={raw_name:<18} "
                        f"path={'/'.join(layout_path):<15} "
                        f"reason=first-level cell not found"
                    )

                    continue

                mapped += 1

                pid = layout_inst.property(102)

                # Final small PCell, retained only for debugging.
                device_cell_name = layout_inst.cell.name

                first_level_cells[raw_name] = (
                    first_level_cell_name
                )

                add_line(
                    f"OK   | raw={raw_name:<18} "
                    f"path={'/'.join(layout_path):<15} "
                    f"pid={str(pid):<6} "
                    f"layout_cell={first_level_cell_name} "
                    f"device_cell={device_cell_name}"
                )

        walk(self.circuit.TOP)

        add_line("\n=== SUMMARY ===")
        add_line(f"Total logical elements: {total}")
        add_line(f"Mapped: {mapped}")
        add_line(f"Unmapped: {unmapped}")

        if output_path is None:
            output_path = (
                Path(self.output_dir)
                / "layout_mapping_audit.txt"
            )
        else:
            output_path = Path(output_path)

        output_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        output_path.write_text(
            "\n".join(report_lines),
            encoding="utf-8",
        )

        print(
            f"\nMapping audit written to: "
            f"{output_path}"
        )

        return first_level_cells


    def _raw_name_to_layout_path(self, raw_name):
        """
        Converts CDL flattened names to GDS hierarchy path.

        Examples:
            XpcI0|IB1  -> ["I0", "IB1"]
            XsjI0|J1   -> ["I0", "J1"]
            LI0|L1     -> ["I0", "L1"]
            IB1        -> ["IB1"]
        """

        name = str(raw_name)

        prefixes = ["Xpc", "Xsj", "L", "R"]

        for prefix in prefixes:
            if name.lower().startswith(prefix.lower()):
                name = name[len(prefix):]
                break

        return name.split("|")
    
    def find_layout_instance_by_path(self, layout_cell, path_parts):
        """
        Finds a nested layout instance using a hierarchy path.

        Example:
            layout_cell = MultiplexerAmeli
            path_parts = ["I0", "IB1"]

        It first finds I0 inside MultiplexerAmeli,
        then finds IB1 inside I0's layout cell.
        """

        current_cell = layout_cell
        current_inst = None
        global_trans = pya.Trans()

        for part in path_parts:
            current_inst = self.find_layout_instance_by_pid(current_cell, part)

            if current_inst is None:
                return None, None

            global_trans = global_trans * current_inst.trans
            current_cell = current_inst.cell

        return current_inst, global_trans

    
    def integrating_layout(self): 
        def go_through(layout_cell, circuit_cell, layout_parent_inst=None):

            # Affichage du contexte
            if layout_parent_inst is None:
                print(
                    f"SYNC TOP: circuit={circuit_cell.name} "
                    f"<-> layout_cell={layout_cell.name}"
                )
            else:
                print(
                    f"SYNC CELL: circuit={circuit_cell.name} "
                    f"<-> layout_inst_property102={layout_parent_inst.property(102)} "
                    f"(layout_cell={layout_cell.name})"
                )

            for circuit_inst in circuit_cell.instances:

                lookup_names = [getattr(circuit_inst, "raw_name", circuit_inst.name)]
                if lookup_names[0] != circuit_inst.name:
                    lookup_names.append(circuit_inst.name)

                print("looking for circuit instance:", circuit_inst.name)
                print("inside layout cell:", layout_cell.name)
                print("lookup names:", lookup_names)

                layout_inst = None
                global_trans = None

                for lookup_name in lookup_names:
                    path_parts = self._raw_name_to_layout_path(lookup_name)

                    layout_inst, global_trans = self.find_layout_instance_by_path(
                        self.layout_top,
                        path_parts
                    )

                    if layout_inst is not None:
                        break

                if layout_inst is None:
                    raise RuntimeError(
                        f"Instance '{circuit_inst.name}' not found in layout. "
                        f"Tried names: {lookup_names}"
                    )

                circuit_inst.KLayoutInstance = layout_inst
                circuit_inst.KLayoutCell = layout_inst.cell
                circuit_inst.global_trans = global_trans

                print(
                    f"FOUND: circuit={circuit_inst.name} "
                    f"<-> layout_property102={layout_inst.property(102)} "
                    f"layout_cell={layout_inst.cell.name}"
                )

                # Descente hiérarchique si l'objet logique contient des sous-instances
                if hasattr(circuit_inst, "instances") and circuit_inst.instances:
                    go_through(
                        layout_inst.cell,      # IMPORTANT : on passe la CELL
                        circuit_inst,
                        layout_parent_inst=layout_inst
                    )

        print(
            f"SYNC TOP: circuit={self.circuit.TOP.name} "
            f"<-> layout={self.layout_top.name}"
        )

        go_through(self.layout_top, self.circuit.TOP)

    def report_layout_mapping(self):
        def walk(cell, path=""):
            for inst in cell.instances:
                inst_name = getattr(inst, "raw_name", inst.name)
                current_path = f"{path}/{inst_name}" if path else inst_name
                layout_inst = getattr(inst, "KLayoutInstance", None)
                if layout_inst is not None:
                    pid = layout_inst.property(102)
                    print(f"MAP: {current_path} -> layout cell '{layout_inst.cell.name}' pid={pid}")
                else:
                    print(f"UNMAPPED: {current_path}")
                if hasattr(inst, "instances") and inst.instances:
                    walk(inst, current_path)
        walk(self.circuit.TOP)
        
    def delete_old_port(self, pname, label_layer, anchor=None):
        property_id, port_tag = 9001, f"AUTO_PORT:{pname}"

        for layer_index in (self.term_layer, label_layer):
            to_delete = []

            for shape in self.layout_top.shapes(layer_index).each():
                tagged = str(shape.property(property_id)) == port_tag
                same_text = layer_index == label_layer and shape.is_text() and shape.text.string == pname

                same_geometry = False
                if anchor is not None and layer_index == self.term_layer and (shape.is_path() or shape.is_box()):
                    bbox = shape.bbox()
                    same_geometry = bbox.left <= anchor.x <= bbox.right and bbox.bottom <= anchor.y <= bbox.top

                if tagged or same_text or same_geometry:
                    to_delete.append(shape)

            for shape in to_delete:
                shape.delete()
                
    def get_element_global_bounds(self, elem):
        layout_inst = getattr(elem, "KLayoutInstance", None)
        global_trans = getattr(elem, "global_trans", None)

        if layout_inst is None or global_trans is None:
            return None

        bbox = layout_inst.cell.bbox()
        if bbox.empty():
            return None

        corners = [
            global_trans * pya.Point(bbox.left, bbox.bottom),
            global_trans * pya.Point(bbox.right, bbox.bottom),
            global_trans * pya.Point(bbox.left, bbox.top),
            global_trans * pya.Point(bbox.right, bbox.top),
        ]

        return (
            min(point.x for point in corners),
            min(point.y for point in corners),
            max(point.x for point in corners),
            max(point.y for point in corners),
        )
        
    def instance_edge_touches_another(self, elem, edge="bottom", tolerance=500):
        bounds = self.get_element_global_bounds(elem)
        if bounds is None:
            return False

        left, bottom, right, top = bounds
        edge_position = bottom if edge == "bottom" else top

        def walk(cell):
            for other in cell.instances:
                if hasattr(other, "instances") and other.instances:
                    yield from walk(other)
                else:
                    yield other

        for other in walk(self.circuit.TOP):
            if other is elem:
                continue

            other_bounds = self.get_element_global_bounds(other)
            if other_bounds is None:
                continue

            other_left, other_bottom, other_right, other_top = other_bounds

            horizontal_overlap = (
                other_right >= left - tolerance
                and other_left <= right + tolerance
            )

            edge_touched = (
                other_bottom - tolerance
                <= edge_position
                <= other_top + tolerance
            )

            if horizontal_overlap and edge_touched:
                print(
                    f"{elem.name}: {edge} edge touches "
                    f"{getattr(other, 'name', other)}"
                )
                return True

        return False
                
    def get_instance_visual_bottom_center_trans(self, elem, vertical_offset=0):
        bounds = self.get_element_global_bounds(elem)
        if bounds is None:
            return None

        left, bottom, right, top = bounds
        center_x = (left + right) // 2

        bottom_touches = self.instance_edge_touches_another(
            elem,
            edge="bottom",
            tolerance=500,
        )

        top_touches = self.instance_edge_touches_another(
            elem,
            edge="top",
            tolerance=500,
        )

        if bottom_touches and not top_touches:
            selected_edge = "top"
            position = pya.Point(center_x, top - vertical_offset)
        else:
            selected_edge = "bottom"
            position = pya.Point(center_x, bottom + vertical_offset)

        print(
            f"{elem.name}: bottom_touches={bottom_touches}, "
            f"top_touches={top_touches}, selected={selected_edge}"
        )

        return pya.Trans(position)

    def mark_single_connection_nodes_in_layout(self):
        label_layer, property_id = self.layout.layer(52, 0), 9001
        
        excluded_port_names = {"VDD", "GND!", "0",}

        declared_top_ports = getattr(self.circuit.TOP, "port_names", [],)

        allowed_top_ports = {
            str(port_name).strip().upper()
            for port_name in declared_top_ports
            if (str(port_name).strip().upper() not in excluded_port_names)
        }

        print("=== MARK SINGLE-CONNECTION NODES IN LAYOUT ===")

        for node in self.list_nodes_top:
            
            node_name = str(getattr(node, "name", "")).strip()

            if node_name.upper() not in allowed_top_ports:
                continue
            
            connected_elements = getattr(node, "connected_elements", [],)
            elem = connected_elements[0]
            if not hasattr(elem, "global_trans"):
                continue

            pname = f"P{elem.name} M2 M0"
            port_tag = f"AUTO_PORT:{pname}"
            port_trans = (
                self.get_instance_visual_bottom_center_trans(
                    elem,
                    vertical_offset=260,
                )
            )

            if port_trans is None:
                print(
                    f"Skipping {node_name}: "
                    f"could not find the bottom of "
                    f"{elem.name}'s layout cell"
                )
                continue
            anchor = port_trans.disp

            # Completely delete the old text and old path before drawing.
            self.delete_old_port(pname, label_layer, anchor)

            port_text = pya.Text(pname, port_trans)
            port_text.halign = pya.Text.HAlignCenter
            port_text.valign = pya.Text.VAlignCenter

            bounds = self.get_element_global_bounds(elem)
            if bounds is None:
                continue

            left, bottom, right, top = bounds
            width = 500
            path_y = port_trans.disp.y

            path_t = pya.Path(
                [pya.Point(left, path_y), pya.Point(right, path_y)],
                width,
            )

            path_shape = self.layout_top.shapes(self.term_layer).insert(path_t)
            text_shape = self.layout_top.shapes(label_layer).insert(port_text)

            path_shape.set_property(property_id, port_tag)
            text_shape.set_property(property_id, port_tag)

            port_name, node_name = f"P{elem.name}", str(node.GlobalName)

            with open(os.path.join(self.output_dir, "BIG_Cell_inductex.cir"), "a") as file:
                file.write("\n* --- Auto-added ground connection ---\n")
                file.write(f"{port_name:<10} {node_name:<10} 0\n")

            print(f"Node {node.GlobalName} -> {elem.name} ==> écrit '{pname}'")

        # Save to the exact same GDS that was originally loaded.
        self.layout.write(str(self.layout_path))
        
    
    def insert_managed_text(
        self,
        text,
        text_trans,
        geometry=None,
        geometry_layer=None,
        label_layer=None,
        property_id=9001,
        tag_prefix="AUTO_PORT",
    ):
        label_layer = self.label_layer if label_layer is None else label_layer
        geometry_layer = self.term_layer if geometry_layer is None else geometry_layer

        anchor = text_trans.disp
        tag = f"{tag_prefix}:{text}"

        self.delete_old_port(text, label_layer, anchor)

        text_object = pya.Text(text, text_trans)
        text_object.halign = pya.Text.HAlignCenter
        text_object.valign = pya.Text.VAlignCenter

        inserted_text = self.layout_top.shapes(label_layer).insert(text_object)
        inserted_text.set_property(property_id, tag)

        inserted_geometry = None

        if geometry is not None:
            inserted_geometry = self.layout_top.shapes(geometry_layer).insert(geometry)
            inserted_geometry.set_property(property_id, tag)

        return inserted_text, inserted_geometry
    
    def cover_cell_with_layer(self):
        cover_layer = self.layout.layer(10, 0)
        bbox = self.layout_top.bbox()

        if bbox.empty():
            print(f"Cell {self.layout_top.name} est vide, rien à recouvrir.")
            return

        xmin, xmax, ymax = bbox.left, bbox.right, bbox.top
        path_width = 10
        path_y = ymax - path_width // 2
        banner_height = 10
        text = "Pdc M3 M0"
        anchor = pya.Point((xmin + xmax) // 2, ymax - banner_height // 2)
        banner_path = pya.Path(
            [pya.Point(xmin, path_y), pya.Point(xmax, path_y)],
            path_width,
        )
        self.insert_managed_text(
            text=text,
            text_trans=pya.Trans(anchor),
            geometry=banner_path,
            geometry_layer=self.term_layer,
            label_layer=self.label_layer,
        )

        # Replace the previous full-cell cover instead of accumulating copies.
        self.layout_top.shapes(cover_layer).clear()
        self.layout_top.shapes(cover_layer).insert(pya.Box(bbox))

        self.layout.write(str(self.layout_path))
        
    def get_closest_resistor_center_trans(self, inst, r2_layer_number, r2_datatype=0):
        layout_inst = getattr(inst, "KLayoutInstance", None)
        global_trans = getattr(inst, "global_trans", None)

        if layout_inst is None or global_trans is None:
            return None

        r2_layer = self.layout.layer(r2_layer_number, r2_datatype)
        resistor_boxes = []

        for shape in layout_inst.cell.shapes(r2_layer).each():
            bbox = shape.bbox()

            if bbox.empty():
                continue

            # Keep horizontal resistor-like rectangles.
            if bbox.width() > bbox.height():
                resistor_boxes.append(bbox)

        if not resistor_boxes:
            print(f"WARNING: no R2 resistor found for {inst.name}")
            return None

        # The JJ anchor/origin in global layout coordinates.
        jj_position = global_trans.disp

        def distance_squared(resistor_bbox):
            resistor_center = global_trans * resistor_bbox.center()
            dx = resistor_center.x - jj_position.x
            dy = resistor_center.y - jj_position.y
            return dx * dx + dy * dy

        closest_resistor_bbox = min(resistor_boxes, key=distance_squared)
        closest_resistor_center = global_trans * closest_resistor_bbox.center()

        print(
            f"{inst.name}: closest resistor center="
            f"({closest_resistor_center.x}, {closest_resistor_center.y})"
        )

        # Keep the label globally horizontal.
        return pya.Trans(closest_resistor_center)
        
    def write_cell_names(self):
        """Écrit les noms des composants dans la cellule supérieure sur le layer 52/0."""

        self.label_layer = self.layout.layer(52, 0)
        self.term_layer = self.layout.layer(45, 0)

        def recursive_name(cell, parent_trans):
            for inst in cell.instances:
                if hasattr(inst, "global_trans"):
                    global_trans = inst.global_trans
                else:
                    layout_inst = getattr(inst, "KLayoutInstance", None)

                    if layout_inst is None:
                        print(f"WARNING: no KLayout instance for {getattr(inst, 'name', inst)}")
                        continue

                    global_trans = parent_trans * layout_inst.trans

                inst_type = getattr(inst, "type", None)

                if inst_type == "JJ":
                    port_j = f"{inst.name} M2 M1"

                    self.insert_managed_text(
                        text=port_j,
                        text_trans=global_trans,
                        label_layer=self.label_layer,
                    )

                    port_parallel = f"Prb{inst.name[1:]} M2 R2"

                    resistor_center_trans = self.get_closest_resistor_center_trans(
                        inst,
                        r2_layer_number=3,
                        r2_datatype=0,
                    )

                    if resistor_center_trans is not None:
                        self.insert_managed_text(
                            text=port_parallel,
                            text_trans=resistor_center_trans,
                            label_layer=self.label_layer,
                        )

                    inst.global_trans = global_trans

                elif inst_type == "IB":
                    ib_res_length = int(((((2.6 * 10**6) / (inst.Ib * 10**6)) * 5) / 2) * 1000000 + 2000)
                    port_ib = f"{inst.name} M3 M2"

                    self.insert_managed_text(
                        text=port_ib,
                        text_trans=global_trans * pya.Trans(pya.Point(0, ib_res_length)),
                        label_layer=self.label_layer,
                    )

                    inst.global_trans = global_trans

                elif inst_type == "R":
                    res_length = int(((inst.R * 10) / 2) * 1000 + 1000)
                    port_res = f"P{inst.name} M2 R2"

                    self.insert_managed_text(
                        text=port_res,
                        text_trans=global_trans * pya.Trans(pya.Point(0, res_length)),
                        label_layer=self.label_layer,
                    )

                    inst.global_trans = global_trans

                elif inst_type == "L":
                    inst.global_trans = global_trans

                elif hasattr(inst, "instances"):
                    recursive_name(inst, global_trans)

        recursive_name(self.circuit.TOP, pya.Trans())
        self.layout.write(str(self.layout_path))