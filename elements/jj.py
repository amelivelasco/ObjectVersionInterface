from elements.base import Element

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
        


