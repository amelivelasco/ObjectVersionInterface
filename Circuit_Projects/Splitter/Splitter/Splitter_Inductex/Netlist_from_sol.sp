*Custom Compiler Version T-2022.06-SP1
*Fri Aug 21 09:46:04 2026

*.SCALE METER
*.LDD
.GLOBAL GND!
********************************************************************************
* Library          : LayoutDone
* Cell             : splitter
* View             : schematic
* View Search List : auCdl schematic
* View Stop List   : auCdl
********************************************************************************
.subckt splitter IN OUT1 OUT2 VDD
*.PININFO IN:I OUT1:I OUT2:I VDD:B
XsjJ2 net25 GND! jj_s ics=248.42u
XsjJ3 net18 GND! jj_s ics=248.42u
XsjJ1 net10 GND! jj_s ics=322.93u
LL9 net25 OUT1 ind2 l=1.17804p
LL8 net18 OUT2 ind2 l=1.52326p
LL7 net14 net18 ind2 l=1.28817p
LL6 net14 net25 ind2 l=1.17637p
LL4 net10 net14 ind2 l=0.48346p
LL3 IN net10 ind2 l=0.820727p
XpcIB1 GND! VDD net14 pwrcell ib=497.539u
.ends splitter


