from exporters.KLayoutExporter import KLayoutExporter
from exporters.InductexExporter import InductexExporter
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
    base_dir = os.path.dirname(os.path.abspath(__file__))


    # -------------------------------
    # 5) Parsing du fichier CDL
    # -------------------------------
    netlist_path = os.path.join(base_dir, "test_files", "BasicCellsHomemade_MultiplexerAmeli.sp")
    layout_path = os.path.join(base_dir, "test_files", "MultiplexerAmeli.custom_compiler.gds")
    
    circuit = parser.parse(netlist_path)
    
    klayout_exp = KLayoutExporter(circuit, layout_path)
    inductex_exp = InductexExporter(circuit)

    inductex_exp.folder_to_write(base_dir)
    TOP_CEL = circuit.TOP
    inductex_exp.list_top_nodes(TOP_CEL)
    # --- Charger le layout ---
    klayout_exp.integrating_layout()
    klayout_exp.report_mapping_audit()
    klayout_exp.report_layout_mapping()
    inductex_exp.renum_top()
    circuit.assign_cell_ids()
    circuit.define_local_names()
    circuit.rename_all_elements_by_type()
    #circuit.traverse_cell(TOP_CEL)

    klayout_exp.write_cell_names()
    
    lines = inductex_exp.read_inductex_file()
    elem_connections = inductex_exp.read_elem_connections(lines)
    inductex_exp.write_inductex_file(elem_connections)
    
    inductex_exp.attach_elements_to_nodes()
    klayout_exp.mark_single_connection_nodes_in_layout()
    klayout_exp.cover_cell_with_layer()

    #parser.parsesol(r"Datafolder\sol.txt",circuit)
    #circuit.BuildNetlist()

    
if __name__ == "__main__":
    
    main()