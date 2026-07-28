*Custom Compiler Version T-2022.06-SP1
*Mon Jul 27 14:23:51 2026

*.SCALE METER
*.LDD
.GLOBAL GND!
********************************************************************************
* Library          : FAM_project
* Cell             : Outputswitcher
* View             : flat
* View Search List : auCdl schematic
* View Stop List   : auCdl
********************************************************************************
.subckt Outputswitcher In Out1 Out2 VDD
*.PININFO In:I Out1:I Out2:I VDD:I
LI4|L2 I4|net6 I4|net8 ind2 l=2.97p
LI4|L3 I4|net8 I4|net7 ind2 l=2.97p
LI4|L6 In I4|net6 ind2 l=2.97p
LI4|L7 I4|net7 net23 ind2 l=2.97p
LI5|L2 I5|net6 I5|net8 ind2 l=2.97p
LI5|L3 I5|net8 I5|net7 ind2 l=2.97p
LI5|L6 net23 I5|net6 ind2 l=2.97p
LI5|L7 I5|net7 net29 ind2 l=2.97p
LI6|L2 I6|net6 I6|net8 ind2 l=2.97p
LI6|L3 I6|net8 I6|net7 ind2 l=2.97p
LI6|L6 net29 I6|net6 ind2 l=2.97p
LI6|L7 I6|net7 net24 ind2 l=2.97p
LI1|L1 Out1 I1|net22 ind2 l=2.504p
LI1|L2 I1|net21 I1|net35 ind2 l=1.593p
LI1|L3 I1|net35 I1|net28 ind2 l=5.479p
LI1|L4 I1|net28 I1|net10 ind2 l=2.624p
LI1|L5 I1|net10 I1|net12 ind2 l=1.240p
LI1|L6 I1|net12 net17 ind2 l=2.017p
LI1|L7 I1|net27 In ind2 l=2.309p
LI3|L1 net17 I3|net22 ind2 l=2.504p
LI3|L2 I3|net21 I3|net35 ind2 l=1.593p
LI3|L3 I3|net35 I3|net28 ind2 l=5.479p
LI3|L4 I3|net28 I3|net10 ind2 l=2.624p
LI3|L5 I3|net10 I3|net12 ind2 l=1.240p
LI3|L6 I3|net12 Out2 ind2 l=2.017p
LI3|L7 I3|net27 net24 ind2 l=2.309p
LI0|L1 In I0|net6 ind2 l=1.574p
LI0|L4 net17 I0|net49 ind2 l=1.5740p
LI0|L2 I0|net6 I0|net76 ind2 l=3.14p
LI0|L3 I0|net52 I0|net27 ind2 l=4.7381p
LI0|L5 I0|net49 I0|net69 ind2 l=3.14p
LI0|L6 I0|net29 I0|net52 ind2 l=4.7381p
LI0|L7 I0|net35 I0|net78 ind2 l=4.7751p
LI0|L8 net24 I0|net54 ind2 l=1.1983p
LI0|L9 I0|net54 I0|net73 ind2 l=3.2191p
LI0|L10 I0|net19 I0|net21 ind2 l=3.77p
LI0|L11 I0|net21 Out1 ind2 l=1.4703p
LI0|L40 I0|net69 I0|net30 ind2 l=0.8p
LI0|L42 I0|net78 I0|net19 ind2 l=0.8p
LI0|L41 I0|net76 I0|net28 ind2 l=0.8p
XsjI4|J2 I4|net7 I4|net9 jj_s ics=150u
XsjI4|J1 I4|net6 I4|net11 jj_s ics=150u
XsjI5|J2 I5|net7 I5|net9 jj_s ics=150u
XsjI5|J1 I5|net6 I5|net11 jj_s ics=150u
XsjI6|J2 I6|net7 I6|net9 jj_s ics=150u
XsjI6|J1 I6|net6 I6|net11 jj_s ics=150u
XsjI1|J1 I1|net22 I1|net21 jj_s ics=175u
XsjI1|J2 I1|net24 I1|net21 jj_s ics=200u
XsjI1|J4 I1|net28 I1|net27 jj_s ics=150u
XsjI1|J3 I1|net26 I1|net28 jj_s ics=250u
XsjI1|J5 I1|net30 I1|net12 jj_s ics=200u
XsjI3|J1 I3|net22 I3|net21 jj_s ics=175u
XsjI3|J2 I3|net24 I3|net21 jj_s ics=200u
XsjI3|J4 I3|net28 I3|net27 jj_s ics=150u
XsjI3|J3 I3|net26 I3|net28 jj_s ics=250u
XsjI3|J5 I3|net30 I3|net12 jj_s ics=200u
XsjI0|J1 I0|net6 GND! jj_s ics=250u
XsjI0|J2 I0|net76 GND! jj_s ics=200u
XsjI0|J3 I0|net28 I0|net27 jj_s ics=202u
XsjI0|J6 I0|net30 I0|net29 jj_s ics=202u
XsjI0|J4 I0|net49 GND! jj_s ics=250u
XsjI0|J5 I0|net69 GND! jj_s ics=200u
XsjI0|J7 I0|net52 I0|net35 jj_s ics=196u
XsjI0|J8 I0|net19 GND! jj_s ics=165u
XsjI0|J11 I0|net21 GND! jj_s ics=250u
XsjI0|J9 I0|net54 GND! jj_s ics=250u
XsjI0|J10 I0|net73 I0|net78 jj_s ics=146u
XpcI4|X8 GND! VDD I4|net8 pwrcell ib=210u
XpcI5|X8 GND! VDD I5|net8 pwrcell ib=210u
XpcI6|X8 GND! VDD I6|net8 pwrcell ib=210u
XpcI1|IB2 I1|GND VDD I1|net10 pwrcell ib=135u
XpcI1|IB1 I1|GND VDD I1|net35 pwrcell ib=230u
XpcI3|IB2 I3|GND VDD I3|net10 pwrcell ib=135u
XpcI3|IB1 I3|GND VDD I3|net35 pwrcell ib=230u
XpcI0|IB1 GND! VDD I0|net6 pwrcell ib=175u
XpcI0|IB2 GND! VDD I0|net49 pwrcell ib=175u
XpcI0|IB3 GND! VDD I0|net52 pwrcell ib=273u
XpcI0|IB4 GND! VDD I0|net54 pwrcell ib=175u
XpcI0|IB5 GND! VDD I0|net21 pwrcell ib=175u
LI4|L4 GND! I4|net9 ind1 l=0.1p
LI4|L5 GND! I4|net11 ind1 l=0.1p
LI5|L4 GND! I5|net9 ind1 l=0.1p
LI5|L5 GND! I5|net11 ind1 l=0.1p
LI6|L4 GND! I6|net9 ind1 l=0.1p
LI6|L5 GND! I6|net11 ind1 l=0.1p
LI1|Lp1 I1|net24 GND! ind1 l=0.222p
LI1|Lp2 I1|net26 GND! ind1 l=0.495p
LI1|Lp3 I1|net30 GND! ind1 l=0.260p
LI3|Lp1 I3|net24 GND! ind1 l=0.222p
LI3|Lp2 I3|net26 GND! ind1 l=0.495p
LI3|Lp3 I3|net30 GND! ind1 l=0.260p
.ends Outputswitcher


