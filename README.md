# Project N.O.M.A.D. (Node for Offline Media, Archives, and Data)
Project N.O.M.A.D., is a self-contained, offline survival computer packed with critical tools, knowledge, and AI to keep you informed and empowered—anytime, anywhere.

## Installation & Quickstart
Project N.O.M.A.D. can be installed on any Debian-based operating system (we recommend Ubuntu). Installation is completely terminal-based, and all tools and resources are designed to be accessed through the browser, so there's no need for a desktop environment if you'd rather setup N.O.M.A.D. as a "server" and access it through other clients.

*Note: sudo/root privileges are required to run the install script*

```bash
curl -fsSL https://raw.githubusercontent.com/CrosstalkSolutions/project-nomad/main/install/install/sh -o install_nomad.sh

sudo bash ./install_nomad.sh
```

Project N.O.M.A.D. is now installed on your device! Open a browser and navigate to `http://localhost:8080` (or `http://DEVICE_IP:8080`) to start exploring!

## How It Works
From a technical standpoint, N.O.M.A.D. is primarily a management UI and API that orchestrates a goodie basket of containerized offline archive tools and resources such as 
[Kiwix](https://kiwix.org/), [OpenStreetMap](https://www.openstreetmap.org/), [Ollama](https://ollama.com/), [OpenWebUI](https://openwebui.com/), and more.

By abstracting the installation of each of these awesome tools, N.O.M.A.D. makes getting your offline survival computer up and running a breeze! N.O.M.A.D. also includes some additional built-in handy tools, such as a ZIM library managment interface, calculators, and more.

## Device Requirements
While many similar offline survival computers are designed to be run on bare-minimum, lightweight hardware, Project N.O.M.A.D. is quite the opposite. To install and run the
available AI tools, we highly encourage the use of a beefy, GPU-backed device to make the most of your install.

At it's core, however, N.O.M.A.D. is still very lightweight. For a barebones installation of the management application itself, the following minimal specs are required:

*Note: Project N.O.M.A.D. is not sponsored by any hardware manufacturer and is designed to be as hardware-agnostic as possible. The harware listed below is for example/comparison use only*

#### Minimum Specs
- Processor: 2 GHz dual-core processor or better
- RAM: 4GB system memory
- Storage: At least 5 GB free disk space
- OS: Debian-based (Ubuntu recommended)
- Stable internet connection (required during install only)

To run LLM's and other included AI tools:

#### Optimal Specs
- Processor: AMD Ryzen 7 or Intel Core i7 or better
- RAM: 32 GB system memory
- Graphics: NVIDIA RTX 3060 or better (more VRAM = run larger models)
- Storage: At least 250 GB free disk space (preferably on SSD)
- OS: Debian-based (Ubuntu recommended)
- Stable internet connection (required during install only)

Again, Project N.O.M.A.D. itself is quite lightweight - it's the tools and resources you choose to install with N.O.M.A.D. that will determine the specs required for your unique deployment

## About Internet Usage & Privacy
Project N.O.M.A.D. is designed for offline usage. An internet connection is only required during the initial installation (to download dependencies) and if you (the user) decide to download additional tools and resources at a later time. Otherwise, N.O.M.A.D. does not require an internet connection and has ZERO built-in telemetry.

## About Security
By design, Project N.O.M.A.D. is intended to be open and available without hurdles - it includes no authentication. If you decide to connect your device to a local network after install (e.g. for allowing other devices to access it's resources), you can block/open ports to control which services are exposed.
