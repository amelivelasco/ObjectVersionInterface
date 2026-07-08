from elements.base import Element

# Class description:
# This class represents a bias current source element in the InductEx netlist format.
# It inherits from the Element class and implements the emit method to return the appropriate
# netlist line for a bias current source. The class also includes methods to addd real
# current values.

# Parameters:
# - name: The name of the bias current source element, such as "IB1".
# - net_in: A string representing the input net of the bias current source, such as "net1".
# - net_out: A string representing the output net of the bias current source, such as "net2".
# - Ib_micro: The bias current value in microamperes (µA) for the bias current source.

# Methods: Same as in base class
# - emit(): Returns a list of strings representing the netlist line for the bias current source in InductEx format.
# - addRealIB(Value): A method to add the real bias current value to the element.
# - addRealLIB(Value): A method to add the real bias current value in logarithmic scale to the element.
 
# Example usage:
# bias_ib = BiasIBElement(name="IB1", net_in="net1", net_out="net2", Ib_micro=10)
# bias_ib.addRealIB(10)  # Adding the real bias current value
# bias_ib.addRealLIB(1)  # Adding the real bias current value in logarithmic scale

# Why bias? 
# Bias current sources are used to set the operating point of active devices in
# electronic circuits. They provide a constant current to ensure that the active devices
# operate in the desired region of their characteristics, which is crucial for the proper 
# functioning of the circuit.

# Improvements:
# - Fix the SonarQube issue related to the name of the parameter Ib_micro 
#   (should remove Capital Letter)
# - The emit method should be an interface to have better control over
#   the format of the netlist line for the bias current source element in InductEx format,
#   as well as to allow more flexibility in the netlist generation process.
# - We should create an enum for the types of elements to avoid using strings.

# Questions:
# - What is the difference between the real bias current value and
#   the real bias current value in logarithmic scale?

class BiasIBElement(Element):
    """
    Source de courant de bias IB.
    """

    def __init__(self, name: str, net_in: str, net_out: str, ib_micro: float):
        super().__init__(name, net_in, net_out)
        self.Ib = ib_micro  # µA 
        self.type = "IB"

    def emit(self) -> list[str]:
        return [
            f"IB{self.name}\t{self.net_in}\t{self.net_out}\t{self.Ib}" 
        ]
    def addRealIB(self, real_ib_value:float):
        self.RealIB = real_ib_value
        return
    def addRealLIB(self, real_lib_value:float):
        self.RealLIB = real_lib_value
        return
