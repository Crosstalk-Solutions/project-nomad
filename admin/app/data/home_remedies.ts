/**
 * Non-herbal home-care / self-care measures (Phase 2b, runtime source of truth).
 *
 * Same pattern as natural_remedies.ts / conditions.ts: the repo-root
 * collections/home_remedies.json is the browseable mirror, this compiled module
 * is what the running app reads (the image ships only compiled admin/build/).
 * Keep the two in sync. Sources are US-government public-domain pages (CDC,
 * NIH/NLM MedlinePlus summaries, FDA consumer updates) — each entry carries its
 * exact sourceUrl.
 */

import type { NaturalRemediesFile } from '../../types/conditions.js'

export const HOME_REMEDIES_FILE: NaturalRemediesFile = {
  "version": "2026-06-10",
  "source": {
    "name": "US government health guidance (CDC, NIH/NHLBI, MedlinePlus/NLM, FDA)",
    "url": "https://www.cdc.gov",
    "license": "Public domain (US government works)"
  },
  "remedies": [
    {
      "slug": "honey-for-cough",
      "name": "Honey (for cough)",
      "commonNames": [],
      "conditions": [
        "cough",
        "sore-throat",
        "common-cold"
      ],
      "uses": "Honey may be used to relieve cough in adults and children at least 1 year old. One to two teaspoons can be taken directly or stirred into a warm (not hot) beverage.",
      "how": "Give one to two teaspoons of honey directly by mouth, or stir it into a warm (not hot) drink. The CDC recommends this as a home measure for cough associated with the common cold.",
      "evidence": "CDC lists honey among recommended home measures for easing cough and sore throat associated with the common cold; it is one of several non-medication strategies mentioned alongside rest, fluids, and humidifier use.",
      "cautions": "Never give honey to infants under 1 year old — it can contain Clostridium botulinum spores that cause infant botulism, a rare but serious illness. This warning applies regardless of honey type or brand.",
      "sourceUrl": "https://www.cdc.gov/common-cold/treatment/index.html"
    },
    {
      "slug": "fluids-and-rest",
      "name": "Fluids and rest",
      "commonNames": [],
      "conditions": [
        "common-cold",
        "fever",
        "diarrhea",
        "nausea-vomiting"
      ],
      "uses": "Getting plenty of rest and drinking adequate fluids (water, clear broths, juice, or sports drinks) supports recovery from colds, fever, diarrhea, and nausea. Adults with diarrhea should drink water, fruit juices, sports drinks, sodas without caffeine, and salty broths.",
      "how": "Get plenty of rest and drink plenty of fluids. If keeping liquids down is difficult, take small sips of water or suck on ice chips frequently rather than trying to drink large amounts at once.",
      "evidence": "CDC recommends rest and fluids as primary home care measures for the common cold. MedlinePlus (NIH/NIDDK) similarly lists these as the foundation of diarrhea self-care, and advises nausea patients to take in small amounts of clear liquids often to stay hydrated.",
      "cautions": "Severely ill individuals, those with signs of dehydration (no urination, sunken eyes, extreme thirst), or those unable to keep any fluid down should seek medical care promptly. Caffeine and alcohol are not effective rehydration choices.",
      "sourceUrl": "https://www.cdc.gov/common-cold/treatment/index.html"
    },
    {
      "slug": "oral-rehydration",
      "name": "Oral rehydration solution (ORS)",
      "commonNames": [
        "ORS",
        "rehydration salts"
      ],
      "conditions": [
        "dehydration",
        "diarrhea"
      ],
      "uses": "Oral rehydration solutions replace fluids and electrolytes lost through diarrhea or other causes of dehydration. For mild to moderate dehydration, drinking water is the first step; sports drinks or oral rehydration solutions (such as Pedialyte) are recommended when electrolytes are also depleted, especially for children.",
      "how": "Use a commercially prepared oral rehydration solution (available without a prescription) and follow the package directions. For adults with electrolyte losses, sports drinks can help; if liquids are hard to keep down, take small sips frequently or suck on ice chips rather than drinking large amounts at once.",
      "evidence": "MedlinePlus (NIH/NIDDK) states that treatment for dehydration involves replacing lost fluids and electrolytes, and that oral rehydration solutions for children are available without a prescription. The same source recommends sports drinks for adults when electrolytes have been lost alongside fluids.",
      "cautions": "Seek immediate medical care for signs of severe dehydration: no urination for 8 or more hours, rapid heartbeat, confusion, or inability to keep fluids down. Infants and small children with diarrhea should use formulated ORS (not plain water) to replace electrolytes safely.",
      "sourceUrl": "https://medlineplus.gov/dehydration.html"
    },
    {
      "slug": "cool-compress-fever",
      "name": "Cool compress (for fever and insect bites)",
      "commonNames": [],
      "conditions": [
        "fever",
        "insect-bites-stings",
        "eye-allergy",
        "eye-irritation"
      ],
      "uses": "A clean cloth soaked in cool (not ice-cold) water and placed on the forehead or bitten area can help reduce discomfort from fever, insect bites, and eye allergy symptoms. For insect stings, ice wrapped in a washcloth should be applied for 10 minutes on and 10 minutes off.",
      "how": "Soak a clean cloth in cool water, wring it out, and place it on the forehead or affected area. For insect stings, wrap ice in a cloth and apply for 10 minutes on, then 10 minutes off — never place ice directly on bare skin.",
      "evidence": "MedlinePlus (NIH/NIAID) notes that applying cool compresses is recommended for allergic conjunctivitis and eye burning and irritation. For insect bites and stings, a cool or iced compress is a standard first-line self-care step described in MedlinePlus search guidance consistent with NIH resources.",
      "cautions": "Do not apply ice or an ice-cold compress directly to bare skin for extended periods — wrap ice in cloth and limit applications to 10–15 minutes to avoid frostbite or tissue damage. For fever, cool compresses supplement (but do not replace) appropriate fever-reducing medicine when indicated; consult a healthcare provider if fever is high, prolonged, or accompanied by severe symptoms.",
      "sourceUrl": "https://medlineplus.gov/insectbitesandstings.html"
    },
    {
      "slug": "ice-and-elevation",
      "name": "Ice and elevation (RICE method)",
      "commonNames": [
        "RICE",
        "Rest-Ice-Compression-Elevation"
      ],
      "conditions": [
        "muscle-joint-pain",
        "insect-bites-stings"
      ],
      "uses": "Applying ice wrapped in cloth to a strained muscle, sprain, or bite site — combined with rest, compression, and elevation of the injured area — reduces swelling and pain. Ice should be applied for 10–15 minutes every 1–3 hours during the first few days of injury.",
      "how": "Wrap ice in a cloth or towel and apply to the injured area for 10–15 minutes at a time. Rest the area, wrap it snugly with a bandage to reduce swelling, and elevate it above heart level when possible.",
      "evidence": "MedlinePlus (NIH/NIAMS) describes the RICE method as standard first-line treatment for sprains and strains: resting the area, icing it, compressing it with a bandage, and elevating it above heart level when possible. Ice use for the first 3 days is specifically mentioned.",
      "cautions": "Never apply ice directly to skin — always wrap it in a cloth or towel. If swelling worsens significantly, numbness develops, or you suspect a fracture, seek medical evaluation. Do not use heat during the first 48–72 hours of an acute soft-tissue injury.",
      "sourceUrl": "https://medlineplus.gov/sprainsandstrains.html"
    },
    {
      "slug": "heating-pad",
      "name": "Heating pad or warm compress",
      "commonNames": [],
      "conditions": [
        "menstrual-cramps",
        "muscle-joint-pain",
        "earache"
      ],
      "uses": "Applying a heating pad or hot water bottle to the lower abdomen eases menstrual cramps. A warm compress applied to the ear can relieve earache discomfort. Heat may also be used on strained muscles after the first 48–72 hours of an acute injury.",
      "how": "Place a heating pad or hot water bottle on the lower abdomen for menstrual cramps, or hold a warm cloth against the affected ear for earache. Use a low or medium heat setting and put a cloth between the pad and skin to prevent burns.",
      "evidence": "MedlinePlus (NIH/NLM) lists using a heating pad or hot water bottle on the lower abdomen, along with taking a warm bath, as home care measures for period pain. For earache, placing a warm cloth on the affected ear is listed among comfort measures in NIH/NLM resources for acute ear infection self-care.",
      "cautions": "Never fall asleep with a heating pad on — burns can result. Use a low or medium setting and place a cloth between the pad and skin. For ear pain, do not insert anything into the ear canal; if pain is severe, accompanied by drainage, hearing loss, or fever, see a healthcare provider to rule out infection requiring antibiotics.",
      "sourceUrl": "https://medlineplus.gov/periodpain.html"
    },
    {
      "slug": "humidifier-and-steam",
      "name": "Humidifier or steam inhalation",
      "commonNames": [
        "cool-mist vaporizer",
        "steam inhalation"
      ],
      "conditions": [
        "nasal-congestion",
        "cough",
        "common-cold"
      ],
      "uses": "Using a clean humidifier or cool-mist vaporizer adds moisture to the air and can help relieve nasal congestion and cough. Breathing steam from a bowl of hot water or a running shower 2–4 times daily also loosens nasal secretions.",
      "how": "Fill a clean cool-mist humidifier or vaporizer with water and run it in the room. Clean the device daily per the manufacturer's instructions to prevent mold and bacteria buildup.",
      "evidence": "CDC recommends using a clean humidifier or cool-mist vaporizer as a home care measure for common cold symptoms including congestion and cough. MedlinePlus similarly notes that a humidifier can break up mucus and that steam inhalation from a shower is a recognized congestion-relief strategy.",
      "cautions": "Clean the humidifier daily per manufacturer instructions to prevent mold and bacterial growth. Use cool-mist humidifiers rather than warm-mist (steam) versions for children to avoid burn risk. When inhaling steam from hot water, use caution to avoid scalding; keep a safe distance and do not cover your head over a pot of boiling water.",
      "sourceUrl": "https://www.cdc.gov/common-cold/treatment/index.html"
    },
    {
      "slug": "saline-nasal-rinse",
      "name": "Saline nasal rinse",
      "commonNames": [
        "neti pot",
        "nasal irrigation",
        "saline nasal wash"
      ],
      "conditions": [
        "nasal-congestion",
        "common-cold"
      ],
      "uses": "Saline nasal rinses flush pollen, dust, and excess mucus from the nasal passages and add moisture. They can be performed with a neti pot, squeeze bottle, or bulb syringe using a prepared saline solution.",
      "how": "Use only distilled, sterile, or previously boiled-and-cooled water — never tap water. After each use, rinse the device with the same safe water, then air-dry it thoroughly or wipe dry before storing.",
      "evidence": "CDC recommends saline nasal spray or drops as a home care measure for the common cold. The FDA confirms that nasal irrigation devices are 'usually safe and effective products when used and cleaned properly,' with the critical safety requirement being the type of water used.",
      "cautions": "Use only distilled, sterile, or previously boiled (and cooled) water — never tap water. The FDA warns that tap water can harbor organisms including amoebas that are safe to swallow but can cause serious or potentially fatal infections in the nasal passages. Boiled water should be cooled to lukewarm and stored in a clean, closed container for no more than 24 hours. Always clean and dry the device after each use.",
      "sourceUrl": "https://www.fda.gov/consumers/consumer-updates/rinsing-your-sinuses-neti-pots-safe"
    },
    {
      "slug": "oatmeal-bath",
      "name": "Oatmeal or cool bath",
      "commonNames": [
        "colloidal oatmeal bath"
      ],
      "conditions": [
        "skin-rash-itch",
        "poison-ivy",
        "dry-skin"
      ],
      "uses": "Soaking in a lukewarm oatmeal bath or taking a cool bath can relieve itching and skin irritation from rashes, poison ivy, eczema, and dry skin. Colloidal oatmeal bath products are available at drugstores.",
      "how": "Fill a tub with lukewarm (not hot) water and add a colloidal oatmeal bath product according to package directions, or use plain cool water. After soaking, pat skin dry gently and apply a fragrance-free moisturizer immediately to lock in moisture.",
      "evidence": "MedlinePlus (NLM) recommends taking 'lukewarm or oatmeal baths' as a self-care measure for itching, alongside cool compresses and moisturizing lotion. Oatmeal bath products are specifically noted to relieve symptoms of eczema and psoriasis; short, cooler baths are described as better than long, hot baths for skin conditions.",
      "cautions": "Use lukewarm — not hot — water; hot water can worsen skin dryness and irritation. After bathing, pat skin dry gently (do not rub) and immediately apply a fragrance-free moisturizer to lock in moisture. If a rash is spreading rapidly, is accompanied by fever, or involves the face or genitals, consult a healthcare provider.",
      "sourceUrl": "https://medlineplus.gov/itching.html"
    },
    {
      "slug": "cool-running-water-on-burns",
      "name": "Cool running water on burns",
      "commonNames": [],
      "conditions": [
        "burns"
      ],
      "uses": "For minor burns, immediately run cool (not cold) water slowly over the burned area for 10–15 minutes to stop the burning process and reduce pain. After cooling, cover the burn with a clean, dry cloth or sterile bandage.",
      "how": "Run cool water slowly over the burned area for several minutes, then cover with a clean, dry cloth or bandage. Do not apply ice, butter, or any creams — these can worsen tissue damage.",
      "evidence": "CDC burn first-aid materials instruct: run cool water slowly over the burn area for several minutes, then cover with a clean, dry cloth or bandage. MedlinePlus (NIH/NIGMS) similarly specifies cool running water for 10–15 minutes followed by a dry sterile dressing as the appropriate first-aid response for minor burns.",
      "cautions": "Do not apply ice, ice water, butter, first-aid creams, sprays, or home remedies — these can worsen tissue damage or introduce infection. Do not break blisters unless directed by a healthcare provider. Do not try to remove clothing or debris stuck to the burn. Seek immediate medical care for large burns, burns on the face, eyes, hands, or feet, burns from chemicals or electricity, or any burn with extreme pain, numbness, or deep tissue involvement.",
      "sourceUrl": "https://medlineplus.gov/burns.html"
    },
    {
      "slug": "clean-and-cover-wounds",
      "name": "Clean and cover wounds and cuts",
      "commonNames": [],
      "conditions": [
        "wounds-cuts"
      ],
      "uses": "For minor cuts and scrapes, rinse the wound thoroughly with cool clean water to remove dirt, apply gentle pressure with gauze to stop bleeding, then cover with a clean bandage. Wash with soap and water to reduce infection risk.",
      "how": "Apply firm but gentle pressure with gauze to stop bleeding; if blood soaks through, add more gauze on top without removing the first layer. Rinse the wound with cool clean water, then cover it with a clean dry bandage.",
      "evidence": "CDC guidance on wound care states: put pressure on a bleeding cut until it stops, gently pour clean water over the wound to clean it, then apply a clean, dry bandage. MedlinePlus (NLM) similarly advises rinsing cuts with cool water and applying firm but gentle pressure to stop bleeding.",
      "cautions": "Watch for signs of infection in the days following — increasing redness, swelling, warmth, pus, or red streaks spreading from the wound require prompt medical evaluation. Seek immediate care for wounds that are deep, gaping, caused by an animal or human bite, or associated with a puncture from a potentially contaminated object (tetanus risk).",
      "sourceUrl": "https://medlineplus.gov/firstaid.html"
    },
    {
      "slug": "salt-water-gargle",
      "name": "Salt-water gargle",
      "commonNames": [],
      "conditions": [
        "sore-throat",
        "common-cold",
        "canker-sores"
      ],
      "uses": "Gargling with warm salt water several times a day can ease sore throat pain and may also help relieve canker sore discomfort. A standard preparation is ½ teaspoon (3 grams) of salt dissolved in 1 cup (240 mL) of warm water.",
      "how": "Dissolve salt in a cup of warm water, take a mouthful, tilt your head back, and gargle for several seconds before spitting it out. Repeat as needed throughout the day to help ease sore throat pain.",
      "evidence": "MedlinePlus (NLM) states that gargling may ease sore throat pain, listing it alongside lozenges and fluids. The same resource notes that salt-water rinses may help with canker sore discomfort, though mouthwashes containing alcohol should be avoided as they irritate the tissue.",
      "cautions": "Gargling with salt water provides symptomatic relief only and does not treat the underlying cause of a sore throat. Sore throat accompanied by high fever, difficulty swallowing or breathing, drooling, a stiff neck, or lasting more than a week should be evaluated by a healthcare provider, as strep throat and other conditions require different treatment.",
      "sourceUrl": "https://medlineplus.gov/sorethroat.html"
    },
    {
      "slug": "fiber-and-water-constipation",
      "name": "Dietary fiber and water (for constipation and hemorrhoids)",
      "commonNames": [],
      "conditions": [
        "constipation",
        "hemorrhoids"
      ],
      "uses": "Eating more fruits, vegetables, and whole grains (which are high in fiber) and drinking plenty of water each day are the foundational self-care steps for preventing and relieving constipation and reducing hemorrhoid discomfort.",
      "how": "Eat more fruits, vegetables, and whole grains each day and drink plenty of fluids. Increase fiber gradually to avoid gas and bloating.",
      "evidence": "MedlinePlus (NIH/NIDDK) lists increased dietary fiber and adequate fluid intake as primary self-care measures for both constipation and hemorrhoids. The hemorrhoids topic page specifically recommends eating high-fiber foods and drinking enough fluids every day as the first-line home treatment.",
      "cautions": "Increase dietary fiber gradually to avoid gas and bloating. If constipation is new, severe, accompanied by blood in the stool, or associated with significant weight loss, see a healthcare provider to rule out underlying conditions. Hemorrhoid symptoms persisting beyond one week of home treatment, or any rectal bleeding, warrant medical evaluation.",
      "sourceUrl": "https://medlineplus.gov/constipation.html"
    },
    {
      "slug": "sitz-bath",
      "name": "Sitz bath (for hemorrhoids)",
      "commonNames": [],
      "conditions": [
        "hemorrhoids"
      ],
      "uses": "A sitz bath — sitting in a few inches of warm water for 10–15 minutes, several times a day — relieves the pain and itching of hemorrhoids. A special sitz bath tub that fits over a toilet is available at pharmacies.",
      "how": "Fill a tub or sitz bath basin with a few inches of comfortably warm water and sit in it for 10 to 15 minutes. Repeat several times a day, keeping the area clean and dry between baths.",
      "evidence": "MedlinePlus (NLM) lists taking warm baths several times a day, including sitz baths, as a recommended home care measure to relieve hemorrhoid pain. The recommendation is to sit in warm water for 10 to 15 minutes per session.",
      "cautions": "The water should be comfortably warm — not hot — to avoid burns. Keep the area clean and dry between baths. If hemorrhoid symptoms do not improve after one week of home treatment, or if there is rectal bleeding, see a healthcare provider.",
      "sourceUrl": "https://medlineplus.gov/hemorrhoids.html"
    },
    {
      "slug": "elevate-head-heartburn",
      "name": "Elevate head of bed (for heartburn)",
      "commonNames": [],
      "conditions": [
        "heartburn",
        "indigestion"
      ],
      "uses": "Raising the head of the bed 4–6 inches (using blocks under the bed frame or a wedge support) prevents stomach acid from backing up into the esophagus during sleep, reducing nighttime heartburn and GERD symptoms.",
      "how": "Place blocks under the legs at the head of the bed frame, or use a foam wedge under the mattress, to raise the sleeping surface about 6 inches. Using extra pillows under only the head is less effective because it bends the body at the waist rather than tilting the whole torso.",
      "evidence": "MedlinePlus heartburn resources (sourced from NIH/NIDDK) consistently recommend elevating the head during sleep as a lifestyle measure for heartburn and GERD, noting that this position helps prevent reflux. Sleeping with the head raised about 6 inches is a specific recommendation described in the Medical Encyclopedia entry.",
      "cautions": "Using extra pillows under the head is less effective than raising the entire upper body — pillows can cause neck strain and do not sufficiently change the angle. Heartburn that is frequent, severe, or accompanied by difficulty swallowing, unexplained weight loss, or vomiting blood requires medical evaluation.",
      "sourceUrl": "https://medlineplus.gov/heartburn.html"
    },
    {
      "slug": "bland-small-meals",
      "name": "Small, frequent bland meals",
      "commonNames": [
        "BRAT diet",
        "bland diet"
      ],
      "conditions": [
        "nausea-vomiting",
        "indigestion",
        "diarrhea"
      ],
      "uses": "Eating 6–8 small bland meals throughout the day (crackers, toast, baked chicken, rice, potatoes) instead of 3 large meals reduces nausea and eases indigestion. As diarrhea symptoms improve, soft bland foods can be introduced gradually.",
      "how": "Eat smaller meals more often and stick to bland foods, avoiding spicy, fatty, or salty options. If you have trouble keeping food down, start with small sips of clear liquids frequently and add bland solids only when tolerated.",
      "evidence": "MedlinePlus (NLM) recommends small, frequent bland meals and avoiding spicy, fatty, or salty foods as the primary dietary self-care for nausea and vomiting. For indigestion, MedlinePlus notes that avoiding foods and situations that trigger symptoms is the main home strategy. For diarrhea, 'soft, bland food' is recommended as symptoms improve.",
      "cautions": "The BRAT diet (bananas, rice, applesauce, toast) was historically promoted but MedlinePlus notes there is not strong evidence it is better than a standard bland diet; it probably does not cause harm. If nausea or vomiting persists beyond 24–48 hours, is accompanied by severe pain, or prevents adequate fluid intake, seek medical care.",
      "sourceUrl": "https://medlineplus.gov/nauseaandvomiting.html"
    },
    {
      "slug": "dark-quiet-room-headache",
      "name": "Rest in a dark, quiet room (for headache)",
      "commonNames": [],
      "conditions": [
        "headache",
        "sleeplessness"
      ],
      "uses": "Resting with eyes closed in a dark, quiet room is a recommended non-medication self-care measure during a headache or migraine. Drinking water to prevent dehydration and placing a cool cloth on the forehead are often combined with this rest.",
      "how": "Go to a quiet, darkened room, close your eyes, and rest. Drink water and place a cool damp cloth on your forehead to help ease discomfort.",
      "evidence": "MedlinePlus (NLM) describes resting in a quiet, darkened room as one of the key things you can do to feel better during a headache or migraine, alongside drinking water and using relaxation techniques. These recommendations are attributed to NIH sources on headache and migraine management.",
      "cautions": "Sudden severe ('thunderclap') headache, headache with fever, stiff neck, confusion, or vision changes may signal a serious condition and require emergency evaluation. Frequent headaches that disrupt daily life should be discussed with a healthcare provider rather than managed solely at home.",
      "sourceUrl": "https://medlineplus.gov/headache.html"
    },
    {
      "slug": "sleep-hygiene",
      "name": "Sleep hygiene practices",
      "commonNames": [
        "good sleep habits"
      ],
      "conditions": [
        "sleeplessness"
      ],
      "uses": "A consistent set of behavioral practices — consistent bedtime and wake time, a cool and dark bedroom, avoiding screens and caffeine near bedtime, and regular exercise — helps adults achieve and maintain adequate sleep.",
      "how": "Go to bed and wake up at the same time every day. Keep the bedroom quiet, dark, and cool; turn off electronic devices at least 30 minutes before bedtime; and avoid caffeine in the afternoon and evening and large meals or alcohol before bed.",
      "evidence": "CDC and NHLBI both recommend these specific practices for healthy sleep: going to bed and waking at the same time daily, keeping the bedroom quiet, cool, and dark, turning off screens at least 30 minutes before bed, avoiding caffeine in the afternoon and evening, and avoiding large meals or alcohol before sleep. NHLBI notes these habits are particularly important for shift workers and people with insomnia.",
      "cautions": "Good sleep hygiene can help relieve short-term insomnia; persistent insomnia lasting more than a few weeks should be evaluated by a healthcare provider. Sleep difficulties accompanied by snoring, gasping during sleep, or excessive daytime sleepiness may indicate obstructive sleep apnea, which requires medical diagnosis.",
      "sourceUrl": "https://www.cdc.gov/sleep/about/index.html"
    },
    {
      "slug": "pinworm-hygiene",
      "name": "Hygiene measures for pinworm",
      "commonNames": [],
      "conditions": [
        "pinworm"
      ],
      "uses": "Thorough handwashing with soap and warm water (especially after toilet use and before eating), daily morning bathing with soap and water, daily underwear changes, short and clean fingernails, and laundering of bedding and pajamas in hot water are the key household self-care measures for managing pinworm infection.",
      "how": "Bathe after waking up each morning and wash hands regularly, especially after using the bathroom. Change underwear daily, wash pajamas and bed sheets often, and avoid nail biting to prevent reinfection.",
      "evidence": "CDC identifies handwashing as 'the most important way to prevent the spread of pinworms.' MedlinePlus (NIH/NIAID) lists bathe after waking up, wash pajamas and bed sheets often, wash hands regularly, change underwear every day, and avoid nail biting and scratching the anal area as the core preventive hygiene steps.",
      "cautions": "Hygiene alone typically cannot eliminate an active pinworm infection — over-the-counter antiparasitic medication (pyrantel pamoate) is generally needed, and all household members should be treated simultaneously. Medication is typically repeated after 2 weeks because it kills worms but not eggs; the second dose treats worms that hatched after the first dose.",
      "sourceUrl": "https://medlineplus.gov/pinworms.html"
    },
    {
      "slug": "keep-feet-dry-athlete-foot",
      "name": "Keep feet clean and dry (for fungal infection)",
      "commonNames": [
        "athlete's foot self-care"
      ],
      "conditions": [
        "fungal-infection"
      ],
      "uses": "Keeping the feet clean, dry, and cool — including washing daily with soap and water, drying carefully between the toes, wearing clean cotton socks, and not walking barefoot in public showers or locker rooms — supports treatment and prevents spread of athlete's foot and other tinea infections.",
      "how": "Keep feet clean, dry, and cool; wear clean socks and avoid walking barefoot in public areas such as locker room showers (use flip-flops instead). Apply an over-the-counter antifungal cream as directed on the package for most cases of athlete's foot.",
      "evidence": "MedlinePlus (CDC-sourced) advises: keep your feet clean, dry, and cool; wear clean socks; avoid walking barefoot in public areas; wear flip-flops in locker room showers; keep toenails clean and clipped short. Over-the-counter antifungal creams work for most cases of athlete's foot.",
      "cautions": "If over-the-counter antifungal treatment does not improve the infection within 2–4 weeks, see a healthcare provider. Spreading or worsening redness, warmth, and swelling — especially in people with diabetes or circulatory problems — warrants prompt medical care. Nail fungal infections are more difficult to treat than skin infections and often require prescription therapy.",
      "sourceUrl": "https://medlineplus.gov/athletesfoot.html"
    }
  ]
}
