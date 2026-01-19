# Frequently Asked Questions

## General Questions

### What is N.O.M.A.D.?
N.O.M.A.D. (Node for Offline Media, Archives, and Data) is a personal server that gives you access to knowledge, education, and AI assistance without requiring an internet connection. It runs on your own hardware, keeping your data private and accessible anytime.

### Do I need internet to use N.O.M.A.D.?
No — that's the whole point. Once your content is downloaded, everything works offline. You only need internet to:
- Download new content
- Update the software
- Sync the latest versions of Wikipedia, maps, etc.

### What hardware do I need?
N.O.M.A.D. is designed for capable hardware, especially if you want to use the AI features. Recommended:
- Modern multi-core CPU
- 16GB+ RAM (32GB+ for best AI performance)
- SSD storage (size depends on content — 500GB minimum, 2TB+ recommended)
- GPU recommended for faster AI responses

### How much storage do I need?
It depends on what you download:
- Full Wikipedia: ~95GB
- Khan Academy courses: ~50GB
- Medical references: ~500MB
- US state maps: ~2-3GB each
- AI models: 10-40GB depending on model

Start with essentials and add more as needed.

---

## Content Questions

### How do I add more Wikipedia content?
1. Go to **Settings** (hamburger menu → Settings)
2. Click **ZIM Manager**
3. Browse available content
4. Click Download on items you want

### How do I add more educational courses?
1. Open **Kolibri**
2. Sign in as an admin
3. Go to **Device → Channels**
4. Browse and import available channels

### How current is the content?
Content is as current as when it was last downloaded. Wikipedia snapshots are typically updated monthly. Check the file names or descriptions for dates.

### Can I add my own files?
Currently, N.O.M.A.D. uses standard content formats (ZIM files for Kiwix, Kolibri channels for education). Custom content support may be added in future versions.

---

## Troubleshooting

### A feature isn't loading or shows a blank page

**Try these steps:**
1. Wait 30 seconds — some features take time to start
2. Refresh the page (Ctrl+R or Cmd+R)
3. Go back to the Command Center and try again
4. Check Settings → System to see if the service is running
5. Try restarting the service (Stop, then Start in Apps manager)

### Maps show a gray/blank area

The Maps feature requires downloaded map data. If you see a blank area:
1. Go to **Settings → Maps Manager**
2. Download map regions for your area
3. Wait for downloads to complete
4. Return to Maps and refresh

### AI responses are slow

Local AI requires significant computing power. To improve speed:
- Close other applications on the server
- Ensure adequate cooling (overheating causes throttling)
- Consider using a smaller/faster AI model if available
- Add a GPU if your hardware supports it

### "Service unavailable" or connection errors

The service might still be starting up. Wait 1-2 minutes and try again.

If the problem persists:
1. Go to **Settings → Apps**
2. Find the problematic service
3. Click **Restart**
4. Wait 30 seconds, then try again

### Downloads are stuck or failing

1. Check your internet connection
2. Go to **Settings** and check available storage
3. If storage is full, delete unused content
4. Cancel the stuck download and try again

### The server won't start

If you can't access the Command Center at all:
1. Verify the server hardware is powered on
2. Check network connectivity
3. Try accessing directly via the server's IP address
4. Check server logs if you have console access

### I forgot my Kolibri password

Kolibri passwords are managed separately:
1. If you're an admin, you can reset user passwords in Kolibri's user management
2. If you forgot the admin password, you may need to reset it via command line (contact your administrator)

---

## Updates and Maintenance

### How do I update N.O.M.A.D.?
1. Go to **Settings → Check for Updates**
2. If an update is available, click to install
3. The system will download updates and restart automatically
4. This typically takes 2-5 minutes

### Should I update regularly?
Yes, while you have internet access. Updates include:
- Bug fixes
- New features
- Security improvements
- Performance enhancements

### How do I update content (Wikipedia, etc.)?
Content updates are separate from software updates:
1. Go to **Settings → ZIM Manager**
2. Check for newer versions of your installed content
3. Download updated versions as needed

Tip: New Wikipedia snapshots are released approximately monthly.

### What happens if an update fails?
The system is designed to recover gracefully. If an update fails:
1. The previous version should continue working
2. Try the update again later
3. Check Settings → System for error messages

### Command-Line Maintenance

For advanced troubleshooting or when you can't access the web interface, N.O.M.A.D. includes helper scripts in `/opt/project-nomad`:

**Start all services:**
```bash
sudo bash /opt/project-nomad/start_nomad.sh
```

**Stop all services:**
```bash
sudo bash /opt/project-nomad/stop_nomad.sh
```

**Update Command Center:**
```bash
sudo bash /opt/project-nomad/update_nomad.sh
```
*Note: This updates the Command Center only, not individual apps. Update apps through the web interface.*

**Uninstall N.O.M.A.D.:**
```bash
curl -fsSL https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/master/install/uninstall_nomad.sh -o uninstall_nomad.sh
sudo bash uninstall_nomad.sh
```
*Warning: This cannot be undone. All data will be deleted.*

---

## Privacy and Security

### Is my data private?
Yes. N.O.M.A.D. runs entirely on your hardware. Your searches, AI conversations, and usage data never leave your server.

### Can others access my server?
By default, N.O.M.A.D. is accessible on your local network. Anyone on the same network can access it. For public networks, consider additional security measures.

### Does the AI send data anywhere?
No. The AI runs completely locally. Your conversations are not sent to any external service.

---

## Getting More Help

### The AI can help
Try asking Open WebUI for help. The local AI can answer questions about many topics, including technical troubleshooting.

### Check the documentation
You're in the docs now. Use the menu to find specific topics.

### Release Notes
See what's changed in each version: **[Release Notes](/docs/release-notes)**
