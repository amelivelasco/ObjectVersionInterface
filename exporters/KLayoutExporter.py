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
            print(f"  pid={pid}, cell={cell_name}")

        return None
    

    def report_mapping_audit(self):
        print("\n=== LAYOUT MAPPING AUDIT ===")

        total = 0
        mapped = 0
        unmapped = 0

        def walk(cell):
            nonlocal total, mapped, unmapped

            for inst in cell.instances:
                if hasattr(inst, "instances"):
                    walk(inst)
                    continue

                total += 1

                raw_name = getattr(inst, "raw_name", inst.name)
                layout_inst = getattr(inst, "KLayoutInstance", None)
                layout_path = self._raw_name_to_layout_path(raw_name)

                if layout_inst is None:
                    unmapped += 1
                    print(
                        f"FAIL | raw={raw_name:<18} "
                        f"path={'/'.join(layout_path):<15} "
                        f"reason=not mapped"
                    )
                    continue

                mapped += 1
                pid = layout_inst.property(102)
                cell_name = layout_inst.cell.name

                print(
                    f"OK   | raw={raw_name:<18} "
                    f"path={'/'.join(layout_path):<15} "
                    f"pid={str(pid):<6} "
                    f"layout_cell={cell_name}"
                )

        walk(self.circuit.TOP)

        print("\n=== SUMMARY ===")
        print(f"Total logical elements: {total}")
        print(f"Mapped: {mapped}")
        print(f"Unmapped: {unmapped}")




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
    
    def mark_single_connection_nodes_in_layout(self):
        """
        Pour chaque node connecté à un seul élément,
        écrit dans KLayout (layer 52/0) un texte :
        P<NomDuComposant>
        """

        layout = self.layout
        label_layer = layout.layer(52, 0)

        print("=== MARK SINGLE-CONNECTION NODES IN LAYOUT ===")

        for node in self.list_nodes_top:

            if not hasattr(node, "connected_elements"):
                continue

            # --- Cas : une seule connexion ---
            if len(node.connected_elements) != 1:
                continue
            elem = node.connected_elements[0]

            # Sécurité minimale
            if not hasattr(elem, "global_trans"):
                continue

            pname = f"P{elem.name} M2 M0"

            local_text_pos_p = pya.Point(-5000, 0)
            text_trans_p = elem.global_trans * pya.Trans(local_text_pos_p)

            port_p_txt = pya.Text(
                pname,
                text_trans_p
            )
            
            w = 500   # largeur
            h = 3000   # hauteur

            # Rectangle centré sur (0,0)
            box = pya.Box(
                -w // 2, -h // 2,
                w // 2,  h // 2
                )
            box_t = box.transformed(text_trans_p)
            self.layout_top.shapes(self.term_layer).insert(box_t)
            self.layout_top.shapes(label_layer).insert(port_p_txt)


            
            port_name = f"P{elem.name}"
            node_name = str(node.GlobalName)
            new_line = f"{port_name:<10} {node_name:<10} 0\n"

                        
            with open(os.path.join(self.output_dir, "BIG_Cell_inductex.cir"), "a") as f:
                    f.write("\n* --- Auto-added ground connection ---\n")
                    f.write(new_line)


            print(
                f"Node {node.GlobalName} -> "
                f"{elem.name}  ==> écrit '{pname}'"
            )
        self.layout.write(os.path.join(self.output_dir,"BIG_Cellname.gds"))
    
    def cover_cell_with_layer(self):
        """
        Recouvre entièrement une cell donnée avec un rectangle
        sur le layer (layer_num, layer_datatype).
        """

        layout = self.layout
        layer = layout.layer(10,0)

        bbox = self.layout_top.bbox()

        # Sécurité : cell vide
        if bbox.empty() and self.layout_top != None:
            print(f"Cell {self.layout_top} est vide, rien à recouvrir.")
            return

        # Création du rectangle couvrant toute la cell
        cover_box = pya.Box(bbox)
        
        # =================================================
        # 2) BANDE EN HAUT + TEXTE (layer 45/0)
        # =================================================
        banner_height_um = 10.0
        banner_height_dbu = int(banner_height_um )

        xmin = bbox.left
        xmax = bbox.right
        ymax = bbox.top

        # --- Bande rectangulaire ---
        banner_box = pya.Box(
            xmin,
            ymax - banner_height_dbu,
            xmax,
            ymax
        )
        self.layout_top.shapes(self.term_layer).insert(banner_box)

        text = "Pdc M3 M0"

        text_x = (xmin + xmax) // 2
        text_y = ymax - banner_height_dbu // 2

        text_trans = pya.Trans(pya.Point(text_x, text_y))
        text_shape = pya.Text(text, text_trans)

        self.layout_top.shapes(self.label_layer).insert(text_shape)


        # Insertion dans la cell
        self.layout_top.shapes(layer).insert(cover_box)
        self.layout.write(os.path.join(self.output_dir,"BIG_Cellname.gds"))
        
    def write_cell_names(self):
        """
        Écrit le nom de chaque Cell dans la Cell elle-même,
        sur le layer 52/0.
        """

        self.label_layer = self.layout.layer(52, 0)
        self.term_layer = self.layout.layer(45, 0)
        def recursive_name(cell,parent_trans):
            for inst in cell.instances:
                
                if hasattr(inst, "global_trans"):
                    global_trans = inst.global_trans
                else:
                    local_trans = inst.KLayoutInstance.trans
                    global_trans = parent_trans * local_trans

                if hasattr(inst,"type") and inst.type == "JJ":
                       
                    portj = str(inst.name + " M2 M1")
                    local_text_pos_portj = pya.Point(0,0)
                    text_trans_portj = global_trans * pya.Trans(local_text_pos_portj)
                    portjtxt = pya.Text(
                        str(portj),
                        text_trans_portj
                    )
                    self.layout_top.shapes(self.label_layer).insert(portjtxt)

                    ray = sqrt((inst.Ic*10000000)/(10*3.14159*2))+8000 # This calculates the radius of the circle based on the critical current (Ic) of the Josephson junction. 

                    port_par_resj = str("Prb"+inst.name[1:] + " M2 R2")
                    local_text_pos_port_par_resj = pya.Point(0,-ray)
                    text_trans_port_par_resj = global_trans * pya.Trans(local_text_pos_port_par_resj)
                    port_par_resjtxt = pya.Text(
                        str(port_par_resj),
                        text_trans_port_par_resj
                    )
                    self.layout_top.shapes(self.label_layer).insert(port_par_resjtxt)
                    inst.global_trans = global_trans

                elif hasattr(inst,"type") and inst.type == "IB":
                    ib_res_length = ((((2.6*10**6)/(inst.Ib*10**6))*5)/2)*1000000+2000
                    port_ib = str(inst.name + " M3 M2")
                    local_text_pos_port_ib = pya.Point(0,ib_res_length)
                    text_trans_port_ib = global_trans * pya.Trans(local_text_pos_port_ib)
                    port_ibtxt = pya.Text(
                        str(port_ib),
                        text_trans_port_ib
                    )
                    self.layout_top.shapes(self.label_layer).insert(port_ibtxt)
                    inst.global_trans = global_trans

                elif hasattr(inst,"type") and inst.type == "R":
                    res_length = (((inst.R)*10)/2)*1000+1000
                    port_res = str("P"+inst.name + " M2 R2")
                    local_text_pos_port_res = pya.Point(0,res_length)
                    text_trans_port_res = global_trans * pya.Trans(local_text_pos_port_res)
                    port_ibtxt = pya.Text(
                        str(port_res),
                        text_trans_port_res
                    )
                    self.layout_top.shapes(self.label_layer).insert(port_ibtxt)
                    inst.global_trans = global_trans
                
                elif hasattr(inst, "type") and inst.type == "L":
                    # On mémorise UNIQUEMENT la transformation globale
                    inst.global_trans = global_trans


                elif hasattr(inst, "instances"):
                    recursive_name(inst,global_trans)

        recursive_name(self.circuit.TOP,pya.Trans())

        self.layout.write(os.path.join(self.output_dir,"BIG_Cellname.gds"))