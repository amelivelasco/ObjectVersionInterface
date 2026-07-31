*Custom Compiler Version T-2022.06-SP1
*Wed Jul 29 11:40:05 2026

*.SCALE METER
*.LDD
.GLOBAL GND!
********************************************************************************
* Library          : LayoutDone
* Cell             : NDROMDrivers
* View             : flat
* View Search List : auCdl schematic
* View Stop List   : auCdl
********************************************************************************
.subckt NDROMDrivers CLK DX DX_bar Out Src26
*.PININFO CLK:I DX:I DX_bar:I Out:O Src26:I
XsjI23|J5 I23|net141 I23|net142 jj_s ics=180u
XsjI23|J1 I23|net4 GND! jj_s ics=250u
XsjI23|J2 I23|net136 I23|net140 jj_s ics=180u
XsjI23|J4 I23|net119 GND! jj_s ics=250u
XsjI23|J7 I23|net138 I23|net121 jj_s ics=90u
XsjI23|J10 I23|net144 I23|net124 jj_s ics=177u
XsjI23|J3 I23|net137 GND! jj_s ics=201u
XsjI23|J6 I23|net127 GND! jj_s ics=258u
XsjI23|J8 I23|net145 GND! jj_s ics=230u
XsjI23|J11 I23|net139 GND! jj_s ics=150u
XsjI23|J9 I23|net110 GND! jj_s ics=250u
XsjX100 net11 GND! jj_s ics=200u
XsjX101 net9 GND! jj_s ics=300u
XsjX82 net4 GND! jj_s ics=200u
XsjX83 net2 GND! jj_s ics=300u
XsjX0 net30 GND! jj_s ics=200u
XsjX1 net28 GND! jj_s ics=300u
XsjX4 net33 GND! jj_s ics=300u
XsjX5 net35 GND! jj_s ics=200u
LI23|L1 net8 I23|net4 ind2 l='1.8663p*2'
LI23|L2 I23|net4 I23|net136 ind2 l=3.1p
LI23|L3 I23|net137 I23|net138 ind2 l=5.6p
LI23|L4 net7 I23|net119 ind2 l='1.7117p*2'
LI23|L5 I23|net119 I23|net141 ind2 l=3.4p
LI23|L6 I23|net127 I23|net138 ind2 l=7.2p
LI23|L7 I23|net121 I23|net100 ind2 l=2.7p 
LI23|L8 I23|net100 I23|net145 ind2 l=4.2p
LI23|L9 net6 I23|net110 ind2 l=2.7p
LI23|L10 I23|net110 I23|net124 ind2 l=5.5p
LI23|L11 I23|net145 I23|net139 ind2 l=6.7p
LI23|L12 I23|net139 net5 ind2 l=2.4p
LI23|L74 I23|net140 I23|net137 ind2 l=3.1p
LI23|L76 I23|net144 I23|net145 ind2 l=1p
LI23|L75 I23|net142 I23|net127 ind2 l=2p
LL101 net11 net10 ind2 l=0.8p
LL100 net10 net9 ind2 l=0.5p
LL102 net9 net6 ind2 l=1.8p
LL103 CLK net11 ind2 l=1.06p
LL80 net3 net2 ind2 l=1.05p
LL71 net4 net3 ind2 l=1.05p
LL81 net2 Out ind2 l=1.05p
LL73 net5 net4 ind2 l=2.75p
LL10 net28 net7 ind2 l=1.8p
LL11 DX_bar net30 ind2 l=1.06p
LL14 DX net35 ind2 l=1.06p
LL15 net33 net8 ind2 l=1.8p
LL20 net30 net29 ind2 l=0.8p
LL21 net29 net28 ind2 l=0.5p
LL22 net35 net34 ind2 l=0.8p
LL23 net34 net33 ind2 l=0.5p
XpcIB3 GND! Src26 net34 pwrcell ib=280u
XpcIB2 GND! Src26 net29 pwrcell ib=280u
XpcIB1 GND! Src26 net10 pwrcell ib=280u
XpcIB4 GND! Src26 net3 pwrcell ib=250u
XpcI23|IB1 GND! Src26 I23|net4 pwrcell ib=175u
XpcI23|IB2 GND! Src26 I23|net137 pwrcell ib=139u
XpcI23|IB3 GND! Src26 I23|net119 pwrcell ib=175u
XpcI23|IB4 GND! Src26 I23|net100 pwrcell ib=158u
XpcI23|IB6 GND! Src26 I23|net139 pwrcell ib=175u
XpcI23|IB5 GND! Src26 I23|net110 pwrcell ib=175u
.ends NDROMDrivers


