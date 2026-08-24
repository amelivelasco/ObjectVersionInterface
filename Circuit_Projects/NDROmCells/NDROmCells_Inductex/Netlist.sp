*Custom Compiler Version T-2022.06-SP1
*Thu Jul 23 10:15:37 2026

*.SCALE METER
*.LDD
.GLOBAL GND!
********************************************************************************
* Library          : LayoutDone
* Cell             : NDROM2
* View             : schematic
* View Search List : auCdl schematic
* View Stop List   : auCdl
********************************************************************************
.subckt NDROM2 Q RD SET0 SET1 VDD
*.PININFO Q:O RD:I SET0:I SET1:I VDD:B
LL75 net142 net127 ind2 l=1p
LL76 net144 net145 ind2 l=0.5p
LL74 net140 net137 ind2 l=1.55p
LL12 net139 Q ind2 l=1.6989p
LL11 net145 net139 ind2 l=3.3341p
LL10 net110 net124 ind2 l=2.7508p
LL9 RD net110 ind2 l=1.3783p
LL8 net100 net145 ind2 l=2.0153p
LL7 net121 net100 ind2 l=1.4501p
LL6 net127 net138 ind2 l=3.6623p
LL5 net119 net141 ind2 l=1.7767p
LL4 SET0 net119 ind2 l=1.7117p
LL3 net137 net138 ind2 l=2.8212p
LL2 net4 net136 ind2 l=1.55p
LL1 SET1 net4 ind2 l=1.8663p
XpcIB5 GND! VDD net110 pwrcell ib=175u
XpcIB6 GND! VDD net139 pwrcell ib=175u
XpcIB4 GND! VDD net100 pwrcell ib=158u
XpcIB3 GND! VDD net119 pwrcell ib=175u
XpcIB2 GND! VDD net137 pwrcell ib=139u
XpcIB1 GND! VDD net4 pwrcell ib=175u
XsjJ9 net110 GND! jj_s ics=250u
XsjJ11 net139 GND! jj_s ics=250u
XsjJ8 net145 GND! jj_s ics=230u
XsjJ6 net127 GND! jj_s ics=258u
XsjJ3 net137 GND! jj_s ics=201u
XsjJ10 net144 net124 jj_s ics=177u
XsjJ7 net138 net121 jj_s ics=90u
XsjJ4 net119 GND! jj_s ics=250u
XsjJ2 net136 net140 jj_s ics=180u
XsjJ1 net4 GND! jj_s ics=250u
XsjJ5 net141 net142 jj_s ics=180u
.ends NDROM2


