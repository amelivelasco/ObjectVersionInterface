from abc import ABC, abstractmethod

# Class description:
# Abstract class defining the structure of an element in
# the interface such as a resistor or capacitor. Each element 
# has a name, input and output nets, and a method to emit 
# its representation in the InductEx netlist format.

# Parameters:
# - name: The name of the element, such as " resistor1 ".
# - net_in: A dictionary representing the input nets of the element, such as {"1": [None]}
#           where the key is the net name and the value is a list of connected nodes.
#           Connected nodes can be represented as strings or None if not connected. For 
#           example, {"1": ["nodeA"]} indicates that the input net "1" is connected to "nodeA".
# - net_out: A dictionary representing the output nets of the element, such as {"2": [None]}

# Methods:
# - emit(): An abstract method that should be implemented by subclasses to 
#           return the lines of the InductEx netlist representation of the element.
# The _init__ method initializes the element with:
# - name: The name of the element as in the netlist.
# - net_in: A dictionary representing the input nets of the element.
# - net_out: A dictionary representing the output nets of the element.
# - local_name: Whats the difference between this and name?
# - type: The type of the element, such as "Resistor" or "Capacitor".
# - netInductex: The net name used in the InductEx netlist for this element.
# - LayoutCell: The layout cell where this element is placed in the physical design.
# - listAdditionalNode: Why do we need this? We 

# Example usage:
# class Resistor(Element):
#     def __init__(self, name, net_in, net_out, resistance):
#         super().__init__(name, net_in, net_out)
#         self.resistance = resistance
#     def emit(self):
#         return [f"R {self.name} {self.net_in['1'][0]} {self.net_out['2'][0]} 
#         {self.resistance}"]


# Problems:
# net_in. net_out are not used in the intialization of the element.

# Improvements: 
# - Even though the net_in and net_out here are expressed as dictionaries, they are only used as 
#   strings in the emit method of the subclasses. We should 
#   modify the subclasses to use dictionaires instead.
# - Maybe add methods to addNetIn and addNetOut? 



class Element(ABC):
    """
    Classe abstraite de base pour tous les éléments physiques.
    """

    def __init__(self, name: str, net_in, net_out):
        self.name = name
        self.raw_name = name
        self.Path_name = None
        self.net_in = net_in
        self.net_out = net_out
        self.local_name = None
        self.type = None
        self.netInductex = None
        self.LayoutCell = None
        self.listAdditionalNode = []
        self.original_name = None

    @abstractmethod
    def emit(self) -> list[str]:
        """
        Retourne les lignes de netlist InductEx.
        """
        pass

