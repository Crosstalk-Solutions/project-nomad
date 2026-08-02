"""Automated checks for NOMAD persona responses.

Two layers:
  1. Universal rule violations (apply to every response).
  2. Per-question expected/forbidden signals (declared in questions.json).

Each check returns a dict: {check, passed, evidence}. Evidence is the matched
text when a check fails, useful for skimming the report.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class CheckResult:
    check: str
    passed: bool
    evidence: str | None = None
    kind: str = "rule"  # "rule" | "expect" | "forbid"


# ---------------------------------------------------------------------------
# Universal rule violations
# ---------------------------------------------------------------------------
#
# Each rule is (name, regex, passed_when, description). passed_when="absent"
# means the check passes if the pattern is absent.

URL_PATTERN = re.compile(
    r"https?://|www\.[a-z0-9-]+\.[a-z]{2,}", re.IGNORECASE
)

CONSULT_PRO_BODY_PATTERN = re.compile(
    r"\b(consult|contact|hire|seek out)\s+(a|an)\s+(licensed|professional|certified|qualified|expert)\b"
    r"|\b(licensed\s+(electrician|plumber|contractor|installer|professional))\b"
    r"|\bprofessional\s+(installer|electrician|installation)\b",
    re.IGNORECASE,
)

# Negation cues that flip the meaning of a CONSULT_PRO match (i.e. the model
# is saying you DON'T need a pro). Looked for in the 60 chars preceding a
# match; if any is present, the check is treated as a pass.
NEGATION_BEFORE_CONSULT_PRO = re.compile(
    r"\b(without|no need for|do(es)? not (need|require)|don[''']t need|doesn[''']t need|not requiring|"
    r"avoid(?:ing)?|skip(?:ping)?)\b",
    re.IGNORECASE,
)

UTILITY_PERMIT_PATTERN = re.compile(
    r"\b(contact|call|consult|coordinate with|reach out to|check with)\s+(your\s+)?(local\s+)?utility\b"
    r"|\bpermit\s+from\s+(the\s+)?(local\s+)?(AHJ|authority|building\s+department|city\s+hall|municipality)\b"
    r"|\b(contact|call|consult|visit)\s+(your\s+)?(local\s+)?city\s+hall\b",
    re.IGNORECASE,
)

CALL_911_UNQUALIFIED_PATTERN = re.compile(
    r"\bcall\s+9-?1-?1\b", re.IGNORECASE
)
CALL_911_QUALIFIED_PATTERN = re.compile(
    r"\b(if\s+you\s+(have|can|are\s+able)|when\s+(grid|cell|phone)|grid[-\s]?up|"
    r"if\s+(grid|cell|phone|service)\s+is\s+available|otherwise)\b",
    re.IGNORECASE,
)

YOUTUBE_TUTORIAL_PATTERN = re.compile(
    r"\b(youtube|online\s+(tutorial|forum|calculator|video|resource)|search\s+online|watch\s+a\s+tutorial)\b",
    re.IGNORECASE,
)

# Fake commercial product patterns — names that pattern-match real products
# but with invented model numbers. E.g. "TCCC-10" (TCCC is a doctrine body, not
# a brand), "Combat Application Tourniquet Mark IV", etc.
SUSPECT_PRODUCT_PATTERN = re.compile(
    r"\bTCCC-\d+\b"  # TCCC is doctrine, not a brand
    r"|\bCAT-Mk?\s*[IVX0-9]+\b"  # CAT has Gen 6/7, not Mark numbers
    r"|\bMorningStar\s+Tristar\s+MPPT\s+75-A\b",  # known hallucinated variant
    re.IGNORECASE,
)

# Closing-paragraph hedge — looks at the LAST 200 chars for a disclaimer
# pattern. This is the closing-hedge instinct we've been fighting.
CLOSING_HEDGE_PATTERN = re.compile(
    r"\b(always\s+prioritize\s+safety|consult\s+(a|an|with)\s+(licensed|qualified|professional|expert|electrician|installer)"
    r"|consider\s+(seeking|reaching\s+out|hiring)|seek\s+professional|"
    r"if\s+you[''']re\s+(not\s+)?(comfortable|sure|unsure)|"
    r"depending\s+on\s+your\s+(specific\s+)?(situation|jurisdiction|location)|"
    r"check\s+(with\s+)?(your\s+)?local\s+(regulations|codes|building)|"
    r"follow\s+industry\s+standards|"
    r"legality\s+varies|"
    r"ensure\s+you\s+are\s+within\s+permitted|"
    r"manufacturer[''']s\s+guidelines)\b",
    re.IGNORECASE,
)


def last_paragraph(text: str) -> str:
    """Return the last non-empty paragraph of a response (for closer checks)."""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    return paragraphs[-1] if paragraphs else ""


# Personas where the off-grid rules don't apply. Grid is the connected-mode
# persona and is expected to recommend URLs, utility companies, licensed pros,
# etc. We still run the always-applicable checks (suspect product names,
# qualified 911) but skip the offline-only ones.
ONLINE_PERSONAS = {"grid"}


def run_universal_checks(text: str, persona: str = "generalist") -> list[CheckResult]:
    results: list[CheckResult] = []
    offline = persona not in ONLINE_PERSONAS

    if offline:
        # URL leak
        m = URL_PATTERN.search(text)
        results.append(CheckResult(
            check="no_url_leak",
            passed=m is None,
            evidence=m.group(0) if m else None,
        ))

        # consult-a-professional body, with negation awareness so phrases like
        # "without requiring professional installation" don't false-flag.
        m = CONSULT_PRO_BODY_PATTERN.search(text)
        passed = m is None
        evidence = None
        if m:
            window_start = max(0, m.start() - 60)
            preceding = text[window_start : m.start()]
            if NEGATION_BEFORE_CONSULT_PRO.search(preceding):
                passed = True
            else:
                evidence = m.group(0)
        results.append(CheckResult(
            check="no_consult_pro_body",
            passed=passed,
            evidence=evidence,
        ))

        # utility / AHJ permit boilerplate
        m = UTILITY_PERMIT_PATTERN.search(text)
        results.append(CheckResult(
            check="no_utility_permit_boilerplate",
            passed=m is None,
            evidence=m.group(0) if m else None,
        ))

        # YouTube / online resource references
        m = YOUTUBE_TUTORIAL_PATTERN.search(text)
        results.append(CheckResult(
            check="no_online_resource_reference",
            passed=m is None,
            evidence=m.group(0) if m else None,
        ))

        # Closing-paragraph hedge
        closer = last_paragraph(text)
        m = CLOSING_HEDGE_PATTERN.search(closer)
        results.append(CheckResult(
            check="no_closing_hedge",
            passed=m is None,
            evidence=closer[:200] if m else None,
        ))

    # Always-applicable checks (apply regardless of persona)

    # "call 911" without an off-grid qualifier in surrounding text. For grid
    # personas this is always a pass — calling 911 is the right answer.
    call911 = CALL_911_UNQUALIFIED_PATTERN.search(text)
    if call911 and offline:
        start = max(0, call911.start() - 100)
        end = min(len(text), call911.end() + 100)
        window = text[start:end]
        qualified = CALL_911_QUALIFIED_PATTERN.search(window) is not None
        results.append(CheckResult(
            check="911_qualified",
            passed=qualified,
            evidence=window if not qualified else None,
        ))
    else:
        results.append(CheckResult(check="911_qualified", passed=True))

    # Suspect / hallucinated commercial product names — always applies
    m = SUSPECT_PRODUCT_PATTERN.search(text)
    results.append(CheckResult(
        check="no_suspect_product_name",
        passed=m is None,
        evidence=m.group(0) if m else None,
    ))

    return results


# ---------------------------------------------------------------------------
# Per-question signals
# ---------------------------------------------------------------------------
#
# Each named signal maps to a list of regex patterns. A signal is "present"
# if any of its patterns match.

SIGNAL_PATTERNS: dict[str, list[str]] = {
    # Electrical
    "charge_controller": [r"\bcharge controller\b"],
    "battery": [r"\bbatter(?:y|ies)\b"],
    "inverter": [r"\binverter\b"],
    "fuse_or_breaker": [r"\bfuse(s|d)?\b", r"\bbreaker(s)?\b", r"\bovercurrent\b"],
    "awg": [r"\bAWG\b", r"\bgauge\b"],
    "voltage_drop": [r"\bvoltage drop\b", r"\bdrop\s+over\s+distance\b"],
    "amp_hour": [r"\bAh\b", r"\bamp[- ]?hour\b"],
    "depth_of_discharge": [r"\b(depth of discharge|DoD|usable capacity)\b"],
    "transfer_switch": [r"\btransfer switch\b"],
    "interlock": [r"\binterlock\b", r"\bbreaker interlock\b"],
    "backfeed": [r"\bback[- ]?feed(ing)?\b"],
    "mppt": [r"\bMPPT\b"],
    "pwm": [r"\bPWM\b"],
    "efficiency": [r"\befficien(cy|t|tly)\b"],
    "ground_rod": [r"\bground(ing)? rod\b"],
    "bonding": [r"\bbond(ing|ed)?\b"],
    "watt_hour": [r"\bwatt[- ]?hour\b", r"\bWh\b", r"\bkWh\b"],
    "continuous_watt": [r"\bcontinuous (watt|power|rating|load)\b"],
    "surge": [r"\bsurge\b", r"\bpeak\s+(watt|power)\b"],
    "voltage": [r"\bvoltage\b"],
    "insulated_glove": [
        r"\binsulat(ed|ing) glove(s)?\b",
        r"\bnon[- ]?conductive glove(s)?\b",
        r"\brubber glove(s)?\b",
    ],
    "eye_protection": [r"\b(safety glasses|eye protection|goggles)\b"],

    # Medic
    "direct_pressure": [r"\bdirect pressure\b"],
    "wound_packing_or_tourniquet": [
        r"\bwound packing\b",
        r"\bpack(ed|ing)?\s+(the\s+)?wound\b",
        r"\btourniquet\b",
    ],
    "march": [r"\bMARCH\b", r"\bprimary survey\b"],
    "cool_water_or_shade": [r"\bcool water\b", r"\bcool down\b", r"\bshade\b", r"\bimmers(e|ion)\b"],
    "heat_exhaustion_vs_stroke": [r"\bheat exhaustion\b.*\bheat stroke\b", r"\bheat stroke\b.*\bheat exhaustion\b"],
    "immobilize": [r"\bimmobiliz(e|ing|ation)\b", r"\bsplint(ing)?\b"],
    "circulation_sensation_motion": [
        r"\bcirculation\b.*\bsensation\b",
        r"\bCSM\b",
        r"\bpulse.*toe\b",
        r"\bdistal (pulse|circulation)\b",
        r"\b(lose|loss of|check(ing)?) circulation\b",
        r"\b(warmth|color|sensation) (in|of) (the )?toe\b",
        r"\b(feel|feeling) in (your |the )?toe\b",
        r"\btoes? (are|feel)\b",
    ],
    "cool_water": [
        r"\bcool[- ]?(\([^)]*\))?\s*water\b",  # handles "cool (not ice) water"
        r"\bcool, clean water\b",
        r"\brunning water\b",
        r"\bcold water\b",  # close enough for burn cooling
    ],
    "no_ice": [r"\bnot? ice\b", r"\bavoid ice\b", r"\bnot? (using|use|apply)\s+ice\b"],
    "airway": [r"\bairway\b"],
    "epinephrine_described": [r"\bepinephrine\b", r"\bepi[- ]?pen\b"],
    "capillary_refill_or_skin_turgor": [
        r"\bcapillary refill\b",
        r"\bskin turgor\b",
        # Accept presentation of dehydration signs collectively
        r"\b(sunken|dry mouth|dark urine|reduced urine)\b.*\b(sunken|dry mouth|dark urine|reduced urine)\b",
    ],
    "oral_rehydration": [r"\boral rehydration\b", r"\bORS\b", r"\bsips of\b", r"\bsmall sips\b"],
    "cellulitis_or_lymphangitis": [r"\bcellulitis\b", r"\blymphangitis\b", r"\bspreading\s+infection\b"],
    "antibiotic": [r"\bantibiotic(s)?\b"],
    "aspirin": [r"\baspirin\b"],
    "evacuate": [r"\bevacuat(e|ion)\b", r"\btransport\b"],
    "rewarming": [
        r"\brewarm(ing)?\b",
        r"\bwarm\s+(the\s+)?(person|patient|body|core)\b",
        r"\bwarming\s+(measures|techniques|the core|the patient)\b",
        r"\bbody[- ]warming\b",
        r"\bwarm the core\b",
    ],
    "remove_wet": [
        r"\bremove\s+wet\b",
        r"\bdry\s+(them|the\s+patient|clothes)\b",
        r"\bwet clothing\b",
    ],
    "aspirin_or_evacuate": [r"\baspirin\b", r"\bevacuat(e|ion)\b", r"\btransport\b"],

    # Bushcraft
    "debris_hut_or_leanto": [r"\bdebris hut\b", r"\blean[- ]?to\b", r"\bA[- ]?frame\b"],
    "insulation_from_ground": [
        r"\binsulat(e|ion) (from the )?ground\b",
        r"\bground (insulation|cover)\b",
        r"\boff (the )?ground\b",
        r"\b(cold|wet) ground\b.*\b(barrier|base|insulat)",
        r"\b(barrier|base) against (cold|wet) ground\b",
    ],
    "tinder_dry_inner": [
        r"\binner bark\b",
        r"\bfeather stick\b",
        r"\bdry tinder\b",
        r"\bsplit (wood|log)\b",
        r"\bshredded bark\b",
        r"\bdead leaves\b",
        r"\bcattail(s)?\b",
    ],
    "feather_stick_or_split": [
        r"\bfeather stick\b",
        r"\bsplit (the )?(wood|log)\b",
        r"\bbatoning\b",
        r"\bshredded bark\b",
        r"\bshaved\s+(wood|tinder)\b",
        r"\bdry (?:inside|inner)\b.*\bwood\b",
    ],
    "boil": [r"\bboil(ing)?\b"],
    "rolling_boil_time": [r"\brolling boil\b", r"\bone minute\b", r"\b1 minute\b", r"\bthree minutes\b"],
    "north_star_or_polaris": [r"\bPolaris\b", r"\bnorth star\b"],
    "inner_bark_or_yucca_or_dogbane": [r"\binner bark\b", r"\byucca\b", r"\bdogbane\b", r"\bmilkweed\b", r"\bnettle\b"],
    "gorge_hook_or_trap_or_handline": [r"\bgorge hook\b", r"\bhand[- ]?line\b", r"\bfish trap\b", r"\bweir\b"],
    "bow_drill_or_hand_drill": [r"\bbow drill\b", r"\bhand drill\b", r"\bfire plow\b"],
    "practice_required": [r"\bpractice\b", r"\bskill\b.*\btime\b", r"\bnot easy\b", r"\brequires\s+(significant\s+)?practice\b"],
    "universal_edibility_test_or_dont_eat": [r"\buniversal edibility test\b", r"\bdo not eat\b", r"\bdon't eat\b", r"\bavoid\s+(eating|unknown)\b"],

    # Comms
    "yes_license_required": [r"\b(yes|requires?|need)\b.*\blicense\b"],
    "fcc_or_part_95": [r"\bFCC\b", r"\bPart 95\b"],
    "vhf_uhf": [r"\bVHF\b", r"\bUHF\b"],
    "2m_or_70cm": [r"\b2[- ]?m(eter)?\b", r"\b70[- ]?cm\b"],
    "nvis_or_hf": [r"\bNVIS\b", r"\bHF\b"],
    "antenna_height": [
        r"\bantenna height\b",
        r"\bheight (above|of the) (ground|antenna)\b",
        r"\blow.+dipole\b",
        r"\bdipole.+low\b",
        r"\b(\d+) feet (above|high)\b",
        r"\belevat(e|ed)\s+(the\s+)?antenna\b",
    ],
    "line_of_sight": [r"\bline[- ]of[- ]sight\b", r"\bLOS\b"],
    "few_miles_typical": [r"\b\d+\s*(to|-)\s*\d+\s*miles\b", r"\b1\s*to\s*5 miles\b", r"\bfew miles\b"],
    "calling_frequency_named": [
        # Accept any named frequency in MHz at common emergency bands.
        # NWS 162.x, 2m 146.x, 70cm 446.x, CB 27.x, 6m 50.x, etc.
        r"\b1(46|47|62)\.\d+\s*MHz\b",
        r"\b446\.\d+\s*MHz\b",
        r"\b27\b\.?\d*\s*MHz\b",
        r"\bcalling frequency\b",
        r"\bcalling channel\b",
        r"\bNWR\b",
        r"\bNOAA\b.*\bweather\b",
    ],
    "12v_or_regulated": [
        r"\b12[- ]?v(olt)?\b",
        r"\bregulated\b",
        r"\bvoltage regulat(ion|or)\b",
        r"\bDC[- ]?DC converter\b",
    ],

    # Homesteader
    "acidify_or_pressure": [r"\bacidif(y|ied|ication)\b", r"\bpressure can(ning|ner)?\b", r"\blemon juice\b", r"\bcitric acid\b"],
    "usda_or_extension": [r"\bUSDA\b", r"\bextension service\b", r"\bComplete Guide to Home Canning\b"],
    "no_pressure_only": [
        r"\bonly pressure\b",
        r"\bnever water bath\b",
        r"\bnot safe.*water bath\b",
        r"\bpressure can(ning)? (only|required|needed|is needed)\b",
        r"\b(cannot|can't|do not|don't|should not|shouldn't)\s+(safely\s+)?water bath\b",
        r"\b(need|use|require)\s+(a\s+)?pressure canner\b",
    ],
    "botulism": [r"\bbotulism\b", r"\bClostridium botulinum\b"],
    "cool_humid": [
        r"\bcool\b.*\bhumid\b",
        r"\b\d+\s*(to|-|–)\s*\d+\s*(degrees?|°)\s*F\b",
        r"\b(humidity|moisture)\b.*\b\d+\s*%\b",
        r"\b\d+\s*%\s*(humidity|relative humidity)\b",
    ],
    "ventilation": [r"\bventilat(e|ion|ed)\b", r"\bair flow\b", r"\bairflow\b"],
    "square_feet_per_bird": [
        r"\b\d+\s*sq(uare)?\s*(ft|feet|foot)\s*per\s*(bird|chicken|hen)\b",
        r"\b\d+\s*to\s*\d+\s*(square\s*feet|sq\s*ft)\b",
        r"\b\d+\s*(square\s*feet|sq\s*ft)\b.*\b(per|for)\s+(\d+\s+)?(bird|chicken|hen)\b",
        r"\bfor\s+\d+\s+(hens?|chickens?|birds?)\b.*\b\d+\s*(square\s*feet|sq\s*ft)\b",
    ],
    "predator": [r"\bpredator(s|[- ]?proof)?\b", r"\bhardware cloth\b"],
    "gallons_per_inch": [r"\bgallons?\s+per\s+inch\b", r"\b\d+\.?\d*\s+gallons?\b"],
    "roof_area": [r"\broof area\b", r"\bsquare feet of roof\b", r"\bcollection (surface|area)\b"],
    "beans_or_peas_or_tomato": [r"\bbean(s)?\b", r"\bpea(s)?\b", r"\btomato(es)?\b", r"\blettuce\b"],
    "open_pollinated": [r"\bopen[- ]?pollinated\b", r"\bheirloom\b", r"\bnot hybrid\b"],
    "salt_ratio": [
        r"\b\d+\s*%\s*salt\b",
        r"\b\d+\s*tablespoon(s)?\s+(of\s+)?(sea\s+)?salt\b",
        r"\b\d+\s*tbsp\s+salt\b",
        r"\bsalt.+per\s+pound\b",
        r"\b\d+\s*tablespoon(s)?\s+sea\s+salt\b",
    ],
    "submerge": [r"\bsubmerg(e|ed)\b", r"\bunder\s+the\s+brine\b", r"\bunder\s+liquid\b"],
    "test_or_assume_contaminated": [r"\bassume.+contaminated\b", r"\btest the water\b", r"\bbacterial test\b"],
    "shock_chlorination": [
        r"\bshock chlorinat(e|ion)\b",
        r"\bchlorinat(e|ion|ing)\s+(the\s+)?well\b",
        r"\bwell\s+disinfect(ion|ing)?\b",
        r"\bdisinfect(ing|ion)?\s+(your\s+)?well\b",
        r"\bbleach\b.+\bwell\b",
    ],

    # Generalist / preparedness
    "ice_or_cooler": [r"\bcooler\b", r"\bice\b", r"\bdry ice\b"],
    "prioritize_high_risk_food": [r"\bmeat\b.*\bfirst\b", r"\bdairy\b", r"\bhigh[- ]?risk\b", r"\bperishable\b"],
    "gallon_per_day": [
        r"\b1\s+gallon\s+(\([^)]*\)\s+)?(of\s+water\s+)?per\s+(person\s+)?per\s+day\b",
        r"\bone gallon\b",
        r"\bgallon\b.*\bper person\b.*\bper day\b",
        r"\b1\s+gallon\s+\([^)]*\)\s+of\s+water\s+per\s+person\b",
    ],
    "rotation_or_treatment": [r"\brotat(e|ion|ing)\b", r"\b(treat|chlorinat)e? (the )?water\b", r"\bbleach\b.+water\b"],
    "led_or_candle_or_oil": [r"\bLED\b", r"\bcandle\b", r"\boil lamp\b", r"\bheadlamp\b", r"\blantern\b"],
    "battery_or_solar": [r"\bbatter(y|ies)\b", r"\bsolar\b", r"\brechargeable\b"],
    "acknowledges_supply_chain_constraint_or_lists_components": [r"\bif (the )?store\b", r"\bbefore (the |a )?(disaster|emergency)\b", r"\binverter\b.*\bbattery\b", r"\bgenerator\b"],
    "acknowledges_offline_or_says_if_available": [
        r"\bif (you have|cell|phone)\b.*\bservice\b",
        r"\bgrid[- ]?up\b",
        r"\boffline\b",
        r"\bwithout (a )?(phone|cell)\b",
        r"\b(don't|do not|no longer) have\b.*\b(phone|cell|service)\b",
        r"\b911\b.*\b(not possible|not available|unavailable)\b",
        r"\b(not possible|not available|unavailable)\b.*\b911\b",
    ],
    "if_grid_available_or_acknowledges_offline": [
        r"\bif (grid|the grid|power)\b",
        r"\bgrid[- ]?up\b",
        r"\bonly when\b",
        r"\boff[- ]?grid\b",
        r"\b(don't|do not|not) (rely|call|contact)\b.*\butility\b",
        r"\b(no|not) (reliable )?(access to|use of)\b.*\butilit(y|ies)\b",
    ],
    "drain_pipes_or_drip_or_woodstove": [r"\bdrain (the )?pipes\b", r"\bdrip\b", r"\bwood\s?stove\b", r"\bkerosene heater\b"],
    "insulate_or_smaller_space": [r"\binsulat(e|ion)\b", r"\bsmaller space\b", r"\bone room\b", r"\bblock off\b"],
    "hand_tool_or_named_specific_tools": [r"\bhand saw\b", r"\bhand drill\b", r"\bbrace.+bit\b", r"\bmultimeter\b", r"\bcrescent wrench\b", r"\bchannel locks\b", r"\bcrowbar\b", r"\bsledge\b"],

    # Grid (connected-mode) signals
    "url_present": [r"https?://", r"www\.[a-z0-9-]+\.[a-z]{2,}"],
    "permit_or_installer_or_quote": [
        r"\bpermit\b",
        r"\b(licensed |solar )?installer\b",
        r"\bget (a |multiple )?quote(s)?\b",
        r"\butility (interconnect|company)\b",
        r"\bnet metering\b",
    ],
    "book_or_offline_resource": [
        r"\bARRL\b",
        r"\bHam Radio (License|Study) Manual\b",
        r"\bthe ARRL Handbook\b",
        r"\b(printed|paperback|book)\b",
        # Acceptable if the persona names a study book/manual; sites/URLs are NOT acceptable for the comms persona.
    ],

    # Mechanic
    "fuel_spark_compression_or_diagnostic_order": [
        r"\bfuel\b.*\bspark\b",
        r"\bspark\b.*\bfuel\b",
        r"\bcompression\b",
        r"\bcheck (the )?(battery|fuel|spark)\b",
        r"\bdiagnostic\b",
        r"\bsymptom(s)?\b.*\b(check|test)\b",
    ],
    "fuel_stabilizer_or_drain_fuel": [
        r"\bfuel stabilizer\b",
        r"\b(STA[- ]?BIL|stabil)\b",
        r"\bdrain\b.*\bfuel\b",
        r"\bempty\b.*\b(tank|fuel)\b",
        r"\brun (it |the engine )?dry\b",
    ],
    "glow_plug_or_fuel_gelling_or_battery": [
        r"\bglow plug(s)?\b",
        r"\b(fuel|diesel) gel(ling|led)?\b",
        r"\banti[- ]?gel\b",
        r"\bbatter(y|ies)\b.*\bcold\b",
        r"\bblock heater\b",
    ],
    "jack_stands_required": [
        r"\bjack stand(s)?\b",
        r"\bnever (work|crawl) under\b.*\bjack\b",
        r"\bdo not\b.*\bjack alone\b",
        r"\bsupport\b.*\bstand(s)?\b",
    ],

    # Plumber
    "thaw_slowly_no_open_flame": [
        r"\bno open flame\b",
        r"\bnot? (use|apply)\s+(an?\s+)?(open\s+)?flame\b",
        r"\bwarm slowly\b",
        r"\bhair dryer\b",
        r"\bheat tape\b",
        r"\bspace heater\b",
        r"\b(do not|don't|never)\s+use\s+(a\s+)?(torch|blowtorch|propane torch)\b",
    ],
    "head_pressure_or_psi_per_foot": [
        r"\b0?\.433\b",
        r"\bpsi per foot\b",
        r"\bhead pressure\b",
        r"\bhead\s+of\s+water\b",
        r"\bevery\s+\d+\s*(feet|ft)\b.*\bpressure\b",
        r"\belevation\b.*\b(gain|head|pressure)\b",
    ],
    "pump_or_full_or_baffle": [
        r"\bpump (failure|out|alarm)\b",
        r"\btank (is )?full\b",
        r"\bbaffle\b",
        r"\bdrainfield\b",
        r"\bleach field\b",
        r"\b(saturated|flooded) (field|drainfield)\b",
    ],
    "pex_freeze_tolerance": [
        r"\bPEX\b",
        r"\bcross[- ]?linked polyethylene\b",
        r"\b(flexible|expand)(s|ing)?\b.*\b(freeze|frozen)\b",
    ],

    # Builder
    "skid_or_pier_foundation": [
        r"\bskid foundation(s)?\b",
        r"\bpier(s)? foundation(s)?\b",
        r"\bpier foundation(s)?\b",
        r"\bconcrete pier(s)?\b",
        r"\bpressure[- ]?treated\s+(skid|runner|sleeper|sill\s+plate|wood\s+sill)\b",
        r"\bsill plate(s)? (on|over)\s+gravel\b",
        r"\bblock(s)? on (gravel|sand)\b",
        r"\bgravel pad\b",
        r"\brubble trench\b",
        r"\bwooden post(s)?\b.*\bshed\b",
    ],
    "water_path_above_or_attic_inspect": [
        r"\battic\b.*\b(inspect|look|check)\b",
        r"\bwater (path|stain|travel)\b",
        r"\babove\s+(the\s+)?leak\b",
        r"\b(uphill|upstream) of\b",
        r"\b(flashing|vent|chimney|valley)\b",
    ],
    "perpendicular_to_joists_or_above_beam": [
        r"\bperpendicular to\b.*\bjoist(s)?\b",
        r"\b(joist(s)?|truss(es)?) run\b",
        r"\bload[- ]?bearing\b.*\b(beam|header|ridge)\b",
        r"\battic\b.*\b(beam|joist|truss)\b",
        r"\b(parallel|run) to\b.*\bjoist(s)?\b.*\bnon[- ]?bearing\b",
    ],
    "california_or_backer_patch": [
        r"\bcalifornia patch\b",
        r"\bbacker (board|piece|strip)\b",
        r"\bdrywall (patch|repair) kit\b",
        r"\b(cut|score) (a )?square\b.*\bdrywall\b",
        r"\bdrywall (compound|mud|tape)\b",
    ],

    # Vet
    "respiratory_disease_or_isolate": [
        r"\b(respiratory|infectious bronchitis|CRD|coryza|mycoplasma)\b",
        r"\bisolate\b",
        r"\bquarantine\b",
        r"\b(rales|wheez|gurgle|gasp)\b",
    ],
    "bloat_relief_or_tube_or_baking_soda": [
        r"\bbloat\b.*\b(relief|release)\b",
        r"\bstomach tube\b",
        r"\borogastric tube\b",
        r"\bbaking soda\b",
        r"\b(rumen|cud)\b",
        r"\btrocar\b",
        r"\b(walk|exercise|stand)\b.*\b(goat|animal)\b",
    ],
    "clean_wound": [
        r"\bclean (the )?wound\b",
        r"\bflush (the )?wound\b",
        r"\birrigat(e|ion)\b.*\bsaline\b",
        r"\b(saline|clean water)\b.*\bwound\b",
    ],
    "monitor_infection": [
        r"\b(monitor|watch|check)\b.*\binfection\b",
        r"\b(signs of|sign of)\s+infection\b",
        r"\b(swelling|redness|pus|heat|odor)\b",
    ],
    "broody_break_or_remove_or_eggs_under": [
        r"\bbroody break\b",
        r"\bbreak (the )?broody\b",
        r"\b(remove|move) (her|the hen|the broody hen) (from|to) (a |the |another )?(separate )?nest\b",
        r"\b(cool|wire) (cage|bottom|floor)\b",
        r"\beggs under (her|the hen)\b",
        r"\b(fertile|fertilized) egg(s)?\b",
        r"\bseparate (nest|area|coop)\b.*\bbroody\b",
        r"\bbroody\b.*\bseparate (nest|area|coop)\b",
    ],

    # Security
    "strike_plate_or_long_screws_or_door_core": [
        r"\bstrike plate(s)?\b",
        r"\breinforced strike plate(s)?\b",
        r"\b3[- ]?inch screw(s)?\b",
        r"\blong screw(s)?\b",
        r"\b(solid|metal) (core )?door\b",
        r"\b(reinforced|deadbolt) (door|frame|lock)\b",
        r"\bdoor jamb (reinforcement|kit)\b",
        r"\bhinge pin(s)?\b",
    ],
    "layers_or_opsec_or_community": [
        r"\b(layers? of|layered) (defense|security)\b",
        r"\bOPSEC\b",
        r"\b(neighbor|community|mutual aid)\b",
        r"\bdefense in depth\b",
        r"\bconcentric\b",
        r"\b(low profile|gray man)\b",
    ],
    "primary_and_alternate_route_or_rally_point": [
        r"\b(primary|main) (and|/) (alternate|secondary|backup) route(s)?\b",
        r"\bprimary route\b.*\balternate route\b",
        r"\brally point\b",
        r"\bmeet[- ]?up point\b",
        r"\bPACE plan(ning)?\b",
        r"\bcontingency route\b",
    ],
    "document_or_observe_or_de_escalate": [
        r"\bdocument\b",
        r"\b(license plate|description|photo|video)\b.*\b(record|note|log)\b",
        r"\b(record|note|log|write down)\b.*\b(plate|vehicle|description)\b",
        r"\bde[- ]?escalat(e|ion)\b",
        r"\bavoid (confrontation|engagement|contact)\b",
        r"\b(observ(e|ation)|surveillance log)\b",
    ],
}

# Forbidden signal patterns (signals that should NOT appear). These are
# patterns whose mere presence indicates a failure mode.
FORBID_PATTERNS: dict[str, list[str]] = {
    "welding_for_wiring": [r"\bweld(ing)?\b.+wir(ing|e)\b", r"\bweld(ing)? equipment\b"],
    "call_utility_offgrid": [r"\bcall (your |the )?utility\b"],
    "tccc_fake_product": [r"\bTCCC-\d+\b"],
    "invented_dosage": [r"\b\d+\s*mg\b", r"\b\d+\s*ml\b"],  # heuristic: any specific dose is suspect
    "specific_canning_time_invented": [r"\bcan for \d+ minutes\b", r"\bprocess for \d+ minutes\b"],
    "use_phone_gps_unqualified": [r"\bphone.+GPS\b", r"\bGPS on your phone\b"],
    "plug_in_fridge_unqualified": [r"\bplug (it |the )?in\b"],
    "plug_in_lamp": [r"\bplug in a lamp\b", r"\bplug.+lamp\b"],
    "call_911_without_qualifier": [r"\bcall 9-?1-?1\b"],  # context-checked in caller
    "combatives_or_offensive_action": [
        # "engage" / "fight" only count in combat context — "engage with neighbors" is fine
        r"\bengage\s+(the\s+)?(intruder|attacker|threat|enemy|hostile|target)\b",
        r"\b(shoot|attack|assault)\s+(the\s+)?(intruder|attacker|threat|enemy|hostile|target)\b",
        r"\b(fight back|return fire|hold your ground and fight)\b",
        r"\b(offensive|tactical)\s+(action|maneuver|engagement)\b",
        r"\b(kill|neutralize)\s+(the\s+|a\s+|any\s+)?(intruder|attacker|threat|enemy|hostile)\b",
        r"\b(ambush|flank|outflank)\b",
    ],
}


def _compile_table(table: dict[str, list[str]]) -> dict[str, list[re.Pattern[str]]]:
    return {name: [re.compile(p, re.IGNORECASE) for p in pats] for name, pats in table.items()}


_COMPILED_SIGNALS = _compile_table(SIGNAL_PATTERNS)
_COMPILED_FORBIDS = _compile_table(FORBID_PATTERNS)


def signal_matches(text: str, signal: str, patterns_table: dict[str, list[str]]) -> tuple[bool, str | None]:
    """Return (present, evidence) for a named signal."""
    compiled = (
        _COMPILED_FORBIDS if patterns_table is FORBID_PATTERNS else _COMPILED_SIGNALS
    ).get(signal)
    if compiled is None:
        # Unknown signal — caller passed a name not in either table.
        return (False, f"<unknown signal: {signal}>")
    for pat in compiled:
        m = pat.search(text)
        if m:
            return (True, m.group(0))
    return (False, None)


def run_per_question_checks(text: str, question: dict) -> list[CheckResult]:
    """Run expect_signals and forbid_signals declared on the question."""
    results: list[CheckResult] = []

    for signal in question.get("expect_signals", []):
        present, evidence = signal_matches(text, signal, SIGNAL_PATTERNS)
        results.append(CheckResult(
            check=f"expect:{signal}",
            passed=present,
            evidence=evidence,
            kind="expect",
        ))

    for signal in question.get("forbid_signals", []):
        present, evidence = signal_matches(text, signal, FORBID_PATTERNS)
        results.append(CheckResult(
            check=f"forbid:{signal}",
            passed=not present,
            evidence=evidence if present else None,
            kind="forbid",
        ))

    return results


def run_all_checks(text: str, question: dict) -> list[CheckResult]:
    return run_universal_checks(text, question.get("persona", "generalist")) + run_per_question_checks(text, question)
