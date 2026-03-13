FROM node:22-slim AS base

# Install bash & curl for entrypoint script compatibility, graphicsmagick for pdf2pic, and vips-dev & build-base for sharp
RUN apt-get update && apt-get install -y bash curl graphicsmagick libvips-dev build-essential \
    && rm -rf /var/lib/apt/lists/*

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

# Labels
LABEL org.opencontainers.image.title="Project N.O.M.A.D — Homelab Edition" \
      org.opencontainers.image.description="Network Operations Monitoring and Automation Dashboard — Container-native homelab platform" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.vendor="Crosstalk Solutions, LLC" \
      org.opencontainers.image.documentation="https://github.com/DocwatZ/project-nomad-homelab-edition/blob/main/README.md" \
      org.opencontainers.image.source="https://github.com/DocwatZ/project-nomad-homelab-edition" \
      org.opencontainers.image.licenses="Apache-2.0"

ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-deps /app/node_modules /app/node_modules
COPY --from=build /app/build /app
# Copy root package.json for version info
COPY package.json /app/version.json
COPY admin/docs /app/docs
COPY README.md /app/README.md

# Create storage directory with proper permissions
RUN mkdir -p /app/storage && chown -R node:node /app/storage

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD curl -f http://localhost:8080/api/health || exit 1

CMD ["node", "./bin/server.js"]