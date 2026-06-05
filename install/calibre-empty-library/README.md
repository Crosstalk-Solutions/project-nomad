# Empty Calibre library (Calibre-Web seed)

`metadata.db` is an empty Calibre library database, generated once with
`calibredb --with-library <dir> list` (calibre 9.9).

Calibre-Web cannot create a library from scratch. On a fresh NOMAD it would dead-end
at the "Database Configuration" page asking for an existing Calibre database. To avoid
that, the Calibre-Web pre-install action seeds this file into `storage/books` (only when
no `metadata.db` is already there) and hands ownership to the container's user, so the
user just points Calibre-Web at `/books` once and starts adding books.

This file is bundled into the admin image via the Dockerfile and copied at install time
by `DockerService._runPreinstallActions__CalibreWeb()`. To regenerate it:

```sh
docker run --rm -v "$PWD/lib:/books" --entrypoint bash lscr.io/linuxserver/calibre:latest \
  -c "calibredb --with-library /books list"
# then copy lib/metadata.db here
```
