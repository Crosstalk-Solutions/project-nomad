# Kiwix Categories To-Do List

Potential categories to add to the tiered collections system in `kiwix-categories.json`.

## Current Categories (Completed)
- [x] Medicine - Medical references, first aid, emergency care
- [x] Survival & Preparedness - Food prep, prepper videos, repair guides
- [x] Education & Reference - Wikipedia, textbooks, TED talks
- [x] DIY & Repair - Woodworking, vehicle maintenance, home improvement
- [x] Agriculture & Food - Cooking, gardening, food preservation
- [x] Computing & Technology - Programming, electronics, maker projects
- [x] Languages & Reference - Dictionaries, language learning, translation
- [x] History & Culture - Historical Q&A, world factbook, biographies
- [x] Children & Family - Children's books, educational videos, parenting
- [x] Trades & Vocational - Engineering, 3D printing, automotive repair
- [x] Entertainment - Chess, puzzles, fiction, music, movies

---

## High Priority

### ~~Technology & Programming~~ ✅ (added as Computing & Technology)
~~Stack Overflow, developer documentation, coding tutorials~~

### ~~Children & Family~~ ✅
~~Age-appropriate educational content for kids~~

### ~~Trades & Vocational~~ ✅
~~Practical skills for building, fixing, and maintaining~~

### ~~Agriculture & Gardening~~ ✅ (added as Agriculture & Food)
~~Food production and farming~~

---

## Medium Priority

### ~~Languages & Reference~~ ✅
~~Dictionaries, language learning, translation~~

### ~~History & Culture~~ ✅
~~Historical knowledge and cultural encyclopedias~~

### Legal & Civic
Laws, rights, and civic procedures
- Legal references
- Constitutional documents
- Civic procedures
- Rights and responsibilities

### Communications
Emergency and amateur radio, networking
- Ham radio guides
- Emergency communication protocols
- Basic networking/IT
- Signal procedures

---

## Nice To Have

### ~~Entertainment~~ ✅
~~Recreational reading and activities~~

### Religion & Philosophy
Spiritual and philosophical texts
- Religious texts (various traditions)
- Philosophy references
- Ethics guides

### Regional/Non-English Bundles
Content in other languages
- Spanish language bundle
- French language bundle
- Other major languages

---

## Notes

- Each category should have 3 tiers: Essential, Standard, Comprehensive
- Higher tiers include all content from lower tiers via `includesTier`
- Check Kiwix catalog for available ZIM files: https://download.kiwix.org/zim/
- Consider storage constraints - Essential tiers should be <500MB ideally
- Mark one tier as `recommended: true` (usually Essential)
