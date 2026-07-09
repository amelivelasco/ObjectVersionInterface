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
        self.raw_name = name
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
        
        cell_lines = self._get_cell_lines(filename, linelist)

        port_mapping = self._build_port_mapping(cell_lines[0], nodes)
        cell_lines = self._replace_port_names(cell_lines, port_mapping)

        for line in cell_lines:
            self._rebuild_line(line, filename, circuit, upper_nodes)
    
    def _get_cell_lines(self, filename, linelist):
        with open(filename, "r") as file:
            lines = file.read().splitlines()

        start = linelist[0] - 1
        end = linelist[1] - 1

        return lines[start:end]

    def _build_port_mapping(self, subckt_line, nodes):
        tokens = subckt_line.split()
        ports = tokens[2:]

        return dict(zip(ports, nodes))
    
    def _replace_port_names(self, cell_lines, port_mapping):
        replaced_lines = []

        for line in cell_lines:
            for old_port, new_node in port_mapping.items():
                line = re.sub(
                    r"(?<!\w)" + re.escape(old_port) + r"(?!\w)",
                    str(new_node),
                    line
                )

            replaced_lines.append(line)

        return replaced_lines

    def _rebuild_line(self, line, filename, circuit, upper_nodes):
        tokens = line.split()

        if not tokens:
            return

        head = tokens[0]
        head_lower = head.lower()

        if head_lower.startswith(".subckt"):
            self._handle_subckt(tokens)
            return

        if head_lower.startswith("xsjj"):
            self._handle_jj(tokens, upper_nodes)
            return

        if head_lower.startswith("xpc") and "|ib" in head_lower:
            self._handle_ib(tokens, upper_nodes)
            return

        if head_lower.startswith("ll"):
            self._handle_inductor(tokens, upper_nodes)
            return

        if head_lower.startswith("r"):
            self._handle_resistor(tokens, upper_nodes)
            return

        if head_lower.startswith("xi"):
            self._handle_cell_instance(tokens, filename, circuit, upper_nodes)
            
    
    def _handle_subckt(self, tokens):
        ports = tokens[2:]

        for port in ports:
            self.add_port_net(port)
    
    def _handle_jj(self, tokens, upper_nodes):
        head = tokens[0]

        name = re.sub(r"^xsj", "", head, flags=re.I)
        net_in = tokens[1]
        net_out = tokens[2]

        ic = self._get_float_param(tokens, ("ic=", "ics="), default=100.0, remove_chars="u")

        self.add_element(
            JJElement(name, None, None, ic),
            net_in,
            net_out,
            upper_nodes
        )
    
    def _handle_ib(self, tokens, upper_nodes):
        head = tokens[0]

        name = re.sub(r"^xpc", "", head, flags=re.I)
        net_in = tokens[2]
        net_out = tokens[3]

        ib = self._get_float_param(tokens, ("ib=",), default=None, remove_chars="u")

        self.add_element(
            BiasIBElement(name, None, None, ib),
            net_in,
            net_out,
            upper_nodes
        )
    
    def _handle_inductor(self, tokens, upper_nodes):
        head = tokens[0]

        name = head[1:]
        net_p = tokens[1]
        net_n = tokens[2]

        lval = self._get_float_param(tokens, ("l=",), default=None, remove_chars="pn")

        self.add_element(
            InductorElement(name, None, None, lval),
            net_p,
            net_n,
            upper_nodes
        )
    
    def _handle_resistor(self, tokens, upper_nodes):
        head = tokens[0]

        name = head[1:]
        net_p = tokens[1]
        net_n = tokens[2]

        rval = self._get_float_param(tokens[3:], ("r=",), default=None)

        if rval is None:
            rval = float(tokens[-1])

        self.add_element(
            ResistorElement(name, None, None, rval),
            net_p,
            net_n,
            upper_nodes
        )
    
    def _handle_cell_instance(self, tokens, filename, circuit, upper_nodes):
        head = tokens[0]

        model = tokens[-1]
        nets = tokens[1:-1]

        child_nodes = [
            self.get_node(net, upper_nodes)
            for net in nets
        ]

        added_cell = Cell(model)

        added_cell.rebuild(
            filename,
            circuit.get_cell(model).lines,
            circuit,
            nets,
            child_nodes
        )

        added_cell.name = head[1:]

        self.add_cell_instance(added_cell)
    
    def _get_float_param(self, tokens, prefixes, default=None, remove_chars=""):
        for token in tokens:
            token_lower = token.lower()

            if not token_lower.startswith(prefixes):
                continue

            value = token.split("=", 1)[1]

            for char in remove_chars:
                value = value.replace(char, "")

            return float(value)

        return default
        
                