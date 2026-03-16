# NOMAD-DATA PDFs & Docs herunterladen

Dieses Skript lädt alle in `nomad-data-pdf-urls.txt` eingetragenen PDFs und Ressourcen in eine NOMAD-DATA-Ordnerstruktur.

## Warum sehe ich die neuen ZIM-Kategorien / PDFs nicht?

- **ZIM-Kategorien (Deutsch & Österreich, Klexikon, Koch-Wiki, …):** Die App lädt die Collection-Dateien von einer URL. Standard ist der **main**-Branch von Crosstalk-Solutions – dort sind die neuen Kategorien erst nach Merge des PRs. Damit du sie **sofort** siehst, muss die laufende NOMAD-Instanz die Umgebungsvariable **`NOMAD_COLLECTIONS_BASE_URL`** setzen (z.B. in der Docker-/Compose-Umgebung):
  ```bash
  NOMAD_COLLECTIONS_BASE_URL=https://raw.githubusercontent.com/neuhubereco/project-nomad/refs/heads/feature/collections-german-austria-zim
  ```
  Danach in der Oberfläche unter Einstellungen / Content Explorer die Collections neu laden („Collections aktualisieren“ o.ä.).  
  **Hinweis:** Die App-Version muss den Code für `NOMAD_COLLECTIONS_BASE_URL` enthalten (z.B. Build von deinem Fork oder nach Merge des PRs).

- **PDFs in der Knowledge Base:** Die App muss **`NOMAD_DATA_PATH`** auf den Ordner setzen, in dem deine NOMAD-DATA-Struktur liegt (z.B. wo die heruntergeladenen PDFs in 01_MEDIZIN, 04_SURVIVAL, … liegen). Dieser Pfad muss **im Container** erreichbar sein (z.B. Volume-Mount):
  ```bash
  NOMAD_DATA_PATH=/storage/nomad_data
  ```
  Wenn die PDFs auf dem Host unter `/home/nomad/nomad_data` liegen, muss dieses Verzeichnis z.B. als `/storage/nomad_data` in den Admin-Container gemountet sein. Anschließend in der App: **Knowledge Base → Scan and Sync** ausführen.

## 1. Live: Neue ZIM-Kategorien

Die neuen ZIM-Kategorien (Deutsch & Österreich, Militär & Taktik, Kommunikation, Energie & Off-Grid) sind in `collections/kiwix-categories.json` eingetragen.

- **Wenn du das offizielle Repo (Crosstalk-Solutions) nutzt:** Nach Push auf `main` lädt die App die neue Spec von GitHub – in der Oberfläche unter **Einstellungen → Content Explorer** „Collections aktualisieren“ o.ä., dann erscheinen die neuen Kategorien.
- **Eigenes Fork:** Setze die Umgebungsvariable  
  `NOMAD_COLLECTIONS_BASE_URL=https://raw.githubusercontent.com/DEIN_USER/project-nomad/refs/heads/main`  
  (z.B. in `compose.yml` oder `.env`), dann bezieht die App die Specs von deinem Fork.

## 2. PDFs/Docs automatisch laden

```bash
# Im Projekt-Root (oder mit Zielordner)
./install/download-nomad-data-pdfs.sh

# Oder mit Zielordner (z.B. auf dem Server)
./install/download-nomad-data-pdfs.sh /opt/project-nomad/storage/nomad_data

# Oder mit NOMAD_DATA_PATH
export NOMAD_DATA_PATH=/pfad/zu/NOMAD-DATA
./install/download-nomad-data-pdfs.sh
```

Es werden u.a. geladen:

- **Österreich Zivilschutz** (Blackout-Ratgeber, Vorrat, Bundesheer)
- **FEMA / Ready.gov** (Are You Ready, CERT, Hazard Sheets, Evacuation, Shelter, Communications)
- **FEMA ICS-Formulare** (ICS 201, NIMS ICS Forms Booklet)
- **CDC** (Wasser, Food and Water Emergency)
- **WHO** (EML Medikamentenliste)
- **IFRC** (First Aid Guidelines), **WHO/ICRC** (Basic Emergency Care)
- **BLE/BZL** (Garten DE), **UBA** (Kompost), **FAO**
- **NREL** (Energie-Reports), **HUD** (Gebäude), **EPA** (Renovierung), **USDA** (Wood Handbook)
- **Energy.gov** (Fuel Storage)
- **BBK** (Ratgeber Notfallvorsorge DE), **DGUV** (Erste-Hilfe-Handbuch 204-007)

**Hinweis Server:** Wenn `/opt/project-nomad/storage/nomad_data` nicht existiert oder nicht beschreibbar ist, das Skript mit einem anderen Ziel ausführen (z.B. `./install/download-nomad-data-pdfs.sh /home/nomad/nomad_data`). Anschließend Verzeichnis mit Root anlegen und Daten verschieben:  
`sudo mkdir -p /opt/project-nomad/storage/nomad_data && sudo chown nomad:nomad /opt/project-nomad/storage/nomad_data && sudo cp -a /home/nomad/nomad_data/. /opt/project-nomad/storage/nomad_data/`

## 3. RAG (Knowledge Base)

Die App indexiert alle unterstützten Dateien (PDF, Text, Bilder) **im gesamten Ordner** `NOMAD_DATA_PATH` (also auch 01_MEDIZIN, 04_SURVIVAL, 07_FUNK, 08_VORRAT, 10_EIGENE_PDFS_RAG usw.).  

Wenn du die heruntergeladenen PDFs auch in der Knowledge Base nutzen willst:

- `NOMAD_DATA_PATH` auf deinen NOMAD-DATA-Root setzen (z.B. `/opt/project-nomad/storage/nomad_data` oder `/home/nomad/nomad_data`). Die RAG-Sync durchsucht dann **alle** Unterordner (01_MEDIZIN, 04_SURVIVAL, 07_FUNK, …).

Anschließend in der App: **Knowledge Base → Scan and Sync**.

## 4. Ohne ZIM – manuell ablegen

Diese Inhalte haben **kein** automatisches Download-Skript (keine direkten PDF-URLs oder nur Webseiten). Bitte von Hand in NOMAD-DATA speichern (z.B. als PDF-Export oder SingleFile):

| Thema | Quelle |
|-------|--------|
| **MSD Manual DE** | https://www.msdmanuals.com/de/heim (Website) |
| **AWMF Leitlinien** | https://register.awmf.org/ (Einzel-PDFs pro Leitlinie) |
| **Meshtastic/LoRa** | https://meshtastic.org/docs/ |
| **ATAK/CivTAK** | tak.gov, CivTAK-Dokumentation |
| **Baofeng UV-5R** | Miklor, sn0wlink, radiodoc/uv-5r (siehe CATEGORIES-TODO.md) |
| **VDE/DEHN** | Wo frei verfügbar (oft Normen paywall) |
| **DARC Notfunk** | https://www.darc.de/der-club/referate/notfunk/dokumente/ (PDFs manuell von der Seite) |

Nach dem Speichern ggf. nach `10_EIGENE_PDFS_RAG` kopieren und **Scan and Sync** ausführen.

## 5. Österreich-Karte (PMTiles Extract, optional)

Für eine Offline-Karte nur Österreich: [pmtiles CLI](https://github.com/protomaps/go-pmtiles/releases) installieren, dann (wenn eine gültige Build-URL von [maps.protomaps.com/builds](https://maps.protomaps.com/builds) verfügbar ist):

```bash
pmtiles extract "https://build.protomaps.com/YYYYMMDD.pmtiles" austria.pmtiles --bbox=9.53,46.37,17.16,49.02
```

Datei nach `storage/maps/pmtiles/` legen und in der App unter Einstellungen → Karten hinzufügen.
