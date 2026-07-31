*Custom Compiler Version T-2022.06-SP1
*Wed May  6 12:09:17 2026

*.SCALE METER
*.LDD
.GLOBAL GND!
********************************************************************************
* Library          : BasicCellsHomemade
* Cell             : SFQtoCMOSNo_par_res
* View             : schematic
* View Search List : auCdl schematic
* View Stop List   : auCdl
********************************************************************************
.subckt SFQtoCMOSNo_par_res DC SFQ_in VDD
*.PININFO DC:O SFQ_in:I VDD:I
XpcIB3 GND! VDD net61 pwrcell ib=175u
XpcIB5 GND! VDD net75 pwrcell ib=270u
XpcIB4 GND! VDD net68 pwrcell ib=230u
XpcIB2 GND! VDD net10 pwrcell ib=240u
XpcIB1 GND! VDD net91 pwrcell ib=280u
LLpIn SFQ_in net91 ind2 l=1p
LL15 net75 net97 ind2 l=1.783p
LL13 net69 net75 ind2 l=4.860p
LLpout DC net97 ind2 l=1p
LL12 net69 net68 ind2 l=2.1p
LLR1 net96 net65 ind2 l=0.909p
LL11 net65 net57 ind2 l=0.474p
LL10 net63 net56 ind2 l=0.972p
LL9 net61 net52 ind2 l=0.809p
LL6 net56 net12 ind2 l=0.895p
LL8 net57 net56 ind2 l=1.061p
LL7 net52 net57 ind2 l=3p
LL5 net10 net52 ind2 l=1.303p
LL4 net91 net44 ind2 l=1.036p
LL3 net43 net91 ind2 l=0.965p
RR51 net96 GND! res r=2
XsjJ10 net97 GND! jj_s ics=190u
XsjJ9 net69 GND! jj_s ics=240u
XsjJ8 net65 net68 jj_s ics=150u
XsjJ6 net63 GND! jj_s ics=350u
XsjJ7 net61 GND! jj_s ics=275u
XsjJ4 net12 GND! jj_s ics=175u
XsjJ5 net10 GND! jj_s ics=175u
XsjJ2 net44 net12 jj_s ics=200u
XsjJ3 net43 net10 jj_s ics=200u
XsjJ1 net91 GND! jj_s ics=325u
.ends SFQtoCMOSNo_par_res


