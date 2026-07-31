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
*RIB1 VDD net20 r=13.796
*LIB1 net20 net2 l=5.4731p
*RIB2 VDD net22 r=9.40689
*LIB2 net22 net3 l=2.98237p
*RIB3 VDD net24 r=10.8696
*LIB3 net24 net4 l=4.32338p
*RIB4 VDD net26 r=10.183
*LIB4 net26 net5 l=1.87898p
*RIB5 VDD net28 r=9.35357
*LIB5 net28 net6 l=1.04067p
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
