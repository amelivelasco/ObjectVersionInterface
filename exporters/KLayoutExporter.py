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

        found_names = []

        for klayout_inst in layout_cell.each_inst():
            pid = klayout_inst.property(102)
            cell_name = klayout_inst.cell.name

            found_names.append((pid, cell_name))

            if str(pid).lower() == str(target_name).lower():
                return klayout_inst

        return None

    def get_first_level_layout_cell(self, raw_name):
        layout_path = self._raw_name_to_layout_path(raw_name)
        if not layout_path: return None

        # J6, L75, IB4, etc. are directly inside the top layout cell.
        if len(layout_path) == 1:
            return self.layout_top.name

        # I0/J5, I12/L3, I6/IB1, etc.
        first_level_pid = layout_path[0]

        for layout_inst in self.layout_top.each_inst():
            pid = layout_inst.property(102)
            if str(pid).lower() == str(first_level_pid).lower():
                return layout_inst.cell.name

        return None
    

    def build_first_level_layout_mapping(self):
        first_level_cells = {}

        def walk(cell):
            for inst in cell.instances:
                if hasattr(inst, "instances") and inst.instances:
                    walk(inst)
                    continue

                raw_name = getattr(inst, "raw_name", inst.name)
                layout_inst = getattr(inst, "KLayoutInstance", None)

                if layout_inst is None:
                    continue

                first_level_cell_name = self.get_first_level_layout_cell(raw_name)

                if first_level_cell_name is not None:
                    first_level_cells[raw_name] = first_level_cell_name

        walk(self.circuit.TOP)
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

    
    def _log_sync_context(self, layout_cell, circuit_cell, layout_parent_inst):
        if layout_parent_inst is None: print(f"SYNC TOP: circuit={circuit_cell.name} <-> layout_cell={layout_cell.name}")
        else: print(f"SYNC CELL: circuit={circuit_cell.name} <-> layout_inst_property102={layout_parent_inst.property(102)} (layout_cell={layout_cell.name})")

    def _get_synthetic_name(self, circuit_inst):
        raw_name = str(getattr(circuit_inst, "raw_name", circuit_inst.name)).upper()
        logical_name = str(circuit_inst.name).upper()
        candidates = [raw_name, logical_name]
        if raw_name.startswith("L") and not raw_name.startswith("LL"): candidates.append(f"L{raw_name}")
        if logical_name.startswith("L") and not logical_name.startswith("LL"): candidates.append(f"L{logical_name}")
        return next((name for name in candidates if name in getattr(self, "combined_layout_map", {})), None)

    def _find_physical_layout_instance(self, physical_name):
        lookup_candidates = [physical_name]
        if physical_name.startswith("LL"): lookup_candidates.append(physical_name[1:])

        for lookup_name in lookup_candidates:
            path_parts = self._raw_name_to_layout_path(lookup_name)
            found_inst, found_trans = self.find_layout_instance_by_path(self.layout_top, path_parts)
            if found_inst is not None: return found_inst, found_trans
        return None, None

    def _map_synthetic_instance(self, circuit_inst, synthetic_name):
        physical_names = self.combined_layout_map[synthetic_name]
        physical_instances, physical_transforms = [], []

        for physical_name in physical_names:
            found_inst, found_trans = self._find_physical_layout_instance(physical_name)
            if found_inst is None:
                raise RuntimeError(f"Synthetic '{synthetic_name}' maps to physical '{physical_name}', but that instance was not found in the GDS.")
            physical_instances.append(found_inst); physical_transforms.append(found_trans)

        circuit_inst.KLayoutInstances = physical_instances
        circuit_inst.KLayoutTransforms = physical_transforms
        circuit_inst.combined_layout_names = physical_names
        circuit_inst.KLayoutInstance = physical_instances[0]
        circuit_inst.KLayoutCell = physical_instances[0].cell
        circuit_inst.global_trans = physical_transforms[0]

    def _get_layout_lookup_names(self, circuit_inst):
        lookup_names = [getattr(circuit_inst, "raw_name", circuit_inst.name)]
        if lookup_names[0] != circuit_inst.name: lookup_names.append(circuit_inst.name)
        return lookup_names

    def _find_layout_instance(self, lookup_names):
        for lookup_name in lookup_names:
            path_parts = self._raw_name_to_layout_path(lookup_name)
            layout_inst, global_trans = self.find_layout_instance_by_path(self.layout_top, path_parts)
            if layout_inst is not None: return layout_inst, global_trans
        return None, None

    def _map_regular_layout_instance(self, circuit_inst, layout_cell):
        lookup_names = self._get_layout_lookup_names(circuit_inst)

        layout_inst, global_trans = self._find_layout_instance(lookup_names)
        if layout_inst is None: raise RuntimeError(f"Instance '{circuit_inst.name}' not found in layout. Tried names: {lookup_names}")

        circuit_inst.KLayoutInstance = layout_inst
        circuit_inst.KLayoutCell = layout_inst.cell
        circuit_inst.global_trans = global_trans
        return layout_inst

    def _sync_layout_cell(self, layout_cell, circuit_cell, layout_parent_inst=None):
        self._log_sync_context(layout_cell, circuit_cell, layout_parent_inst)

        for circuit_inst in circuit_cell.instances:
            synthetic_name = self._get_synthetic_name(circuit_inst)
            if synthetic_name:
                self._map_synthetic_instance(circuit_inst, synthetic_name)
                continue

            layout_inst = self._map_regular_layout_instance(circuit_inst, layout_cell)
            if hasattr(circuit_inst, "instances") and circuit_inst.instances:
                self._sync_layout_cell(layout_inst.cell, circuit_inst, layout_inst)

    def integrating_layout(self):
        self._sync_layout_cell(self.layout_top, self.circuit.TOP)

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
        
    def _shape_matches_port(self, shape, layer_index, label_layer, pname, port_tag, anchor, property_id):
        if str(shape.property(property_id)) == port_tag: return True
        if layer_index == label_layer and shape.is_text() and shape.text.string == pname: return True
        if anchor is None or layer_index != self.term_layer or not (shape.is_path() or shape.is_box()): return False
        bbox = shape.bbox()
        return bbox.left <= anchor.x <= bbox.right and bbox.bottom <= anchor.y <= bbox.top

    def delete_old_port(self, pname, label_layer, anchor=None):
        property_id, port_tag = 9001, f"AUTO_PORT:{pname}"

        for layer_index in (self.term_layer, label_layer):
            to_delete = [
                shape for shape in self.layout_top.shapes(layer_index).each()
                if self._shape_matches_port(shape, layer_index, label_layer, pname, port_tag, anchor, property_id)
            ]
            for shape in to_delete: shape.delete()

    def get_ib_center_trans(self, inst, r2_layer_number=3, r2_datatype=0):
        """Return the real global center of an IB resistor, with the old formula as fallback."""
        center_trans = self.get_main_r2_center_trans(inst, r2_layer_number, r2_datatype)

        if center_trans is not None:
            return center_trans

        global_trans = getattr(inst, "global_trans", None)
        ib = float(getattr(inst, "Ib", 0) or 0)

        if global_trans is None or ib <= 0:
            print(
                f"WARNING: cannot determine IB center for "
                f"{getattr(inst, 'name', inst)}"
            )
            return None

        ib_res_length = int(
            (((2.6 * 10**6) / (ib * 10**6)) * 5 / 2)
            * 1000000
            + 2000
        )

        fallback = global_trans * pya.Trans(
            pya.Point(0, ib_res_length)
        )

        return fallback
                
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
        
    def _walk_leaf_instances(self, cell):
        for other in cell.instances:
            if hasattr(other, "instances") and other.instances:
                yield from self._walk_leaf_instances(other)
            else:
                yield other

    def _bounds_touch_edge(self, bounds, edge_position, left, right, tolerance):
        other_left, other_bottom, other_right, other_top = bounds
        horizontal_overlap = other_right >= left - tolerance and other_left <= right + tolerance
        edge_touched = other_bottom - tolerance <= edge_position <= other_top + tolerance
        return horizontal_overlap and edge_touched

    def instance_edge_touches_another(self, elem, edge="bottom", tolerance=500):
        bounds = self.get_element_global_bounds(elem)
        if bounds is None: return False

        left, bottom, right, top = bounds
        edge_position = bottom if edge == "bottom" else top

        for other in self._walk_leaf_instances(self.circuit.TOP):
            if other is elem: continue

            other_bounds = self.get_element_global_bounds(other)
            if other_bounds is None or not self._bounds_touch_edge(other_bounds, edge_position, left, right, tolerance): continue
            return True

        return False

    def get_recursive_cell_bbox(self, cell):
        bbox = cell.bbox()
        if not bbox.empty():
            return bbox

        points = []

        for child in cell.each_inst():
            child_bbox = self.get_recursive_cell_bbox(child.cell)
            if child_bbox is None:
                continue

            for point in (
                pya.Point(child_bbox.left, child_bbox.bottom),
                pya.Point(child_bbox.right, child_bbox.bottom),
                pya.Point(child_bbox.left, child_bbox.top),
                pya.Point(child_bbox.right, child_bbox.top),
            ):
                points.append(child.trans * point)

        if not points:
            return None

        return pya.Box(
            min(point.x for point in points),
            min(point.y for point in points),
            max(point.x for point in points),
            max(point.y for point in points),
        )
                
    def get_instance_visual_bottom_center_trans(self, elem, vertical_offset=0):
        layout_inst = getattr(elem, "KLayoutInstance", None)
        global_trans = getattr(elem, "global_trans", None)

        if layout_inst is None or global_trans is None:
            return None

        bbox = self.get_recursive_cell_bbox(layout_inst.cell)
        if bbox is None or bbox.empty():
            print(f"WARNING: no recursive bounds found for {elem.name}")
            return None

        sideways = bbox.width() > bbox.height()

        if sideways:

            use_left = abs(bbox.left) <= abs(bbox.right)
            local_x = (
                bbox.left + vertical_offset
                if use_left
                else bbox.right - vertical_offset
            )

            local_start = pya.Point(local_x, bbox.bottom)
            local_end = pya.Point(local_x, bbox.top)
        else:

            local_y = bbox.bottom + vertical_offset
            local_start = pya.Point(bbox.left, local_y)
            local_end = pya.Point(bbox.right, local_y)

        edge_start = global_trans * local_start
        edge_end = global_trans * local_end

        anchor = pya.Point(
            (edge_start.x + edge_end.x) // 2,
            (edge_start.y + edge_end.y) // 2,
        )

        is_vertical = abs(edge_end.y - edge_start.y) > abs(
            edge_end.x - edge_start.x
        )

        port_trans = pya.Trans(
            1 if is_vertical else 0,
            False,
            anchor.x,
            anchor.y,
        )


        return port_trans, edge_start, edge_end

    def _node_name(self, value):
        return str(getattr(value, "GlobalName", getattr(value, "name", value)))

    def _get_connected_elements(self, elem, opposite_name):
        connected = []
        for other in self._walk_leaf_instances(self.circuit.TOP):
            if other is elem: continue
            other_net_in = self._node_name(getattr(other, "net_in", ""))
            other_net_out = self._node_name(getattr(other, "net_out", ""))
            if opposite_name in {other_net_in, other_net_out}: connected.append(other)
        return connected

    def _get_neighbor_centers(self, elements):
        centers = []
        for other in elements:
            bounds = self.get_element_global_bounds(other)
            if bounds is None: continue
            left, bottom, right, top = bounds
            centers.append(((left + right) // 2, (bottom + top) // 2))
        return centers

    def _get_closest_neighbor_center(self, centers, center_x, center_y):
        if not centers: return center_x, center_y
        return min(centers, key=lambda point: (point[0] - center_x) ** 2 + (point[1] - center_y) ** 2)

    def _get_farthest_port_side(self, cell_is_sideways, center_x, center_y, neighbor_x, neighbor_y):
        if cell_is_sideways: return "right" if neighbor_x <= center_x else "left"
        return "top" if neighbor_y <= center_y else "bottom"

    def _build_port_geometry(self, side, bounds, inset):
        left, bottom, right, top = bounds
        center_x, center_y = (left + right) // 2, (bottom + top) // 2

        if side in ("left", "right"):
            x = left + inset if side == "left" else right - inset
            anchor = pya.Point(x, center_y)
            return pya.Trans(1, False, anchor.x, anchor.y), pya.Point(x, bottom), pya.Point(x, top)

        y = top - inset if side == "top" else bottom + inset
        anchor = pya.Point(center_x, y)
        return pya.Trans(0, False, anchor.x, anchor.y), pya.Point(left, y), pya.Point(right, y)

    def get_port_farthest_from_connected_cell(self, elem, port_node, inset=260):
        bounds = self.get_element_global_bounds(elem)
        if bounds is None: return None

        left, bottom, right, top = bounds
        center_x, center_y = (left + right) // 2, (bottom + top) // 2
        cell_is_sideways = (right - left) >= (top - bottom)

        port_name = self._node_name(port_node)
        net_in, net_out = getattr(elem, "net_in", None), getattr(elem, "net_out", None)
        opposite_node = net_out if port_name == self._node_name(net_in) else net_in
        opposite_name = self._node_name(opposite_node)

        connected_elements = self._get_connected_elements(elem, opposite_name)
        neighbor_centers = self._get_neighbor_centers(connected_elements)
        neighbor_x, neighbor_y = self._get_closest_neighbor_center(neighbor_centers, center_x, center_y)
        side = self._get_farthest_port_side(cell_is_sideways, center_x, center_y, neighbor_x, neighbor_y)
        text_trans, edge_start, edge_end = self._build_port_geometry(side, bounds, inset)

        return text_trans, edge_start, edge_end

    def mark_single_connection_nodes_in_layout(self):
        auto_ground_groups = {}
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
            port_geometry = self.get_port_farthest_from_connected_cell(
                elem,
                node,
                inset=260,
            )

            if port_geometry is None:
                print(
                    f"Skipping {node_name}: "
                    f"could not calculate the bounds of "
                    f"{elem.name}'s layout cell"
                )
                continue

            port_trans, edge_start, edge_end = port_geometry
            anchor = port_trans.disp

            self.delete_old_port(pname, label_layer, anchor)

            port_text = pya.Text(pname, port_trans)
            port_text.halign = pya.Text.HAlignCenter
            port_text.valign = pya.Text.VAlignCenter

            path_t = pya.Path(
                [edge_start, edge_end],
                500,
            )

            path_shape = self.layout_top.shapes(self.term_layer).insert(path_t)
            text_shape = self.layout_top.shapes(label_layer).insert(port_text)

            path_shape.set_property(property_id, port_tag)
            text_shape.set_property(property_id, port_tag)

            port_name, node_name = f"P{elem.name}", str(node.GlobalName)

            raw_name = str(getattr(elem, "original_name", getattr(elem, "raw_name", elem.name)))
            clean_name = raw_name

            for prefix in ("Xpc", "Xsj", "L", "R"):
                if clean_name.lower().startswith(prefix.lower()):
                    clean_name = clean_name[len(prefix):]
                    break

            parts = clean_name.split("|")
            instance_path = "/".join(parts[:-1]) if len(parts) > 1 else str(getattr(self.circuit.TOP, "name", "TOP"))
            auto_ground_groups.setdefault(instance_path, []).append(f"{port_name:<10} {node_name:<15} 0")


        auto_ground_lines = []

        for instance_path, group_lines in auto_ground_groups.items():
            auto_ground_lines.append(f"* --- INSTANCE {instance_path} ---")
            auto_ground_lines.extend(dict.fromkeys(group_lines))
            auto_ground_lines.append("")

        self.layout.write(str(self.layout_path))
        return auto_ground_lines
        
    
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

        xmax, ymin, ymax =  bbox.right, bbox.bottom, bbox.top

        path_width = 10
        banner_length = 500
        center_y = (ymin + ymax) // 2

        # Vertical Pdc on the RIGHT border.
        path_x = xmax - path_width // 2
        y1 = center_y - banner_length // 2
        y2 = center_y + banner_length // 2

        text = "Pdc M2 M0"
        anchor = pya.Point(path_x, center_y)

        banner_path = pya.Path(
            [pya.Point(path_x, y1), pya.Point(path_x, y2)],
            path_width,
        )

        self.insert_managed_text(
            text=text,
            text_trans=pya.Trans(1, False, anchor.x, anchor.y),
            geometry=banner_path,
            geometry_layer=self.term_layer,
            label_layer=self.label_layer,
        )

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

            if bbox.width() > bbox.height():
                resistor_boxes.append(bbox)

        if not resistor_boxes:
            print(f"WARNING: no R2 resistor found for {inst.name}")
            return None

        jj_position = global_trans.disp

        def distance_squared(resistor_bbox):
            resistor_center = global_trans * resistor_bbox.center()
            dx = resistor_center.x - jj_position.x
            dy = resistor_center.y - jj_position.y
            return dx * dx + dy * dy

        closest_resistor_bbox = min(resistor_boxes, key=distance_squared)
        closest_resistor_center = global_trans * closest_resistor_bbox.center()

        return pya.Trans(closest_resistor_center)
    
    def has_parallel_jj(self, elem):
        elem_nets = {str(getattr(elem, "net_in", "")), str(getattr(elem, "net_out", ""))}
        if "" in elem_nets or len(elem_nets) != 2: return False

        def walk(cell):
            for other in cell.instances:
                if hasattr(other, "instances") and other.instances: yield from walk(other)
                else: yield other

        return any(other is not elem and getattr(other, "type", None) == "JJ" and elem_nets == {str(getattr(other, "net_in", "")), str(getattr(other, "net_out", ""))} for other in walk(self.circuit.TOP))


    def get_main_r2_center_trans(self, elem, layer_number=3, datatype=0):
        layout_inst, global_trans = getattr(elem, "KLayoutInstance", None), getattr(elem, "global_trans", None)
        if layout_inst is None or global_trans is None: return None

        r2_layer, candidates = self.layout.layer(layer_number, datatype), []

        def add_bbox(bbox, trans):
            if bbox.empty(): return
            points = [trans * pya.Point(bbox.left, bbox.bottom), trans * pya.Point(bbox.right, bbox.bottom), trans * pya.Point(bbox.left, bbox.top), trans * pya.Point(bbox.right, bbox.top)]
            left, right = min(point.x for point in points), max(point.x for point in points)
            bottom, top = min(point.y for point in points), max(point.y for point in points)
            candidates.append(((right - left) * (top - bottom), pya.Point((left + right) // 2, (bottom + top) // 2)))

        def walk(cell, trans):
            for shape in cell.shapes(r2_layer).each(): add_bbox(shape.bbox(), trans)
            for child in cell.each_inst(): walk(child.cell, trans * child.trans)

        walk(layout_inst.cell, global_trans)
        if not candidates:
            print(f"WARNING: no recursive R2 geometry found for {elem.name}")
            return None

        area, center = max(candidates, key=lambda candidate: candidate[0])
        return pya.Trans(center)
        
    def _get_instance_global_trans(self, inst, parent_trans):
        if hasattr(inst, "global_trans"): return inst.global_trans
        layout_inst = getattr(inst, "KLayoutInstance", None)
        if layout_inst is None:
            print(f"WARNING: no KLayout instance for {getattr(inst, 'name', inst)}"); return None
        return parent_trans * layout_inst.trans

    def _write_jj_name(self, inst, global_trans):
        self.insert_managed_text(text=f"{inst.name} M2 M1", text_trans=global_trans, label_layer=self.label_layer)
        resistor_center_trans = self.get_closest_resistor_center_trans(inst, r2_layer_number=3, r2_datatype=0)
        if resistor_center_trans is not None:
            self.insert_managed_text(text=f"Prb{inst.name[1:]} M2 R2", text_trans=resistor_center_trans, label_layer=self.label_layer)
        inst.global_trans = global_trans

    def _write_ib_name(self, inst, global_trans):
        inst.global_trans = global_trans
        label_trans = self.get_ib_center_trans(inst, r2_layer_number=3, r2_datatype=0)
        if label_trans is not None:
            self.insert_managed_text(text=f"{inst.name} M2 R2", text_trans=label_trans, label_layer=self.label_layer)

    def _write_resistor_name(self, inst, global_trans):
        inst.global_trans = global_trans
        port_res = f"P{inst.name} M2 R2"
        res_length = int(((inst.R * 10) / 2) * 1000 + 1000)
        default_trans = global_trans * pya.Trans(pya.Point(0, res_length))
        parallel_jj = self.has_parallel_jj(inst)
        label_trans = default_trans if parallel_jj else self.get_main_r2_center_trans(inst, 3, 0) or default_trans
        self.insert_managed_text(text=port_res, text_trans=label_trans, label_layer=self.label_layer)

    def _write_component_name(self, inst, global_trans):
        inst_type = getattr(inst, "type", None)
        if inst_type == "JJ": self._write_jj_name(inst, global_trans); return True
        if inst_type == "IB": self._write_ib_name(inst, global_trans); return True
        if inst_type == "R": self._write_resistor_name(inst, global_trans); return True
        if inst_type == "L":
            inst.global_trans = global_trans; return True
        return False

    def _write_names_recursive(self, cell, parent_trans):
        for inst in cell.instances:
            global_trans = self._get_instance_global_trans(inst, parent_trans)
            if global_trans is None: continue
            if self._write_component_name(inst, global_trans): continue
            if hasattr(inst, "instances"): self._write_names_recursive(inst, global_trans)

    def write_cell_names(self):
        """Écrit les noms des composants dans la cellule supérieure sur le layer 52/0."""
        self.label_layer = self.layout.layer(52, 0)
        self.term_layer = self.layout.layer(45, 0)
        self.clear_old_labels()
        self._write_names_recursive(self.circuit.TOP, pya.Trans())
        self.layout.write(str(self.layout_path))

    def clear_old_labels(self):
        """Remove all existing text labels and old auto-generated port geometry."""

        property_id = 9001

        # Remove ALL old text labels from layer 52/0.
        old_texts = [
            shape
            for shape in self.layout_top.shapes(self.label_layer).each()
            if shape.is_text()
        ]

        for shape in old_texts:
            shape.delete()

        # Remove only geometry previously generated by our code.
        old_auto_geometry = [
            shape
            for shape in self.layout_top.shapes(self.term_layer).each()
            if shape.property(property_id) is not None
        ]

        for shape in old_auto_geometry:
            shape.delete()
