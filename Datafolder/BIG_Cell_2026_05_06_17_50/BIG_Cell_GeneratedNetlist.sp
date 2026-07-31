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
RIB1 VDD net20 r=13.796
LIB1 net20 net2 l=5.4731p
RIB2 VDD net22 r=9.40689
LIB2 net22 net3 l=2.98237p
RIB3 VDD net24 r=10.8696
LIB3 net24 net4 l=4.32338p
RIB4 VDD net26 r=10.183
LIB4 net26 net5 l=1.87898p
RIB5 VDD net28 r=9.35357
LIB5 net28 net6 l=1.04067p
LL1 net7 net6 ind2 l=1.11722p
LL2 net3 net8 ind2 l=1.37662p
LL3 net9 net3 ind2 l=1.20575p
LL4 net10 net8 ind2 l=2.36227p
LL5 net9 net4 ind2 l=1.65612p
LL6 net11 net12 ind2 l=3.96245p
LL7 net12 net13 ind2 l=0.87918p
LL8 net14 net15 ind2 l=1.19168p
LL9 net2 net16 ind2 l=-0.0706194p
LL10 net15 net17 ind2 l=0.442075p
LL11 net13 net15 ind2 l=0.924162p
LL12 net16 net13 ind2 l=1.42108p
LL13 net5 net16 ind2 l=0.599707p
LL14 net6 net18 ind2 l=1.92049p
LL15 net19 net6 ind2 l=2.25653p
RR1 net11 GND! res r=3.82962
XjJ1 net8 32 jj ics=188.76u lser=0.060717p
Rs1 net8 31 res r=3.22225
LJ1 31 32 ind2 l=0.589833p
Lp1 31 GND! ind2 l=1.30081p
XjJ2 net9 35 jj ics=238.46u lser=0.183187p
Rs2 net9 34 res r=2.49984
LJ2 34 35 ind2 l=0.347785p
Lp2 34 GND! ind2 l=0.295302p
XjJ3 net12 net4 jj ics=149.03u lser=0.245984p
Rs3 net12 37 res r=4.17303
LJ3 37 net4 ind2 l=0.478515p
XjJ4 net14 40 jj ics=347.82u lser=0.137564p
Rs4 net14 39 res r=1.64028
LJ4 39 40 ind2 l=0.347197p
Lp4 39 GND! ind2 l=0-0.18032p
XjJ5 net2 43 jj ics=273.21u lser=0.0994301p
Rs5 net2 42 res r=2.08713
LJ5 42 43 ind2 l=0.487964p
Lp5 42 GND! ind2 l=2.03841p
XjJ6 net17 46 jj ics=173.86u lser=0.172594p
Rs6 net17 45 res r=3.51695
LJ6 45 46 ind2 l=0.431087p
Lp6 45 GND! ind2 l=0.627378p
XjJ7 net5 49 jj ics=173.86u lser=0.105642p
Rs7 net5 48 res r=3.48548
LJ7 48 49 ind2 l=0.577261p
Lp7 48 GND! ind2 l=0.900994p
XjJ8 net18 net17 jj ics=198.7u lser=0.219048p
Rs8 net18 51 res r=3.05528
LJ8 51 net17 ind2 l=0.369881p
XjJ9 net19 net5 jj ics=198.7u lser=0.21635p
Rs9 net19 53 res r=3.049
LJ9 53 net5 ind2 l=0.387319p
XjJ10 net6 56 jj ics=322.93u lser=0.158252p
Rs10 net6 55 res r=1.77374
LJ10 55 56 ind2 l=0.249961p
Lp10 55 GND! ind2 l=0.249572p
