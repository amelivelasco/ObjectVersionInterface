from elements.base import Element

# Class description:
# This class represents a resistor element in the InductEx netlist format. It inherits
# from the Element class and implements the emit method to return the appropriate netlist
# line for a resistor. The class also includes a method to add the real resistance value
# to the element.

# Parameters:
# - name: The name of the resistor element, such as "R1".
# - net_p: A string representing the positive net of the resistor, such as "net
# - net_n: A string representing the negative net of the resistor, such as "net2".
# - R_ohm: The resistance value in ohms for the resistor.

# Methods:
# - emit(): Returns a list of strings representing the netlist line for the resistor in InductEx format.
# - addRealR(Value): A method to add the real resistance value to the element.

# Example usage:
# resistor = ResistorElement(name="R1", net_p="net1", net_n="net2", R_ohm=1000)
# resistor.addRealR(1000) 

# Improvements:
# - Same improvements as previous components.

class ResistorElement(Element):
    """
    Résistance logique.
    """

    def __init__(self, name: str, net_p: str, net_n: str, r_ohm: float):
        super().__init__(name, net_p, net_n)
        self.R = r_ohm  # ohms
        self.type = "R"

    def emit(self) -> list[str]:
        return [
            f"R{self.name}\t{self.net_in}\t{self.net_out}\t{self.R}"
        ]
    
    def addRealR(self, real_r_value:float):
        self.RealR = real_r_value
        return