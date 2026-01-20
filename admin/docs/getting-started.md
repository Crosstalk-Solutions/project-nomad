# Getting Started with N.O.M.A.D.

This guide will help you install and set up your N.O.M.A.D. server.

---

## Installation

### System Requirements

N.O.M.A.D. runs on any **Debian-based Linux** system (Ubuntu recommended). The installation is terminal-based, and everything is accessed through a web browser — no desktop environment needed.

**Minimum Specs** (Command Center only):
- 2 GHz dual-core processor
- 4 GB RAM
- 5 GB free storage
- Internet connection (for initial install)

**Recommended Specs** (with AI features):
- AMD Ryzen 7 / Intel Core i7 or better
- 32 GB RAM
- NVIDIA RTX 3060 or better (more VRAM = larger AI models)
- 250 GB+ free storage (SSD preferred)

The Command Center itself is lightweight — your hardware requirements depend on which tools and content you choose to install.

### Install N.O.M.A.D.

Open a terminal and run these two commands:

```bash
curl -fsSL https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/master/install/install_nomad.sh -o install_nomad.sh
```

```bash
sudo bash install_nomad.sh
```

That's it. Once the install finishes, open a browser and go to:

- **Same machine:** `http://localhost:8080`
- **Other devices on your network:** `http://YOUR_SERVER_IP:8080`

### About Internet & Privacy

N.O.M.A.D. is designed for offline use. Internet is only needed:
- During initial installation
- When downloading additional content

There is **zero telemetry** — your data stays on your device.

### About Security

N.O.M.A.D. has no built-in authentication — it's designed to be open and accessible. If you expose it on a network, consider using firewall rules to control which ports are accessible.

---

## After Installation

### 1. Run the Easy Setup Wizard

If this is your first time using N.O.M.A.D., the Easy Setup wizard will help you:
- Choose which apps to enable
- Download map regions for your area
- Select knowledge collections (Wikipedia, medical references, etc.)

**[Launch Easy Setup →](/easy-setup)**

The wizard walks you through four simple steps:
1. **Apps** — Choose additional tools like CyberChef or FlatNotes
2. **Maps** — Select geographic regions for offline maps
3. **ZIM Files** — Choose reference collections (Wikipedia, medical, survival guides)
4. **Review** — Confirm your selections and start downloading

### 2. Wait for Downloads to Complete

Depending on what you selected, downloads may take a while. You can:
- Monitor progress in the Settings area
- Continue using features that are already installed
- Leave your server running overnight for large downloads

### 3. Explore Your Content

Once downloads complete, you're ready to go. Your content works offline whenever you need it.

---

## Understanding Your Tools

### Kiwix — Your Offline Library

Kiwix stores compressed versions of websites and references that work without internet.

**What's included:**
- Full Wikipedia (millions of articles)
- Medical references and first aid guides
- How-to guides and survival information
- Classic books from Project Gutenberg

**How to use it:**
1. Click **Kiwix** from the Command Center home screen or [Apps](/settings/apps) page
2. Choose a collection (like Wikipedia)
3. Search or browse just like the regular website

---

### Kolibri — Offline Education

Kolibri provides complete educational courses that work offline.

**What's included:**
- Khan Academy video courses
- Math, science, reading, and more
- Progress tracking for learners
- Works for all ages

**How to use it:**
1. Click **Kolibri** from the Command Center home screen or [Apps](/settings/apps) page
2. Sign in or create a learner account
3. Browse courses and start learning

**Tip:** Kolibri supports multiple users. Create accounts for each family member to track individual progress.

---

### Open WebUI — Your AI Assistant

Chat with a local AI that runs entirely on your server — no internet needed.

**What can it do:**
- Answer questions on any topic
- Explain complex concepts simply
- Help with writing and editing
- Brainstorm ideas
- Assist with problem-solving

**How to use it:**
1. Click **Open WebUI** from the Command Center home screen or [Apps](/settings/apps) page
2. Type your question or request
3. The AI responds in conversational style

**Tip:** Be specific in your questions. Instead of "tell me about plants," try "what vegetables grow well in shade?"

---

### Maps — Offline Navigation

View maps without internet. Download the regions you need before going offline.

**How to use it:**
1. Click **Maps** from the Command Center
2. Navigate by dragging and zooming
3. Search for locations using the search bar

**To add more map regions:**
1. Go to **Settings → Maps Manager**
2. Select the regions you need
3. Click Download

**Tip:** Download maps for areas you travel to frequently, plus neighboring regions just in case.

**[Open Maps →](/maps)**

---

## Managing Your Server

### Adding More Content

As your needs change, you can add more content anytime:

- **More apps:** Settings → Apps
- **More references:** Settings → ZIM Manager
- **More map regions:** Settings → Maps Manager
- **More educational content:** Through Kolibri's built-in content browser

### Keeping Things Updated

While you have internet, periodically check for updates:

1. Go to **Settings → Check for Updates**
2. If updates are available, click to install
3. Wait for the update to complete (your server will restart)

Content updates (Wikipedia, maps, etc.) can be managed separately from software updates.

### Monitoring System Health

Check on your server anytime:

1. Go to **Settings → System**
2. View CPU, memory, and storage usage
3. Check system uptime and status

---

## Tips for Best Results

### Before Going Offline

- **Update everything** — Run software and content updates
- **Download what you need** — Maps, references, educational content
- **Test it** — Make sure features work while you still have internet to troubleshoot

### Storage Management

Your server has limited storage. Prioritize:
- Content you'll actually use
- Critical references (medical, survival)
- Maps for your region
- Educational content matching your needs

Check storage usage in **Settings → System**.

### Getting Help

- **In-app docs:** You're reading them now
- **AI assistant:** Ask Open WebUI for help with almost anything
- **Release notes:** See what's new in each version

---

## Next Steps

You're ready to use N.O.M.A.D. Here are some things to try:

1. **Look something up** — Search for a topic in Kiwix
2. **Learn something** — Start a Khan Academy course in Kolibri
3. **Ask a question** — Chat with the AI in Open WebUI
4. **Explore maps** — Find your neighborhood in the Maps viewer

Enjoy your offline knowledge server!
