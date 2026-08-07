from datetime import datetime, timezone
from pathlib import Path

from UI.main_page import Schematic
from exporters.KLayoutExporter import KLayoutExporter
from exporters.InductexExporter import InductexExporter
from exporters.SpiceExporter import SpiceExporter
from parser.cdl_parser import CDLParser
import os
import subprocess


def show_file_in_vscode(file_path: Path):
    file_path = file_path.resolve()

    try:
        if os.name == "nt":
            subprocess.Popen(
                ["cmd", "/c", "code", "--reuse-window", str(file_path)],
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
        else:
            subprocess.Popen(
                ["code", "--reuse-window", str(file_path)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
    except OSError as error:
        print(f"Could not open generated file in VS Code: {error}")


def main():
    base_dir = Path(__file__).resolve().parent

    netlist_path = (
        base_dir
        / "Circuit_Projects"
        / "MultiplexerAmeli"
        / "BasicCellsHomemade_MultiplexerAmeli.sp"
    )
       
    layout_path = (
        base_dir 
        / "Circuit_Projects"
        / "MultiplexerAmeli"
        / "MultiplexerAmeli.custom_compiler.gds"
    )

    netlist_path = (
        base_dir
        / "Circuit_Projects"
        / "NDROmCells"
        / "Netlist.sp"
    )
       
    layout_path = (
        base_dir 
        / "Circuit_Projects"
        / "NDROmCells"
        / "BIG_Cellname.gds"
    )

    # netlist_path = (
    #     base_dir
    #     / "Circuit_Projects"  
    #     / "NDROMWires" 
    #     / "LayoutDone_NDROMDrivers.sp"
    # )
       
    # layout_path = (
    #     base_dir 
    #     / "Circuit_Projects"
    #     / "NDROMWires"
    #     / "NDROMDrivers.custom_compiler.gds"
    # )

    # netlist_path = (
    #     base_dir
    #     / "Circuit_Projects"
    #     / "Splitter" / "Splitter"
    #     / "Netlist.sp"
    # )

    # layout_path = (
    #     base_dir
    #     / "Circuit_Projects"
    #     / "Splitter" / "Splitter"
    #     / "Layout.gds"
    # )
    
    # netlist_path = (
    #     base_dir
    #     / "Circuit_Projects"
    #     / "NDROMDrivers"
    #     / "Netlist.sp"
    # )

    # layout_path = (
    #     base_dir 
    #     / "Circuit_Projects"
    #     / "NDROMDrivers"
    #     / "NDROMDrivers.custom_compiler.gds"
    # )

    # netlist_path = (
    #     base_dir
    #     / "Circuit_Projects"
    #     / "VFHalf"
    #     / "LayoutDone_VFHalf.sp"
    # )
    
    # layout_path = (
    #     base_dir 
    #     / "Circuit_Projects"
    #     / "VFHalf" 
    #     / "VFHalf.custom_compiler.gds"
    # )

    # netlist_path = (
    #     base_dir
    #     / "Circuit_Projects"
    #     / "NDROMDrivers 1 (1)"
    #     / "NDROMDrivers"
    #     / "LayoutDone_NDROMDrivers.sp"
    # )
    
    # layout_path = (
    #     base_dir 
    #     / "Circuit_Projects"
    #     / "NDROMDrivers 1 (1)" 
    #     / "NDROMDrivers"
    #     / "NDROMDrivers.custom_compiler.gds"
    # )
    
    
    

    ordered_elems_path = (
        base_dir
        / "ordered_elems.txt"
    )

    circuit_data_path = (
        base_dir
        / "UI"
        / "circuit_data.js"
    )

 
    # Always use this exact output location.
    datafolder = base_dir / "Datafolder"
    # Create a folder with the same base name as the active .sp file.
    # Create a dedicated InductEx folder beside the active .sp file.
    output_dir = netlist_path.parent / f"{netlist_path.stem}_Inductex"
    output_dir.mkdir(parents=True, exist_ok=True)

    version = 1
    while (output_dir / f"BIG_Cell_inductex_V{version}.cir").exists():
        version += 1

    cir_output_path = output_dir / f"BIG_Cell_inductex_V{version}.cir"

    print("InductEx circuit folder:", output_dir.resolve())
    print("New InductEx file:", cir_output_path.resolve())

    # Remove every stale copy so there is only one current .cir file.
    if datafolder.exists():
        for old_cir_path in datafolder.rglob("BIG_Cell_inductex.cir"):
            print("Deleting old InductEx file:", old_cir_path.resolve())
            old_cir_path.unlink(missing_ok=True)

    # 1. Parse circuit.
    parser = CDLParser()
    circuit = parser.parse(netlist_path)

    # 2. Create exporters using the same fixed output directory.
    klayout_exp = KLayoutExporter(circuit, layout_path)
    inductex_exp = InductexExporter(circuit)
    klayout_exp.output_dir = str(output_dir)
    inductex_exp.output_dir = str(output_dir)
    inductex_exp.list_top_nodes(circuit.TOP)
    original_inductex_node_count = len(inductex_exp.list_nodes_top)

    # 3. Match logical elements to GDS instances.
    klayout_exp.integrating_layout()
    first_level_layout_cells = klayout_exp.report_mapping_audit()
    klayout_exp.report_layout_mapping()

    # 4. Prepare element names.
    circuit.assign_cell_ids()
    circuit.define_local_names()

    def save_original_component_names(cell):
        for elem in cell.instances:
            if hasattr(elem, "net_in"):
                elem.original_name = getattr(elem, "raw_name", elem.name)
            elif hasattr(elem, "instances"):
                save_original_component_names(elem)

    save_original_component_names(circuit.TOP)
    circuit.rename_all_elements_by_type()

    # 5. Write GDS labels.
    klayout_exp.write_cell_names()

    # 6. Generate the complete translated .cir file exactly once.
    generated_cir_path = Path(
        inductex_exp.export_complete_cir(
            klayout_exporter=klayout_exp,
            output_path=cir_output_path,
        )
    ).resolve()

    # Force the generated result into the one official output path.
    if generated_cir_path != cir_output_path.resolve():
        raise RuntimeError(
            f"The .cir file was generated in the wrong location.\n"
            f"Expected: {cir_output_path.resolve()}\n"
            f"Actual: {generated_cir_path}"
        )

    print("New InductEx run saved at:", generated_cir_path)

    if not generated_cir_path.exists():
        raise RuntimeError(f"InductEx file was not generated: {generated_cir_path}")

    show_file_in_vscode(generated_cir_path)

    cir_content = generated_cir_path.read_text(encoding="utf-8")

    # Refuse to continue when an old writer produced only auto-ground lines.
    expected_header = "* === TRANSLATED CIRCUIT CONNECTIONS ==="

    if not cir_content.startswith(expected_header):
        preview = cir_content[:500]
        raise RuntimeError(
            "The generated .cir file is still using the old output format.\n"
            f"File: {generated_cir_path}\n"
            f"Expected first line: {expected_header}\n"
            f"Actual beginning:\n{preview}"
        )

    translated_line_count = sum(
        1
        for line in cir_content.splitlines()
        if line.strip() and not line.lstrip().startswith("*")
    )

    print("LATEST INDUCTEX FILE:", generated_cir_path)
    print("FILE SIZE:", generated_cir_path.stat().st_size, "bytes")
    print("CONNECTION LINES:", translated_line_count)
    print("FIRST 500 CHARACTERS:")
    print(cir_content[:500])

    # This only modifies the GDS and does not write the .cir file.
    klayout_exp.cover_cell_with_layer()

    # 7. Generate schematic information.
    spice_data = parser.circuit_to_schematic_data(circuit)
    schematic = Schematic(sp_file=netlist_path, map_file=ordered_elems_path)

    schematic.refresh_ordered_components_file(
        circuit=circuit,
        first_level_layout_cells=first_level_layout_cells,
    )

    ordered_components = schematic.read_ordered_components(spice_data)

    # 8. Set each component's first-level layout cell.
    for component in ordered_components:
        first_level_cell = first_level_layout_cells.get(component.raw)

        if first_level_cell is None:
            print(
                f"WARNING: no first-level layout cell found for "
                f"{component.raw}. Keeping {component.layout_cell}"
            )
            continue

        print(
            f"Updating {component.raw}: "
            f"{component.layout_cell} -> {first_level_cell}"
        )

        component.layout_cell = first_level_cell

    # 9. Overwrite ordered_elems.txt.
    generated_at = datetime.now(timezone.utc).isoformat()

    with ordered_elems_path.open("w", encoding="utf-8") as file:
        file.write(f"generated_at: {generated_at}\n")
        for component in ordered_components:
            file.write(f"{component}\n")

    print("ordered_elems.txt rewritten at:", ordered_elems_path.resolve())

    # 10. Regenerate circuit_data.js.
    schematic.write_circuit_data(
        ordered_components=ordered_components,
        output_file=circuit_data_path,
    )

    print("circuit_data.js regenerated at:", circuit_data_path.resolve())

    sol_path = output_dir / "sol.txt"

    if sol_path.exists():
        print("Loading InductEx solution:", sol_path.resolve())

        # Load extracted values into the existing logical circuit.
        parser.parsesol(
            str(sol_path),
            circuit,
        )
        spice_exp = SpiceExporter(circuit)
        spice_exp.output_dir = str(output_dir)

        extracted_sp_path = (
            output_dir
            / "Netlist_from_sol.sp"
        )

        spice_exp.build_net_list(
            output_path=extracted_sp_path
        )

        print(
            "Extracted SP created:",
            extracted_sp_path.resolve()
        )

        show_file_in_vscode(
            extracted_sp_path
        )

        # --------------------------------------------------------
        # Clean temporary nodes generated by the first CIR pass.
        # --------------------------------------------------------

        inductex_exp.reset_generated_state(
            original_inductex_node_count
        )

        # --------------------------------------------------------
        # Generate another CIR using extracted values.
        # --------------------------------------------------------

        inductex_exp.use_extracted_values = True

        extracted_cir_path = (
            output_dir
            / f"BIG_Cell_inductex_from_sol_V{version}.cir"
        )

        generated_extracted_cir = Path(
            inductex_exp.export_complete_cir(
                klayout_exporter=klayout_exp,
                output_path=extracted_cir_path,
            )
        ).resolve()

        print(
            "Extracted-value CIR created:",
            generated_extracted_cir
        )

        show_file_in_vscode(
            generated_extracted_cir
        )

    else:
        print(
            "No sol.txt available yet:",
            sol_path.resolve()
        )


if __name__ == "__main__":
    main()