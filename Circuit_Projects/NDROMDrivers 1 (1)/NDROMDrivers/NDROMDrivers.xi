* IXI File for InductEx example - resistance:rsfq_dcsfq_res
* RSFQ DC-SFQ circuit with resistance
* Authors: L Schindler
* Last mod: 19 August 2026
*******************************************************
* ----------------------------------------------
* COMMAND FOR MODEL/SIMULATION CONTROL
* ----------------------------------------------
$COMMAND
  MeshFile     "BIG_Cell.msh"
  MeshType     Tetra
  Mode         MQS
  Netlist      "BIG_Cell_inductex_V1.cir"
  Plot         [ J ]
  Process      "..\seeqc_v8.ldf"
  Fidelity     High
  Cores        8
$END

* ----------------------------------------------
* MAIN (TOP-LEVEL) STRUCTURE
* ----------------------------------------------
$STRUCT
  Name    "NDROMDrivers"
  $GDS
    Name  "NDROMDrivers.custom_compiler.gds"
  $END
$END
