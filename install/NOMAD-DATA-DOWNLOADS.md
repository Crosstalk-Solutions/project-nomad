# NOMAD-DATA PDFs & Docs herunterladen

Dieses Skript lädt alle in `nomad-data-pdf-urls.txt` eingetragenen PDFs und Ressourcen in eine NOMAD-DATA-Ordnerstruktur.

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

Die App indexiert nur Inhalte unter **`NOMAD_DATA_PATH/10_EIGENE_PDFS_RAG`**.  

Wenn du die heruntergeladenen PDFs auch in der Knowledge Base nutzen willst:

- Entweder **Kopien/Symlinks** der gewünschten PDFs nach `NOMAD-DATA/10_EIGENE_PDFS_RAG/` legen (z.B. Unterordner `Survival`, `Funk`, `Medizin`),  
- oder `NOMAD_DATA_PATH` auf deinen NOMAD-DATA-Root setzen und in der App nur diesen einen Baum nutzen; dann müsste die RAG-Logik um weitere Ordner (z.B. 04_SURVIVAL, 07_FUNK) erweitert werden.

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
