from elements.base import Element

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
        
    def addRealLIB(self, real_lib_value:float):
        self.RealLIB = real_lib_value
        
