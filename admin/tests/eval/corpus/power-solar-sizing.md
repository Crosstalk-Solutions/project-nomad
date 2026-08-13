# Sizing a Small Solar System

Work backwards from your loads, never forwards from a panel you happened to buy.

## Step one: measure the load

Add up watt-hours per day for everything you intend to run. A device drawing 20
watts for 6 hours is 120 watt-hours. Measure real devices with a meter; nameplate
ratings are near-useless.

## Step two: size the battery

Divide daily watt-hours by battery voltage to get amp-hours. Then divide by the
usable depth of discharge — **50%** for lead-acid, **80%** for LiFePO4. Then
multiply by the number of days of autonomy you want to survive without sun.

## Step three: size the panels

Divide daily watt-hours by your location's **peak sun hours** — typically 3 to 5,
not the number of daylight hours. Then add **25%** for charge controller
inefficiency, wiring loss, panel soiling, and the fact that panels never hit
their rated output in the real world.

## Charge controllers

An MPPT controller extracts roughly 20-30% more energy than a PWM controller from
the same panel, and the gap widens in cold weather and low light. PWM is only
sensible on very small systems where the controller cost dominates.
