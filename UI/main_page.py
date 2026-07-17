from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict, deque
from itertools import count
import heapq
import math
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
            
    
    @staticmethod
    def get_component_instance_path(component):
        """
        Return the parent hierarchical instance path.

        Examples:
            I0/L1       -> I0
            I0/I3/L1    -> I0/I3
        """
        path = str(
            getattr(component, "path", "") or ""
        ).strip()

        if "/" in path:
            return path.rsplit("/", 1)[0]

        if path:
            return path

        return str(
            getattr(component, "layout_cell", "")
            or "root"
        )

    def get_layout_instance_id(self, component):
        """
        A layout-cell type is not a unique instance.

        I0/NDROM2 and I12/NDROM2 must be placed in separate boxes even though
        both components report layout_cell='NDROM2'.
        """
        instance_path = (
            self.get_component_instance_path(
                component
            )
        )

        return (
            f"{instance_path}::"
            f"{component.layout_cell}"
        )

    def handle_layout_cell(self, layout_cells, component):
        instance_id = self.get_layout_instance_id(
            component
        )
        instance_path = (
            self.get_component_instance_path(
                component
            )
        )

        existing_layout = next(
            (
                layout
                for layout in layout_cells
                if getattr(
                    layout,
                    "instance_id",
                    None,
                ) == instance_id
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

            # LayoutInstance does not need constructor changes. These
            # attributes are attached for the exporter.
            new_layout_cell.instance_id = (
                instance_id
            )
            new_layout_cell.instance_path = (
                instance_path
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
            for line_number, line in enumerate(file, start=1):
                line = line.strip()

                if not line:
                    continue

                if line.startswith("generated_at:"):
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

                component.original_index = len(ordered_components)
                ordered_components.append(component)

        return ordered_components


    @staticmethod
    def _snap_down(value, grid_size):
        return int(math.floor(value / grid_size) * grid_size)

    @staticmethod
    def _snap_up(value, grid_size):
        return int(math.ceil(value / grid_size) * grid_size)

    @staticmethod
    def _component_order(component):
        return getattr(component, "original_index", 0)

    def _build_component_edges(self, components):
        """
        Build directed edges from producer components to consumer components.

        A component produces ``net_out`` and consumes ``net_in``. A shared net
        may therefore create a branch or merge rather than a single edge.
        """
        producers = defaultdict(list)
        consumers = defaultdict(list)

        for component in components:
            if component.net_out is not None:
                producers[component.net_out].append(component.raw)

            if component.net_in is not None:
                consumers[component.net_in].append(component.raw)

        edges = defaultdict(set)
        predecessors = defaultdict(set)

        for net in set(producers).intersection(consumers):
            for producer_id in producers[net]:
                for consumer_id in consumers[net]:
                    if producer_id == consumer_id:
                        continue

                    edges[producer_id].add(consumer_id)
                    predecessors[consumer_id].add(producer_id)

        for component in components:
            edges.setdefault(component.raw, set())
            predecessors.setdefault(component.raw, set())

        return edges, predecessors

    def _assign_graph_layers(self, node_ids, edges, order_lookup):
        """
        Assign a left-to-right layer to each node.

        Kahn's algorithm handles the acyclic part. Any nodes remaining in a
        feedback loop are placed deterministically after their known
        predecessors instead of making the exporter fail.
        """
        node_ids = list(node_ids)
        node_set = set(node_ids)
        indegree = {node_id: 0 for node_id in node_ids}
        predecessors = defaultdict(set)

        for source_id in node_ids:
            for target_id in edges.get(source_id, ()):
                if target_id not in node_set or target_id == source_id:
                    continue

                indegree[target_id] += 1
                predecessors[target_id].add(source_id)

        queue = deque(sorted(
            (
                node_id
                for node_id in node_ids
                if indegree[node_id] == 0
            ),
            key=lambda node_id: order_lookup.get(node_id, 0),
        ))

        layers = {node_id: 0 for node_id in node_ids}
        processed = set()

        while queue:
            source_id = queue.popleft()
            processed.add(source_id)

            for target_id in sorted(
                edges.get(source_id, ()),
                key=lambda node_id: order_lookup.get(node_id, 0),
            ):
                if target_id not in node_set:
                    continue

                layers[target_id] = max(
                    layers[target_id],
                    layers[source_id] + 1,
                )
                indegree[target_id] -= 1

                if indegree[target_id] == 0:
                    queue.append(target_id)

        # Gracefully place components involved in cycles.
        for node_id in sorted(
            node_set.difference(processed),
            key=lambda item: order_lookup.get(item, 0),
        ):
            known_predecessor_layers = [
                layers[pred_id]
                for pred_id in predecessors[node_id]
                if pred_id in processed
            ]

            if known_predecessor_layers:
                layers[node_id] = max(known_predecessor_layers) + 1
            else:
                layers[node_id] = max(layers.values(), default=0) + 1

            processed.add(node_id)

        return layers

    def _order_nodes_in_layers(
        self,
        node_ids,
        layers,
        edges,
        predecessors,
        order_lookup,
        sweeps=6,
    ):
        """
        Apply forward/backward barycentric sweeps to reduce edge crossings.
        """
        layer_to_nodes = defaultdict(list)

        for node_id in node_ids:
            layer_to_nodes[layers[node_id]].append(node_id)

        for layer_nodes in layer_to_nodes.values():
            layer_nodes.sort(
                key=lambda node_id: order_lookup.get(node_id, 0)
            )

        max_layer = max(layer_to_nodes, default=0)

        for _ in range(sweeps):
            positions = {
                node_id: index
                for layer_nodes in layer_to_nodes.values()
                for index, node_id in enumerate(layer_nodes)
            }

            # Left-to-right sweep: align with predecessors.
            for layer_index in range(1, max_layer + 1):
                current_nodes = layer_to_nodes[layer_index]

                def predecessor_score(node_id):
                    connected = [
                        positions[pred_id]
                        for pred_id in predecessors.get(node_id, ())
                        if pred_id in positions
                    ]

                    if not connected:
                        return (
                            float(order_lookup.get(node_id, 0)),
                            order_lookup.get(node_id, 0),
                        )

                    return (
                        sum(connected) / len(connected),
                        order_lookup.get(node_id, 0),
                    )

                current_nodes.sort(key=predecessor_score)

            positions = {
                node_id: index
                for layer_nodes in layer_to_nodes.values()
                for index, node_id in enumerate(layer_nodes)
            }

            # Right-to-left sweep: align with successors.
            for layer_index in range(max_layer - 1, -1, -1):
                current_nodes = layer_to_nodes[layer_index]

                def successor_score(node_id):
                    connected = [
                        positions[successor_id]
                        for successor_id in edges.get(node_id, ())
                        if successor_id in positions
                    ]

                    if not connected:
                        return (
                            float(order_lookup.get(node_id, 0)),
                            order_lookup.get(node_id, 0),
                        )

                    return (
                        sum(connected) / len(connected),
                        order_lookup.get(node_id, 0),
                    )

                current_nodes.sort(key=successor_score)

        return {
            layer_index: layer_to_nodes[layer_index]
            for layer_index in sorted(layer_to_nodes)
        }

    def _place_one_layout_cell(
        self,
        components,
        element_ids,
        component_width,
        component_height,
        column_gap,
        row_gap,
        cell_padding,
        companion_gap,
    ):
        component_by_id = {
            component.raw: component
            for component in components
        }
        order_lookup = {
            component.raw: self._component_order(component)
            for component in components
        }

        edges, predecessors = self._build_component_edges(components)
        layers = self._assign_graph_layers(
            component_by_id,
            edges,
            order_lookup,
        )
        ordered_layers = self._order_nodes_in_layers(
            component_by_id,
            layers,
            edges,
            predecessors,
            order_lookup,
        )

        # A JJ and its generated resistor occupy one vertical placement block.
        block_heights = {}

        for component_id, component in component_by_id.items():
            component_type, _ = self.get_component_type(component)

            if component_type == "JJ":
                block_heights[component_id] = (
                    component_height * 2 + companion_gap
                )
            else:
                block_heights[component_id] = component_height

        layer_heights = {}

        for layer_index, layer_nodes in ordered_layers.items():
            layer_heights[layer_index] = (
                sum(block_heights[node_id] for node_id in layer_nodes)
                + row_gap * max(0, len(layer_nodes) - 1)
            )

        content_height = max(
            layer_heights.values(),
            default=component_height,
        )

        placements = {}

        for layer_index, layer_nodes in ordered_layers.items():
            x = (
                cell_padding
                + layer_index * (component_width + column_gap)
            )
            y = (
                cell_padding
                + (content_height - layer_heights[layer_index]) // 2
            )

            for order_in_layer, component_id in enumerate(layer_nodes):
                placements[component_id] = {
                    "x": int(x),
                    "y": int(y),
                    "width": component_width,
                    "height": component_height,
                    "layer": layer_index,
                    "order_in_layer": order_in_layer,
                    "orientation": "left-to-right",
                }

                component = component_by_id[component_id]
                component_type, _ = self.get_component_type(component)

                if component_type == "JJ":
                    resistor_id = re.sub(
                        r"^Xsj",
                        "R",
                        component_id,
                        count=1,
                        flags=re.IGNORECASE,
                    )

                    if resistor_id in element_ids:
                        placements[resistor_id] = {
                            "x": int(x),
                            "y": int(
                                y + component_height + companion_gap
                            ),
                            "width": component_width,
                            "height": component_height,
                            "layer": layer_index,
                            "order_in_layer": order_in_layer,
                            "orientation": "left-to-right",
                            "companion_of": component_id,
                        }

                y += block_heights[component_id] + row_gap

        max_layer = max(ordered_layers, default=0)
        cell_width = (
            cell_padding * 2
            + component_width
            + max_layer * (component_width + column_gap)
        )
        cell_height = cell_padding * 2 + content_height

        return placements, int(cell_width), int(cell_height)

    def place_components(
        self,
        ordered_components,
        elements,
        *,
        image_size=44,
        pin_offset=22,
        layout_cell_margin_x=70,
        layout_cell_margin_y=70,
        layout_cell_gap_x=70,
        layout_cell_gap_y=70,
        layout_cell_padding_x=45,
        layout_cell_padding_top=75,
        layout_cell_padding_bottom=40,
        layout_cell_element_gap_x=105,
        layout_cell_element_gap_y=115,
        layout_cell_min_width=320,
        layout_cell_min_height=230,
        layout_cell_row_width=1500,
    ):
        """
        Reproduce the former JavaScript layout in Python.

        Layout cells are placed left-to-right and wrap to a new row. Elements
        inside each cell use the former snake layout:

            even row: left-to-right
            odd row:  right-to-left

        Coordinates exported for elements are top-left rectangle coordinates,
        while pins follow the snake direction exactly as the old JavaScript
        implementation did.
        """
        del ordered_components  # Element order already contains JJ companions.

        elements_by_cell = defaultdict(list)
        cell_order = []

        for element in elements:
            cell_id = (
                element.get("layout_instance")
                or element.get("layout_cell")
            )

            if cell_id not in elements_by_cell:
                cell_order.append(cell_id)

            elements_by_cell[cell_id].append(element)

        def measure_cell(element_count):
            safe_count = max(1, element_count)

            columns = max(
                1,
                math.ceil(
                    math.sqrt(safe_count * 1.5)
                ),
            )

            rows = max(
                1,
                math.ceil(safe_count / columns),
            )

            content_width = (
                image_size
                + max(0, columns - 1)
                * layout_cell_element_gap_x
            )

            content_height = (
                image_size
                + max(0, rows - 1)
                * layout_cell_element_gap_y
            )

            width = max(
                layout_cell_min_width,
                layout_cell_padding_x * 2
                + content_width,
            )

            height = max(
                layout_cell_min_height,
                layout_cell_padding_top
                + content_height
                + layout_cell_padding_bottom,
            )

            return {
                "columns": columns,
                "rows": rows,
                "content_width": content_width,
                "content_height": content_height,
                "width": width,
                "height": height,
            }

        measurements = {
            cell_id: measure_cell(
                len(elements_by_cell[cell_id])
            )
            for cell_id in cell_order
        }

        cell_placements = {}
        element_placements = {}

        x = layout_cell_margin_x
        y = layout_cell_margin_y
        current_row_height = 0
        maximum_right = 0

        row_right_limit = (
            layout_cell_margin_x
            + layout_cell_row_width
        )

        for cell_id in cell_order:
            measurement = measurements[cell_id]

            should_start_new_row = (
                x != layout_cell_margin_x
                and x + measurement["width"]
                > row_right_limit
            )

            if should_start_new_row:
                x = layout_cell_margin_x
                y += (
                    current_row_height
                    + layout_cell_gap_y
                )
                current_row_height = 0

            cell_placements[cell_id] = {
                "x": x,
                "y": y,
                "width": measurement["width"],
                "height": measurement["height"],
                "columns": measurement["columns"],
                "rows": measurement["rows"],
                "content_width":
                    measurement["content_width"],
                "content_height":
                    measurement["content_height"],
                "layer": 0,
            }

            content_start_x = (
                x
                + (
                    measurement["width"]
                    - measurement["content_width"]
                ) / 2
            )

            content_start_y = (
                y + layout_cell_padding_top
            )

            for index, element in enumerate(
                elements_by_cell[cell_id]
            ):
                row = index // measurement["columns"]
                index_in_row = (
                    index % measurement["columns"]
                )

                direction = 1 if row % 2 == 0 else -1

                if direction == 1:
                    column = index_in_row
                else:
                    column = (
                        measurement["columns"]
                        - 1
                        - index_in_row
                    )

                center_x = (
                    content_start_x
                    + image_size / 2
                    + column
                    * layout_cell_element_gap_x
                )

                center_y = (
                    content_start_y
                    + image_size / 2
                    + row
                    * layout_cell_element_gap_y
                )

                input_pin = {
                    "x":
                        center_x
                        - direction * pin_offset,
                    "y": center_y,
                }

                output_pin = {
                    "x":
                        center_x
                        + direction * pin_offset,
                    "y": center_y,
                }

                element_placements[element["id"]] = {
                    "x": center_x - image_size / 2,
                    "y": center_y - image_size / 2,
                    "width": image_size,
                    "height": image_size,
                    "row": row,
                    "col": column,
                    "direction": direction,
                    "orientation":
                        "left-to-right"
                        if direction == 1
                        else "right-to-left",
                    "parent_layout_cell": cell_id,
                    "pins": {
                        "in": input_pin,
                        "out": output_pin,
                    },
                }

            maximum_right = max(
                maximum_right,
                x + measurement["width"],
            )

            current_row_height = max(
                current_row_height,
                measurement["height"],
            )

            x += (
                measurement["width"]
                + layout_cell_gap_x
            )

        canvas_width = max(
            900,
            maximum_right
            + layout_cell_margin_x,
        )

        canvas_height = max(
            550,
            y
            + current_row_height
            + layout_cell_margin_y,
        )

        missing = {
            element["id"]
            for element in elements
        }.difference(element_placements)

        if missing:
            raise ValueError(
                "No compact placement generated for: "
                + ", ".join(sorted(missing))
            )

        return {
            "elements": element_placements,
            "layout_cells": cell_placements,
            "canvas": {
                "width": canvas_width,
                "height": canvas_height,
            },
        }

    @staticmethod
    def _compress_orthogonal_path(points):
        if len(points) <= 2:
            return points

        compressed = [points[0]]

        for index in range(1, len(points) - 1):
            previous_point = compressed[-1]
            current_point = points[index]
            next_point = points[index + 1]

            first_direction = (
                current_point[0] - previous_point[0],
                current_point[1] - previous_point[1],
            )
            second_direction = (
                next_point[0] - current_point[0],
                next_point[1] - current_point[1],
            )

            if (
                first_direction[0] == 0
                and second_direction[0] == 0
            ):
                continue

            if (
                first_direction[1] == 0
                and second_direction[1] == 0
            ):
                continue

            compressed.append(current_point)

        compressed.append(points[-1])
        return compressed

    @staticmethod
    def _distance_to_goal_box(point, goal_bounds):
        min_x, min_y, max_x, max_y = goal_bounds
        x, y = point

        dx = max(min_x - x, 0, x - max_x)
        dy = max(min_y - y, 0, y - max_y)

        return dx + dy

    def _astar_route(
        self,
        *,
        start,
        goals,
        net_id,
        blocked,
        occupied,
        terminal_owners,
        bounds,
        grid_size,
        bend_penalty,
        congestion_penalty,
        max_expansions,
    ):
        goals = set(goals)

        if start in goals:
            return [start]

        goal_bounds = (
            min(point[0] for point in goals),
            min(point[1] for point in goals),
            max(point[0] for point in goals),
            max(point[1] for point in goals),
        )

        min_x, min_y, max_x, max_y = bounds
        directions = (
            (grid_size, 0),
            (-grid_size, 0),
            (0, grid_size),
            (0, -grid_size),
        )

        serial = count()
        start_state = (start, None)
        open_heap = [(
            self._distance_to_goal_box(start, goal_bounds),
            0.0,
            next(serial),
            start,
            None,
        )]
        best_cost = {start_state: 0.0}
        came_from = {}
        expansions = 0

        while open_heap and expansions < max_expansions:
            _, current_cost, _, current, previous_direction = (
                heapq.heappop(open_heap)
            )
            current_state = (current, previous_direction)

            if current_cost != best_cost.get(current_state):
                continue

            if current in goals:
                path = [current_state]

                while current_state in came_from:
                    current_state = came_from[current_state]
                    path.append(current_state)

                path.reverse()
                return [state[0] for state in path]

            expansions += 1

            for direction in directions:
                next_point = (
                    current[0] + direction[0],
                    current[1] + direction[1],
                )
                next_x, next_y = next_point

                if not (
                    min_x <= next_x <= max_x
                    and min_y <= next_y <= max_y
                ):
                    continue

                if (
                    next_point in blocked
                    and next_point not in goals
                    and next_point != start
                ):
                    continue

                owners = terminal_owners.get(next_point, set())

                if owners and net_id not in owners:
                    continue

                occupying_net = occupied.get(next_point)

                if (
                    occupying_net is not None
                    and occupying_net != net_id
                ):
                    continue

                movement_cost = 1.0

                if (
                    previous_direction is not None
                    and direction != previous_direction
                ):
                    movement_cost += bend_penalty

                if occupying_net == net_id:
                    movement_cost *= 0.15

                nearby_occupied = 0

                for offset_x, offset_y in directions:
                    neighbour = (
                        next_x + offset_x,
                        next_y + offset_y,
                    )

                    if (
                        neighbour in occupied
                        and occupied[neighbour] != net_id
                    ):
                        nearby_occupied += 1

                movement_cost += (
                    nearby_occupied * congestion_penalty
                )

                next_cost = current_cost + movement_cost
                next_state = (next_point, direction)

                known_cost = best_cost.get(next_state)

                if (
                    known_cost is not None
                    and next_cost >= known_cost
                ):
                    continue

                best_cost[next_state] = next_cost
                came_from[next_state] = current_state
                heuristic = self._distance_to_goal_box(
                    next_point,
                    goal_bounds,
                ) / grid_size

                heapq.heappush(
                    open_heap,
                    (
                        next_cost + heuristic,
                        next_cost,
                        next(serial),
                        next_point,
                        direction,
                    ),
                )

        return None

    @staticmethod
    def _compact_route_points(points):
        """
        Remove duplicate and collinear points from an orthogonal polyline.
        """
        cleaned = []

        for point in points:
            normalized = {
                "x": float(point["x"]),
                "y": float(point["y"]),
            }

            if cleaned and cleaned[-1] == normalized:
                continue

            cleaned.append(normalized)

        if len(cleaned) <= 2:
            return cleaned

        compressed = [cleaned[0]]

        for index in range(1, len(cleaned) - 1):
            previous = compressed[-1]
            current = cleaned[index]
            following = cleaned[index + 1]

            same_vertical = (
                previous["x"] == current["x"]
                == following["x"]
            )

            same_horizontal = (
                previous["y"] == current["y"]
                == following["y"]
            )

            if same_vertical or same_horizontal:
                continue

            compressed.append(current)

        compressed.append(cleaned[-1])
        return compressed

    @staticmethod
    def _element_type_from_data(element):
        value = element.get("type")

        if isinstance(value, (list, tuple)):
            return value[0] if value else None

        return value

    @staticmethod
    def _orthogonal_segments(path):
        segments = []

        for index in range(len(path) - 1):
            first = path[index]
            second = path[index + 1]

            if (
                first["x"] == second["x"]
                and first["y"] == second["y"]
            ):
                continue

            segments.append((
                first,
                second,
            ))

        return segments

    @staticmethod
    def _segment_length(first, second):
        return (
            abs(second["x"] - first["x"])
            + abs(second["y"] - first["y"])
        )

    @staticmethod
    def _segment_crosses_rectangle(
        first,
        second,
        rectangle,
    ):
        """
        Return True only when a segment crosses the rectangle interior.

        Touching or travelling along a component boundary is allowed.
        """
        left = rectangle["x"]
        right = rectangle["x"] + rectangle["width"]
        top = rectangle["y"]
        bottom = rectangle["y"] + rectangle["height"]

        if first["y"] == second["y"]:
            y = first["y"]

            if not (top < y < bottom):
                return False

            segment_left = min(first["x"], second["x"])
            segment_right = max(first["x"], second["x"])

            return (
                max(segment_left, left)
                < min(segment_right, right)
            )

        if first["x"] == second["x"]:
            x = first["x"]

            if not (left < x < right):
                return False

            segment_top = min(first["y"], second["y"])
            segment_bottom = max(first["y"], second["y"])

            return (
                max(segment_top, top)
                < min(segment_bottom, bottom)
            )

        # Every generated candidate is expected to be orthogonal.
        return True

    @staticmethod
    def _segments_intersect(
        first_a,
        first_b,
        second_a,
        second_b,
    ):
        first_horizontal = (
            first_a["y"] == first_b["y"]
        )
        second_horizontal = (
            second_a["y"] == second_b["y"]
        )

        if first_horizontal and not second_horizontal:
            horizontal_left = min(
                first_a["x"],
                first_b["x"],
            )
            horizontal_right = max(
                first_a["x"],
                first_b["x"],
            )
            vertical_top = min(
                second_a["y"],
                second_b["y"],
            )
            vertical_bottom = max(
                second_a["y"],
                second_b["y"],
            )

            return (
                horizontal_left
                <= second_a["x"]
                <= horizontal_right
                and vertical_top
                <= first_a["y"]
                <= vertical_bottom
            )

        if not first_horizontal and second_horizontal:
            return Schematic._segments_intersect(
                second_a,
                second_b,
                first_a,
                first_b,
            )

        if first_horizontal and second_horizontal:
            if first_a["y"] != second_a["y"]:
                return False

            first_left = min(
                first_a["x"],
                first_b["x"],
            )
            first_right = max(
                first_a["x"],
                first_b["x"],
            )
            second_left = min(
                second_a["x"],
                second_b["x"],
            )
            second_right = max(
                second_a["x"],
                second_b["x"],
            )

            return (
                max(first_left, second_left)
                <= min(first_right, second_right)
            )

        if first_a["x"] != second_a["x"]:
            return False

        first_top = min(
            first_a["y"],
            first_b["y"],
        )
        first_bottom = max(
            first_a["y"],
            first_b["y"],
        )
        second_top = min(
            second_a["y"],
            second_b["y"],
        )
        second_bottom = max(
            second_a["y"],
            second_b["y"],
        )

        return (
            max(first_top, second_top)
            <= min(first_bottom, second_bottom)
        )

    def _score_compact_candidate(
        self,
        paths,
        rectangles,
        existing_segments,
        net_id,
    ):
        """
        Prefer short routes, few bends, no component intersections, and few
        crossings with unrelated nets.
        """
        score = 0.0

        for path in paths:
            score += max(0, len(path) - 2) * 14

            for first, second in self._orthogonal_segments(path):
                score += self._segment_length(
                    first,
                    second,
                )

                for rectangle in rectangles:
                    if self._segment_crosses_rectangle(
                        first,
                        second,
                        rectangle,
                    ):
                        score += 100000

                for existing in existing_segments:
                    if existing["net"] == net_id:
                        continue

                    if self._segments_intersect(
                        first,
                        second,
                        existing["a"],
                        existing["b"],
                    ):
                        score += 6000

        return score

    def _terminal_for_element(
        self,
        element,
        pin_name,
        escape_distance,
    ):
        point = dict(
            element["pins"][pin_name]
        )

        direction = int(
            element.get("direction", 1)
        )

        if pin_name == "in":
            outward_direction = -direction
        else:
            outward_direction = direction

        escape = {
            "x":
                point["x"]
                + outward_direction
                * escape_distance,
            "y": point["y"],
        }

        return {
            "element_id": element["id"],
            "layout_cell":
                element.get("layout_cell"),
            "layout_instance":
                element.get("layout_instance"),
            "pin": pin_name,
            "point": point,
            "escape": escape,
        }

    def _two_terminal_candidates(
        self,
        first_terminal,
        second_terminal,
        lane_gap,
        lane_attempts,
    ):
        first_point = first_terminal["point"]
        first_escape = first_terminal["escape"]
        second_escape = second_terminal["escape"]
        second_point = second_terminal["point"]

        start_x = first_escape["x"]
        start_y = first_escape["y"]
        end_x = second_escape["x"]
        end_y = second_escape["y"]

        candidate_cores = []

        # Straight route when the terminals already share an axis.
        if start_x == end_x or start_y == end_y:
            candidate_cores.append([
                first_escape,
                second_escape,
            ])

        # Simple one-bend alternatives.
        candidate_cores.extend([
            [
                first_escape,
                {
                    "x": end_x,
                    "y": start_y,
                },
                second_escape,
            ],
            [
                first_escape,
                {
                    "x": start_x,
                    "y": end_y,
                },
                second_escape,
            ],
        ])

        # Former JavaScript V-H-V route.
        middle_y = (
            start_y + end_y
        ) / 2

        candidate_cores.append([
            first_escape,
            {
                "x": start_x,
                "y": middle_y,
            },
            {
                "x": end_x,
                "y": middle_y,
            },
            second_escape,
        ])

        middle_x = (
            start_x + end_x
        ) / 2

        candidate_cores.append([
            first_escape,
            {
                "x": middle_x,
                "y": start_y,
            },
            {
                "x": middle_x,
                "y": end_y,
            },
            second_escape,
        ])

        minimum_y = min(start_y, end_y)
        maximum_y = max(start_y, end_y)
        minimum_x = min(start_x, end_x)
        maximum_x = max(start_x, end_x)

        for attempt in range(1, lane_attempts + 1):
            offset = lane_gap * attempt

            for lane_y in (
                minimum_y - offset,
                maximum_y + offset,
            ):
                candidate_cores.append([
                    first_escape,
                    {
                        "x": start_x,
                        "y": lane_y,
                    },
                    {
                        "x": end_x,
                        "y": lane_y,
                    },
                    second_escape,
                ])

            for lane_x in (
                minimum_x - offset,
                maximum_x + offset,
            ):
                candidate_cores.append([
                    first_escape,
                    {
                        "x": lane_x,
                        "y": start_y,
                    },
                    {
                        "x": lane_x,
                        "y": end_y,
                    },
                    second_escape,
                ])

        candidates = []

        for core in candidate_cores:
            full_path = self._compact_route_points([
                first_point,
                *core,
                second_point,
            ])

            candidates.append([full_path])

        return candidates

    def _multi_terminal_candidates(
        self,
        terminals,
        lane_gap,
        lane_attempts,
    ):
        """
        Generate horizontal-bus and vertical-bus candidates.

        A shared trunk is shorter and cleaner than independently connecting
        every terminal pair.
        """
        escape_xs = [
            terminal["escape"]["x"]
            for terminal in terminals
        ]
        escape_ys = [
            terminal["escape"]["y"]
            for terminal in terminals
        ]

        sorted_xs = sorted(escape_xs)
        sorted_ys = sorted(escape_ys)

        median_x = sorted_xs[
            len(sorted_xs) // 2
        ]
        median_y = sorted_ys[
            len(sorted_ys) // 2
        ]

        horizontal_lanes = {
            median_y,
            min(escape_ys) - lane_gap,
            max(escape_ys) + lane_gap,
        }

        vertical_lanes = {
            median_x,
            min(escape_xs) - lane_gap,
            max(escape_xs) + lane_gap,
        }

        for attempt in range(1, lane_attempts + 1):
            offset = lane_gap * attempt
            horizontal_lanes.add(
                median_y - offset
            )
            horizontal_lanes.add(
                median_y + offset
            )
            vertical_lanes.add(
                median_x - offset
            )
            vertical_lanes.add(
                median_x + offset
            )

        candidates = []

        for lane_y in sorted(horizontal_lanes):
            minimum_x = min(escape_xs)
            maximum_x = max(escape_xs)

            paths = [
                self._compact_route_points([
                    {
                        "x": minimum_x,
                        "y": lane_y,
                    },
                    {
                        "x": maximum_x,
                        "y": lane_y,
                    },
                ])
            ]

            for terminal in terminals:
                paths.append(
                    self._compact_route_points([
                        terminal["point"],
                        terminal["escape"],
                        {
                            "x":
                                terminal["escape"]["x"],
                            "y": lane_y,
                        },
                    ])
                )

            candidates.append(paths)

        for lane_x in sorted(vertical_lanes):
            minimum_y = min(escape_ys)
            maximum_y = max(escape_ys)

            paths = [
                self._compact_route_points([
                    {
                        "x": lane_x,
                        "y": minimum_y,
                    },
                    {
                        "x": lane_x,
                        "y": maximum_y,
                    },
                ])
            ]

            for terminal in terminals:
                paths.append(
                    self._compact_route_points([
                        terminal["point"],
                        terminal["escape"],
                        {
                            "x": lane_x,
                            "y":
                                terminal["escape"]["y"],
                        },
                    ])
                )

            candidates.append(paths)

        return candidates

    def route_elements(
        self,
        elements,
        canvas,
        *,
        grid_size=1,
        hanger_rise=25,
        escape_distance=16,
        lane_gap=28,
        lane_attempts=7,
    ):
        """
        Compact but complete net routing.

        This keeps the former snake placement and short JJ/resistor hangers,
        but unlike the old adjacent-only rule it gathers every terminal for
        every net and connects all of them.

        Two-terminal nets use the shortest low-collision dogleg candidate.
        Multi-terminal nets use a shared horizontal or vertical bus.
        """
        del canvas

        routes = []
        external_ports = []
        errors = []
        represented_nets = set()
        existing_segments = []

        rectangles = [
            {
                "id": element["id"],
                "x": element["x"],
                "y": element["y"],
                "width": element["width"],
                "height": element["height"],
            }
            for element in elements
        ]

        def append_route(
            route_id,
            net_id,
            paths,
            *,
            route_kind,
            terminals=None,
        ):
            valid_paths = [
                path
                for path in paths
                if len(path) >= 2
            ]

            if net_id is None or not valid_paths:
                return

            represented_nets.add(net_id)

            route = {
                "id": route_id,
                "net": net_id,
                "routed": True,
                "external": False,
                "routing_layer": 0,
                "route_kind": route_kind,
                "terminals":
                    terminals or [],
                "paths": valid_paths,
            }

            routes.append(route)

            for path in valid_paths:
                for first, second in (
                    self._orthogonal_segments(path)
                ):
                    existing_segments.append({
                        "net": net_id,
                        "a": first,
                        "b": second,
                    })

        # Preserve the old JJ/resistor visual connection.
        for index in range(len(elements) - 1):
            current = elements[index]
            following = elements[index + 1]

            current_type = (
                self._element_type_from_data(
                    current
                )
            )
            following_type = (
                self._element_type_from_data(
                    following
                )
            )

            is_jj_resistor_pair = (
                current_type == "JJ"
                and following_type == "R"
                and (
                    following.get("companion_of")
                    == current.get("id")
                    or (
                        following.get("path")
                        == current.get("path")
                        and following.get("pid")
                        == current.get("pid")
                    )
                )
            )

            if not is_jj_resistor_pair:
                continue

            current_center = {
                "x":
                    current["x"]
                    + current["width"] / 2,
                "y":
                    current["y"]
                    + current["height"] / 2,
            }

            resistor_center = {
                "x":
                    following["x"]
                    + following["width"] / 2,
                "y":
                    following["y"]
                    + following["height"] / 2,
            }

            current_top = {
                "x": current_center["x"],
                "y": current["y"],
            }
            resistor_top = {
                "x": resistor_center["x"],
                "y": following["y"],
            }

            top_y = min(
                current_top["y"],
                resistor_top["y"],
            ) - hanger_rise

            append_route(
                (
                    f"route:{current['id']}:"
                    "jj-resistor-in"
                ),
                current.get("net_in"),
                [
                    self._compact_route_points([
                        current_top,
                        {
                            "x": current_top["x"],
                            "y": top_y,
                        },
                        {
                            "x": resistor_top["x"],
                            "y": top_y,
                        },
                        resistor_top,
                    ])
                ],
                route_kind="jj-resistor-input",
            )

            current_bottom = {
                "x": current_center["x"],
                "y":
                    current["y"]
                    + current["height"],
            }
            resistor_bottom = {
                "x": resistor_center["x"],
                "y":
                    following["y"]
                    + following["height"],
            }

            bottom_y = max(
                current_bottom["y"],
                resistor_bottom["y"],
            ) + hanger_rise

            append_route(
                (
                    f"route:{current['id']}:"
                    "jj-resistor-out"
                ),
                current.get("net_out"),
                [
                    self._compact_route_points([
                        current_bottom,
                        {
                            "x": current_bottom["x"],
                            "y": bottom_y,
                        },
                        {
                            "x": resistor_bottom["x"],
                            "y": bottom_y,
                        },
                        resistor_bottom,
                    ])
                ],
                route_kind="jj-resistor-output",
            )

        net_terminals = defaultdict(list)

        for element in elements:
            # The generated resistor is already connected to its JJ by the
            # two hanger routes. Its horizontal pins must not become extra
            # terminals in the main net tree.
            if (
                self._element_type_from_data(element)
                == "R"
            ):
                continue

            for pin_name, net_id in (
                ("in", element.get("net_in")),
                ("out", element.get("net_out")),
            ):
                if net_id is None:
                    continue

                terminal = self._terminal_for_element(
                    element,
                    pin_name,
                    escape_distance,
                )

                net_terminals[net_id].append(
                    terminal
                )

        def net_priority(item):
            net_id, terminals = item
            xs = [
                terminal["point"]["x"]
                for terminal in terminals
            ]
            ys = [
                terminal["point"]["y"]
                for terminal in terminals
            ]

            span = (
                max(xs) - min(xs)
                + max(ys) - min(ys)
            )

            # Route large/long nets first so smaller nets can avoid them.
            return (
                -len(terminals),
                -span,
                str(net_id),
            )

        for net_id, terminals in sorted(
            net_terminals.items(),
            key=net_priority,
        ):
            terminal_data = [
                {
                    "element_id":
                        terminal["element_id"],
                    "layout_cell":
                        terminal["layout_cell"],
                    "pin": terminal["pin"],
                    "x": terminal["point"]["x"],
                    "y": terminal["point"]["y"],
                }
                for terminal in terminals
            ]

            if len(terminals) == 1:
                terminal = terminals[0]

                external_ports.append({
                    "net": net_id,
                    "element_id":
                        terminal["element_id"],
                    "layout_cell":
                        terminal["layout_cell"],
                    "pin": terminal["pin"],
                    "x": terminal["point"]["x"],
                    "y": terminal["point"]["y"],
                    "escape_x":
                        terminal["escape"]["x"],
                    "escape_y":
                        terminal["escape"]["y"],
                })
                represented_nets.add(net_id)
                continue

            if len(terminals) == 2:
                candidates = (
                    self._two_terminal_candidates(
                        terminals[0],
                        terminals[1],
                        lane_gap,
                        lane_attempts,
                    )
                )
            else:
                candidates = (
                    self._multi_terminal_candidates(
                        terminals,
                        lane_gap,
                        lane_attempts,
                    )
                )

            best_paths = min(
                candidates,
                key=lambda candidate: (
                    self._score_compact_candidate(
                        candidate,
                        rectangles,
                        existing_segments,
                        net_id,
                    )
                ),
            )

            append_route(
                f"route:{net_id}:complete",
                net_id,
                best_paths,
                route_kind=(
                    "compact-two-terminal"
                    if len(terminals) == 2
                    else "compact-shared-bus"
                ),
                terminals=terminal_data,
            )

        all_nets = {
            net_id
            for element in elements
            for net_id in (
                element.get("net_in"),
                element.get("net_out"),
            )
            if net_id is not None
        }

        unrendered_nets = sorted(
            all_nets.difference(represented_nets),
            key=str,
        )

        if unrendered_nets:
            errors.append(
                "No route or external port generated for: "
                + ", ".join(unrendered_nets)
            )

        print(
            "Compact complete routing:",
            len(routes),
            "route objects;",
            len(external_ports),
            "external ports;",
            len(unrendered_nets),
            "unrendered nets.",
        )

        return {
            "routes": routes,
            "external_ports": external_ports,
            "errors": errors,
            "grid_size": grid_size,
            "routing_mode":
                "compact_complete_nets",
            "unrendered_nets":
                unrendered_nets,
        }

    def write_layout_cells(self, ordered_components):
        layout_cells = []

        for component in ordered_components:
            self.handle_layout_cell(
                layout_cells,
                component,
            )

        layout_cells_data = []

        for layout_instance in layout_cells:
            layout_element_ids = []

            for component in layout_instance.elements:
                layout_element_ids.append(
                    component.raw
                )

                component_type1, _ = (
                    self.get_component_type(
                        component
                    )
                )

                if component_type1 == "JJ":
                    resistor_id = re.sub(
                        r"^Xsj",
                        "R",
                        component.raw,
                        count=1,
                        flags=re.IGNORECASE,
                    )

                    layout_element_ids.append(
                        resistor_id
                    )

            instance_id = getattr(
                layout_instance,
                "instance_id",
                layout_instance.layout_cell,
            )
            instance_path = getattr(
                layout_instance,
                "instance_path",
                "",
            )

            layout_cells_data.append({
                "id": instance_id,
                "layout_instance": instance_id,
                "layout_cell":
                    layout_instance.layout_cell,
                "instance_path":
                    instance_path,
                "label": (
                    f"{layout_instance.layout_cell} "
                    f"({instance_path})"
                    if instance_path
                    else layout_instance.layout_cell
                ),
                "net_in":
                    layout_instance.net_in,
                "net_out":
                    layout_instance.net_out,
                "elements":
                    layout_element_ids,
            })

        return layout_cells_data


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
                "layout_instance":
                    self.get_layout_instance_id(
                        component
                    ),
                "instance_path":
                    self.get_component_instance_path(
                        component
                    ),
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
                    "layout_instance":
                        self.get_layout_instance_id(
                            component
                        ),
                    "instance_path":
                        self.get_component_instance_path(
                            component
                        ),
                    "type": ("R", ""),
                    "net_in": component.net_in,
                    "net_out": component.net_out,
                    "image": "../img/res_draw.png",
                    "companion_of": component.raw,
                })

        placement = self.place_components(
            ordered_components,
            elements,
        )

        for element in elements:
            element.update(
                placement["elements"][element["id"]]
            )

        layout_cells_data = self.write_layout_cells(
            ordered_components
        )

        for layout_cell in layout_cells_data:
            layout_cell.update(
                placement["layout_cells"][
                    layout_cell["id"]
                ]
            )

        instance_counts = defaultdict(int)

        for element in elements:
            instance_counts[
                element.get("layout_instance")
            ] += 1

        print(
            "Layout instances:",
            dict(instance_counts),
        )

        routing = self.route_elements(
            elements,
            placement["canvas"],
        )

        data = {
            "name": ordered_components_file.stem,
            "generated_at": datetime.now(
                timezone.utc
            ).isoformat(),
            "canvas": {
                **placement["canvas"],
                "grid_size": routing["grid_size"],
            },
            "nodes": nodes,
            "elements": elements,
            "layout_cells": layout_cells_data,
            "routes": routing["routes"],
            "external_ports": routing["external_ports"],
            "routing_errors": routing["errors"],
            "routing_mode": routing["routing_mode"],
            "unrendered_nets": routing["unrendered_nets"],
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