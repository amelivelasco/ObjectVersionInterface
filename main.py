from datetime import datetime, timezone
from pathlib import Path

from UI.main_page import Schematic
from exporters.KLayoutExporter import KLayoutExporter
from exporters.InductexExporter import InductexExporter
from exporters.SpiceExporter import SpiceExporter
from parser.cdl_parser import CDLParser
import os
import re
import subprocess

def read_custom_compiler_cell_name(sp_path):
    for line in Path(sp_path).read_text(encoding="utf-8", errors="ignore").splitlines():
        match = re.match(r"^\s*\*\s*Cell\s*:\s*(.+?)\s*$", line, re.IGNORECASE)
        if match: return match.group(1).strip()
    return None

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

    # netlist_path = (
    #     base_dir
    #     / "Circuit_Projects"
    #     / "NDROmCells"
    #     / "Netlist.sp"
    # )
       
    # layout_path = (
    #     base_dir 
    #     / "Circuit_Projects"
    #     / "NDROmCells"
    #     / "BIG_Cellname.gds"
    # )

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

    netlist_path = (
        base_dir
        / "Circuit_Projects"
        / "Splitter" / "Splitter"
        / "Netlist.sp"
    )

    layout_path = (
        base_dir
        / "Circuit_Projects"
        / "Splitter" / "Splitter"
        / "Layout.gds"
    )
    
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

 
    output_dir = (
        netlist_path.parent
        / f"{netlist_path.stem}_Inductex"
    )

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )
    output_dir.mkdir(parents=True, exist_ok=True)

    version = 1
    while (output_dir / f"BIG_Cell_inductex_V{version}.cir").exists():
        version += 1

    cir_output_path = output_dir / f"BIG_Cell_inductex_V{version}.cir"

    print("InductEx circuit folder:", output_dir.resolve())
    print("New InductEx file:", cir_output_path.resolve())

    original_netlist_path = netlist_path
    top_cell_name = read_custom_compiler_cell_name(original_netlist_path)
    if not top_cell_name: top_cell_name = str(circuit.TOP.name)
    sol_path = original_netlist_path.parent / "sol.txt"
    extracted_sp_path = original_netlist_path.parent / "Netlist_from_sol.sp"

    if not original_netlist_path.exists():
        raise FileNotFoundError(f"Original SPICE netlist not found: {original_netlist_path.resolve()}")


    def build_sol_name_map(sp_path):
        map_parser = CDLParser()
        map_circuit = map_parser.parse(sp_path)

        map_circuit.assign_cell_ids()
        map_circuit.define_local_names()

        original_names = {}

        def save_names(cell):
            for elem in cell.instances:
                if hasattr(elem, "instances"):
                    save_names(elem)
                else:
                    original_names[id(elem)] = str(getattr(elem, "raw_name", elem.name)).upper()

        save_names(map_circuit.TOP)

        # Same renaming used for the InductEx CIR:
        # L1, L2, J1, J2, IB1...
        map_circuit.rename_all_elements_by_type()

        name_map = {}

        def collect_names(cell):
            for elem in cell.instances:
                if hasattr(elem, "instances"):
                    collect_names(elem)
                    continue

                raw_name = original_names[id(elem)]
                sol_name = str(elem.name).upper()

                name_map[raw_name] = sol_name

                if raw_name.startswith("L") and not raw_name.startswith("LL"):
                    name_map[f"L{raw_name}"] = sol_name

                if elem.type == "JJ":
                    name_map[f"XSJ{raw_name}"] = sol_name

                if elem.type == "IB":
                    name_map[f"XPC{raw_name}"] = sol_name

        collect_names(map_circuit.TOP)

        print("\n=== ORIGINAL SP -> SOL NAME MAP ===")
        for original, sol_name in name_map.items():
            print(f"{original} -> {sol_name}")
        print("====================================\n")

        return name_map
    
    combined_layout_map = {}


    if sol_path.exists():
        print("InductEx solution found:", sol_path.resolve())

        # IMPORTANT:
        # Always use ORIGINAL SP as the formatting/topology template.
        name_map = build_sol_name_map(original_netlist_path)

        generated_sp, combined_layout_map = SpiceExporter.create_sp_from_sol(
            sol_path=sol_path,
            source_sp=original_netlist_path,
            output_sp=extracted_sp_path,
            name_map=name_map,
        )

        netlist_path = extracted_sp_path

        print("Netlist updated while preserving original SP format:", netlist_path.resolve())
        show_file_in_vscode(netlist_path)

    else:
        netlist_path = original_netlist_path
        print("No sol.txt found. Using original SP:", netlist_path.resolve())


    parser = CDLParser()
    circuit = parser.parse(netlist_path)

    # Parse the SP with its ORIGINAL component names and ORIGINAL nets preserved.
    parser = CDLParser()
    circuit = parser.parse(netlist_path)

    # 1. Parse circuit.
    parser = CDLParser()
    circuit = parser.parse(netlist_path)

    # 2. Create exporters using the same fixed output directory.
    klayout_exp = KLayoutExporter(circuit, layout_path)

    klayout_exp.combined_layout_map = combined_layout_map

    inductex_exp = InductexExporter(circuit)

    if sol_path.exists():
        inductex_exp.sol_values = SpiceExporter.parse_sol_file(sol_path)

    klayout_exp.output_dir = str(output_dir)
    inductex_exp.output_dir = str(output_dir)
    inductex_exp.list_top_nodes(circuit.TOP)

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
        top_cell_name=top_cell_name
    )

    ordered_components = schematic.read_ordered_components(spice_data)

    # 9. Overwrite ordered_elems.txt.
    generated_at = datetime.now(timezone.utc).isoformat()

    with ordered_elems_path.open("w", encoding="utf-8") as file:
        file.write(f"generated_at: {generated_at}\n")
        file.write(f"cell_name: {top_cell_name}\n")
        for component in ordered_components: file.write(f"{component}\n")

    print("ordered_elems.txt rewritten at:", ordered_elems_path.resolve())

    schematic.write_circuit_data(
        ordered_components=ordered_components,
        output_file=circuit_data_path,
        top_cell_name=top_cell_name
    )

    print("circuit_data.js regenerated at:", circuit_data_path.resolve())


if __name__ == "__main__":
    main()