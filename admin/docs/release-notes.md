# Release Notes

## Version 1.10.1 - December 5, 2025

### ✨ Improvements
1. This is a test
- **Kiwix**: ZIM storage path

---

## Version 1.10.0 - December 5, 2025

### 🚀 Features

- Disk info monitoring

### ✨ Improvements

- **Install**: Add Redis env variables to compose file
- **Kiwix**: initial download and setup

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
- **Collections**: Curated ZIM Collections
- **Collections**: add Preppers Library
- **Collections**: add slug, icon, and language
- **Collections**: store additional data with resources list
- Custom map and ZIM file downloads (WIP)
- New maps system (WIP)

### ✨ Improvements

- **DockerService**: cleanup old OSM stuff
- **Install**: standardize compose file names
- Hide query devtools in prod

---

## Version 1.7.0 - December 5, 2025

### 🚀 Features

- Alert and button styles redesign
- System info page redesign
- **Collections**: Curated ZIM Collections
- **Collections**: add Preppers Library
- **Collections**: add slug, icon, and language
- **Collections**: store additional data with resources list
- Custom map and ZIM file downloads (WIP)
- New maps system (WIP)

### ✨ Improvements

- **DockerService**: cleanup old OSM stuff
- **Install**: standardize compose file names
- Hide query devtools in prod

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

- **Scripts**: logs directory creation improvements
- **Scripts**: fix type in management-compose file path

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

- 📧 Email: support@projectnomad.com
- 🐛 Bug Reports: [GitHub Issues](https://github.com/Crosstalk-Solutions/project-nomad/issues)

---

*For previous release notes, see our [changelog archive](https://github.com/Crosstalk-Solutions/project-nomad/releases).*