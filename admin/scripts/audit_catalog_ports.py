#!/usr/bin/env python3
"""
Supply Depot catalog port audit.

For every curated (non-dependency) service in the `services` table, launch its image in a
throwaway container using the catalog's image / command / env / volume container-paths, then
detect what TCP port(s) the app actually listens on inside the container (via /proc/net/tcp,
which needs no tools in the image) and compare against the container port the catalog maps.

A mismatch is the "Meshtastic Web" class of bug: the catalog publishes host->containerPort but
the app listens on a different internal port, so the published port reaches nothing.

Non-invasive: separate `audit_*` containers, random host ports on 127.0.0.1, temp volumes,
auto-removed. It never touches NOMAD's service records or real containers.

Run on a NOMAD host (needs the nomad_mysql container + docker):  python3 audit_catalog_ports.py
"""
import json
import os
import shlex
import shutil
import subprocess
import tempfile
import time

HOST_PORT_BASE = 9300  # throwaway host ports, well clear of catalog (8400s) and customs (8600s)
STARTUP_TIMEOUT = 60   # seconds to wait for an app to come up (heavy JVM apps like Stirling are slow)
MEMORY_CAP = "2g"      # generous cap; some apps (Stirling) OOM under 1g and falsely look crashed

# Apps that legitimately can't run in a throwaway probe (need real data or device config), so a
# "CRASHED"/"UNREACHABLE" verdict for them is expected and NOT a catalog port bug. Listed for the
# reader's benefit only — the script still probes them.
KNOWN_NEEDS_SETUP = {
    "nomad_kiwix_server": "needs a ZIM library (managed separately by NOMAD)",
    "nomad_meshtasticd": "needs a config.yaml with a MAC address",
}


def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True)


def mysql(query):
    """Run a query in the nomad_mysql container, reading the password from its own env.

    The inner command is single-quoted for the host shell so $MYSQL_PASSWORD is NOT expanded
    on the host (where it's unset) — it reaches the container's shell literally and expands there.
    Query must contain no double quotes (these catalog queries don't).
    """
    inner = 'mysql -N -unomad_user -p"$MYSQL_PASSWORD" nomad -e "%s"' % query
    out = sh("docker exec nomad_mysql sh -c " + shlex.quote(inner))
    if out.returncode != 0:
        raise SystemExit("mysql query failed: " + out.stderr)
    return out.stdout


def parse_config(raw):
    try:
        return json.loads(raw) if raw else {}
    except Exception:
        return {}


def container_port(cfg):
    """First container port from PortBindings (preferred) or ExposedPorts, e.g. '8080/tcp' -> 8080."""
    pb = (cfg.get("HostConfig") or {}).get("PortBindings") or {}
    keys = list(pb.keys()) or list((cfg.get("ExposedPorts") or {}).keys())
    for k in keys:
        try:
            return int(k.split("/")[0])
        except ValueError:
            continue
    return None


def listening_ports(name):
    """Listening TCP ports inside a container, parsed from /proc/net/tcp{,6} (st 0A = LISTEN)."""
    ports = set()
    for proc in ("/proc/net/tcp", "/proc/net/tcp6"):
        out = sh(f"docker exec {name} cat {proc} 2>/dev/null")
        for line in out.stdout.splitlines()[1:]:
            f = line.split()
            if len(f) > 3 and f[3] == "0A":
                try:
                    ports.add(int(f[1].split(":")[1], 16))
                except (IndexError, ValueError):
                    pass
    return sorted(ports)


def image_exposed(image):
    out = sh(f"docker image inspect {image} --format '{{{{json .Config.ExposedPorts}}}}'")
    try:
        d = json.loads(out.stdout.strip() or "null") or {}
        return sorted(int(k.split("/")[0]) for k in d)
    except Exception:
        return []


def main():
    rows = mysql(
        "SELECT service_name, container_image, COALESCE(container_command,''), container_config "
        "FROM services WHERE category IS NOT NULL AND is_dependency_service=0 "
        "AND is_custom=0 ORDER BY service_name"
    )
    services = [r.split("\t", 3) for r in rows.splitlines() if r.strip()]
    results = []

    for idx, (name, image, command, raw_cfg) in enumerate(services):
        cfg = parse_config(raw_cfg)
        cport = container_port(cfg)
        env = cfg.get("Env") or []
        binds = (cfg.get("HostConfig") or {}).get("Binds") or []
        host_port = HOST_PORT_BASE + idx
        cname = "audit_" + name
        tmpdirs = []

        sh(f"docker rm -f {cname} >/dev/null 2>&1")

        args = ["docker", "run", "-d", "--name", cname, "--memory=" + MEMORY_CAP]
        for e in env:
            args += ["-e", e]
        for b in binds:
            cpath = b.split(":")[1] if ":" in b else b
            td = tempfile.mkdtemp(prefix="audit_")
            os.chmod(td, 0o777)
            tmpdirs.append(td)
            args += ["-v", f"{td}:{cpath}"]
        if cport:
            args += ["-p", f"127.0.0.1:{host_port}:{cport}/tcp"]
        args.append(image)
        if command.strip():
            args += command.split()

        run = subprocess.run(args, capture_output=True, text=True)
        if run.returncode != 0:
            results.append((name, image, cport, [], None, "START ERROR: " + run.stderr.strip()[:160]))
            for td in tmpdirs:
                shutil.rmtree(td, ignore_errors=True)
            continue

        # Wait for the app to come up: a reachable published port or any internal listener.
        reachable_code, listeners = "000", []
        deadline = time.time() + STARTUP_TIMEOUT
        while time.time() < deadline:
            state = sh(f"docker inspect -f '{{{{.State.Running}}}}' {cname}").stdout.strip()
            listeners = listening_ports(cname)
            if cport:
                reachable_code = sh(
                    f"curl -s -o /dev/null -m 3 -w '%{{http_code}}' http://127.0.0.1:{host_port}"
                ).stdout.strip()
            if (cport and cport in listeners) or (reachable_code not in ("000", "")):
                break
            if state == "false" and listeners == []:
                time.sleep(2)
            time.sleep(2)

        running = sh(f"docker inspect -f '{{{{.State.Running}}}}' {cname}").stdout.strip() == "true"
        if not running:
            verdict = "CRASHED (exited)"
        elif cport is None:
            verdict = "NO PORT in catalog config"
        elif cport in listeners:
            verdict = f"OK (listens on {cport}, http={reachable_code})"
        elif listeners:
            verdict = f"PORT MISMATCH: catalog={cport}, app listens on {listeners}"
        elif reachable_code not in ("000", ""):
            verdict = f"OK (reachable http={reachable_code})"
        else:
            verdict = f"UNREACHABLE: nothing on catalog port {cport} (no listeners detected)"

        results.append((name, image, cport, listeners, image_exposed(image), verdict))

        sh(f"docker rm -f {cname} >/dev/null 2>&1")
        for td in tmpdirs:
            shutil.rmtree(td, ignore_errors=True)

    print("\n===== SUPPLY DEPOT CATALOG PORT AUDIT =====\n")
    for name, image, cport, listeners, exposed, verdict in results:
        flag = "  " if verdict.startswith("OK") else ">>"
        print(f"{flag} {name}")
        print(f"     image:        {image}")
        print(f"     catalog port: {cport}   image EXPOSE: {exposed or '-'}   listening: {listeners or '-'}")
        print(f"     verdict:      {verdict}")
        if name in KNOWN_NEEDS_SETUP and not verdict.startswith("OK"):
            print(f"     note:         expected — {KNOWN_NEEDS_SETUP[name]}; not a port bug")
        print()
    bad = [r for r in results if not r[5].startswith("OK") and r[0] not in KNOWN_NEEDS_SETUP]
    print(f"===== {len([r for r in results if r[5].startswith('OK')])}/{len(results)} OK; "
          f"{len(bad)} unexpected issue(s), {len(KNOWN_NEEDS_SETUP)} known-needs-setup =====")


if __name__ == "__main__":
    main()
