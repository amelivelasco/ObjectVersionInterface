import argparse
import shutil
from pathlib import Path

PROJECTS = {
    "multiplexer": {
        "netlist": "Circuit_Projects/MultiplexerAmeli/BasicCellsHomemade_MultiplexerAmeli.sp",
        "layout": "Circuit_Projects/MultiplexerAmeli/MultiplexerAmeli.custom_compiler.gds",
    },
    "ndrom_cells": {
        "netlist": "Circuit_Projects/NDROmCells/Netlist.sp",
        "layout": "Circuit_Projects/NDROmCells/BIG_Cellname.gds",
    },
    "ndrom_wires": {
        "netlist": "Circuit_Projects/NDROMWires/LayoutDone_NDROMDrivers.sp",
        "layout": "Circuit_Projects/NDROMWires/NDROMDrivers.custom_compiler.gds",
    },
    "splitter": {
        "netlist": "Circuit_Projects/Splitter/Splitter/Netlist.sp",
        "layout": "Circuit_Projects/Splitter/Splitter/Layout.gds",
    },
    "ndrom_drivers": {
        "netlist": "Circuit_Projects/NDROMDrivers/Netlist.sp",
        "layout": "Circuit_Projects/NDROMDrivers/NDROMDrivers.custom_compiler.gds",
    },
    "vfhalf": {
        "netlist": "Circuit_Projects/VFHalf/LayoutDone_VFHalf.sp",
        "layout": "Circuit_Projects/VFHalf/VFHalf.custom_compiler.gds",
    },
    "ndrom_drivers_old": {
        "netlist": "Circuit_Projects/NDROMDrivers 1 (1)/NDROMDrivers/LayoutDone_NDROMDrivers.sp",
        "layout": "Circuit_Projects/NDROMDrivers 1 (1)/NDROMDrivers/NDROMDrivers.custom_compiler.gds",
    },
}


def move_project_file(source_path, output_dir):
    destination = output_dir / source_path.name

    # File was already moved during a previous execution.
    if destination.exists():
        return destination

    if not source_path.exists():
        raise FileNotFoundError(f"Project file not found: {source_path}")

    output_dir.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source_path), str(destination))

    print(f"Moved: {source_path} -> {destination}")
    return destination

def resolve_project_file(source_path, output_dir):
    source_path = Path(source_path)
    destination = Path(output_dir) / source_path.name

    output_dir.mkdir(parents=True, exist_ok=True)

    # A new/updated file has been exported into the project root.
    # Move it into the InductEx folder, replacing the previous version.
    if source_path.exists():
        if destination.exists():
            destination.unlink()

        source_path.replace(destination)

        print(f"Updated project file: {destination.resolve()}")
        return destination

    # Nothing new was exported: use the version already stored
    # inside the InductEx folder.
    if destination.exists():
        return destination

    raise FileNotFoundError(
        f"File not found in either location:\n"
        f"  {source_path}\n"
        f"  {destination}"
    )

def select_project(base_dir):
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", "-p", choices=PROJECTS)
    args = parser.parse_args()

    project_name = args.project or choose_project()
    project = PROJECTS[project_name]

    source_netlist = base_dir / project["netlist"]
    source_layout = base_dir / project["layout"]

    project_dir = source_netlist.parent
    output_dir = project_dir / f"{project_dir.name}_Inductex"

    netlist_path = resolve_project_file(source_netlist, output_dir)
    layout_path = resolve_project_file(source_layout, output_dir)

    return netlist_path, layout_path, project_dir


def choose_project():
    names = list(PROJECTS)

    print("\nAvailable projects:")
    for index, name in enumerate(names, 1):
        print(f"  {index}. {name}")

    while True:
        choice = input("\nSelect project: ").strip()
        if choice.isdigit() and 1 <= int(choice) <= len(names):
            return names[int(choice) - 1]
        if choice in PROJECTS:
            return choice
        print("Invalid project.")