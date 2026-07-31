class CircuitComponent:
    def __init__(self, raw, path, pid, layout_cell, net_in, net_out, value = None, row = None, column= None):
        self.raw = raw
        self.path = path
        self.pid = pid
        self.layout_cell = layout_cell
        self.net_in = net_in
        self.net_out = net_out
        self.row = row
        self.column = column
        self.value = value
        
    @property
    def nets(self):
        return {net for net in [self.net_in, self.net_out] if net is not None}

    def shares_net_with(self, other):
        return len(self.nets.intersection(other.nets)) > 0


    def __repr__(self):
        return (
            "CircuitComponent("
            f"raw={self.raw}, "
            f"path={self.path}, "
            f"pid={self.pid}, "
            f"layout_cell={self.layout_cell}, "
            f"net_in={self.net_in}, "
            f"net_out={self.net_out}, "
            f"value={self.value}"
            ")"
        )