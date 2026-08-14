# Offline (Air-Gapped) Installation

Project NOMAD is built to *run* without an internet connection, but a normal
installation still needs one: the installer downloads Docker, host packages,
container images and its own helper scripts. That leaves a gap for anyone who
wants to prepare a machine now and deploy it somewhere with no connectivity —
or rebuild a machine after connectivity is gone.

**Offline artifact mode** closes that gap. You build a bundle once on a
connected machine, carry it to the target on a USB drive, and run the ordinary
installer against it.

```bash
# On a connected build machine, from a Project NOMAD checkout (needs only Docker):
./install/build_offline_bundle_docker.sh --target ubuntu:26.04 --output /media/usb/NOMAD

# On the disconnected target, from inside the bundle directory:
sudo bash ./install_nomad.sh --artifacts .
```

There is only one installer. `install_nomad.sh` with no `--artifacts` argument
behaves exactly as it always has.

---

## Table of Contents

- [What the bundle covers](#what-the-bundle-covers)
- [Building a bundle](#building-a-bundle)
- [Installing on a disconnected target](#installing-on-a-disconnected-target)
- [Verifying a bundle](#verifying-a-bundle)
- [Bundle layout](#bundle-layout)
- [How artifact mode stays offline](#how-artifact-mode-stays-offline)
- [GPU support](#gpu-support)
- [Bundling Supply Depot apps](#bundling-supply-depot-apps)
- [Updating an air-gapped installation](#updating-an-air-gapped-installation)
- [Optional images and pre-staged content](#optional-images-and-pre-staged-content)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Verified offline behaviour](#verified-offline-behaviour)

---

## What the bundle covers

A bundle contains everything needed to bring up the **core NOMAD management
stack** — the Command Center and its supporting services — on a clean machine:

- Docker Engine, CLI, containerd, Buildx and Compose v2, plus the host
  utilities the installer uses, as `.deb` packages with their dependencies
- every container image referenced by `install/management_compose.yaml`
- the management compose file, the start/stop/update helper scripts, and the
  uninstall script
- the exact `install_nomad.sh` from the checkout the bundle was built from

Supply Depot applications can be added with
[`--with-apps`](#bundling-supply-depot-apps). Offline content — ZIM files beyond
a small Wikipedia sample, maps, AI models, Kolibri channels — is fetched from
remote catalogs at runtime and is **not** covered; see
[Known limitations](#known-limitations).

---

## Building a bundle

The build machine needs **internet access and Docker** — that's the whole list.
The entire build runs in containers, so no `git`, `bash` version, or GNU
coreutils is required on the host, and the machine does not need to resemble the
target: Linux, macOS and Windows build machines all produce the same bundle,
because the package closure is resolved inside a container of the target
distribution.

```bash
git clone https://github.com/Crosstalk-Solutions/project-nomad.git
cd project-nomad

./install/build_offline_bundle_docker.sh --target ubuntu:26.04
```

With no `--output`, the builder asks where to write the bundle, offering the
directory you are running from, any connected removable drives (so you can
write straight to the USB stick it will travel on), and your home directory. To
skip the question, pass `--output DIR`, or `--no-prompt` to accept the default.
Prompting is disabled automatically when stdin is not a terminal, so scripts and
CI never hang.

`build_offline_bundle_docker.sh` is a thin wrapper: it mounts the checkout, the
output directory and the Docker socket into a container and runs
`build_offline_bundle.sh` there, passing every option straight through. Call
`build_offline_bundle.sh` directly only if you are already inside a Linux
environment with `git` and coreutils available.

This produces `/media/usb/NOMAD/project-nomad-offline-ubuntu-26.04-amd64-<commit>/`.

The dependency closure is resolved inside a **pristine** container of the target
release — nothing is installed there first, because APT only downloads packages
it does not already have, and a contaminated container silently produces an
incomplete bundle. Before finishing, the builder re-runs the target's exact
isolated APT installation in a clean container with `--network none`. If the
bundle cannot satisfy its own package list offline, the build fails rather than
handing you a bundle that breaks in the field.

| Option | Purpose |
|--------|---------|
| `--repo PATH` | Source checkout to build from (default: parent of the script) |
| `--target OS:VERSION` | Target operating system (default: `ubuntu:26.04`) |
| `--arch ARCH` | Target architecture (default: `amd64`) |
| `--output DIR` | Where to create the bundle (default: `./dist`) |
| `--without-nvidia-toolkit` | Omit the NVIDIA Container Toolkit packages |
| `--extra-image-list FILE` | Also pull and bundle the image references in `FILE` |
| `--extra-image-archive FILE` | Include an existing `docker save` archive |
| `--with-apps LIST` | Bundle Supply Depot app images (`default`, `all`, or a list) |
| `--list-apps` | Print the installable app names and exit |
| `--content-dir DIR` | Include pre-staged NOMAD storage content |
| `--archive` | Also produce a `.tar.gz` of the finished bundle |

### Why the build runs in a container

Every path-valued option is resolved to an absolute host path and mounted into
the build container at that same location. This matters because the build starts
*further* containers, and their bind mounts are resolved by the host Docker
daemon — a path that existed only inside the build container would silently fail
to mount. The wrapper handles this for `--output`, `--repo`, `--content-dir`,
`--extra-image-archive` and `--extra-image-list`.

Two environment variables are available if your setup is unusual:

| Variable | Purpose |
|---|---|
| `NOMAD_BUILDER_IMAGE` | Build container image (default `docker:cli`) |
| `NOMAD_DOCKER_SOCKET` | Docker socket path (default `/var/run/docker.sock`) |
| `NOMAD_NO_PROMPT` | Set to `1` to never ask where to write the bundle |

### Building onto FAT/exFAT removable media

Writing a bundle straight to a USB stick is supported and expected. Note that
macOS deposits AppleDouble sidecars (`._name`) and `.DS_Store` files on such
filesystems. These are OS metadata rather than bundle content, so the builder
removes them and excludes them from `SHA256SUMS`, and the installer ignores them
when loading image archives. Without that, a `._core-images.tar` sidecar would
both break checksum verification and be handed to `docker load`.

### Bundles are specific

A bundle is valid for **one operating system, one version, and one
architecture**. The package closure is resolved for that exact combination, so
an Ubuntu 26.04 bundle will not install on Debian 12, and the installer refuses
to try. Build one bundle per target platform.

The bundle records the git commit it was built from and carries that commit's
installer, so the target runs the same code the bundle was built against.

---

## Installing on a disconnected target

The target needs a clean, supported OS install and nothing else. In particular,
**do not install Docker first** — it comes from the bundle:

| Normal install | Offline install |
|---|---|
| Install a supported OS | **Same** |
| Connect to the internet | Not needed |
| `apt-get install curl` | Not needed — provided by the bundle |
| `curl … install_nomad.sh` | Not needed — the bundle carries the installer |
| Installer fetches Docker from `get.docker.com` | Docker installs from the bundle |
| Installer pulls images from GHCR / Docker Hub | Images load from the bundle |
| Installer downloads helper scripts from GitHub | Provided by the bundle |

Copy the bundle directory to the target (USB drive, external disk, whatever
moves bytes), then:

```bash
cd /media/usb/NOMAD/project-nomad-offline-ubuntu-26.04-amd64-<commit>
sudo bash ./install_nomad.sh --artifacts .
```

The environment variable form is equivalent:

```bash
sudo NOMAD_ARTIFACT_PATH=/media/usb/NOMAD/project-nomad-offline-... \
  bash ./install_nomad.sh
```

If both are supplied, the `--artifacts` argument wins.

Installation proceeds as usual from there — same prompts, same license
acceptance, same result. When it finishes, the Command Center is available at
`http://localhost:8080`, and at `http://<device-ip>:8080` if the machine has a
LAN address.

A completely disconnected machine may have no LAN address at all. That is fine:
artifact mode falls back to `localhost` instead of failing, and simply doesn't
advertise a LAN URL.

---

## Verifying a bundle

Before transferring a bundle — or on the target before installing — check it:

```bash
./install/verify_offline_bundle.sh /media/usb/NOMAD/project-nomad-offline-...
```

This confirms every required file is present, verifies the checksums, and
prints the manifest. It runs entirely offline and installs nothing.

The installer performs the same validation automatically before it touches the
system.

---

## Bundle layout

```text
project-nomad-offline-<os>-<version>-<arch>-<commit>/
├── install_nomad.sh              # the installer from the source commit
├── manifest                      # bundle metadata (data, never sourced)
├── README.txt
├── SHA256SUMS                    # covers every other file in the bundle
├── packages/
│   └── apt/                      # flat local APT repository
│       ├── Packages
│       ├── Packages.gz
│       └── *.deb
├── images/
│   ├── core-images.txt           # image references in the bundle
│   ├── core-image-metadata.tsv   # image IDs and repo digests
│   ├── core-images.tar           # docker save archive
│   └── optional-images.tar       # optional
├── payload/
│   └── nomad/
│       ├── management_compose.yaml
│       ├── compose.artifact.yml  # generated pull_policy: never override
│       ├── start_nomad.sh
│       ├── stop_nomad.sh
│       ├── update_nomad.sh
│       └── uninstall_nomad.sh
└── content/                      # optional pre-staged storage content
```

### The manifest

```text
BUNDLE_FORMAT_VERSION=1
NOMAD_COMMIT=<full git sha>
TARGET_OS=ubuntu
TARGET_VERSION=26.04
TARGET_ARCH=amd64
WITH_NVIDIA_TOOLKIT=1
CREATED_AT_UTC=2026-08-14T16:00:00Z
```

The manifest is plain data. The installer reads individual keys from it and
never executes it as shell.

### Checksums

`SHA256SUMS` covers every regular file in the bundle except itself, and is
verified before any package is installed or image loaded.

This proves the bundle **transferred intact**. It is not a publisher signature
and does not establish who produced the bundle — verify provenance separately
if that matters to you.

---

## How artifact mode stays offline

Artifact mode is *fail-closed*. Once an artifact path is given, the installer
never falls back to the network to fill a gap. A missing package, image,
payload file, manifest field or checksum stops the installation with an
actionable error.

Concretely, in artifact mode the installer does not use `curl` or `wget` to
acquire anything, does not run `docker pull`, and does not contact GitHub,
GHCR, Docker Hub, the Docker convenience script, or NVIDIA's package
repository.

**Host packages** are installed from the bundle's flat APT repository through a
temporary source that excludes the machine's own configuration:

```text
deb [trusted=yes] file:/tmp/nomad-artifact-apt.XXXXXX/repo ./
```

APT is invoked with `Dir::Etc::sourcelist` pointing at that file,
`Dir::Etc::sourceparts=-` to exclude `/etc/apt/sources.list.d`,
`Dir::State::Lists` pointing at a private directory so the host's package lists
are left alone, `APT::Get::List-Cleanup=0`, and `Acquire::Retries=0`. The
machine's configured remote repositories take no part in dependency resolution,
which is why a missing dependency fails instead of quietly downloading.

**Container images** are loaded with `docker load`. Because
`management_compose.yaml` legitimately uses `pull_policy: always` for online
installs, the builder generates `compose.artifact.yml` setting
`pull_policy: never` for every service. Artifact mode layers both files:

```bash
docker compose -p project-nomad \
  -f /opt/project-nomad/compose.yml \
  -f /opt/project-nomad/compose.artifact.yml \
  up -d --pull never
```

The canonical compose file is never rewritten just to make an offline install
work.

A practical consequence: a bundle tested on a machine that happens to be online
behaves identically once the cable is pulled. If it works connected, it works
disconnected.

---

## GPU support

Artifact mode keeps the installer's existing non-blocking GPU behaviour — GPU
problems warn, they never fail the install.

- NVIDIA hardware is detected with the same logic as an online install.
- If the bundle includes `nvidia-container-toolkit` (the default; disable with
  `--without-nvidia-toolkit`) **and** a working host NVIDIA driver is present,
  the Docker runtime is configured locally.
- If the host driver is missing, you get a warning and the install continues.
- NVIDIA's package repository is never contacted.

**Host NVIDIA drivers are out of scope for this version of the bundle format.**
Bundling kernel drivers means matching kernel versions and handling DKMS, which
is a materially larger problem. Install the driver on the target separately if
you need GPU acceleration offline.

AMD GPU detection and the marker files the Command Center reads are unchanged.

---

## Bundling Supply Depot apps

A core bundle gets you the Command Center, but the Supply Depot will be unable
to install anything without a network. `--with-apps` carries the app images too:

```bash
./install/build_offline_bundle_docker.sh \
  --target ubuntu:26.04 \
  --with-apps default
```

| Value | Meaning |
|---|---|
| `default` | A useful starter set: Kiwix, CyberChef, IT-Tools, FlatNotes, Excalidraw, File Browser, Stirling PDF |
| `all` | Every app in the catalog (large — includes Ollama, Kolibri, Jellyfin) |
| `kiwix,cyberchef,…` | An explicit comma-separated list |

Run `./install/build_offline_bundle.sh --list-apps` to see the available names.
An unrecognised name fails the build rather than quietly producing a bundle
without the app you asked for.

This works because the app catalog is **not fetched from the internet**: it is
seeded into the Command Center's database from a file baked into the admin
image, with pinned image tags. The installer then skips the registry pull for
any image already present locally. Loading the images from a bundle is therefore
enough for the Supply Depot to install those apps offline.

The image references are read from that same seeder at build time, so a bundle
cannot drift from the catalog the UI will offer.

### Apps with extra requirements

Most apps need nothing beyond their image. Two exceptions are worth knowing:

- **Kiwix** refuses to start without at least one ZIM file, and its pre-install
  step fetches a sample from GitHub. When Kiwix is selected, the builder includes
  the small Wikipedia sample from the checkout as pre-staged content, and the
  pre-install step skips the download when storage already holds a ZIM.

  That skip is a change to the admin application, so it only takes effect once
  it ships in a released `ghcr.io/crosstalk-solutions/project-nomad` image.
  Against an older admin image, installing Kiwix on an air-gapped host fails
  with `getaddrinfo EAI_AGAIN github.com` even when the ZIM is already in
  storage, because the downloader's idempotency check sits behind a HEAD
  request.
- **The AI Assistant (Ollama)** ships as an image, but *models* are downloaded
  separately from the Ollama registry at first use. Bundling the image does not
  make model downloads work offline.

Content that is fetched from remote catalogs at runtime — ZIM files beyond the
bundled sample, maps, Kolibri channels, AI models — is not covered. Use
`--content-dir` to pre-stage such files if you already have them in NOMAD's
storage layout.

## Updating an air-gapped installation

Re-running the installer with a newer bundle updates in place. This is the
supported offline update path — build a new bundle on a connected machine, carry
it over, and run the same command:

```bash
sudo bash ./install_nomad.sh --artifacts .
```

Re-running is safe and repeatable. When an existing installation is detected the
installer:

- keeps the database, installed apps, settings and content;
- reuses the credentials the database was initialised with, rather than
  generating new ones (MySQL only applies those on first startup, so
  regenerating is precisely what would force wiping the data directory);
- preserves the URL the instance is already reachable at;
- loads any new or updated images from the bundle and recreates the changed
  containers;
- adds new pre-staged content without overwriting files you have changed.

Use it to move to a newer NOMAD version, or simply to add apps: rebuild with a
wider `--with-apps` set and re-run.

Note that `update_nomad.sh` — the online update path — still pulls from a
registry and will not work air-gapped. Use a new bundle instead.

## Optional images and pre-staged content

Two further extension points exist. Both are **transport mechanisms**, not
guarantees.

### Additional images

On a machine with NOMAD already installed and apps set up:

```bash
./install/capture_installed_images.sh --output /tmp/nomad-extra-images
```

Then include the archive:

```bash
./install/build_offline_bundle.sh \
  --target ubuntu:26.04 \
  --extra-image-archive /tmp/nomad-extra-images/optional-images.tar \
  --output /media/usb/NOMAD
```

This moves the Docker images to the target. It does **not** by itself make
those applications installable offline — Supply Depot install flows and catalog
metadata may have their own network dependencies. Test any app you care about
individually before relying on it.

### Pre-staged content

```bash
./install/build_offline_bundle.sh \
  --target ubuntu:26.04 \
  --content-dir /srv/nomad-storage-seed \
  --output /media/usb/NOMAD
```

The directory is copied into `/opt/project-nomad/storage` before the stack
starts. It must already match NOMAD's storage layout.

---

## Known limitations

Be precise about what offline artifact mode does and does not claim:

- **Apps need `--with-apps`; content is mostly not covered.** A core bundle
  installs the Command Center only. App images can be bundled, but offline
  content (ZIMs beyond the bundled sample, maps, AI models, Kolibri channels) is
  fetched from remote catalogs at runtime and is not covered.
- **`update_nomad.sh` still needs the internet.** Update an air-gapped install by
  building a new bundle and re-running the installer against it.
- **Host NVIDIA drivers are not bundled.** See [GPU support](#gpu-support).
- **Checksums are integrity, not provenance.** See
  [Checksums](#checksums).
- **One bundle, one platform.** OS, version and architecture must match.
- **x86_64 only**, matching the installer's supported architecture.
- **The Command Center still probes for connectivity at runtime.** It shows
  an offline status and falls back to bundled data rather than failing, but
  those requests are attempted. This is existing behaviour, unchanged here.

---

## Troubleshooting

**"This bundle targets ubuntu 26.04, but this host runs 24.04."**
Bundles carry a package set resolved for one exact OS version. Build a bundle
for the target's version.

**"The offline artifact bundle failed checksum verification."**
The copy is corrupt or incomplete — a common outcome of pulling a USB drive
early. Copy it again and re-run `verify_offline_bundle.sh`.

**"Failed to install host dependencies from the offline artifact bundle."**
The bundle is missing a package this machine needs. The builder resolves the
dependency closure inside a pristine base image of the target release and
verifies offline that it resolves, so this normally means the target is more
minimal than a stock install of that release. Note which package APT names and
rebuild the bundle for the target's exact OS version.

**"The bundle lists image X but it is not present after loading."**
The image archive is incomplete. Rebuild the bundle on a connected machine.

**The installer says it cannot find the bundle.**
Pass a path to the bundle *directory* (the one containing `manifest`), and
remember `sudo` — the path must be readable by root. Mount points containing
spaces are handled.

---

## Verified offline behaviour

What has actually been exercised on a disconnected Ubuntu 26.04 host, with all
egress denied:

| Step | Result |
|---|---|
| Fresh install from a core bundle | Works — all six management containers healthy |
| Reboot with egress still denied | Works — stack returns on its own |
| Docker installed from the bundle | Works — no repository added to the host |
| Re-running with a newer bundle | Works — database, apps, settings and content preserved |
| Installing CyberChef / IT-Tools offline | Works — installed and serving |
| Installing Kiwix offline | Requires the pre-install fix above in the admin image |
| Downloading content (ZIMs, maps, models) | Not supported offline by design |
