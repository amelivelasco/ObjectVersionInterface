from datetime import datetime, timezone
from pathlib import Path

from UI.main_page import Schematic
from exporters.KLayoutExporter import KLayoutExporter
from exporters.InductexExporter import InductexExporter
from parser.cdl_parser import CDLParser


def main():
    base_dir = Path(__file__).resolve().parent

    # netlist_path = (
    #     base_dir
    #     / "test_files"
    #     / "BasicCellsHomemade_MultiplexerAmeli.sp"
    # )
    
    netlist_path = (
        base_dir
        / "Splitter" / "Splitter"
        / "Netlist.sp"
    )

    layout_path = (
        base_dir / "Splitter" / "Splitter"
        / "Layout.gds"
    )

    ordered_elems_path = (
        base_dir
        / "ordered_elems.txt"
    )

    circuit_data_path = (
        base_dir
        / "UI"
        / "circuit_data.js"
    )

    # --------------------------------------------------
    # 1. Parse the circuit
    # --------------------------------------------------
    parser = CDLParser()
    circuit = parser.parse(netlist_path)

    # --------------------------------------------------
    # 2. Create exporters
    # --------------------------------------------------
    klayout_exp = KLayoutExporter(
        circuit,
        layout_path,
    )

    inductex_exp = InductexExporter(circuit)

    inductex_exp.folder_to_write(
        str(base_dir)
    )

    top_cell = circuit.TOP

    inductex_exp.list_top_nodes(
        top_cell
    )

    # --------------------------------------------------
    # 3. Match circuit elements with layout instances
    # --------------------------------------------------
    klayout_exp.integrating_layout()

    # This method must return:
    # {
    #     "LI0|L1": "NDROM2",
    #     "LI0|L2": "NDROM2",
    #     "I6|J7": "confluenceBufferUpgrade",
    #     ...
    # }
    first_level_layout_cells = (
        klayout_exp.report_mapping_audit()
    )

    klayout_exp.report_layout_mapping()

    # --------------------------------------------------
    # 4. Continue the original circuit processing
    # --------------------------------------------------
    inductex_exp.renum_top()

    circuit.assign_cell_ids()
    circuit.define_local_names()
    
    def save_original_component_names(cell):
        for elem in cell.instances:
            if hasattr(elem, "net_in"):
                elem.original_name = elem.name
            elif hasattr(elem, "instances"):
                save_original_component_names(elem)


    save_original_component_names(circuit.TOP)

    circuit.rename_all_elements_by_type()

    klayout_exp.write_cell_names()

    lines = inductex_exp.read_inductex_file()

    element_connections = (
        inductex_exp.read_elem_connections(
            lines
        )
    )

    inductex_exp.write_inductex_file(
        element_connections
    )

    inductex_exp.attach_elements_to_nodes()

    klayout_exp.mark_single_connection_nodes_in_layout()
    klayout_exp.cover_cell_with_layer()

    # --------------------------------------------------
    # 5. Read the ordered components
    # --------------------------------------------------
    spice_data = parser.circuit_to_schematic_data(
        circuit
    )

    schematic = Schematic(
        sp_file=netlist_path,
        map_file=ordered_elems_path,
    )
    
    schematic.refresh_ordered_components_file(
        circuit=circuit,
        first_level_layout_cells=first_level_layout_cells,
    )


    ordered_components = (
        schematic.read_ordered_components(
            spice_data
        )
    )

    # --------------------------------------------------
    # 6. Replace layout_cell with the first-level cell
    #    below MultiplexerAmeli
    # --------------------------------------------------
    for component in ordered_components:
        first_level_cell = (
            first_level_layout_cells.get(
                component.raw
            )
        )

        if first_level_cell is None:
            print(
                "WARNING: no first-level layout cell "
                f"found for {component.raw}. "
                f"Keeping existing value: "
                f"{component.layout_cell}"
            )
            continue

        print(
            f"Updating {component.raw}: "
            f"{component.layout_cell} "
            f"-> {first_level_cell}"
        )

        component.layout_cell = (
            first_level_cell
        )

    # --------------------------------------------------
    # 7. Rewrite ordered_elems.txt
    # --------------------------------------------------
    generated_at = datetime.now(
        timezone.utc
    ).isoformat()

    with ordered_elems_path.open(
        "w",
        encoding="utf-8",
    ) as file:
        file.write(
            f"generated_at: {generated_at}\n"
        )

        for component in ordered_components:
            file.write(
                f"{component}\n"
            )

    print(
        "ordered_elems.txt rewritten at:",
        ordered_elems_path.resolve(),
    )

    # --------------------------------------------------
    # 8. Regenerate circuit_data.js from the updated file
    # --------------------------------------------------
    schematic.write_circuit_data(
        ordered_components_file=ordered_elems_path,
        output_file=circuit_data_path,
    )

    print(
        "circuit_data.js regenerated at:",
        circuit_data_path.resolve(),
    )


if __name__ == "__main__":
    main()