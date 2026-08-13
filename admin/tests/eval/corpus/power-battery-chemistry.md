# Battery Chemistry for Storage Systems

## Cycle life

The number that matters is cycles at a given depth of discharge.

- **LiFePO4** (lithium iron phosphate): **3,000 to 5,000 cycles** at 80% depth of
  discharge
- **AGM** (absorbed glass mat lead-acid): **300 to 500 cycles** at 50% depth of
  discharge
- **Flooded lead-acid**: 500 to 1,200 cycles at 50%, but requires watering and
  ventilation

LiFePO4 costs more per amp-hour up front and far less per usable cycle.

## Temperature

LiFePO4 must not be **charged below freezing (32°F / 0°C)**. Charging a cold
lithium cell plates metallic lithium onto the anode, which is permanent and
eventually causes an internal short. Discharging below freezing is fine, just
reduced in capacity. Any decent battery management system enforces this, but
cheap cells often ship without one.

Lead-acid tolerates cold charging but loses capacity, and a discharged lead-acid
battery can freeze solid and split its case.

## Usable capacity

A 100Ah LiFePO4 battery gives you about 80Ah usable. A 100Ah AGM gives you about
50Ah before you start destroying it. Compare on usable capacity, never on
nameplate.
