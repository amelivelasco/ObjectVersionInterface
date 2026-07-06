*.LDD
.GLOBAL GND!
********************************************************************************
* Library          : BasicCellsHomemade
* Cell             : SFQtoCMOSNo_par_res
* View             : schematic
* View Search List : auCdl schematic
* View Stop List   : auCdl
********************************************************************************
.subckt SFQtoCMOSNo_par_res net10 net7 VDD
*.PININFO DC:O SFQ_in:I VDD:I
*LIB1 net1 net2
*LIB1 net1 net2
*LIB1 net1 net2
*LIB2 net1 net3
*LIB2 net1 net3
*LIB2 net1 net3
*LIB3 net1 net4
*LIB3 net1 net4
*LIB3 net1 net4
*LIB4 net1 net5
*LIB4 net1 net5
*LIB4 net1 net5
*LIB5 net1 net6
*LIB5 net1 net6
*LIB5 net1 net6
*LL1 net7 net6 l=1.11722p
*LL2 net3 net8 l=1.37662p
*LL3 net9 net3 l=1.20575p
*LL4 net10 net8 l=2.36227p
*LL5 net9 net4 l=1.65612p
*LL6 net11 net12 l=3.96245p
*LL7 net12 net13 l=0.87918p
*LL8 net14 net15 l=1.19168p
*LL9 net2 net16 l=-0.0706194p
*LL10 net15 net17 l=0.442075p
*LL11 net13 net15 l=0.924162p
*LL12 net16 net13 l=1.42108p
*LL13 net5 net16 l=0.599707p
*LL14 net6 net18 l=1.92049p
*LL15 net19 net6 l=2.25653p
*RR1 net11 GND! r=3.82962
