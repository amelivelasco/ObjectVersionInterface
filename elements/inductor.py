from elements.base import Element

# Class description:
# This class represents an inductor element in the InductEx netlist format. It inherits 
# from the Element class and implements the emit method to return the appropriate netlist 
# line for an inductor. The class also includes a method to add the real inductance value 
# to the element.

# Parameters:
# - name: The name of the inductor element, such as "L1".
# - net_p: A string representing the positive net of the inductor, such as "net1".
# - net_n: A string representing the negative net of the inductor, such as "net2". 
#   Negative net is the reference node for the inductor. What is the reference node? 
#   It is the node that serves as a common return path for current in the circuit. 
#   It is often connected to ground or a common voltage level. In the case of an inductor, 
#   the negative net (net_n) can be considered as the reference node for the inductor, 
#   while the positive net (net_p) is where the current flows through the inductor.
# - L_pH: The inductance value in picohenries (pH) for the inductor.

# Methods: 
# - emit(): Returns a list of strings representing the netlist line for the inductor in
#   InductEx format.
# - addRealL(Value): A method to add the real inductance value to the element. 

# Example usage:
# inductor = InductorElement(name="L1", net_p="net1", net_n="net2", L_pH=100)
# inductor.addRealL(100)  # Adding the real inductance value

# Improvements:
# - Fix the SonarQube issues related to the name of the parameter L_pH as well as Value (should remove Capital Letter)
# - Also, remove the useless return of the method addReal.
# - Make the Value of the inductance a typed parameter.

class InductorElement(Element):
    """
    Inductance logique.
    """

    def __init__(self, name: str, net_p: str, net_n: str, l_ph: float):
        super().__init__(name, net_p, net_n)
        self.L = l_ph  # pH
        self.type = "L"

    def emit(self) -> list[str]:
        return [
            f"L{self.name}\t{self.net_in}\t{self.net_out}\t{self.L}"
        ]
    def addRealL(self, real_l_value:float):
        self.RealL = real_l_value