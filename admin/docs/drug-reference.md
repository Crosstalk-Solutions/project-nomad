# Drug Reference

The Drug Reference is an offline, searchable database of **FDA drug labels**, the official information that comes with over-the-counter and prescription medicines. Once it is installed you can look up a medicine by name, work backwards from a situation to the medicines that treat it, and put two labels side by side, all with no internet connection.

It is an optional add-on. A fresh NOMAD does not have it until you choose to install it, because the dataset is large.

> **This is health information, not medical advice.** The Drug Reference shows you the manufacturer's FDA label text and matches situations to over-the-counter options. It cannot replace a doctor, pharmacist, or nurse. Always follow the directions on the actual product you have, and in a real emergency get professional help if you can.

The first time you open the Drug Reference in a browser, you will see this warning as a dialog you have to acknowledge before the page will load. That acknowledgement is remembered per browser, so a different browser or device will show it again.

---

## Installing it

There are two ways to get the data, and they end up in the same place.

**From the Content Explorer**, as part of a collection:

1. From the home screen, open **Content Explorer**.
2. Choose the **Medicine** category.
3. Select the **Standard** tier. Its contents are listed on the card, and you will see **FDA Drug Reference** among them.
4. Confirm the download.

**From the Drug Reference page itself.** Open **Drug Reference** from the home screen. If no data is installed you will get a "No FDA drug data yet" panel with a **Download FDA drug data** button, which starts the same process.

Either way it runs in two stages in the background:

- **Download** — NOMAD pulls the openFDA drug-label dataset, about **1.7 GB** compressed, in several parts. If your connection drops it picks up where it left off.
- **Indexing** — NOMAD ingests those labels into a fast offline search database. This is the longer stage, and the data expands to roughly **8 to 10 GB** on disk.

You do not have to sit and watch. Leave the page and it keeps going, and search switches on by itself once indexing finishes. The page shows progress for both stages while they run.

---

## Finding your way around

Everything lives behind a single **Drug Reference** tile on the home screen. Once data is installed, the page has three tabs.

### Search by drug

Type a drug name, brand or generic, and NOMAD shows matching FDA labels: what the medicine is for, dosing, warnings, and ingredients, straight from the manufacturer's official label.

Results are **grouped by active ingredient** rather than listed as hundreds of near-identical products. A search for a common painkiller returns one group per ingredient instead of every store brand separately, so you can see what you are actually choosing between.

### By situation

Start from the problem instead of the product. Pick one or more situations, such as burn, fever, or diarrhea, and NOMAD lists the medicines whose FDA labels cover them.

Selecting more than one situation looks for medicines that cover **all** of them first, then falls back to showing results for each situation on its own. That is useful when you are dealing with more than one symptom at once and want a single product if one exists.

### FDA data

Shows where the data came from and its current state: whether it is downloaded, indexed, and how many labels are loaded. This is also where you go to re-run a download or restart indexing if something needs attention.

---

## Comparing two medicines

From a drug's detail page, use **Compare label warnings** to put two labels side by side and read what each one says.

This puts the two manufacturers' warning sections next to each other. It does **not** calculate drug interactions, and it will not tell you whether a combination is safe. Deciding whether two medicines can be taken together is exactly the kind of question to put to a pharmacist or doctor.

---

## Keeping it current

FDA labels change over time. If you have turned on **automatic content updates** (Settings → Updates), NOMAD periodically checks whether openFDA has published a newer dataset and refreshes the Drug Reference on its own, the same way it handles your other offline content.

With automatic updates off, the data stays exactly as it was when you installed it, which is fine for offline use. You can always re-run the download from the **FDA data** tab to pull the latest.

---

## A note on storage

The Drug Reference is the largest single item in the Medicine → Standard collection. Budget around **8 to 10 GB** of disk for it after indexing, on top of the 1.7 GB download.

If storage is tight, the Content Explorer shows the full size of a tier before you commit, so you can see what you are taking on.
