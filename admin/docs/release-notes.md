# Release Notes

## Version 1.23.0 - February 5, 2026

### 🚀 Features

- **Maps**: Maps now use full page by default
- **Navigation**: Added "Back to Home" link on standard header pages
- **AI**: Fuzzy search for AI models list
- **UI**: Improved global error reporting with user notifications

### 🐛 Bug Fixes

- **Kiwix**: Avoid restarting the Kiwix container while download jobs are running
- **Docker**: Ensure containers are fully removed on failed service install
- **AI**: Filter cloud models from API response and fallback model list
- **Curated Collections**: Prevent duplicate resources when fetching latest collections
- **Content Tiers**: Rework tier system to dynamically determine install status on the server side

### ✨ Improvements

- **Docs**: Added pretty rendering for markdown tables in documentation pages

---

## Version 1.22.0 - February 4, 2026

### 🚀 Features

- **Content Manager**: Display friendly names (Title and Summary) instead of raw filenames for ZIM files
- **AI Knowledge Base**: Automatically add NOMAD documentation to AI Knowledge Base on install

### 🐛 Bug Fixes

- **Maps**: Ensure map asset URLs resolve correctly when accessed via hostname
- **Wikipedia**: Prevent loading spinner overlay during download
- **Easy Setup**: Scroll to top when navigating between wizard steps
- **AI Chat**: Hide chat button and page unless AI Assistant is actually installed
- **Settings**: Rename confusing "Port" column to "Location" in Apps Settings

### ✨ Improvements

- **Ollama**: Cleanup model download logic and improve progress tracking

---

## Version 1.21.0 - February 2, 2026

### 🚀 Features

- **AI Assistant**: Built-in AI chat interface — no more separate Open WebUI app
- **Knowledge Base**: Document upload with OCR, semantic search (RAG), and contextual AI responses via Qdrant
- **Wikipedia Selector**: Dedicated Wikipedia content management with smart package selection
- **GPU Support**: NVIDIA and AMD GPU passthrough for Ollama (faster AI inference)

### 🐛 Bug Fixes

- **Benchmark**: Detect Intel Arc Graphics on Core Ultra processors
- **Easy Setup**: Remove built-in System Benchmark from wizard (now in Settings)
- **Icons**: Switch to Tabler Icons for consistency, remove unused icon libraries
- **Docker**: Avoid re-pulling existing images during install

### ✨ Improvements

- **Ollama**: Fallback list of recommended models if api.projectnomad.us is down
- **Ollama/Qdrant**: Docker images pinned to specific versions for stability
- **README**: Added website and community links
- Removed Open WebUI as a separate installable app (replaced by built-in AI Chat)

---

## Version 1.20.0 - January 28, 2026

### 🚀 Features

- **Collections**: Expanded curated categories with more content and improved tier selection modal UX
- **Legal**: Expanded Legal Notices and moved to bottom of Settings sidebar

### 🐛 Bug Fixes

- **Install**: Handle missing curl dependency on fresh Ubuntu installs
- **Migrations**: Fix timestamp ordering for builder_tag migration

---

## Version 1.19.0 - January 28, 2026

### 🚀 Features

- **Benchmark**: Builder Tag system — claim leaderboard spots with NOMAD-themed tags (e.g., "Tactical-Llama-1234")
- **Benchmark**: Full benchmark with AI now required for community sharing; HMAC-signed submissions
- **Release Notes**: Subscribe to release notes via email
- **Maps**: Automatically download base map assets if missing

### 🐛 Bug Fixes

- **System Info**: Fall back to fsSize when disk array is empty (fixes "No storage devices detected")

---

## Version 1.18.0 - January 24, 2026

### 🚀 Features

- **Collections**: Improved curated collections UX with persistent tier selection and submit-to-confirm workflow

### 🐛 Bug Fixes

- **Benchmark**: Fix AI benchmark connectivity (Docker container couldn't reach Ollama on host)
- **Open WebUI**: Fix install status indicator

### ✨ Improvements

- **Docker**: Container URL resolution utility and networking improvements

---

## Version 1.17.0 - January 23, 2026

### 🚀 Features

- **System Benchmark**: Hardware scoring with NOMAD Score, circular gauges, and community leaderboard submission
- **Dashboard**: User-friendly app names with "Powered by" open source attribution
- **Settings**: Updated nomenclature and added tiered content collections to Settings pages
- **Queues**: Support working all queues with a single command

### 🐛 Bug Fixes

- **Easy Setup**: Select valid primary disk for storage projection bar
- **Docs**: Remove broken service links that pointed to invalid routes
- **Notifications**: Improved styling
- **UI**: Remove splash screen
- **Maps**: Static path resolution fix

---

## Version 1.16.0 - January 20, 2026

### 🚀 Features

- **Apps**: Force-reinstall option for installed applications
- **Open WebUI**: Manage Ollama models directly from Command Center
- **Easy Setup**: Show selected AI model size in storage projection bar

### ✨ Improvements

- **Curated Categories**: Improved fetching from GitHub
- **Build**: Added dockerignore file

---

## Version 1.15.0 - January 19, 2026

### 🚀 Features

- **Easy Setup Wizard**: Redesigned Step 1 with user-friendly capability cards instead of app names
- **Tiered Collections**: Category-based content collections with Essential, Standard, and Comprehensive tiers
- **Storage Projection Bar**: Visual disk usage indicator showing projected additions during Easy Setup
- **Windows Support**: Docker Desktop support for local development with platform detection and NOMAD_STORAGE_PATH env var
- **Documentation**: Comprehensive in-app documentation (Home, Getting Started, FAQ, Use Cases)

### ✨ Improvements

- **Easy Setup**: Renamed step 3 label from "ZIM Files" to "Content"
- **Notifications**: Fixed auto-dismiss not working due to stale closure
- Added Survival & Preparedness and Education & Reference content categories

---

## Version 1.14.0 - January 16, 2026

### 🚀 Features

- **Collections**: Auto-fetch latest curated collections from GitHub

### 🐛 Bug Fixes

- **Docker**: Improved container state management

---

## Version 1.13.0 - January 15, 2026

### 🚀 Features

- **Easy Setup Wizard**: Initial implementation of the guided first-time setup experience
- **Maps**: Enhanced missing assets warnings
- **Apps**: Improved app cards with custom icons

### 🐛 Bug Fixes

- **Curated Collections**: UI tweaks
- **Install**: Changed admin container pull_policy to always

---

## Version 1.12.0 - 1.12.3 - December 24, 2025 - January 13, 2026

### 🚀 Features

- **System**: Check internet status on backend with custom test URL support

### 🐛 Bug Fixes

- **Admin**: Improved service install status management
- **Admin**: Improved duplicate install request handling
- **Admin**: Fixed base map assets download URL
- **Admin**: Fixed port binding for Open WebUI
- **Admin**: Improved memory usage indicators
- **Admin**: Added favicons
- **Admin**: Fixed container healthcheck
- **Admin**: Fixed missing ZIM download API client method
- **Install**: Fixed disk info file mount and stability
- **Install**: Ensure update script always pulls latest images
- **Install**: Use modern docker compose command in update script
- **Install**: Ensure update script is executable
- **Scripts**: Remove disk info file on uninstall

---

## Version 1.11.0 - 1.11.1 - December 24, 2025

### 🚀 Features

- **Maps**: Curated map region collections
- **Collections**: Map region collection definitions

### 🐛 Bug Fixes

- **Maps**: Fixed custom pmtiles file downloads
- **Docs**: Documentation renderer fixes

---

## Version 1.10.1 - December 5, 2025

### ✨ Improvements
- **Kiwix**: ZIM storage path improvements

---

## Version 1.10.0 - December 5, 2025

### 🚀 Features

- Disk info monitoring

### ✨ Improvements

- **Install**: Add Redis env variables to compose file
- **Kiwix**: Initial download and setup

---

## Version 1.9.0 - December 5, 2025

### 🚀 Features

- Background job management with BullMQ

### ✨ Improvements

- **Install**: Character escaping in env variables
- **Install**: Host env variable

---

## Version 1.8.0 - December 5, 2025

### 🚀 Features

- Alert and button styles redesign
- System info page redesign
- **Collections**: Curated ZIM Collections with slug, icon, and language support
- Custom map and ZIM file downloads (WIP)
- New maps system (WIP)

### ✨ Improvements

- **DockerService**: Cleanup old OSM stuff
- **Install**: Standardize compose file names

---

## Version 1.7.0 - December 5, 2025

### 🚀 Features

- Alert and button styles redesign
- System info page redesign
- **Collections**: Curated ZIM Collections
- Custom map and ZIM file downloads (WIP)
- New maps system (WIP)

### ✨ Improvements

- **DockerService**: Cleanup old OSM stuff
- **Install**: Standardize compose file names

---

## Version 1.6.0 - November 18, 2025

### 🚀 Features

- Added Kolibri to standard app library

### ✨ Improvements

- Standardize container names in management-compose

---

## Version 1.5.0 - November 18, 2025

### 🚀 Features

- Version footer and fix CI version handling

---

## Version 1.4.0 - November 18, 2025

### 🚀 Features

- **Services**: Friendly names and descriptions

### ✨ Improvements

- **Scripts**: Logs directory creation improvements
- **Scripts**: Fix typo in management-compose file path

---

## Version 1.3.0 - October 9, 2025

### 🚀 New Features

- Uninstall script now removes non-management Nomad app containers

### ✨ Improvements

- **OpenStreetMap**: Apply dir permission fixes more robustly

---

## Version 1.2.0 - October 7, 2025

### 🚀 New Features

- Added CyberChef to standard app library
- Added Dozzle to core containers for enhanced logs and metrics
- Added FlatNotes to standard app library
- Uninstall helper script available

### ✨ Improvements

- **OpenStreetMap**:
    - Fixed directory paths and access issues
    - Improved error handling
    - Fixed renderer file permissions
    - Fixed absolute host path issue
- **ZIM Manager**:
    - Initial ZIM download now hosted in Project Nomad GitHub repo for better availability

---

## Version 1.1.0 - August 20, 2025

### 🚀 New Features

**OpenStreetMap Installation**
- Added OpenStreetMap to installable applications
- Automatically downloads and imports US Pacific region during installation.
- Supports rendered tile caching for enhanced performance.

### ✨ Improvements

- **Apps**: Added start/stop/restart controls for each application container in settings
- **ZIM Manager**: Error-handling/resumable downloads + enhanced UI
- **System**: You can now view system information such as CPU, RAM, and disk stats in settings
- **Legal**: Added legal notices in settings
- **UI**: Added general UI enhancements such as alerts and error dialogs
- Standardized container naming to reduce potential for conflicts with existing containers on host system

### ⚠️ Breaking Changes

- **Container Naming**: As a result of standardized container naming, it is recommend that you do a fresh install of Project N.O.M.A.D. and any apps to avoid potential conflicts/duplication of containers

### 📚 Documentation

- Added release notes page

---

## Version 1.0.1 - July 11, 2025

### 🐛 Bug Fixes

- **Docs**: Fixed doc rendering
- **Install**: Fixed installation script URLs
- **OpenWebUI**: Fixed Ollama connection

---

## Version 1.0.0 - July 11, 2025

### 🚀 New Features

- Initial alpha release for app installation and documentation
- OpenWebUI, Ollama, Kiwix installation
- ZIM downloads & management

---

## Support

- **Discord:** [Join the Community](https://discord.com/invite/crosstalksolutions) — Get help, share your builds, and connect with other NOMAD users
- **Bug Reports:** [GitHub Issues](https://github.com/Crosstalk-Solutions/project-nomad/issues)
- **Website:** [www.projectnomad.us](https://www.projectnomad.us)

---

*For the full changelog, see our [GitHub releases](https://github.com/Crosstalk-Solutions/project-nomad/releases).*
