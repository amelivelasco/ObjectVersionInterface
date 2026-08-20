* IXI File for InductEx example - resistance:rsfq_dcsfq_res
* RSFQ DC-SFQ circuit with resistance
* Authors: L Schindler
* Last mod: 20 August 2026
*******************************************************
* ----------------------------------------------
* COMMAND FOR MODEL/SIMULATION CONTROL
* ----------------------------------------------
$COMMAND
  MeshFile     "BIG_Cell.msh"
  MeshType     Tetra
  Mode         MQS
  Netlist      "splitter_V1.cir"
  Plot         [ J ]
  Process      "..\seeqc_v8.ldf"
  Fidelity     High
  Cores        8
$END

* ----------------------------------------------
* MAIN (TOP-LEVEL) STRUCTURE
* ----------------------------------------------
$STRUCT
  Name    "splitter"
  $GDS
    Name  "Layout.gds"
  $END
$END
