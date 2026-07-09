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
        
             
    # def define_klayout(self, p_path_gds):

    #     self.layout = pya.Layout() # pya is the KLayout Python API. 
    #     self.layout.read(p_path_gds) # The KLayout is used to read and manipulate GDSII files, which are standard file formats for representing integrated circuit layouts.
    #     self.layout_top = self.layout.top_cell() # is this reassignment necessary?
    
    def find_layout_instance_by_pid(self, layout_cell, target_name):
        """
        layout_cell : pya.Cell
        target_name : nom logique attendu, ex: I2, J3, L5
        """

        print("check layout cell:", layout_cell.property(102))  # What is property 102??

        for klayout_inst in layout_cell.each_inst():
            if str(klayout_inst.property(102)).lower()== str(target_name).lower():
                return klayout_inst
        return None

    
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

                print("looking for circuit instance:", circuit_inst.name)
                print("inside layout cell:", layout_cell.name)

                layout_inst = self.find_layout_instance_by_pid(
                    layout_cell,
                    circuit_inst.name
                )

                if layout_inst is None:
                    raise RuntimeError(
                        f"Instance '{circuit_inst.name}' not found "
                        f"in layout cell '{layout_cell.name}'"
                    )

                # Lien entre ton objet logique et KLayout
                circuit_inst.KLayoutInstance = layout_inst
                circuit_inst.KLayoutCell = layout_inst.cell

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
                
                # Transformation locale de cette instance
                local_trans = inst.KLayoutInstance.trans

                # Transformation absolue dans la TOP cell
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