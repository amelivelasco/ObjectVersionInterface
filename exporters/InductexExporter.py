from Hierarchy.node import Node
import os
from datetime import datetime

from exporters.BaseExporter import BaseExporter

class InductexExporter(BaseExporter):
    def __init__(self, circuit):
        super().__init__(circuit)
        self.circuit = circuit
        self.counter_node = 0
        self.list_nodes_top = circuit.list_nodes_top
        self.output_dir = ""
        
        
    def list_top_nodes(self,cell):
        self.list_nodes_top.extend(cell.list_nodes)
        for e in cell.instances:
            if hasattr(e, "net_in"):
                continue
            else:
                self.list_top_nodes(e) 
    
    # could be in circuit class
    def folder_to_write(self, base_dir=None):

        timestamp = datetime.now().strftime("%Y_%m_%d_%H_%M")
        folder_name = f"BIG_Cell_{timestamp}"

        if base_dir is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

        full_path = os.path.join(base_dir, "Datafolder", folder_name)
        os.makedirs(full_path, exist_ok=True)

        self.output_dir = full_path
        
    
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
                elem_type = getattr(
                    elem,
                    "type",
                    None,
                )

                emitter = emitters.get(
                    elem_type
                )

                if emitter is not None:
                    original_name = getattr(
                        elem,
                        "original_name",
                        "<original name unavailable>",
                    )

                    print(
                        f"NAME TRANSLATION: "
                        f"{original_name} -> {elem.name}"
                    )

                    emitter(elem)
                    continue

                if hasattr(elem, "instances"):
                    recursive_walk(elem)

        # Parcours depuis TOP
        recursive_walk(self.circuit.TOP)
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

        # =================================================
        # === ICI : ÉCRITURE FINALE DU FICHIER ============
        # =================================================
    def write_inductex_file(self, relations):
        if relations is None:
            relations = {
                "l": [],
                "p": [],
                "r": [],
                "others": []
            }

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
        """
        Ajoute à chaque Node un attribut `connected_elements`
        listant les éléments qui y sont connectés.
        """
        
        self._walk_node(self.circuit.TOP)
        #self.display_node_connectivity_summary()
        
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

        node_ib = walk(self.circuit.TOP)

        if node_ib is None:
            print("Warning: no IB node found in circuit, skipping IB attachment.")
            return

        new_node = Node(str(len(self.list_nodes_top)+1))

        new_line = f"{'Ldc':<15} {node_ib.GlobalName:<10} {new_node.name:<10}\n{'Pdc':<15} {new_node.name:<10} 0\n"
        with open(os.path.join(self.output_dir, "BIG_Cell_inductex.cir"), "a") as f:
                f.write(new_line)