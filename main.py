from parser.cdl_parser import CDLParser
import pya
import os
from datetime import datetime

# Class description:
# Here is the logic of the main function:
# - It first creates an instance of the CDLParser class.
# - It then calls the parse method of the CDLParser instance, passing the path to a
#  CDL file as an argument. This method reads the CDL file and constructs a circuit hierarchy.
# - After parsing the CDL file, it performs several operations on the constructed circuit, 
#   such as defining the layout, integrating the layout, renumbering nodes, assigning cell IDs, 
#   defining local names, renaming elements by type, writing cell names, writing an InductEx file, 
#   attaching elements to nodes, marking single connection nodes in the layout, and covering cells with a layer.

# Questions:
# What is the purpose of the CDLParser class and how does it work? 


def main():

    # -------------------------------
    # 4) Parser CDL
    # -------------------------------
    parser = CDLParser()


    # -------------------------------
    # 5) Parsing du fichier CDL
    # -------------------------------
    Circuit = parser.parse(r"DC_to_SFQ\Netlist.sp")
    Circuit.FolderTowrite()
    TOP_CEL = Circuit.TOP
    Circuit.listTOPNodes(TOP_CEL)
    # --- Charger le layout ---
    Circuit.defineKlayout(r"DC_to_SFQ\Layout.gds")
    Circuit.IntegratingLayout()
    Circuit.RenumTOP()
    Circuit.assign_cell_ids()
    Circuit.define_local_names()
    Circuit.rename_all_elements_by_type()
    #Circuit.traverse_cell(TOP_CEL)

    Circuit.write_cell_names()
    
    Circuit.write_inductex_file()
    Circuit.attach_elements_to_nodes()
    Circuit.mark_single_connection_nodes_in_layout()
    Circuit.cover_cell_with_layer()

    #parser.parsesol(r"Datafolder\sol.txt",Circuit)
    #Circuit.BuildNetlist()

if __name__ == "__main__":
    
    main()