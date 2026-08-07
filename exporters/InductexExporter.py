from Hierarchy.node import Node
import os
from datetime import datetime
from pathlib import Path

from exporters.BaseExporter import BaseExporter

class InductexExporter(BaseExporter):
    def __init__(self, circuit):
        super().__init__(circuit)
        self.circuit = circuit
        self.counter_node = 0
        self.list_nodes_top = circuit.list_nodes_top
        self.output_dir = ""
        self.use_extracted_values = None
        self.sol_values = {"L": {}, "R": {}, "J": {}, "combined_L": {}}

    def sol_value(self, section, name, fallback):
        return self.sol_values.get(section, {}).get(str(name).upper(), fallback)

    def get_value(self, elem, extracted_attr, original_value):
        if self.use_extracted_values:
            value = getattr(elem, extracted_attr, None)
            if value is not None and str(value).strip() != "":
                return value
        return original_value

    @staticmethod
    def format_cir_value(value):
        if value is None: return ""
        try:
            number = float(value)
        except (TypeError, ValueError):
            return str(value).strip()

        text = format(number, ".15g")
        return "0" if text in {"-0", "-0.0"} else text
        
        
    def list_top_nodes(self,cell):
        self.list_nodes_top.extend(cell.list_nodes)
        for e in cell.instances:
            if hasattr(e, "net_in"):
                continue
            else:
                self.list_top_nodes(e) 
    
    
    def renum_top(self):
        
        gnd_number = 0
        self.counter_node = 1
        
        for node in self.list_nodes_top: 
            if node.name != "GND!":
                node.GlobalName = self.counter_node
                self.counter_node += 1
            if node.name == "GND!":
                print("a")
                node.GlobalName = gnd_number
    
    
    def read_inductex_file(self):
        """
        Lit un fichier InductEx et construit la structure du circuit.

        Gère :
        - L
        - JJ
        - IB
        - R

        Ajoute les nœuds internes créés dans self.list_nodes_top.
        """

        lines = []

        def new_internal_node():
            """
            Crée un nom de nœud interne unique et l'ajoute à self.list_nodes_top.
            """
            node = Node(self.counter_node)
            node.GlobalName = int(self.counter_node)
            self.counter_node +=1

            # Évite les doublons
            if node not in self.list_nodes_top:
                self.list_nodes_top.append(node)

            return node

        
        def emit_l(elem):  # The L is an inductor element in the circuit. 
            """
            Format :
            Lname net_in net_out Lvalue
            """
            self.list_additional_node = None

            l_value = self.get_value(elem, "RealL", elem.L)

            lines.append(
                f"{elem.name:<10} "
                f"{elem.net_in.GlobalName:<15} "
                f"{elem.net_out.GlobalName:<15} "
                f"{self.format_cir_value(l_value)}"
            )


        def emit_jj(elem):
            jname = elem.name
            suffix = jname[1:]
            prb_name, lj_name, rs_name = f"Prb{suffix}", f"Lj{suffix}", f"Rs{suffix}"
            lp_net = elem.net_out
            W_NAME, W_NET = 10, 15

            jj_value = self.format_cir_value(elem.Ic)
            rs_value = self.format_cir_value(self.sol_value("R", f"RS{suffix}", getattr(elem, "RParral", elem.Ic)))

            if str(elem.net_out.GlobalName) == "0":
                lp_net = new_internal_node()
                lp_name = f"Lp{suffix}"
                lp_value = self.format_cir_value(0.4)

                lp_net.connected_elements.append(jname)
                lp_net.connected_elements.append(elem.net_out.GlobalName)
                elem.listAdditionalNode.append(lp_net)

                lines.append(
                    f"{lp_name:<{W_NAME}} "
                    f"{lp_net.GlobalName:<{W_NET}} "
                    f"{elem.net_out.GlobalName:<{W_NET}} "
                    f"{lp_value}"
                )

            additional_net = new_internal_node()
            second_additional_net = new_internal_node()

            additional_net.connected_elements.extend([jname, lj_name])
            second_additional_net.connected_elements.extend([prb_name, rs_name])

            elem.listAdditionalNode.append(additional_net)
            elem.listAdditionalNode.append(second_additional_net)

            lines.append(
                f"{jname:<{W_NAME}} "
                f"{elem.net_in.GlobalName:<{W_NET}} "
                f"{additional_net.GlobalName:<{W_NET}} "
                f"{jj_value}"
            )

            lines.append(
                f"{prb_name:<{W_NAME}} "
                f"{elem.net_in.GlobalName:<{W_NET}} "
                f"{second_additional_net.GlobalName:<{W_NET}}"
            )

            lines.append(
                f"{lj_name:<{W_NAME}} "
                f"{additional_net.GlobalName:<{W_NET}} "
                f"{lp_net.GlobalName:<{W_NET}}"
            )

            lines.append(
                f"{rs_name:<{W_NAME}} "
                f"{second_additional_net.GlobalName:<{W_NET}} "
                f"{lp_net.GlobalName:<{W_NET}} "
                f"{rs_value}"
            )

        def reset_generated_state(self, original_node_count):
            del self.list_nodes_top[original_node_count:]
            self.counter_node = 0

            def reset_cell(cell):
                for elem in cell.instances:
                    if hasattr(elem, "net_in"):
                        for attr in ("listAdditionalNode", "list_additional_node"):
                            nodes = getattr(elem, attr, None)
                            if isinstance(nodes, list):
                                nodes.clear()
                    elif hasattr(elem, "instances"):
                        reset_cell(elem)

            reset_cell(self.circuit.TOP)


        def emit_ib(elem):
            ibname = str(elem.name)
            ib_port_name = ibname
            lib_name = "Lib" + ibname[2:]
            rib_name = "Rib" + ibname[2:]

            additional_net = new_internal_node()
            second_additional_net = new_internal_node()
                    
            second_additional_net.connected_elements.append(lib_name) 
            second_additional_net.connected_elements.append(rib_name)

            
            additional_net.connected_elements.append(ibname)
            additional_net.connected_elements.append(lib_name)

            elem.listAdditionalNode.append(additional_net)
            elem.listAdditionalNode.append(second_additional_net)

            W_NAME = 10
            W_NET = 15

            original_rib = 2600 / elem.Ib
            rib_value = self.format_cir_value(
                self.get_value(elem, "RealIB", original_rib)
            )

            lib_value = self.get_value(elem, "RealLIB", None)

            lines.append(
                f"{ib_port_name:<{W_NAME}} "
                f"{str(elem.net_in.GlobalName):<{W_NET}} "
                f"{str(additional_net.GlobalName):<{W_NET}}"
            )

            lib_line = (
                f"{lib_name:<{W_NAME}} "
                f"{str(additional_net.GlobalName):<{W_NET}} "
                f"{str(second_additional_net.GlobalName):<{W_NET}}"
            )

            if self.use_extracted_values and lib_value is not None:
                lib_line += f" {self.format_cir_value(lib_value)}"

            lines.append(lib_line)

            lines.append(
                f"{rib_name:<{W_NAME}} "
                f"{str(second_additional_net.GlobalName):<{W_NET}} "
                f"{str(elem.net_out.GlobalName):<{W_NET}} "
                f"{rib_value}"
            )

        def emit_r(elem):
            """
            Format demandé :

            Prname net_in additional_net
            Rname additional_net net_out Rvalue
            """

            rname = elem.name
            pr_name = "PR" + rname[1:]

            additional_net = new_internal_node()
            additional_net.connected_elements.append(rname)
            additional_net.connected_elements.append(pr_name)
            elem.listAdditionalNode.append(additional_net)

            W_NAME = 10
            W_NET = 15

            pr_name = "Pr" + rname[1:]

            lines.append(
                f"{pr_name:<{W_NAME}} "
                f"{elem.net_in.GlobalName:<{W_NET}} "
                f"{additional_net.GlobalName:<{W_NET}}"
            )

            r_value = self.get_value(elem, "RealR", elem.R)

            lines.append(
                f"{rname:<{W_NAME}} "
                f"{additional_net.GlobalName:<{W_NET}} "
                f"{elem.net_out.GlobalName:<{W_NET}} "
                f"{self.format_cir_value(r_value)}"
            )
            
        emitters = {
            "L": emit_l,
            "JJ": emit_jj,
            "IB": emit_ib,
            "R": emit_r,
        }

        instance_groups = {}

        def get_first_level_instance(elem):
            raw_name = str(getattr(elem, "original_name", getattr(elem, "raw_name", elem.name)))

            for prefix in ("Xpc", "Xsj", "L", "R"):
                if raw_name.lower().startswith(prefix.lower()):
                    raw_name = raw_name[len(prefix):]
                    break

            path_parts = raw_name.split("|")
            return path_parts[0] if len(path_parts) > 1 else str(getattr(self.circuit.TOP, "name", "TOP"))

        def recursive_walk(cell):
            for elem in cell.instances:
                emitter = emitters.get(getattr(elem, "type", None))

                if emitter is not None:
                    start_index = len(lines)
                    emitter(elem)
                    emitted_lines = lines[start_index:]
                    del lines[start_index:]

                    instance_name = get_first_level_instance(elem)
                    instance_groups.setdefault(instance_name, []).extend(emitted_lines)

                    original_name = getattr(elem, "original_name", getattr(elem, "raw_name", elem.name))
                    print(f"NAME TRANSLATION [{instance_name}]: {original_name} -> {elem.name}")
                    continue

                if hasattr(elem, "instances"):
                    recursive_walk(elem)

        recursive_walk(self.circuit.TOP)

        for instance_name, instance_lines in instance_groups.items():
            lines.append(f"* --- INSTANCE {instance_name} ---")
            lines.extend(instance_lines)
            lines.append("")

        return lines

        
        # =================================================
        # === ICI : TRI DES LIGNES PAR CATÉGORIE ==========
        # =================================================
    
    def read_elem_connections(self, lines):

        ports = []
        resistances = []
        inductances = []
        others = []

        elem_connections = {
            "j": ports,
            "ib": ports,
            "p": ports,
            "r": resistances,
            "l": inductances,
            "others": others
        }

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue

            head = stripped.split()[0]
            head_low = head.lower()

            matched = False
            for key, bucket in elem_connections.items():
                if key != "others" and head_low.startswith(key):
                    bucket.append(line)
                    matched = True
                    break

            if not matched:
                others.append(line)

        return elem_connections


    def build_dc_connection_lines(self):
        def find_ib(cell):
            for elem in cell.instances:
                if getattr(elem, "type", None) == "IB": return elem.net_in
                if hasattr(elem, "instances"):
                    result = find_ib(elem)
                    if result is not None: return result
            return None

        node_ib = find_ib(self.circuit.TOP)
        if node_ib is None:
            print("Warning: no IB node found; skipping Ldc/Pdc.")
            return []

        new_node = Node(str(self.counter_node))
        new_node.GlobalName = self.counter_node
        self.counter_node += 1
        self.list_nodes_top.append(new_node)

        return [
            f"{'Ldc':<10} {node_ib.GlobalName:<15} {new_node.GlobalName:<15}",
            f"{'Pdc':<10} {new_node.GlobalName:<15} 0",
        ]

    def export_complete_cir(self, klayout_exporter=None, output_path=None):
        self.renum_top()
        self.attach_elements_to_nodes()

        translated_lines = self.read_inductex_file()
        dc_lines = self.build_dc_connection_lines()
        auto_ground_lines = []

        if klayout_exporter is not None:
            klayout_exporter.output_dir = self.output_dir
            auto_ground_lines = klayout_exporter.mark_single_connection_nodes_in_layout() or []

        if output_path is None:
            base_output_dir = Path(self.output_dir)
            inductex_dir = base_output_dir.with_name(f"{base_output_dir.name}_Inductex")
            output_path = inductex_dir / "BIG_Cell_inductex.cir"
        else:
            output_path = Path(output_path)

        output_path.parent.mkdir(parents=True, exist_ok=True)

        with output_path.open("w", encoding="utf-8", newline="\n") as file:
            file.write("* === TRANSLATED CIRCUIT CONNECTIONS ===\n")

            for line in translated_lines:
                file.write(line.rstrip() + "\n")

            if dc_lines:
                file.write("\n* === DC CONNECTIONS ===\n")
                for line in dc_lines:
                    file.write(line.rstrip() + "\n")

            if auto_ground_lines:
                file.write("\n* === AUTO-GROUNDED TOP PORTS ===\n")
                for line in auto_ground_lines:
                    file.write(line.rstrip() + "\n")

        print(f"Complete InductEx file written: {output_path.resolve()}")
        print(f"Translated lines: {len(translated_lines)}")
        print(f"DC lines: {len(dc_lines)}")
        print(f"Auto-ground lines: {len(auto_ground_lines)}")

        return str(output_path.resolve())

    def _walk_node(self, cell):
        for elem in cell.instances:
            # Connexion entrée
            if hasattr(elem, "net_in"): 
                elem.net_in.connected_elements.append(elem)
                elem.net_out.connected_elements.append(elem)
                
            # Descente hiérarchique
            else:
                self._walk_node(elem)     

    def attach_elements_to_nodes(self):
        for node in self.list_nodes_top:
            if hasattr(node, "connected_elements"): node.connected_elements.clear()
        self._walk_node(self.circuit.TOP)