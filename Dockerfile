FROM node:22-slim AS base

# Install bash & curl for entrypoint script compatibility, graphicsmagick for pdf2pic, and vips-dev & build-base for sharp 
RUN apt-get update && apt-get install -y bash curl graphicsmagick libvips-dev build-essential

# All deps stage
FROM base AS deps
WORKDIR /app
ADD admin/package.json admin/package-lock.json ./
RUN npm ci

# Production only deps stage
FROM base AS production-deps
WORKDIR /app
ADD admin/package.json admin/package-lock.json ./
RUN npm ci --omit=dev

# Build stage
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules /app/node_modules
ADD admin/ ./
RUN node ace build

# Production stage
FROM base
ARG VERSION=dev
ARG BUILD_DATE
ARG VCS_REF
ARG TARGETARCH

# go-pmtiles (regional map extracts). Pinned so the CLI's stdout format stays
# in sync with parseDryRunOutput().
ARG PMTILES_VERSION=1.30.2
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
      amd64) PMTILES_ARCH=x86_64 ;; \
      arm64) PMTILES_ARCH=arm64 ;; \
      *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    TARBALL=/tmp/go-pmtiles.tar.gz; \
    curl -fsSL -o "$TARBALL" \
      "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_${PMTILES_ARCH}.tar.gz"; \
    tar -xzf "$TARBALL" -C /usr/local/bin pmtiles; \
    rm -f "$TARBALL"; \
    chmod +x /usr/local/bin/pmtiles; \
    /usr/local/bin/pmtiles version

# Labels
LABEL org.opencontainers.image.title="Project N.O.M.A.D" \
      org.opencontainers.image.description="The Project N.O.M.A.D Official Docker image" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.vendor="Crosstalk Solutions, LLC" \
      org.opencontainers.image.documentation="https://github.com/CrosstalkSolutions/project-nomad/blob/main/README.md" \
      org.opencontainers.image.source="https://github.com/CrosstalkSolutions/project-nomad" \
      org.opencontainers.image.licenses="Apache-2.0"

ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-deps /app/node_modules /app/node_modules
COPY --from=build /app/build /app
# Generate version.json from the VERSION build-arg so the image tag is the
# single source of truth (previously copied root package.json, which drifted
# from the tag when semantic-release did not commit the bump back).
RUN echo "{\"version\":\"${VERSION}\"}" > /app/version.json

# Copy docs and README for access within the container
COPY admin/docs /app/docs
COPY README.md /app/README.md

# Copy entrypoint script and ensure it's executable
COPY install/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]