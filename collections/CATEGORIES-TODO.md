# Kiwix Categories To-Do List

Potential categories to add to the tiered collections system in `kiwix-categories.json`.

## Current Categories (Completed)
- [x] Medicine - Medical references, first aid, emergency care
- [x] Survival & Preparedness - Food prep, prepper videos, repair guides
- [x] Education & Reference - Wikipedia, textbooks, TED talks

---

## High Priority

### Technology & Programming
Stack Overflow, developer documentation, coding tutorials
- Stack Overflow (multiple tags available)
- DevDocs documentation
- freeCodeCamp
- Programming language references

### Children & Family
Age-appropriate educational content for kids
- Wikipedia for Schools
- Wikibooks Children's Bookshelf
- Khan Academy Kids (via Kolibri - separate system)
- Storybooks, fairy tales

### Trades & Vocational
Practical skills for building, fixing, and maintaining
- Electrical wiring guides
- Plumbing basics
- Automotive repair
- Woodworking
- Welding fundamentals

### Agriculture & Gardening
Food production and farming (expand beyond what's in Survival)
- Practical Plants database
- Permaculture guides
- Seed saving
- Animal husbandry
- Composting and soil management

---

## Medium Priority

### Languages & Reference
Dictionaries, language learning, translation
- Wiktionary (multiple languages)
- Language learning resources
- Translation dictionaries
- Grammar guides

### History & Culture
Historical knowledge and cultural encyclopedias
- Wikipedia History portal content
- Historical documents
- Cultural archives
- Biographies

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

### Entertainment
Recreational reading and activities
- Project Gutenberg (fiction categories)
- Chess tutorials
- Puzzles and games
- Music theory

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
