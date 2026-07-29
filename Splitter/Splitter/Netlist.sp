*Custom Compiler Version T-2022.06-SP1
*Mon May 11 14:52:14 2026

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
XsjJ2 net25 GND! jj_s ics=250u
XsjJ3 net18 GND! jj_s ics=250u
XsjJ1 net10 GND! jj_s ics=325u
LL9 net25 OUT1 ind2 l=1.9p
LL8 net18 OUT2 ind2 l=1.9p
LL7 net14 net18 ind2 l=1.6p
LL6 net14 net25 ind2 l=1.6p
LL4 net10 net14 ind2 l=1.4p
LL3 IN net10 ind2 l=1.1p
XpcIB1 GND! VDD net14 pwrcell ib=570u
.ends splitter


