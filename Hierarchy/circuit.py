import matplotlib.pyplot as plt
import networkx as nx
import klayout.db as pya
import re
from collections import defaultdict
from math import sqrt
import os
from datetime import datetime

from Hierarchy.node import Node

# Class description:
# This class represents a circuit in the hierarchy of the design. It contains instances of 
# cells and elements, and provides methods to manage the circuit, such as adding instances 
# and cells, defining the top cell, traversing the hierarchy, integrating with KLayout, 
# renaming elements, and writing output files for both KLayout and InductEx.

# Parameters:
# - name: The name of the circuit, such as "top".
# - cells: A dictionary mapping cell names to Cell objects, representing the cells in the circuit.
# - TOP: The top cell of the circuit, which serves as the entry point for the hierarchy.
# - list_nodes_top: A list of nodes in the top cell, which can be used for renaming and managing connections.
# - element_counters: A dictionary to keep track of the count of each type of element for renaming purposes.
# - layout_top: The top cell of the KLayout layout, used for integrating the logical circuit with the physical design.

# Important methods:
# - define_local_names(self): This function visits all the cells and instances in the 
#   circuit and assigns a unique path name to each instance based on its position in the hierarchy.
# - traverse_cell(self, cell): This function recursively traverses the hierarchy of cells and 
#   prints the names of each cell and its instances.
# - find_layout_instance_by_pid(self, layout_cell, target_name): This function finds an instance 
#   in the KLayout layout by recursing over the klayout_instances and finding the target_name .

# Problems:
# - This whole class must be refactored as it contains too many responsabilities.
# - Remove add_instance and add_cells methods as they are not used and are redundant with add_cell.
# - Remove summary or cell_names methods as they are redundant with each other.
# - Remove define_top method as it is redundant with get_cell method.
# - The visit method should not be defined inside define_local_names, it should be a separate method.
# - Remove integrating_layout method as it just calls go_through method => redundant

# Questions:
# - What is the purpose of property 102 in the method find_layout_instance_by_pid?





class Circuit:
    """
    Circuit logique global.
    Contient :
    - des instances élémentaires (JJ, IB, L, R)
    - des cellules instanciées via XI
    """

    def __init__(self, name="top"):
        self.name = name
        self.cells = {}       # name -> Cell (instances XI)
        self.TOP = None
        self.list_nodes_top = []
        self.element_counters = {}
        self.layout_top = None

    def add_instance(self, inst):
        self.instances.append(inst) # PROBLEM: self.instances is not defined in the __init__ method. Remove?

    def add_cells(self, cell):
        self.cells.append(cell)

    def add_cell(self, cell):
        self.cells[cell.name] = cell

    def summary(self):
        return {
            "circuit": self.name,
            "num_instances": len(self.instances),  # remove? self.instances is not defined in the __init__ method.
            "num_cells": len(self.cells),
            "cells": list(self.cells.keys())
        }

    def cell_names(self):  # redundant with summary, remove?
        """
        Retourne la liste des noms des cellules instanciées (XIxx).
        """
        return list(self.cells.keys())
    
    def folder_to_write(self, base_dir=None):

        timestamp = datetime.now().strftime("%Y_%m_%d_%H_%M")
        folder_name = f"BIG_Cell_{timestamp}"

        if base_dir is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

        full_path = os.path.join(base_dir, "Datafolder", folder_name)
        os.makedirs(full_path, exist_ok=True)

        self.output_dir = full_path

    def get_cell(self, name):
        """
        Retourne la Cell du circuit ayant ce nom.
        """
        return self.cells.get(name)

    def define_top(self,name): # Remove, same as get_celll
        self.TOP = self.cells[name]

    def define_local_names(self): 
        """
        Affiche récursivement tous les local_name
        des éléments contenus sous self.TOP.
        """
        if self.TOP is None:
            raise RuntimeError("TOP non définie dans le circuit")

        def visit(cell, path): # Why do you need to define this method inside define_local_names? It can be a separate method.
            cell_path = f"{path}/{cell.name}_{cell.id}" if path else f"{cell.name}_{cell.id}"
            print("cell",cell_path)  
            

            for inst in cell.instances: 
                # ✅ Élément logique
                if hasattr(inst, "net_in"):
                    inst.Path_name = f"{cell_path}/{inst.name}"
                    print(f"{inst.Path_name}")

                # ✅ Sous-cell
                else:
                    inst.Path_name = cell_path
                    visit(inst, cell_path)

        visit(self.TOP, "")

    
    def traverse_cell(self,cell):
        print("Cell Name:", cell.name)
        print("Cell Model:", cell.model)
        for e in cell.instances:
            if hasattr(e, "net_in"):
                print(e.name," net_in:",e.net_in.name," net_out:",e.net_out.name)

            else:
                self.traverse_cell(e)
    
        


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
    
    def define_klayout(self, p_path_gds):

        self.layout = pya.Layout() # pya is the KLayout Python API. 
        self.layout.read(p_path_gds) # The KLayout is used to read and manipulate GDSII files, which are standard file formats for representing integrated circuit layouts.
        self.layout_top = self.layout.top_cell() # is this reassignment necessary?

    
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
            f"SYNC TOP: circuit={self.TOP.name} "
            f"<-> layout={self.layout_top.name}"
        )

        go_through(self.layout_top, self.TOP)

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




    
    def list_top_nodes(self,cell):
        self.list_nodes_top.extend(cell.list_nodes)
        for e in cell.instances:
            if hasattr(e, "net_in"):
                continue
            else:
                self.list_top_nodes(e) 



    
    def plot_all_base_elements(self):
        """
        Affiche tous les IBias du circuit avec leur Path_name.
        """

        if self.TOP is None:
            raise RuntimeError("TOP non définie dans le circuit")

        def visit(cell):
            # Construction du chemin hiérarchique couran
            for inst in cell.instances:
                # ✅ Cas IBias
                if not hasattr(inst, "instances"):
                    print(f"/{inst.local_name}")

                # ✅ Cas sous-cell → récursion
                else:
                    visit(inst)

        visit(self.TOP)
    
    
    def assign_cell_ids(self):
        counter = 1

        def walk(cell):
            nonlocal counter 

            # Donner un ID uniquement aux cellules
            cell.id = counter
            counter += 1

            for inst in cell.instances:
                # On descend seulement dans les cells
                if not hasattr(inst, "net_in"):
                    walk(inst)
        walk(self.TOP)

    def rename_all_elements_by_type(self):
        """
        Renomme tous les éléments logiques avec un nom unique
        dans toute la hiérarchie, avec une numérotation par type :
        JJ   -> J<n>
        LL   -> L<n>
        res  -> res<n>
        bias -> IBX<n>
        """

        # Compteurs par type final
        counters = {
            "J": 0,
            "L": 0,
            "R": 0,
            "IB": 0,
        }

        # Mapping type interne -> préfixe final
        type_map = {
            "JJ": "J",
            "L": "L",
            "R": "R",
            "IB": "IB",
        }

        def rename_all(cell):
            for inst in cell.instances:

                # ✅ Élément logique (feuille)
                if hasattr(inst, "net_in"):
                    internal_type = inst.type  # ex: "JJ", "LL", "res", "bias"
                    if internal_type not in type_map:
                        raise ValueError(f"Type inconnu : {internal_type}")
                    prefix = type_map[internal_type]
                    counters[prefix] += 1
                    inst.name = f"{prefix}{counters[prefix]}"

                # ✅ Sous-cell
                else:
                    rename_all(inst)

        rename_all(self.TOP)

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

        recursive_name(self.TOP,pya.Trans())

        self.layout.write(os.path.join(self.output_dir,"BIG_Cellname.gds"))

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

            lines.append(
                f"{elem.name:<10} "
                f"{elem.net_in.GlobalName:<15} "
                f"{elem.net_out.GlobalName:<15} "
                f"{elem.L}"
            )


        def emit_jj(elem):
            """
            Format demandé :

            Jname net_in additional_net Jvalue
            Prb(Jname) net_in second_additional_net
            Lj(Jname) additional_net net_out
            Rs(Jname) second_additional_net net_out
            """

            jname = elem.name
            prb_name = "Prb" + jname[1:]
            lj_name  = "Lj"  + jname[1:]
            rs_name  = "Rs"  + jname[1:]
            lp_net = elem.net_out
            W_NAME = 10   # make a constant for this
            W_NET = 15


            if str(elem.net_out.GlobalName) == "0":

                lp_net = new_internal_node()
                lp_name = "Lp" + jname[1:]
                lp_value = "0.4"   # valeur parasite (à ajuster si besoin)

                # Connexions logiques (affichage)
                lp_net.connected_elements.append(jname)
                lp_net.connected_elements.append(elem.net_out.GlobalName)

                elem.listAdditionalNode.append(lp_net)

                # Ligne InductEx : inductance parasite vers ground
                lines.append(
                    f"{lp_name:<{W_NAME}} "
                    f"{lp_net.GlobalName:<{W_NET}} "
                    f"{elem.net_out.GlobalName:<{W_NET}} "
                    f"{lp_value}"
                )



            additional_net = new_internal_node()
            second_additional_net = new_internal_node()
            
            additional_net.connected_elements.append(jname)
            additional_net.connected_elements.append(lj_name)

            second_additional_net.connected_elements.append(prb_name)
            second_additional_net.connected_elements.append(rs_name)

            elem.listAdditionalNode.append(additional_net)
            elem.listAdditionalNode.append(second_additional_net)


            # ===================================================
            # AJOUT DE L'INDUCTANCE PARASITE SI net_out == GROUND
            # ===================================================

            lines.append(
                f"{jname:<{W_NAME}} "
                f"{elem.net_in.GlobalName:<{W_NET}} "
                f"{additional_net.GlobalName:<{W_NET}} "
                f"{elem.Ic}"
            )

            lines.append(
                f"{'Prb' + jname[1:]:<{W_NAME}} "
                f"{elem.net_in.GlobalName:<{W_NET}} "
                f"{second_additional_net.GlobalName:<{W_NET}}"
            )

            lines.append(
                f"{'Lj' + jname[1:]:<{W_NAME}} "
                f"{additional_net.GlobalName:<{W_NET}} "
                f"{lp_net.GlobalName:<{W_NET}}"
            )

            lines.append(
                f"{'Rs' + jname[1:]:<{W_NAME}} "
                f"{second_additional_net.GlobalName:<{W_NET}} "
                f"{lp_net.GlobalName:<{W_NET}}"
            )


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


            rib_value = 2600 / elem.Ib

            lines.append(
                f"{ib_port_name:<{W_NAME}} "
                f"{str(elem.net_in.GlobalName):<{W_NET}} "
                f"{str(additional_net.GlobalName):<{W_NET}}"
            )

            lines.append(
                f"{lib_name:<{W_NAME}} "
                f"{str(additional_net.GlobalName):<{W_NET}} "
                f"{str(second_additional_net.GlobalName):<{W_NET}}"
            )

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

            lines.append(
                f"{rname:<{W_NAME}} "
                f"{additional_net.GlobalName:<{W_NET}} "
                f"{elem.net_out.GlobalName:<{W_NET}} "
                f"{elem.R}"
            )
            
        emitters = {
            "L": emit_l,
            "JJ": emit_jj,
            "IB": emit_ib,
            "R": emit_r,
                }

        def recursive_walk(cell):
            """
            Parcours récursif de ta structure logique self.TOP.
            """

            for elem in cell.instances:

                elem_type = getattr(elem, "type", None)
                emitter = emitters.get(elem_type)

                if emitter is not None:
                    emitter(elem)
                    continue
                
                if hasattr(elem, "instances"):
                    recursive_walk(elem)

        # Parcours depuis TOP
        recursive_walk(self.TOP)
        return lines

        
        # =================================================
        # === ICI : TRI DES LIGNES PAR CATÉGORIE ==========
        # =================================================
    
    def read_elem_connections(self, lines):

        ports = []
        resistances = []
        inductances = []
        others = []

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue

            head = stripped.split()[0]
            head_low = head.lower()  # can you do it above in one step

            # Ports : J*, IB*, P*, Pr*, Prb*
            elem_connections = {
                "j": ports,
                "ib": ports,
                "p": ports,
                "r": resistances,
                "l": inductances,
                "others": others
            }
            
            for key in elem_connections.keys():
                if head_low.startswith(key):
                    elem_connections[key].append(line)
                    break
            return elem_connections

        # =================================================
        # === ICI : ÉCRITURE FINALE DU FICHIER ============
        # =================================================
    def write_inductex_file(self, relations):
        
        output_path = os.path.join(self.output_dir, "BIG_Cell_inductex.cir")

        mydict = {
            "INDUCTANCES": relations["l"],
            "PORTS": relations["p"],
            "RESISTANCES": relations["r"],
            "OTHERS": relations["others"]
        }
        
        with open(output_path, "w") as f:
            
            for section, section_lines in mydict.items():
                if not section_lines:
                    continue
                f.write(f"* === {section} ===\n")
                for line in section_lines:
                        f.write(line + "\n")

                print(f"Fichier InductEx écrit : {output_path}")
                print("Nœuds internes créés :")
                for node in self.list_nodes_top:
                    print(" ", node.name)



    def attach_elements_to_nodes(self):
        """
        Ajoute à chaque Node un attribut `connected_elements`
        listant les éléments qui y sont connectés.
        """

        def walk_node(cell):
            for elem in cell.instances:
                # Connexion entrée
                if hasattr(elem, "net_in"): 
                    elem.net_in.connected_elements.append(elem)
                    elem.net_out.connected_elements.append(elem)
                    

                # Descente hiérarchique
                else:
                    walk_node(elem)
                    


        # Parcours
        walk_node(self.TOP)
        #self.display_node_connectivity_summary()
    
    
    def display_node_connectivity_summary(self):
        """
        Affiche les nœuds selon leur nombre de connexions :
        - 1 connexion
        - 2 connexions
        - 3 connexions ou plus
        """

        one_conn = []
        two_conn = []
        three_plus_conn = []
        print(len(self.list_nodes_top))
        for node in self.list_nodes_top:
            print(node.GlobalName)
            print(node.connected_elements)
            n = len(node.connected_elements)
            if n == 1:
                one_conn.append(node)
                print(len(one_conn))
            elif n == 2:
                two_conn.append(node)
            elif n >= 3:
                three_plus_conn.append(node)

        # ---------- AFFICHAGE ----------
        print("\n=== NODE CONNECTIVITY SUMMARY ===")

        print("\n--- Nodes with 1 connection (DANGLING) ---")
        for node in one_conn:
            e = node.connected_elements[0]
            print(
                f"Node {node.GlobalName:<6} -> "
                f"{e:<10}"
            )

        print("\n--- Nodes with 2 connections (OK) ---")
        for node in two_conn:
            elems = ", ".join(f"{e}" for e in node.connected_elements)
            print(
                f"Node {node.GlobalName:<6} -> {elems}"
            )

        print("\n--- Nodes with 3 or more connections (MULTI) ---")
        for node in three_plus_conn:
            elems = ", ".join(f"{e}" for e in node.connected_elements)
            print(
                f"Node {node.GlobalName:<6} ({len(node.connected_elements)} connections) -> {elems}"
            )

        print("\n=== SUMMARY ===")
        print(f"1 connection : {len(one_conn)} node(s)")
        print(f"2 connections: {len(two_conn)} node(s)")
        print(f"3+ connections: {len(three_plus_conn)} node(s)")


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
        
        # =========================================
        # 4) AJOUT INDUCTANCE COMMUNE IB DANS LE .cir
        # =========================================
        
        def walk(cell):
                for elem in cell.instances:

                    # Cas IB trouvé
                    if hasattr(elem, "type") and elem.type == "IB":
                        return elem.net_in

                    # Descente hiérarchique
                    if hasattr(elem, "instances"):
                        result = walk(elem)
                        if result is not None:
                            return result

                return None

        node_ib = walk(self.TOP)

        print(node_ib)
        new_node = Node(str(len(self.list_nodes_top)+1))

        new_line = f"{"Ldc":<15} {node_ib.GlobalName:<10} {new_node.name:<10}\n{"Pdc":<15} {new_node.name:<10} 0\n"
        with open(os.path.join(self.output_dir, "BIG_Cell_inductex.cir"), "a") as f:
                f.write(new_line)

    

    def find_element(self, cell, name):
        for elem in cell.instances:
            # Cas : élément feuille (composant)
            if hasattr(elem, "net_in"):
                if elem.name == name:
                    return elem
                
            # Cas : sous-cell → descente hiérarchique
            else:
                found = self.find_element(elem, name)  # Maybe print out if element is not found
                if found is not None:
                    return found
                

        return None
    
    def build_net_list(self):  # this method writes the netlist in a .sp file instead of a .cir file, which means its purpose is a SPICE netlist and not an InductEx netlist.
        # It's not used anywhere... REMOVE!
        lines = []

        # ===== Header =====
        lines.append("*.LDD")
        lines.append(".GLOBAL GND!")
        lines.append("*" * 80)
        lines.append("* Library          : BasicCellsHomemade")
        lines.append(f"* Cell             : {self.TOP.name}")
        lines.append("* View             : schematic")
        lines.append("* View Search List : auCdl schematic")
        lines.append("* View Stop List   : auCdl")
        lines.append("*" * 80)
        lines.append(self.emit_subckt_line())
        lines.append("*.PININFO DC:O SFQ_in:I VDD:I")

        self.walk_top_instances(lines)
        filename = os.path.join(self.output_dir, "BIG_Cell_GeneratedNetlist.sp")
        lines.append(f".ends {self.TOP.name}")

        with open(filename, "a") as f:
                for l in lines:
                    f.write(l + "\n")


    def find_single_connected_nets(self):
        """
        Retourne un set de noms de nets connectés à un seul élément.
        """
        ports = []

        for node in self.list_nodes_top:
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
        return f".subckt {self.TOP.name} {port_list}"


    def walk_top_instances(self,line_to_add):

        def visit(cell):
            for inst in cell.instances:
                if not hasattr(inst, "instances"):
                    visit(inst)
                    continue
                
                self.add_instance_lines(inst, line_to_add)
        visit(self.TOP)
    
    def net_name(self, net):
        name = f"net{net.GlobalName}"
        return "GND!" if name == "net0" else name
    
    def add_instance_lines(self, inst, lines):
        net_in = self.net_name(inst.net_in)
        net_out = self.net_name(inst.net_out)

        if inst.type == "IB":
            self._add_ib_lines(inst, net_out, lines)
        elif inst.type == "L":
            self.add_l_lines(inst, net_in, net_out, lines)
        elif inst.type == "R":
            self.add_r_lines(inst, net_in, net_out, lines)
        elif inst.type == "JJ":
            self.add_jj_lines(inst, net_in, net_out, lines)
            
    def add_ib_lines(self, inst, net_out, lines):
        node = f"net{inst.list_additional_node[0].GlobalName}"
        lines.append(
        f"R{inst.name} VDD {node} r={inst.RealIB}"
        )
        lines.append(
            f"L{inst.name} {node} {net_out} l={inst.RealLIB}p"
        )
    
    def add_l_lines(self, inst, net_in, net_out, lines):
        lines.append(
            f"L{inst.name} {net_in} {net_out} ind2 l={inst.RealL}p"
        )


    def add_r_lines(self, inst, net_in, net_out, lines):
        lines.append(
            f"R{inst.name} {net_in} {net_out} res r={inst.RealR}"
        )

    def add_jj_lines(self, inst, net_in, net_out, lines):
        node0 = f"net{inst.list_additional_node[0].GlobalName}"
        node1 = f"net{inst.list_additional_node[1].GlobalName}"
        suffix = inst.name[1:]

        if net_out == "GND!":
            lines.append(
                f"Xj{inst.name} {net_in} {node1} jj "
                f"ics={inst.RealJ}u lser={inst.IndPar}p"
            )
            lines.append(
                f"Rs{suffix} {net_in} {node0} res r={inst.RParral}"
            )
            lines.append(
                f"L{inst.name} {node0} {node1} ind2 l={inst.JJIndParral}p"
            )
            lines.append(
                f"Lp{suffix} {node0} {net_out} ind2 l={inst.Lp}p"
            )
            return

        lines.append(
            f"Xj{inst.name} {net_in} {net_out} jj "
            f"ics={inst.RealJ}u lser={inst.IndPar}p"
        )
        lines.append(
            f"Rs{suffix} {net_in} {node0} res r={inst.RParral}"
        )
        lines.append(
            f"L{inst.name} {node0} {net_out} ind2 l={inst.JJIndParral}p"
        )
