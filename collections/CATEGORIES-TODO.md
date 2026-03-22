# Kiwix Categories To-Do List

Potential categories to add to the tiered collections system in `kiwix-categories.json`.

## Current Categories (Completed)
- [x] Medicine - Medical references, first aid, emergency care
- [x] Survival & Preparedness - Food prep, prepper videos, repair guides
- [x] Education & Reference - Wikipedia, textbooks, TED talks
- [x] DIY & Repair - Woodworking, vehicle repair, home improvement, iFixit
- [x] Agriculture & Food - Cooking, gardening, homesteading, food preservation
- [x] Computing & Technology - freeCodeCamp, DevDocs, Arduino, Raspberry Pi, electronics
- [x] Children & Family - African Storybooks, Gutenberg children's lit, Wikipedia for Schools, PhET simulations
- [x] Languages & Reference - Wiktionary (EN, ES, FR, AR, DE, PT)
- [x] History & Culture - Project Gutenberg history, History Q&A, Wikipedia History
- [x] Legal & Civic - Civics guides, Gutenberg law, Law Q&A, Personal Finance Q&A

---

## High Priority

### Trades & Vocational
Practical skills beyond DIY — licensed trades and professional vocational content
- Electrical wiring codes and guides
- Plumbing fundamentals
- Welding techniques
- HVAC basics
- Construction safety

### Communications
Emergency and amateur radio, networking
- Ham radio guides (ARRL)
- Emergency communication protocols (FEMA/NIMS)
- Basic networking/IT
- Signal procedures

---

## Medium Priority

### Mental Health & Psychology
- Psychology Stack Exchange
- Mindfulness and wellness guides
- Crisis support references

### Religion & Philosophy
Spiritual and philosophical texts
- Religious texts (various traditions)
- Philosophy references (Stanford Encyclopedia if available)
- Ethics guides

### Regional/Non-English Bundles
Content in other languages
- Spanish Wikipedia (mini)
- French Wikipedia (mini)
- Other major languages

---

## Nice To Have

### Entertainment
Recreational reading and activities
- Project Gutenberg fiction (lcc-pr: English literature)
- Chess tutorials
- Music theory

---

## Notes

- Each category should have 3 tiers: Essential, Standard, Comprehensive
- Higher tiers include all content from lower tiers via `includesTier`
- Check Kiwix catalog for available ZIM files: https://download.kiwix.org/zim/
- Consider storage constraints - Essential tiers should be <500MB ideally
- Mark one tier as `recommended: true` (usually Essential)
