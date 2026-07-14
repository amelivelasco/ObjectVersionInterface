class LayoutInstance:
    def __init__(self, layout_cell, net_in, net_out, elements=None):
        self.layout_cell = layout_cell
        self.net_in = net_in
        self.net_out = net_out
        self.elements = elements or [] # list of [CircuitComponent]
        
    @property
    def nets(self):
        return {net for net in [self.net_in, self.net_out] if net is not None}

    def shares_net_with(self, other):
        return len(self.nets.intersection(other.nets)) > 0

    def __repr__(self):
        return (
            f"LayoutInstance("
            f"layout_cell={self.layout_cell}, "
            f"net_in={self.net_in}, "
            f"net_out={self.net_out})"
            f"elements={self.elements})"
        )