FROM python:3.12-slim-trixie@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b AS base

FROM base AS tools
ARG TARGETARCH
ARG PMTILES_VERSION=1.30.2
ARG VERSATILES_VERSION=5.12.0
# PMTiles pins match the admin image. VersaTiles hashes are release-asset
# digests from the corresponding GitHub tag.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    case "${TARGETARCH:-amd64}" in \
      amd64) \
        tiles_arch=x86_64; versa_arch=x86_64; \
        pmtiles_sha=2cd3aa18868297fc88425038f794efdc0995e0275f4ca16fa496dd79e245a40c; \
        versatiles_sha=14eb20b499e58f4425f097997d4e8aaaeda40a41548f72dece732d4877884c21 ;; \
      arm64) \
        tiles_arch=arm64; versa_arch=aarch64; \
        pmtiles_sha=804cdf071834e1156af554c1a26cc42b56b9cde5a2db9c6e3653d16fb846d5fa; \
        versatiles_sha=a731dec934179fe28fb5f9e047da655861107aa36659928d0909f6341e5a92d1 ;; \
      *) echo "Unsupported World Offline platform: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    cd /tmp; \
    pmtiles_file="go-pmtiles_${PMTILES_VERSION}_Linux_${tiles_arch}.tar.gz"; \
    versa_file="versatiles-linux-musl-${versa_arch}.tar.gz"; \
    curl -fsSL --retry 3 -o "$pmtiles_file" \
      "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/${pmtiles_file}"; \
    echo "$pmtiles_sha  $pmtiles_file" | sha256sum -c -; \
    tar -xzf "$pmtiles_file" -C /usr/local/bin pmtiles; \
    curl -fsSL --retry 3 -o "$versa_file" \
      "https://github.com/versatiles-org/versatiles-rs/releases/download/v${VERSATILES_VERSION}/${versa_file}"; \
    echo "$versatiles_sha  $versa_file" | sha256sum -c -; \
    member=$(tar -tzf "$versa_file" | awk '/(^|\/)versatiles$/ { print; exit }'); \
    test -n "$member"; \
    tar -xOzf "$versa_file" "$member" > /usr/local/bin/versatiles; \
    chmod 755 /usr/local/bin/pmtiles /usr/local/bin/versatiles; \
    pmtiles version; \
    versatiles --version; \
    rm -f "$pmtiles_file" "$versa_file"

FROM base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libbrotli1 libexpat1 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=tools /usr/local/bin/pmtiles /usr/local/bin/versatiles /usr/local/bin/
WORKDIR /app
COPY requirements.txt .
RUN python -m pip install --no-cache-dir --require-hashes --only-binary=:all: -r requirements.txt \
    && python -c "import ctypes, numpy, PIL, rasterio; ctypes.CDLL('libbrotlidec.so.1'); ctypes.CDLL('libbrotlienc.so.1')"
COPY server.py world_pack.py world_provider.py satellite_provider.py local_detail.py blue_marble_source_sizes.json export_catalog.py ./
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    WORLD_PMTILES_BIN=/usr/local/bin/pmtiles \
    WORLD_VERSATILES_BIN=/usr/local/bin/versatiles
USER 65532:65532
EXPOSE 8083
ENTRYPOINT ["python", "/app/server.py"]
