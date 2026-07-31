from elements.base import Element

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