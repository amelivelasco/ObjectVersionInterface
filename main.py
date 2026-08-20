from pathlib import Path

from UI.main_page import Schematic
from parser.cdl_parser import CDLParser
from project_list import select_project


def read_custom_compiler_cell_name(sp_path):
    for line in Path(sp_path).read_text(encoding="utf-8", errors="ignore").splitlines():
        stripped = line.strip()
        if not stripped.startswith("*"): continue
        key, separator, value = stripped[1:].partition(":")
        if separator and key.strip().lower() == "cell": return value.strip()
    return None


def main():
    base_dir = Path(__file__).resolve().parent

    original_netlist_path, layout_path, project_dir = select_project(base_dir)

    ordered_elems_path = base_dir / "ordered_elems.txt"

    schematic = Schematic(
        sp_file=original_netlist_path,
        map_file=ordered_elems_path
    )

    paths = schematic.build_run_paths(
        base_dir,
        original_netlist_path,
        project_dir
    )

    # Automatically clean/migrate the old architecture.
    schematic.organize_existing_files(paths)

    # Chooses the correct active SP:
    # no sol.txt -> original Netlist.sp
    # sol.txt    -> generated Netlist_from_sol.sp
    netlist_path, combined_layout_map = schematic.prepare_netlist(paths)

    parser = CDLParser()

    circuit = parser.parse(netlist_path)
    original_circuit = CDLParser().parse(original_netlist_path)

    top_cell_name = (
        read_custom_compiler_cell_name(original_netlist_path)
        or str(circuit.TOP.name)
    )

    paths["cir_output"] = schematic.get_next_cir_output_path(
        top_cell_name,
        paths["output_dir"],
        paths["previous_cirs_dir"]
    )

    schematic.attach_original_values(
        original_circuit,
        circuit,
        paths["sol"].exists()
    )

    klayout_exp, inductex_exp = schematic.setup_exporters(
        circuit,
        layout_path,
        paths["output_dir"],
        combined_layout_map,
        paths["sol"]
    )

    first_level_layout_cells = schematic.prepare_layout_mapping(
        circuit,
        klayout_exp
    )

    schematic.generate_inductex_files(
        parser,
        klayout_exp,
        inductex_exp,
        {
            "layout_path": layout_path,
            "paths": paths,
            "top_cell_name": top_cell_name,
        }
    )

    klayout_exp.cover_cell_with_layer()

    schematic.generate_schematic_files(
        parser,
        circuit,
        netlist_path,
        paths,
        first_level_layout_cells,
        top_cell_name
    )


if __name__ == "__main__":
    main()