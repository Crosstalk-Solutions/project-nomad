# Running on macOS

Use OrbStack or Docker Desktop with Linux containers. The Compose file builds
the checked-out source for the Docker engine's native architecture, including
Apple Silicon. No Debian installer or sudo is needed.

From the repository root, generate local credentials once (Node.js required):

```sh
node --input-type=module -e 'import { randomBytes } from "node:crypto"; import { writeFileSync, existsSync } from "node:fs"; if (!existsSync(".env")) writeFileSync(".env", `APP_KEY=${randomBytes(32).toString("hex")}\nDB_PASSWORD=${randomBytes(24).toString("hex")}\nMYSQL_ROOT_PASSWORD=${randomBytes(24).toString("hex")}\n`, {mode: 0o600});'
mkdir -p .nomad/storage
docker compose -f compose.macos.yaml up -d --build
```

Open http://localhost:8080. First startup downloads images, builds the app,
and runs database migrations and seeders. Check progress with:

```sh
docker compose -f compose.macos.yaml ps
docker compose -f compose.macos.yaml logs --tail=100 admin
```

Content lives in `.nomad/storage` (ignored by Git); MySQL and Redis use Docker
volumes. Keep `.env` with your backups. Stop and restart with:

```sh
docker compose -f compose.macos.yaml down
docker compose -f compose.macos.yaml up -d
```

Do not use `down -v` unless you intend to delete the database volumes.
NOMAD creates additional app containers through the Docker socket. Those
containers have their own lifecycle; stopping this Compose stack does not stop
apps installed through NOMAD. Their published ports follow NOMAD's settings
and may be accessible from the LAN even though this file binds the Command
Center to localhost.

## Mac-specific differences

- The Linux disk collector and automatic updater are omitted. Hardware metrics
  reflect the Linux VM, and the update/log viewer UI may be unavailable. Rebuild
  with the command above after updating the source checkout.
- Installable apps must provide images compatible with your Docker engine's
  architecture (or supported emulation); they are not all validated by this setup.
- For accelerated AI, run Ollama natively on macOS and select an external Ollama
  server in NOMAD's AI settings: `http://host.docker.internal:11434`. Configure
  Ollama to listen on an interface reachable from Docker, for example
  `OLLAMA_HOST=0.0.0.0 ollama serve` when using its CLI. This exposes Ollama on
  the network, so use a trusted network/firewall. Avoid simultaneously installing
  NOMAD's Ollama container on port 11434.
- The Docker socket gives NOMAD control over the Docker engine, as required
  for installing and managing its companion apps.

Running the Node app directly is possible for development (see CONTRIBUTING.md),
but still requires MySQL, Redis, and Docker for managed apps. A Debian/Ubuntu
Linux VM is another option if you need the original installer and Linux sidecars.
