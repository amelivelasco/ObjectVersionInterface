from copy import deepcopy
class Node:
    """
    Cellule logique.
    Contient des instances et leurs connexions par noms de nets.
    """

    def __init__(self, name: str):
        self.id = None
        self.name = name
        self.internal = True
        self.port = None
        self.global_name = None
        self.connected_elements = []