from elements.base import Element

# Class description:
# This class represents a Josephson Junction element in the InductEx netlist format. 
# It inherits from the Element class and implements the emit method to return the 
# appropriate netlist line for a Josephson Junction. The class also includes methods to add the real
# Josephson Junction parameters to the element.

# Parameters:
# - name: The name of the Josephson Junction element, such as "JJ1".
# - net_in: A string representing the input net of the Josephson Junction, such as "net1".
# - net_out: A string representing the output net of the Josephson Junction, such as "net2".
# - Ic_micro: The critical current value in microamperes (µA) for the Josephson Junction.

# Methods:
# - emit(): Returns a list of strings representing the netlist line for the Josephson Junction in InductEx format.  
# - addIndParas(Value): A method to add the inductive parameters of the Josephson Junction to the element.
# - addJJReal(Value): A method to add the real Josephson Junction parameters to the element.
# - addJJIndParral(Value): A method to add the parallel inductance of the Josephson Junction to the element.
# - addJJRParral(Value): A method to add the parallel resistance of the Josephson Junction to the element.
# - addJJLp(Value): A method to add the Josephson inductance of the Josephson Junction to the element.

# Example usage:
# jj = JJElement(name="JJ1", net_in="net1", net_out="net2", Ic_micro=10)
# jj.addIndParas(0.1)  # Adding the inductive parameters of the Josephson Junction
# jj.addJJReal(10)  # Adding the real Josephson Junction parameters
# jj.addJJIndParral(0.01)  # Adding the parallel inductance of the Josephson Junction
# jj.addJJRParral(100)  # Adding the parallel resistance of the Josephson Junction
# jj.addJJLp(0.001)  # Adding the Josephson inductance of the Josephson Junction

# Improvements:
# - Fix all the SonarQube issues related to the names of the parameters (should remove Capital
# Letter)
# - Make the Values typed parameters.


class JJElement(Element):
    """
    Josephson Junction logique.
    """

    def __init__(self, name: str, net_in: str, net_out: str, ic_micro: float):
        super().__init__(name, net_in, net_out)
        self.Ic = ic_micro  # µA
        self.type = "JJ"

    def emit(self) -> list[str]:
        return [
            f"J{self.name}\t{self.net_in}\t{self.net_out}\t{self.Ic}"
        ]
    def addIndParas(self, ind_par_value: float):
        self.IndPar = ind_par_value

    def addJJReal(self, jj_real_value: float):
        self.RealJ = jj_real_value
        
    def addJJIndParral(self, jj_ind_parral_value: float):
        self.RParral = jj_ind_parral_value
        
    def addJJLp(self, jj_lp_value: float):
        self.Lp = jj_lp_value
        


