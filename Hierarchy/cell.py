import re
from Hierarchy.node import Node
from elements.base import Element
from elements.jj import JJElement
from elements.bias_ib import BiasIBElement
from elements.inductor import InductorElement
from elements.resistor import ResistorElement
from Hierarchy.circuit import Circuit

# Class description:
# This class represents a logical cell in the design. It contains instances of 
# elements and their connections by net names.
# The Cell class provides methods to add port nets, add cell instances, add elements,
# get nodes, clean cells, summarize the cell, and rebuild the cell from a netlist.

# Parameters:
# - name: The name of the cell, such as "cell1".
# - id: An optional identifier for the cell.
# - model: The model of the cell, 
# - instances: A list to store the instances of elements and subcells within the cell.
# - list_nodes: A list to store the nodes in the cell.
# - net_map: A list to store the mapping of port nets in the cell.
# - lines: A list to store the lines of the netlist representation of the cell.
# - path_name: The path name of the cell in the hierarchy.

# Methods:
# - 1) add_port_net(port): A method to add a port net to the cell's net_map.
# - 2) add_cell_instance(cell_instance): A method to add a cell instance to the cell's instances list.
# - 3) add_rebuild_cell_instance(cell_instance, nets): A method to add a cell instance to the 
#   cell's instances list. PROBLEMATIC
# - 4) add_element(element, net_in, net_out, list_upper_nodes): A method to add an element to the
#   cell's instances list.
# - 5) get_node(name, list_upper_nodes): A method to get a node by name from the cell's list_nodes
#   or from the list_upper_nodes. If the node does not exist, it creates a
#   new node and adds it to the list_nodes.
# - 6) clean_cells(): A method to remove instances with None names from the cell's instances list
# - 7) summary(): A method to print a summary of the cell, including its name and the types and names of its instances.
# - 8) rebuild(filename, linelist, circuit, nodes, upper_nodes): A method to rebuild the cell from a netlist file.
#   MUST REFACTOR!


# Questions:
# - Why is the name and type the same in the intialization? 
# - What is a port net and a node differently? 
#   Answer: A port net is a node that is connected to a port of the cell.
# - What is the difference between the list_nodes and the lines? 
#   Answer: The list_nodes is a list of Node objects that represent the nodes in the cell, 
#           while the lines is a list of strings that represent the lines of the netlist 
#           representation of the cell. 
#           The list_nodes is used for internal representation and manipulation of the 
#           cell's structure, while the lines is used for generating the netlist output.
# - What is the convention for the path names? Are they relative or absolute?
# - Why do we need to separate the port nets to the normal nodes? 
#   Answer: To distinguish between the external connections of the cell (port nets) and the internal connections (normal nodes).

# Improvements:
# - Remove the id parameter as it is not useed, and the names themselves are unique in the list_nodes.
# - Remove the nets parameter from the add_rebuild_cell_instance method.
# - The add_rebuild_cell_instance method seems to be doing the same thing as the add_cell_instance method, 
#   we should remove one of them.
# - The get_node method should be renamed to something like find_or_create_node to better reflect its functionality.
# - Strongly type the parameters of the methods.
# - We should add error handling for cases where the netlist file is not properly formatted or when there are missing parameters in the netlist lines.
# - IMPORTANT: Refactor the rebuild method to reduce its complexity.





class Cell:
    """
    Cellule logique.
    Contient des instances et leurs connexions par noms de nets.
    """

    def __init__(self, name: str):
        self.id = None
        self.name = name
        self.model = name
        self.instances = []
        self.list_nodes= []
        self.net_map = []
        self.lines = []
        self.path_name = ""
        

    
    def add_port_net(self, port):
        
        self.net_map.append(port)


    def add_cell_instance(self, cell_instance):
        
        self.instances.append(cell_instance)
        return cell_instance
    
    def add_element(self, element, net_in, net_out, list_upper_nodes):
        element.net_in = self.get_node(net_in, list_upper_nodes)
        element.net_out = self.get_node(net_out, list_upper_nodes)

        self.instances.append(element)
        return element


    def get_node(self, name, list_upper_nodes):
        name_node = {x.name: x for x in self.list_nodes}
        
       

        if name in name_node:
            return name_node[name]
        
        name_upper_node = {x.name: x for x in list_upper_nodes}

        if name in name_upper_node:
            return name_upper_node[name]
        
        new_node = Node(name)
        if new_node.name in self.net_map: 
            new_node.Internal = False
            new_node.Port = name
        
        self.list_nodes.append(new_node)
        return new_node



    
    def clean_cells(self):

        for i in self.instances:
            print(i.name)
            if i.name is None:
                self.instances.remove(i)
    

   
    def summary(self):
        print("cell name:", self.name)
        for i in self.instances:
            print(type(i),i.name,i.net_out,i.net_in)


    def rebuild(self,filename, linelist,circuit,nodes,upper_nodes):

        lignes =open(filename, "r").read().splitlines()   # iterates through each netlist line 
        cell = lignes[linelist[0]-1:linelist[1]-1] # extracts the lines corresponding to the cell based on the provided line numbers
        tokens = cell[0].split()  # splits the first line of the cell to extract the tokens, such as the cell name and port nets
        list_ports = tokens[2:]  # extracts the port nets from the tokens, which are typically listed after the cell name in the .subckt line of the netlist
                   # This mapping is used to replace the port net names in the cell's netlist lines with the actual node names during the rebuilding process.
        for i in range (len(list_ports)): 
            dict[list_ports[i]] = nodes[i]  # populates the dictionary with the port net names as keys and the corresponding node names from the provided nodes list as values.
            for cle, valeur in dict.items(self):
                ligne = re.sub(
                    r"(?<!\w)" + re.escape(cle) + r"(?!\w)",
                    valeur,
                    ligne
                )
            cell[i] = ligne


        for line in cell:  # iterates through each line of the cell's netlist representation to process the elements and instances defined in the cell.
            tokens = line.split() 
            head = tokens[0] 

            low = line.lower()  # forces lowercase
            if low.startswith(".subckt"):  # identifies the start of a subcircuit definition in the netlist., add as an enum
                ports = tokens[2:]
                
                for p in ports:
                    self.add_port_net(p)   # Adds the port nets to the cell's net_map using the add_port_net method
                continue
                # ===== JJ =====
            if head.lower().startswith("xsjj"):  # make this an enum for the types of elements
                name = re.sub(r"^xsj", "", head, flags=re.I)
                net_in = tokens[1]
                net_out = tokens[2]

                Ic = 100.0  # Is this a constant value for the critical current of the Josephson Junction? 
                for t in tokens:
                    if t.lower().startswith(("ic=", "ics=")):
                        Ic = float(t.split("=", 1)[1].replace("u", ""))  # replaces "u" with "" to convert microamperes to a float value. 
                        break
                
                self.add_element( # FIX: net_p and net_n are not being passed to the JJElement constructor => redundant 
                    JJElement(name, None, None, Ic),net_in,net_out,upper_nodes  # Adds JJ element to cell 
                )


            # ===== IB =====
            elif head.lower().startswith("xpcib"):  # Same as above, make this an enum for the types of elements
                name = re.sub(r"^xpc", "", head, flags=re.I) # Here, make xpc as an enum of "subs"
                net_in = tokens[2]
                net_out = tokens[3]

                Ib = None
                for t in tokens:
                    if t.lower().startswith("ib="):  # Here, make ib as an enum of "types"
                        Ib = float(t.split("=", 1)[1].replace("u", ""))
                        break

                self.add_element(
                    BiasIBElement(name, None, None ,Ib),net_in,net_out,upper_nodes
                )

            # ===== Inductance =====
            elif head.lower().startswith("ll"): 
                name = head[1:]
                net_p = tokens[1]
                net_n = tokens[2]

                lval = None
                for t in tokens:
                    if t.lower().startswith("l="):
                        lval = float(
                            t.split("=", 1)[1]
                            .replace("p", "")
                            .replace("n", "")
                        )
                        break
                self.add_element(    
                    InductorElement(name, None, None, lval),net_p,net_n,upper_nodes
                )

            # ===== Résistance =====
            elif head.lower().startswith("r"):
                name = head[1:]
                net_p = tokens[1]
                net_n = tokens[2]

                rval = None
                for t in tokens[3:]:
                    if t.lower().startswith("r="):
                        rval = float(t.split("=", 1)[1])
                        break

                if rval is None:
                    rval = float(tokens[-1])  # Why only Resistance get the check if it's none? 

                self.add_element(
                    ResistorElement(name, None, None, rval),net_p,net_n,upper_nodes
                )
            # ===========================
            # INSTANCIATION DE CELLULE (XI…)
            # ===========================
            if head.lower().startswith("xi"):
                model = tokens[-1]                    # 'JTL' WHAT IS JTL?
                nets = tokens[1:-1]
                list_node_to_send_down = []
                for i in nets: 
                    list_node_to_send_down.append(self.get_node(i,upper_nodes))
                added_cell = Cell(model)   # So the model is always the same as the name ?
                #print("Instance Name",added_cell.name)
                #print("Instance Name",head)
                added_cell.rebuild(filename,circuit.get_cell(model).lines,circuit,nets,list_node_to_send_down)   # Too much recursion. Could use B+ tree to iterate through the hierarchy instead of recursion.
                list_node_to_send_down = [] 
                added_cell.name = head[1:]
                self.add_cell_instance(added_cell)
                