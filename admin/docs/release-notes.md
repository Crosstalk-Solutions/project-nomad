# Release Notes

## Unreleased

### Features
- **AI Assistant**: Added support for remote OpenAI-compatible hosts (e.g. Ollama, LM Studio, etc.) to support running models on seperate hardware from the Command Center host. Thanks @hestela for the contribution!
- **AI Assistant**: Disabled Ollama Cloud support (not compatible with NOMAD's architecture) and added support for flash_attn to improve performance of compatible models. Thanks @hestela for the contribution!
- **Information Library (Kiwix)**: The Kiwix container now uses an XML library file approach instead of a glob-based approach to inform the Kiwix container of available ZIM files. This allows for much more robust handling of ZIM files and avoids issues with the container failing to start due to incomplete/corrupt ZIM files being present in the storage directory. Thanks @jakeaturner for the contribution!
- **RAG**: Added support for EPUB file embedding into the Knowledge Base. Thanks @arn6694 for the contribution!
- **RAG**: Added support for multiple file uploads (<=5, 100mb each) to the Knowledge Base. Thanks @jakeaturner for the contribution!
- **Maps**: The global map file can now be downloaded directly from PMTiles for users who want to the full map and/or regions outside of the U.S. that haven't been added to the curated collections yet. Thanks @bgauger for the contribution!
- **Downloads**: Added support/improvements for rich progress, friendly names, cancellation, and live status updates for active downloads in the UI. Thanks @chriscrosstalk for the contribution!
- **UI**: Converted all PNGs to WEBP for reduced image sizes and improved performance. Thanks @hestela for the contribution!
- **UI**: Added an Installed Models section to AI Assistant settings. Thanks @chriscrosstalk for the contribution!

### Bug Fixes
- **Maps**: The maps API endpoints now properly check for "X-Forwarded-Proto" to support scenarios where the Command Center is behind a reverse proxy that terminates TLS. Thanks @davidgross for the fix!
- **Queue**: Increased the BullMQ lockDuration to prevent jobs from being killed prematurely on slower systems. Thanks @bgauger for the contribution!
- **Queue**: Added better handling for very large downloads and user-initated cancellations. Thanks @bgauger for the contribution!
- **Install**: The install script now checks for the presence of gpg (required for NVIDIA toolkit install) and automatically attempts to install it if it's missing. Thanks @chriscrosstalk for the fix!
- **Security**: Added key validation to the settings read API endpoint. Thanks @LuisMIguelFurlanettoSousa for the fix!
- **Security**: Improved URL validation logic for ZIM downloads to prevent SSRF vulnerabilities. Thanks @sebastiondev for the fix!
- **UI**: Fixed the activity feed height in Easy Setup and added automatic scrolling to the latest message during installation. Thanks @chriscrosstalk for the contribution!

### Improvements

- **Dependencies**: Updated various dependencies to close security vulnerabilities and improve stability
- **Docker**: NOMAD now adds 'com.docker.compose.project': 'project-nomad-managed' and 'io.project-nomad.managed': 'true' labels to all containers installed via the Command Center to improve compatibility with other Docker management tools and make it easier to identify and manage NOMAD containers. Thanks @techyogi for the contribution!
- **Docs**: Added a simple API reference for power users and developers. Thanks @hestela for the contribution!
- **Docs**: Re-formatted the Quick Install command into multiple lines for better readability in the README. Thanks @samsara-02 for the contribution!
- **Docs**: Updated the CONTRIBUTING and FAQ guides with the latest information and clarified some common questions. Thanks @jakeaturner for the contribution!
- **Ops**: Bumped GitHub Actions to their latest versions. Thanks @salmanmkc for the contribution!
- **Performance**: Shrunk the bundle size of the Command Center UI significantly by optimizing dependencies and tree-shaking, resulting in faster load times and a snappier user experience. Thanks @jakeaturner for the contribution!
- **Performance**: Implemented gzip compression by default for all HTTP registered routes from the Command Center backend to further improve performance, especially on slower connections. The DISABLE_COMPRESSION environment variable can be used to turn off this feature if needed. Thanks @jakeaturner for the contribution!
- **Performance**: Added light caching of certain Docker socket interactions and custom AI Assistant name resolution to improve performance and reduce redundant calls to the Docker API. Thanks @jakeaturner for the contribution!
- **Performance**: Switched to Inertia router navigation calls where appropriate to take advantage of Inertia's built-in caching and performance optimizations for a smoother user experience. Thanks @jakeaturner for the contribution!

## Version 1.30.3 - March 25, 2026

### Features

### Bug Fixes
- **Benchmark**: Fixed an issue where CPU and Disk Write scores could be displayed as 0 if the measured values was less than half of the reference mark. Thanks @bortlesboat for the fix!
- **Content Manager**: Fixed a missing API client method that was causing ZIM file deletions to fail. Thanks @LuisMIguelFurlanettoSousa for the fix!
- **Install**: Fixed an issue where the install script could incorrectly report the Docker NVIDIA runtime as missing. Thanks @brenex for the fix!
- **Support the Project**: Fixed a broken link to Rogue Support. Thanks @chriscrosstalk for the fix!

### Improvements
- **AI Assistant**: Improved error reporting and handling for model downloads. Thanks @chriscrosstalk for the contribution!
- **AI Assistant**: Bumped the default version of Ollama installed to v0.18.1 to take advantage of the latest performance improvements and bug fixes.
- **Apps**: Improved error reporting and handling for service installation failures. Thanks @trek-e for the contribution!
- **Collections**: Updated various curated collection links to their latest versions. Thanks @builder555 for the contribution!
- **Cyberchef**: Bumped the default version of CyberChef installed to v10.22.1 to take advantage of the latest features and bug fixes.
- **Docs**: Added a link to the step-by-step installation guide and video tutorial. Thanks @chriscrosstalk for the contribution!
- **Install**: Increased the retries limit for the MySQL service in Docker Compose to improve stability during installation on systems with slower performance. Thanks @dx4956 for the contribution!
- **Install**: Fixed an issue where stale data could cause credentials mismatch in MySQL on reinstall. Thanks @chriscrosstalk for the fix!

## Version 1.30.0 - March 20, 2026

### Features
- **Night Ops**: Added our most requested feature — a dark mode theme for the Command Center interface! Activate it from the footer and enjoy the sleek new look during your late-night missions. Thanks @chriscrosstalk for the contribution!
- **Debug Info**: Added a new "Debug Info" modal accessible from the footer that provides detailed system and application information for troubleshooting and support. Thanks @chriscrosstalk for the contribution!
- **Support the Project**: Added a new "Support the Project" page in settings with links to community resources, donation options, and ways to contribute.
- **Install**: The main Nomad image is now fully self-contained and directly usable with Docker Compose, allowing for more flexible and customizable installations without relying on external scripts. The image remains fully backwards compatible with existing installations, and the install script has been updated to reflect the simpler deployment process.

### Bug Fixes
- **Settings**: Storage usage display now prefers real block devices over tempfs. Thanks @Bortlesboat for the fix!
- **Settings**: Fixed an issue where device matching and mount entry deduplication logic could cause incorrect storage usage reporting and missing devices in storage displays.
- **Maps**: The Maps page now respects the request protocol (http vs https) to ensure map tiles load correctly. Thanks @davidgross for the bug report!
- **Knowledge Base**: Fixed an issue where file embedding jobs could cause a retry storm if the Ollama service was unavailable. Thanks @skyam25 for the bug report!
- **Curated Collections**: Fixed some broken links in the curated collections definitions (maps and ZIM files) that were causing some resources to fail to download.
- **Easy Setup**: Fixed an issue where the "Start Here" badge would persist even after visiting the Easy Setup Wizard for the first time. Thanks @chriscrosstalk for the fix!
- **UI**: Fixed an issue where the loading spinner could look strange in certain use cases.
- **System Updates**: Fixed an issue where the update banner would persist even after the system was updated successfully. Thanks @chriscrosstalk for the fix!
- **Performance**: Various small memory leak fixes and performance improvements across the UI to ensure a smoother experience.

### Improvements
- **Ollama**: Improved GPU detection logic to ensure the latest GPU config is always passed to the Ollama container on update
- **Ollama**: The detected GPU type is now persisted in the database for more reliable configuration and troubleshooting across updates and restarts. Thanks @chriscrosstalk for the contribution!
- **Downloads**: Users can now dismiss failed download notifications to reduce clutter in the UI. Thanks @chriscrosstalk for the contribution!
- **Logging**: Changed the default log level to "info" to reduce noise and focus on important messages. Thanks @traxeon for the suggestion!
- **Logging**: Nomad's internal logger now creates it's own log directory on startup if it doesn't already exist to prevent errors on fresh installs where the logs directory hasn't been created yet.
- **Dozzle**: Dozzle shell access and container actions are now disabled by default. Thanks @traxeon for the recommendation!
- **MySQL & Redis**: Removed port exposure to host by default for improved security. Ports can still be exposed manually if needed. Thanks @traxeon for the recommendation!
- **Dependencies**: Various dependency updates to close security vulnerabilities and improve stability
- **Utility Scripts**: Added a check for the expected Docker Compose version (v2) in all utility scripts to provide clearer error messages and guidance if the environment is not set up correctly.
- **Utility Scripts**: Added an additional warning to the installation script to inform about potential overwriting of existing customized configurations and the importance of backing up data before running the installation script again.
- **Documentation**: Updated installation instructions to reflect the new option for manual deployment via Docker Compose without the install script.


## Version 1.29.0 - March 11, 2026

### Features
- **AI Assistant**: Added improved user guidance for troubleshooting GPU pass-through issues
- **AI Assistant**: The last used model is now automatically selected when a new chat is started
- **Settings**: Nomad now automatically performs nightly checks for available app updates, and users can select and apply updates from the Apps page in Settings

### Bug Fixes
- **Settings**: Fixed an issue where the AI Assistant settings page would be shown in navigation even if the AI Assistant was not installed, thus causing 404 errors when clicked
- **Security**: Path traversal and SSRF mitigations
- **AI Assistant**: Fixed an issue that was causing intermittent failures saving chat session titles

### Improvements
- **AI Assistant**: Extensive performance improvements and improved RAG intelligence/context usage

## Version 1.28.0 - March 5, 2026

### Features
- **RAG**: Added support for viewing active embedding jobs in the processing queue and improved job progress tracking with more granular status updates
- **RAG**: Added support for removing documents from the knowledge base (deletion from Qdrant and local storage)

### Bug Fixes
- **Install**: Fixed broken url's in install script and updated to prompt for Apache 2.0 license acceptance
- **Docs**: Updated legal notices to reflect Apache 2.0 license and added Qdrant attribution
- **Dependencies**: Various minor dependency updates to close security vulnerabilities

### Improvements
- **License**: Added Apache 2.0 license file to repository for clarity and legal compliance

## Version 1.27.0 - March 4, 2026

### Features
- **Settings**: Added pagination support for Ollama model list
- **Early Access Channel**: Allows users to opt in to receive early access builds with the latest features and improvements before they hit stable releases

### Bug Fixes

### Improvements
- **AI Assistant**: Improved chat performance by optimizing query rewriting and response streaming logic
- **CI/CD**: Updated release workflows to support release candidate versions
- **KV Store**: Improved type safety in KV store implementation

## Version 1.26.0 - February 19, 2026

### Features
- **AI Assistant**: Added support for showing reasoning stream for models with thinking capabilities
- **AI Assistant**: Added support for response streaming for improved UX

### Bug Fixes

### Improvements


## Version 1.25.2 - February 18, 2026

### Features

### Bug Fixes
- **AI Assistant**: Fixed an error from chat suggestions when no Ollama models are installed
- **AI Assistant**: Improved discrete GPU detection logic
- **UI**: Legacy links to /docs and /knowledge-base now gracefully redirect to the correct pages instead of showing 404 errors

### Improvements
- **AI Assistant**: Chat suggestions are now disabled by default to avoid overwhelming smaller hardware setups

## Version 1.25.1 - February 12, 2026

### Features

### Bug Fixes
- **Settings**: Fix potential stale cache issue when checking for system updates
- **Settings**: Improve user guidance during system updates

### Improvements


## Version 1.25.0 - February 12, 2026

### Features
- **Collections**: Complete overhaul of collection management with dynamic manifests, database tracking of installed resources, and improved UI for managing ZIM files and map assets
- **Collections**: Added support for checking if newer versions of installed resources are available based on manifest data
### Bug Fixes
- **Benchmark**: Improved error handling and status code propagation for better user feedback on submission failures
- **Benchmark**: Fix a race condition in the sysbench container management that could lead to benchmark test failures

### Improvements

---

## Version 1.24.0 - February 10, 2026

### 🚀 Features

- **AI Assistant**: Query rewriting for enhanced context retrieval
- **AI Assistant**: Allow manual scan and resync of Knowledge Base
- **AI Assistant**: Integrated Knowledge Base UI into AI Assistant page
- **AI Assistant**: ZIM content embedding into Knowledge Base
- **Downloads**: Display model download progress
- **System**: Cron job for automatic update checks
- **Docs**: Polished documentation rendering with desert-themed components

### 🐛 Bug Fixes

- **AI Assistant**: Chat suggestion performance improvements
- **AI Assistant**: Inline code rendering
- **GPU**: Detect NVIDIA GPUs via Docker API instead of lspci
- **Install**: Improve Docker GPU configuration
- **System**: Correct memory usage percentage calculation
- **System**: Show host OS, hostname, and GPU instead of container info
- **Collections**: Correct devdocs ZIM filenames in Computing & Technology
- **Downloads**: Sort active downloads by progress descending
- **Docs**: Fix multiple broken internal links and route references

### ✨ Improvements

- **Docs**: Overhauled in-app documentation with sidebar ordering
- **Docs**: Updated README with feature overview
- **GPU**: Reusable utility for running nvidia-smi

---

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
