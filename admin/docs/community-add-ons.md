# Community Add-Ons

Project N.O.M.A.D. ships with a curated set of built-in tools and content, but the community has started building add-ons that extend the platform with specialized offline content packs. These are third-party projects, not maintained by the N.O.M.A.D. team. Install them at your own discretion, and please direct any bugs or feature requests to the add-on's own repository.

Have you built a NOMAD add-on? Open an issue on the [Project N.O.M.A.D. GitHub repository](https://github.com/Crosstalk-Solutions/project-nomad/issues/new) or send us a note through the [contact form on projectnomad.us](https://www.projectnomad.us/contact), and we'll review it for inclusion on this page.

---

## ZIM Content Packs

ZIM content packs drop additional offline reference material into your existing Kiwix library. They typically ship with an `install.sh` script that downloads source material, builds a ZIM file with `zimwriterfs`, and registers it with your running Kiwix container.

### U.S. Military Field Manuals

**Repository:** [github.com/jrsphoto/ZIM-military-field-manuals](https://github.com/jrsphoto/ZIM-military-field-manuals)

Roughly 180 public-domain U.S. military field manuals covering field medicine, survival, combat first aid, map reading, and more. Built into a searchable ZIM that drops into your Kiwix library.

Final ZIM size is around 2 GB. The builder downloads about 2 GB of source PDFs from archive.org during the build.

### W3Schools Programming Archive

**Repository:** [github.com/kennethbrewer3/ZIM-w3schools-offline](https://github.com/kennethbrewer3/ZIM-w3schools-offline)

A full offline copy of the W3Schools programming tutorials, covering HTML, CSS, JavaScript, Python, SQL, and more. Good for learning to code, looking up syntax, or teaching programming in an environment without internet.

Final ZIM size is around 700 MB. The builder downloads about 6 GB of source files from a GitHub mirror during the build.

---

## Installing a Community Add-On

Each add-on has its own install instructions, but most ZIM packs follow the same shape:

1. Clone the add-on's repository onto your NOMAD host over SSH.
2. Check the README for required build dependencies. Most need `git`, `python3`, `unzip`, and `zim-tools`.
3. Run the included `install.sh` with a `--deploy` flag, pointing it at your Kiwix library path (`/opt/project-nomad/storage/zim`) and your Kiwix container name (`nomad_kiwix_server`).
4. The script builds the ZIM, copies it into your Kiwix library, registers it with Kiwix, and restarts the Kiwix container.

Once the script finishes, the new content will appear in your Information Library the next time you load it.

Expect the initial build to take anywhere from a few minutes to an hour or more depending on the add-on's size and your host's CPU.

---

## A Note on Support

These add-ons are community-built and community-maintained. If something goes wrong with an install script or the content inside a ZIM, please open an issue on the add-on's own repository rather than Project N.O.M.A.D.'s. We're happy to help if the issue is with NOMAD itself, for example if Kiwix isn't picking up a new ZIM after an install, but we can't maintain or support third-party content.
