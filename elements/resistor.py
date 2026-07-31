from elements.base import Element

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
        