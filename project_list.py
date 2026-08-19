import argparse
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

def select_project(base_dir):
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", "-p", choices=PROJECTS)
    args = parser.parse_args()

    project_name = args.project or choose_project()
    project = PROJECTS[project_name]
    netlist_path = base_dir / project["netlist"]
    layout_path = base_dir / project["layout"]

    if not netlist_path.exists(): raise FileNotFoundError(f"Netlist not found: {netlist_path}")
    if not layout_path.exists(): raise FileNotFoundError(f"Layout not found: {layout_path}")

    return netlist_path, layout_path

def choose_project():
    names = list(PROJECTS)

    print("\nAvailable projects:")
    for index, name in enumerate(names, 1): print(f"  {index}. {name}")

    while True:
        choice = input("\nSelect project: ").strip()
        if choice.isdigit() and 1 <= int(choice) <= len(names): return names[int(choice) - 1]
        if choice in PROJECTS: return choice
        print("Invalid project.")