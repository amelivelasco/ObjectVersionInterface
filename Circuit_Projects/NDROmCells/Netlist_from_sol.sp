*Custom Compiler Version T-2022.06-SP1
*Wed Aug 19 10:03:22 2026

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
LL75 net142 net127 ind2 l=1.99109p
LL76 net144 net145 ind2 l=0.726939p
LL74 net140 net137 ind2 l=3.08097p
LL12 net139 Q ind2 l=1.09049p
LL11 net145 net139 ind2 l=2.4932p
LL10 net110 net124 ind2 l=4.46027p
LL9 RD net110 ind2 l=2.84774p
LL8 net100 net145 ind2 l=2.31889p
LL7 net121 net100 ind2 l=1.6565p
LL6 net127 net138 ind2 l=3.53815p
LL5 net119 net141 ind2 l=3.97746p
LL4 SET0 net119 ind2 l=1.43178p
LL3 net137 net138 ind2 l=4.10168p
LL2 net4 net136 ind2 l=1.49745p
LL1 SET1 net4 ind2 l=1.39559p
XpcIB5 GND! VDD net110 pwrcell ib=169.633u
XpcIB6 GND! VDD net139 pwrcell ib=140.405u
XpcIB4 GND! VDD net100 pwrcell ib=291.458u
XpcIB3 GND! VDD net119 pwrcell ib=281.672u
XpcIB2 GND! VDD net137 pwrcell ib=171.271u
XpcIB1 GND! VDD net4 pwrcell ib=169.595u
XsjJ9 net110 GND! jj_s ics=175.56u
XsjJ11 net139 GND! jj_s ics=248.34u
XsjJ8 net145 GND! jj_s ics=175.56u
XsjJ6 net127 GND! jj_s ics=248.34u
XsjJ3 net137 GND! jj_s ics=87.777u
XsjJ10 net144 net124 jj_s ics=172.65u
XsjJ7 net138 net121 jj_s ics=196.07u
XsjJ4 net119 GND! jj_s ics=256.23u
XsjJ2 net136 net140 jj_s ics=228.5u
XsjJ1 net4 GND! jj_s ics=146.29u
XsjJ5 net141 net142 jj_s ics=248.34u
.ends NDROM2


