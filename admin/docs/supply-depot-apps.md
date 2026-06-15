# Supply Depot Apps

The Supply Depot is where you install extra apps onto your NOMAD beyond the built-in tools. Each app runs in its own container on your NOMAD, fully offline, and shows up with an **Open** button once it finishes installing.

This page covers what you need to know to get up and running with each app *on NOMAD specifically*: whether you log in, what the default credentials are, where your files end up, and anything you need to have on hand first. It does not cover how to use the apps themselves. Each app is its own open-source project with its own documentation, and we link out to that for every one.

A quick note on logins: some of these apps have their own accounts, separate from your NOMAD login. Where an app asks you to sign in, we tell you the starting credentials and whether you should change them.

---

## Managing your apps

Every app you install gets a **Manage** menu on its card. From there you can:

- **Docs** — jump straight to the NOMAD getting-started notes for that app (the same per-app sections you'll find below).
- **Edit** — change an app's settings: port mappings, volume binds, environment variables, and memory/CPU limits. This works for curated apps too, not just custom ones. Your edits are merged into the app's existing setup, so advanced settings (like GPU access on the AI Assistant) are preserved, and an edited app stops getting overwritten by catalog updates.
- **Logs** and **Stats** — open a live view of an app's log output or its current memory and CPU use, handy when something isn't behaving.
- **Update** and **Remove** — pull the latest version of an app, or remove it (optionally deleting its image too). If an update's new container fails to start, NOMAD automatically rolls back to the version that was working.

**Seeing what version you're running:** Each app card shows the installed version right next to the app name (for example, `Kiwix · 3.7.0`). When a newer version is available, an orange **Update available** pill appears on the card so it's easy to spot at a glance.

**Custom "Open" links:** By default the **Open** button points at the app on your NOMAD's own address. If you run a reverse proxy or local DNS and would rather open an app at a friendlier address (for example `https://jellyfin.myhomelab.net`), use **Manage › Edit** to set a custom launch URL. NOMAD keeps your original link safely on file, so you can always switch back, and the override sticks across upgrades.

**Keeping apps updated automatically:** Installed apps can update themselves hands-off. This is opt-in at two levels — a master switch in **Settings → Updates** and a per-app toggle in the Supply Depot — and only minor and patch updates are ever applied automatically (major versions always stay manual). See the [Updates guide](/docs/updates) for the full story.

---

## Bringing your own app

Beyond the curated catalog, the Supply Depot can run **your own Docker container** as a managed app alongside everything else. Click **Add a custom app** and tell NOMAD:

- the **image** to pull (for example `ghcr.io/owner/app:1.2.3`),
- any **port mappings**, **volume binds**, **environment variables**, and **memory/CPU limits** it needs.

As you fill it in, NOMAD runs a live pre-flight check and warns you about things like port conflicts or risky settings. Some warnings (an untrusted registry, or a `:latest` tag that can't be version-tracked) are advisory and you can choose **Install anyway**; genuinely unsafe configurations are blocked outright.

Once installed, a custom app behaves like any other: it gets the same **Manage** menu (Edit, Logs, Stats, Update, Remove), shows its version on the card, and can opt in to automatic updates. NOMAD hardens host-path binds and scopes logs and stats to its own managed containers, so a custom app can't reach outside what you give it.

> A custom app is exactly that — yours. NOMAD runs it and gets out of the way; it doesn't provide setup docs or support for software outside the curated catalog. Check the project's own documentation for how to use it.

---

## Stirling PDF {% #stirling-pdf %}

A full toolbox for working with PDFs, all on your own hardware. Merge and split files, convert to and from PDF, compress, rotate, add or remove passwords, OCR scanned documents so they're searchable, sign, stamp, and redact. There are over 50 tools in here, and because it runs locally, none of your documents ever leave your NOMAD.

**Official site:** [stirlingpdf.com](https://stirlingpdf.com) · **Source:** [github.com/Stirling-Tools/Stirling-PDF](https://github.com/Stirling-Tools/Stirling-PDF)

**First time you open it:** It opens straight to the tools, no login required. We set Stirling up to skip its login screen, since on a NOMAD it's a personal tool on your own network and a password wall just gets in the way. You'll see "Guest" in the bottom-left corner, which is normal.

**Heads up, it's a slow starter:** Stirling PDF is a big Java application. After you install it, give it 30 to 60 seconds to finish starting up before it loads cleanly. It also wants a good chunk of memory (around a gigabyte), so it's happier on a NOMAD with room to spare.

**Want a password on it?** If you'd rather Stirling require a login (say a few people share your NOMAD and you want this app locked down), you can turn its login back on from NOMAD:

1. On the Supply Depot page, find Stirling PDF and click **Manage > Edit**.
2. Under **Environment Variables**, change `SECURITY_ENABLELOGIN=false` to `SECURITY_ENABLELOGIN=true`.
3. Save. NOMAD rebuilds the app, and the login screen comes back.

The first time you sign in after that, use username `admin` and password `stirling`. Stirling will make you set your own password right away. Note that this is the only way to flip the login back on: Stirling's own settings menu is locked behind being logged in, so once login is off you turn it on from NOMAD's Edit screen, not from inside Stirling.

**Your data:** Your settings live in the `storage/stirling-pdf` folder on your NOMAD. The PDFs you work on are uploaded for the operation and downloaded back to your own device. Stirling isn't a long-term library, so it's not holding onto your documents.

**Where your PDFs come from (and why you don't see your NOMAD's files):** Stirling works on files from whatever device you're using, your laptop, phone, or tablet. You click "Open from computer," pick a PDF, work on it, then download the result back to that device. Stirling can't reach into files stored elsewhere on your NOMAD, so it won't show you your books folder, your Knowledge Base documents, or anything sitting in File Browser. If the PDF you want is already on your NOMAD, download it from wherever it lives first (File Browser, for example), then open that copy in Stirling. It's one extra step, but it's also why your files stay exactly where you put them instead of getting pulled into another app.

**Works offline:** All of the PDF tools run locally on your NOMAD, so the toolbox itself works fully offline. A few side features reach out to the internet and won't do anything when you're disconnected: the "Google Drive" import option, and the links in the footer (Survey, Discord, GitHub). None of those matter for actually working on PDFs. The one core feature with an online piece is OCR, which reads text out of scanned pages: it ships with English already installed, and adding other languages is the only part that would need a connection.

## File Browser {% #file-browser %}

A web-based file manager for your NOMAD. Browse folders, upload and download files, create folders, rename, move, and delete, all from your browser with nothing to install on your computer. It's a handy way to move files on and off the device or tidy things up without dropping into a command line.

**Official site:** [filebrowser.org](https://filebrowser.org) · **Source:** [github.com/filebrowser/filebrowser](https://github.com/filebrowser/filebrowser)

**First time you open it:** You'll get a login screen. Sign in with username `admin` and password `nomad`. **Change that password right away.** It's the same default on every NOMAD, so until you change it, anyone on your network who knows it could get in. Click the settings gear, open your profile settings, and set a new password.

Unlike most of the apps here, File Browser keeps its login on purpose. It can rename and delete real files on your NOMAD, so a password is the right call even on your own network.

**What you can see:** File Browser shows you your NOMAD's content folders in one place:

- **books** - e-books, including anything you want Calibre-Web to read
- **maps** - downloaded map data
- **media** - video, music, and photos, including anything you want Jellyfin to serve
- **zim** - downloaded offline content like Wikipedia and other reference libraries
- **kb_uploads** - documents you've added to the Knowledge Base

You can upload, download, rename, move, and delete inside these, and anything you drop in the top level is saved too. The behind-the-scenes folders that the apps actually run on (things like the AI models, the search index, and the password vault) are deliberately kept out of File Browser, so you can't browse or delete them by accident.

> **A word on deleting:** what you delete here is really gone, there's no recycle bin. The content is mostly replaceable (you can re-download a map or a Wikipedia library), but if you delete a book or a video you added yourself, that copy is gone. Delete with the same care you would on your own computer.

**Works offline:** Fully offline. File Browser runs entirely on your NOMAD and doesn't reach out to the internet for anything, so it works exactly the same connected or not.

## Calibre-Web {% #calibre-web %}

A web-based reader and library manager for your e-book collection. Read books right in your browser, organize them by author, series, and tags, and send them to a Kindle or other e-reader. It pairs with the books folder on your NOMAD, so your whole library lives on the device and goes wherever it goes.

**Official site:** [github.com/janeczku/calibre-web](https://github.com/janeczku/calibre-web)

**First time you open it:** Calibre-Web needs a library to point at, and NOMAD sets up an empty one for you during install, so you won't get stuck on a setup error. Here's the one-time flow:

1. Open Calibre-Web. It lands on a **Database Configuration** screen.
2. In the **Location of Calibre Database** box, type `/books` and click **Save**. You'll see "Database Settings updated" and your (empty) library opens.
3. That's it for setup. Your library is ready to fill.

If it asks you to sign in at any point, the default login is `admin` / `admin123`. **Change that password** once you're in (click `admin` in the top right, then Edit). It's the same default on every NOMAD.

**Adding books:** Uploading through the web page is turned off by default. To turn it on, go to **Admin** (top right) and edit the basic configuration to allow uploads, then you'll get an Upload button. You can also drop e-book files straight into the books folder using File Browser, then use Calibre-Web's "scan" to pick them up.

**Your data:** Your library lives in the `books` folder on your NOMAD (the same `books` you see in File Browser). Every book you add is stored there, so backing up that one folder backs up your whole collection.

**Works offline:** Reading and managing your library works fully offline. The one feature that reaches out to the internet is "fetch metadata," which pulls book covers and descriptions from online sources. That part won't do anything when you're offline, but it doesn't affect reading or organizing the books you already have.

## IT Tools {% #it-tools %}

A collection of over 100 small utilities you'd otherwise go hunting for online: hash generators, base64 and URL encoders, JSON and SQL formatters, UUID generators, a QR code maker, color converters, and a lot more. It all runs locally on your NOMAD, so you can use it with no internet connection.

**Official site:** [it-tools.tech](https://it-tools.tech) · **Source:** [github.com/CorentinTh/it-tools](https://github.com/CorentinTh/it-tools)

**First time you open it:** It opens straight to the tools. No login, no account, no setup. Pick a tool from the sidebar and use it.

**Your data:** There's nothing to manage. IT Tools doesn't store anything on your NOMAD between sessions, so there are no files, no library to set up, and no credentials to keep track of. It's the simplest app in the Supply Depot.

**Works offline:** Every tool runs right in your browser against the copy on your NOMAD. Nothing here reaches out to the internet, so all of it keeps working when you're offline.

## Excalidraw {% #excalidraw %}

A virtual whiteboard for quick, hand-drawn-style diagrams and sketches. Draw boxes, arrows, and freehand shapes, drop in text and images, and lay out a flowchart, a network diagram, or a rough idea in seconds. The whole thing has a friendly, sketched-on-a-napkin look, and it runs right in your browser.

**Official site:** [excalidraw.com](https://excalidraw.com) · **Source:** [github.com/excalidraw/excalidraw](https://github.com/excalidraw/excalidraw)

**First time you open it:** It opens straight to a blank canvas. No login, no account, no setup. Pick a shape from the toolbar and start drawing. You'll see a short welcome note reminding you that your work is saved in your browser, which leads to the one thing worth understanding about Excalidraw on NOMAD.

**Where your drawings live (read this part):** This version of Excalidraw has no storage on your NOMAD. Your drawing is saved inside the web browser you're using, on that one device. A few things follow from that:

- Your drawing is **not shared between devices**. What you draw on your laptop won't show up when you open Excalidraw on your phone, because each browser keeps its own copy.
- If you **clear your browser data**, or use a private/incognito window, the drawing is gone. There's no copy on the NOMAD to fall back on.
- So **save your work to a file.** Use the menu (top-left) to **Save to...** an `.excalidraw` file, and put it somewhere safe, for example your media or documents folder via File Browser. To pick it back up later, use **Open** and load that file. This is the only way to keep a drawing for the long term or move it to another device.

**Your data:** Because everything stays in your browser, there are no NOMAD folders or credentials to manage for Excalidraw. The files you save are wherever you choose to put them.

**Works offline:** The whiteboard itself works offline, you can draw, edit, and save files with no internet. Three things to know:

- **The signature hand-drawn font comes from the internet.** When your NOMAD is offline, Excalidraw can't fetch it and falls back to a plain font, so your diagrams look a little less sketchy. Your drawings themselves are completely unaffected, only the on-screen font changes.
- **Excalidraw sends anonymous usage analytics when your NOMAD is online.** The app's makers include basic page-view tracking (through a service called Simple Analytics) that records that the app was opened. It doesn't see your drawings, and it can't reach anything when your NOMAD is offline, but we want you to know it's there since NOMAD is otherwise built to keep to itself.
- **A few buttons are cloud features that don't work on NOMAD.** "Live collaboration," "Sign up," and "Excalidraw+" all point to the makers' paid online service and need the internet. They're not part of your offline whiteboard, so you can ignore them. The same goes for the shape **Library** browser, which pulls from an online gallery.

## Homebox {% #homebox %}

A home inventory system for keeping track of everything you own. Catalog your belongings into locations and labels, attach photos, record serial numbers, purchase prices, warranty dates, and receipts, and find anything with a search. It's a genuinely useful tool for insurance records, warranty tracking, and knowing what you have and where it is.

**Official site:** [homebox.software](https://homebox.software) · **Source:** [github.com/sysadminsmedia/homebox](https://github.com/sysadminsmedia/homebox)

**First time you open it:** Homebox lands on a login screen, but you don't have an account yet, so you create one. Click **Register**, then fill in:

- **your email** (used as your username to log in),
- **your name**,
- **a password** (Homebox shows a strength meter and won't let you register until the password is strong enough, so use a real one).

Click **Register**, then log in with that email and password. The first account you create is the **owner** of this Homebox. There are no default credentials to change, the account is yours from the start.

**Sharing your NOMAD with others?** By default Homebox lets anyone who can reach it create their own account. That's fine if it's just you, or if you trust everyone on your network. If you'd rather lock it down so no one else can register after you've made your account:

1. Create your owner account first (above).
2. On the Supply Depot page, find Homebox and click **Manage > Edit**.
3. Under **Environment Variables**, add `HBOX_OPTIONS_ALLOW_REGISTRATION=false`.
4. Save. NOMAD rebuilds the app, and the Register button stops creating new accounts. You can still log in normally.

**Your data:** Everything Homebox stores lives in one folder on your NOMAD, `storage/homebox`, as a single database file (plus any photos and receipts you attach). Backing up that one folder backs up your entire inventory.

**Works offline:** Fully offline. Homebox runs entirely on your NOMAD, keeps all your data locally, and has no usage tracking, so it works exactly the same whether your NOMAD is connected or not. The links in its header (GitHub, Discord, the project website) need the internet, but they're just shortcuts to the project's pages and have nothing to do with your inventory.

## Vaultwarden {% #vaultwarden %}

A private password manager that runs on your own NOMAD. It's compatible with Bitwarden, so you can store logins, secure notes, and card details in an encrypted vault, and use the official Bitwarden browser extensions and phone apps to access it, all pointed at your NOMAD instead of someone else's cloud.

**Official site:** [bitwarden.com](https://bitwarden.com) (for the apps and extensions) · **Source:** [github.com/dani-garcia/vaultwarden](https://github.com/dani-garcia/vaultwarden)

**First time you open it, you'll see a security warning. That's expected, here's why:** A password manager will only run over a secure (HTTPS) connection, so NOMAD sets Vaultwarden up with HTTPS automatically. Because your NOMAD is your own private device and not a public website, it uses a self-signed security certificate, and browsers show a warning the first time they see one. It looks alarming but it's normal for a device on your own network. To get past it once:

1. Click **Open** on the Vaultwarden card. Your browser shows something like *"Your connection is not private"* or *"Not secure."*
2. Click **Advanced**, then **Proceed to (your NOMAD's address)**. (On some browsers the button says "Continue" or "Accept the Risk.")
3. You'll land on the Vaultwarden vault. Your browser remembers your choice, so you won't see the warning again on that device.

**Creating your vault:** On the login page, click **Create account**, then set your **email** and a **master password**.

> **Your master password cannot be recovered.** Vaultwarden has no "forgot password" email and no reset, by design, because it never sees your password. If you forget it, the vault and everything in it is locked for good. Choose something strong that you won't lose, and consider writing it down somewhere physically safe.

**Sharing your NOMAD with others?** By default anyone who can reach Vaultwarden can create their own account (each account is separate and encrypted). If you'd rather no one else can register after you've set yours up:

1. Create your own account first.
2. On the Supply Depot page, find Vaultwarden and click **Manage > Edit**.
3. Under **Environment Variables**, add `SIGNUPS_ALLOWED=false`.
4. Save. NOMAD rebuilds the app and new sign-ups are turned off; existing accounts keep working.

**Using it from your phone and browser:** Install the official Bitwarden app or browser extension, and on its login screen choose **self-hosted** (or "Server URL") and enter `https://(your NOMAD's address):8480`. Note that some phone apps are stricter about self-signed certificates and may refuse to connect; the web vault you open from NOMAD always works.

**Your data:** Your encrypted vault lives in the `storage/vaultwarden` folder on your NOMAD. Backing up that folder backs up everything. (The built-in admin panel is turned off unless you set an admin token, which most people don't need.)

**Works offline:** Fully offline and private. Vaultwarden runs entirely on your NOMAD, stores your vault locally, and phones home to nobody. The Bitwarden apps and extensions also keep a local copy of your vault, so they can read your passwords even when your NOMAD or your phone is offline.

## Jellyfin {% #jellyfin %}

Your own media server. Point Jellyfin at a folder of movies, TV shows, music, and photos on your NOMAD, and it organizes everything with artwork and details and streams it to a web browser, phone, tablet, smart TV, or the Jellyfin apps. It's a private, offline alternative to the big streaming services for media you already own.

**Official site:** [jellyfin.org](https://jellyfin.org) · **Source:** [github.com/jellyfin/jellyfin](https://github.com/jellyfin/jellyfin)

**First time you open it, you'll go through a setup wizard.** It's a few quick screens:

1. **Language** - pick your display language and click Next.
2. **Create your admin account** - enter a username and password. This is the main account that controls the server, so give it a real password and keep track of it. (You can add more users, including limited ones for kids, later from the Dashboard.)
3. **Add your media** - click **Add Media Library** and pick a content type. To make this easy, NOMAD has already created a matching folder for each type inside your media folder, so you just point each library at the one that fits:
   - **Movies** library → the `Movies` folder
   - **Shows** library → the `TV Shows` folder
   - **Music** library → the `Music` folder
   - **Photos** library → the `Photos` folder

   **Point each library at its own folder, not at the whole `media` folder.** This matters: if you point one library at `media` itself (which contains all the others) and another library at, say, `Music` inside it, Jellyfin sees the same files claimed twice, calls it a "duplicate path," and your music silently won't show up. One folder per library keeps everything tidy and working. You can also skip this step and add libraries later from the Dashboard.
4. **Metadata, remote access, finish** - accept the defaults on the remaining screens and finish. Then sign in with the account you just made.

**Getting your media in:** Put your files in the matching subfolder of the **media** folder on your NOMAD (the same `media` folder you see in File Browser): movies in **Movies**, series in **TV Shows**, music in **Music** (a folder per album works great), pictures in **Photos**. The easiest workflow is to upload files with File Browser (or drop them in however you like), then in Jellyfin click **Scan Library** to pick them up. Jellyfin reads sub-folders, so a whole album folder dropped into **Music** comes in as one album. It also works best when files are named clearly (for example `Movie Name (2020).mp4`), which helps it match the right artwork and details.

**Your data:** Your media lives in `storage/media`. Jellyfin's own settings, user accounts, and the artwork it downloads live in `storage/jellyfin`. Your media files are never modified, Jellyfin only reads them.

**Works offline:** Streaming your own media works fully offline, that's the whole point. The one piece that uses the internet is **fetching metadata**: when Jellyfin adds a movie or show, it tries to download a cover image, description, and cast info from online databases. Offline, it can't do that, so items show up with plain names and no artwork, but they still play perfectly. Once you're back online, a library scan fills in the missing artwork.

> **A note on playback performance:** Jellyfin plays most files effortlessly, but if a video's format isn't supported by your device, Jellyfin has to convert it on the fly ("transcoding"), which is heavy work for the processor. NOMAD doesn't set up graphics-card acceleration for this by default, so very large or high-resolution videos may stutter on a modest NOMAD. Playing files in a widely-supported format (like MP4/H.264) avoids transcoding and plays smoothest.

## Meshtastic Web {% #meshtastic-web %}

A browser-based control panel for [Meshtastic](https://meshtastic.org) devices. Meshtastic is off-grid, long-range radio messaging: small, inexpensive LoRa radios that form their own mesh network and send text messages and GPS locations for miles with no cell service, no internet, and no fees. This app is how you configure those radios and read and send messages from a full-size screen.

**Official site:** [meshtastic.org](https://meshtastic.org) · **Source:** [github.com/meshtastic/web](https://github.com/meshtastic/web)

**You need a Meshtastic radio to use this.** This app is just the control panel. On its own it opens to a "No devices connected" screen, because the actual work happens on a physical Meshtastic device (and the network of other radios it talks to). If you don't have one yet, the app won't do much.

**First time you open it:** It opens straight in, no login. Click **New Connection** and you'll see three ways to connect to your radio:

- **HTTP** - connect to a radio that's already joined to your Wi-Fi, by typing its IP address. **This is the method to use on NOMAD** (see below).
- **Bluetooth** - pair with a nearby radio over Bluetooth.
- **Serial** - connect to a radio plugged into a USB port.

**The NOMAD-specific catch (Bluetooth and Serial need HTTPS):** Browsers only allow a website to use Bluetooth or USB when the page is loaded over a secure (HTTPS) connection. NOMAD serves Meshtastic Web over plain HTTP, so on NOMAD the **Bluetooth and Serial options won't connect**, your browser blocks them. The one that works is **HTTP**: put your Meshtastic radio on the same Wi-Fi network (Meshtastic radios can join Wi-Fi), then connect to it here by its IP address. If you specifically need to pair over USB or Bluetooth, do that from the official Meshtastic phone app or the Meshtastic website instead.

**Your data:** There's nothing to set up or store on your NOMAD for this app. Your radio's settings live on the radio itself, and this app's preferences live in your browser. There's no NOMAD folder to manage.

**Works offline:** Fully offline, which is the entire point of Meshtastic. The app is served from your NOMAD, and talking to your radios happens over your local network or radio, never the internet. The only online bits are the links in the footer (Vercel, legal), which don't matter for using your mesh.

## Education Platform (Kolibri) {% #kolibri %}

A complete offline learning platform from Learning Equality. Kolibri pulls together video lessons, exercises, and readings into structured channels, organizes them into classes and lessons, tracks learner progress, and works entirely on your NOMAD with no internet. It's built for schools and learners in places with little or no connectivity.

**Official site:** [learningequality.org/kolibri](https://learningequality.org/kolibri) · **Source:** [github.com/learningequality/kolibri](https://github.com/learningequality/kolibri)

**First time you open it, you'll go through a quick setup wizard.** Pick your facility type and create the **admin account** (this is the super-user that manages the whole device, so give it a real password and keep track of it). Once you're in, you import learning content as **channels**.

**Getting content in (you re-download it):** Kolibri's content is delivered as channels you import. Open **Device → Channels → Import**, and either pull channels from Kolibri Studio (online) or import from a local drive or another Kolibri device if you already have the content files. There's a lot available, so import just the channels you need; they can be large.

**Upgrading from an older NOMAD's Kolibri:** Earlier NOMAD releases shipped a much older Kolibri (the `treehouses/kolibri:0.12.8` image). This Education Platform is a newer, upstream-official Kolibri and installs **fresh** — your old channels and learner data are **not** carried over automatically, because the two versions store data too differently to migrate safely. If you were running the old one:

1. Install this Education Platform from the catalog (it runs alongside the old one on a different port, so nothing is disrupted while you set it up).
2. Re-import the channels you want, as above.
3. Once you're happy with the new install, uninstall the old Kolibri from its card (it carries a **legacy** badge). Your old data folder stays on disk until you remove it.

**Your data:** Your imported channels, classes, and learner progress live in the `storage/kolibri-gen2` folder on your NOMAD. Backing up that folder backs up your whole Kolibri.

**Works offline:** Fully offline once content is imported, that's what Kolibri is for. The only step that uses the internet is importing channels from Kolibri Studio; everything after that, browsing lessons, doing exercises, tracking progress, runs entirely on your NOMAD.
