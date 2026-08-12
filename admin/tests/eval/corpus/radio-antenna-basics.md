# Antenna Fundamentals for Field Operators

The antenna matters more than the radio. A 5 watt handheld with a good antenna
at height will outperform a 50 watt mobile feeding a compromised antenna at
ground level, every time. If you have limited money and limited time, spend both
on the antenna system.

## Why length matters

An antenna is a resonant structure. It radiates most efficiently when its
physical length bears a specific relationship to the wavelength of the signal it
is carrying. Wavelength in meters is found by dividing 300 by the frequency in
megahertz. At 146 MHz, near the center of the 2 meter band, a full wavelength is
just over two meters.

Most practical antennas are a fraction of a wavelength. A quarter-wave whip is
the most common compromise on handhelds because it is short enough to carry and
still works acceptably against a ground plane.

## The rubber duck problem

The short flexible antenna that ships with a handheld is a helically wound
quarter-wave that has been physically shortened. Shortening an antenna costs
efficiency. A stock rubber duck typically radiates a fraction of the power that
reaches it, with the remainder lost as heat in the loading coil and in ground
losses through your hand and body.

Replacing it with a full-length whip is usually the single cheapest improvement
available to a handheld operator. A roll-up J-pole hung from a tree branch is
better still, and costs almost nothing to make from twin-lead.

## Ground planes and counterpoises

A quarter-wave antenna is only half of the radiating structure. The other half is
the ground plane — the conductive surface the antenna works against. On a vehicle
that is the metal roof. On a handheld it is your hand, your arm, and your body,
which is why holding a radio differently changes your signal report.

A counterpoise fixes this. It is nothing more than a wire, cut to a quarter
wavelength, attached to the ground side of the antenna connector and allowed to
hang. On a 2 meter handheld a counterpoise is about **19.5 inches** long, and
adding one is frequently worth more than a new radio.

## Feedline loss

Coaxial cable loses signal, and the loss increases with frequency and with
length. RG-58 is convenient and lossy. LMR-400 is stiff, expensive, and much
better. On a short handheld setup feedline barely matters; on a 100 foot run to a
rooftop antenna at 440 MHz it can eat most of your transmitted power before it
reaches the antenna.

Loss works in both directions. A lossy feedline degrades what you hear just as
much as what you send.

## SWR and what it actually tells you

Standing wave ratio measures how much power is reflected back down the feedline
instead of being radiated. A perfect match reads 1:1. Most operators aim to stay
below **2:1**, above which many solid-state transmitters begin folding back their
output power to protect the finals.

A low SWR does not mean a good antenna. A dummy load has a perfect 1:1 SWR and
radiates nothing at all. SWR tells you about the match, not about the radiation.
This confuses people endlessly: they trim an antenna for the lowest possible SWR
and end up with something that matches beautifully and gets out poorly.

## Height

Above roughly 50 MHz, propagation is essentially line of sight, extended a little
by atmospheric refraction. Every foot of height buys range, and height beats
power by a wide margin. Ten feet of mast is worth more than doubling your
transmitter output.
