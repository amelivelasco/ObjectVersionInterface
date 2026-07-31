import matplotlib.pyplot as plt
import networkx as nx
import klayout.db as pya
import re
from collections import defaultdict
from math import sqrt
import os
from datetime import datetime

from Hierarchy.node import Node

# Class description:
# This class represents a circuit in the hierarchy of the design. It contains instances of 
# cells and elements, and provides methods to manage the circuit, such as adding instances 
# and cells, defining the top cell, traversing the hierarchy, integrating with KLayout, 
# renaming elements, and writing output files for both KLayout and InductEx.

# Parameters:
# - name: The name of the circuit, such as "top".
# - cells: A dictionary mapping cell names to Cell objects, representing the cells in the circuit.
# - TOP: The top cell of the circuit, which serves as the entry point for the hierarchy.
# - list_nodes_top: A list of nodes in the top cell, which can be used for renaming and managing connections.
# - element_counters: A dictionary to keep track of the count of each type of element for renaming purposes.
# - layout_top: The top cell of the KLayout layout, used for integrating the logical circuit with the physical design.

# Important methods:
# - define_local_names(self): This function visits all the cells and instances in the 
#   circuit and assigns a unique path name to each instance based on its position in the hierarchy.
# - traverse_cell(self, cell): This function recursively traverses the hierarchy of cells and 
#   prints the names of each cell and its instances.
# - find_layout_instance_by_pid(self, layout_cell, target_name): This function finds an instance 
#   in the KLayout layout by recursing over the klayout_instances and finding the target_name .

# Problems:
# - This whole class must be refactored as it contains too many responsabilities.
# - Remove add_instance and add_cells methods as they are not used and are redundant with add_cell.
# - Remove summary or cell_names methods as they are redundant with each other.
# - Remove define_top method as it is redundant with get_cell method.
# - The visit method should not be defined inside define_local_names, it should be a separate method.
# - Remove integrating_layout method as it just calls go_through method => redundant

# Questions:
# - What is the purpose of property 102 in the method find_layout_instance_by_pid?





class Circuit:
    """
    Circuit logique global.
    Contient :
    - des instances élémentaires (JJ, IB, L, R)
    - des cellules instanciées via XI
    """

    def __init__(self, name="top"):
        self.name = name
        self.cells = {}       # name -> Cell (instances XI)
        self.TOP = None
        self.list_nodes_top = []
        self.element_counters = {}

    def add_instance(self, inst):
        self.instances.append(inst) # PROBLEM: self.instances is not defined in the __init__ method. Remove?

    def add_cells(self, cell):
        self.cells.append(cell)

    def add_cell(self, cell):
        self.cells[cell.name] = cell

    def summary(self):
        return {
            "circuit": self.name,
            "num_instances": len(self.instances),  # remove? self.instances is not defined in the __init__ method.
            "num_cells": len(self.cells),
            "cells": list(self.cells.keys())
        }

    def cell_names(self):  # redundant with summary, remove?
        """
        Retourne la liste des noms des cellules instanciées (XIxx).
        """
        return list(self.cells.keys())

    def get_cell(self, name):
        """
        Retourne la Cell du circuit ayant ce nom.
        """
        return self.cells.get(name)

    def define_top(self,name): # Remove, same as get_celll
        self.TOP = self.cells[name]

    def define_local_names(self): 
        """
        Affiche récursivement tous les local_name
        des éléments contenus sous self.TOP.
        """
        if self.TOP is None:
            raise RuntimeError("TOP non définie dans le circuit")

        def visit(cell, path): # Why do you need to define this method inside define_local_names? It can be a separate method.
            cell_path = f"{path}/{cell.name}_{cell.id}" if path else f"{cell.name}_{cell.id}"
            print("cell",cell_path)  
            

            for inst in cell.instances: 
                # ✅ Élément logique
                if hasattr(inst, "net_in"):
                    inst.Path_name = f"{cell_path}/{inst.name}"
                    print(f"{inst.Path_name}")

                # ✅ Sous-cell
                else:
                    inst.Path_name = cell_path
                    visit(inst, cell_path)

        visit(self.TOP, "")

    
    def traverse_cell(self,cell):
        print("Cell Name:", cell.name)
        print("Cell Model:", cell.model)
        for e in cell.instances:
            if hasattr(e, "net_in"):
                print(e.name," net_in:",e.net_in.name," net_out:",e.net_out.name)

            else:
                self.traverse_cell(e)




    
    def plot_all_base_elements(self):
        """
        Affiche tous les IBias du circuit avec leur Path_name.
        """

        if self.TOP is None:
            raise RuntimeError("TOP non définie dans le circuit")

        def visit(cell):
            # Construction du chemin hiérarchique couran
            for inst in cell.instances:
                # ✅ Cas IBias
                if not hasattr(inst, "instances"):
                    print(f"/{inst.local_name}")

                # ✅ Cas sous-cell → récursion
                else:
                    visit(inst)

        visit(self.TOP)
    
    
    def assign_cell_ids(self):
        counter = 1

        def walk(cell):
            nonlocal counter 

            # Donner un ID uniquement aux cellules
            cell.id = counter
            counter += 1

            for inst in cell.instances:
                # On descend seulement dans les cells
                if not hasattr(inst, "net_in"):
                    walk(inst)
        walk(self.TOP)

    def rename_all_elements_by_type(self):
        """
        Renomme tous les éléments logiques avec un nom unique
        dans toute la hiérarchie, avec une numérotation par type :
        JJ   -> J<n>
        LL   -> L<n>
        res  -> res<n>
        bias -> IBX<n>
        """

        # Compteurs par type final
        counters = {
            "J": 0,
            "L": 0,
            "R": 0,
            "IB": 0,
        }

        # Mapping type interne -> préfixe final
        type_map = {
            "JJ": "J",
            "L": "L",
            "R": "R",
            "IB": "IB",
        }

        def rename_all(cell):
            for inst in cell.instances:

                # ✅ Élément logique (feuille)
                if hasattr(inst, "net_in"):
                    internal_type = inst.type  # ex: "JJ", "LL", "res", "bias"
                    if internal_type not in type_map:
                        raise ValueError(f"Type inconnu : {internal_type}")
                    prefix = type_map[internal_type]
                    counters[prefix] += 1
                    inst.name = f"{prefix}{counters[prefix]}"

                # ✅ Sous-cell
                else:
                    rename_all(inst)

        rename_all(self.TOP)
    
    
    def display_node_connectivity_summary(self):
        """
        Affiche les nœuds selon leur nombre de connexions :
        - 1 connexion
        - 2 connexions
        - 3 connexions ou plus
        """

        one_conn = []
        two_conn = []
        three_plus_conn = []
        print(len(self.list_nodes_top))
        for node in self.list_nodes_top:
            print(node.GlobalName)
            print(node.connected_elements)
            n = len(node.connected_elements)
            if n == 1:
                one_conn.append(node)
                print(len(one_conn))
            elif n == 2:
                two_conn.append(node)
            elif n >= 3:
                three_plus_conn.append(node)

        # ---------- AFFICHAGE ----------
        print("\n=== NODE CONNECTIVITY SUMMARY ===")

        print("\n--- Nodes with 1 connection (DANGLING) ---")
        for node in one_conn:
            e = node.connected_elements[0]
            print(
                f"Node {node.GlobalName:<6} -> "
                f"{e:<10}"
            )

        print("\n--- Nodes with 2 connections (OK) ---")
        for node in two_conn:
            elems = ", ".join(f"{e}" for e in node.connected_elements)
            print(
                f"Node {node.GlobalName:<6} -> {elems}"
            )

        print("\n--- Nodes with 3 or more connections (MULTI) ---")
        for node in three_plus_conn:
            elems = ", ".join(f"{e}" for e in node.connected_elements)
            print(
                f"Node {node.GlobalName:<6} ({len(node.connected_elements)} connections) -> {elems}"
            )

        print("\n=== SUMMARY ===")
        print(f"1 connection : {len(one_conn)} node(s)")
        print(f"2 connections: {len(two_conn)} node(s)")
        print(f"3+ connections: {len(three_plus_conn)} node(s)")


    def find_element(self, cell, name):
        for elem in cell.instances:
            # Cas : élément feuille (composant)
            if hasattr(elem, "net_in"):
                if elem.name == name:
                    return elem
                
            # Cas : sous-cell → descente hiérarchique
            else:
                found = self.find_element(elem, name)  # Maybe print out if element is not found
                if found is not None:
                    return found
                

        return None
      