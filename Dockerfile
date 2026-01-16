FROM node:22-slim AS base

# Install bash & curl for entrypoint script compatibility
# as well as dependencies for Playwright Chromium
RUN apt-get update && apt-get install -y \
    bash \
    curl \
    wget \
    ca-certificates \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    libxcb-shm0 \
    libx11-xcb1 \
    libxrandr2 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxfixes3 \
    libxi6 \
    libgtk-3-0t64 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libatk1.0-0t64 \
    libcairo-gobject2 \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    libxrender1 \
    libasound2t64
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
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-deps /app/node_modules /app/node_modules
COPY --from=build /app/build /app
# Copy root package.json for version info
COPY package.json /app/version.json
COPY admin/docs /app/docs
EXPOSE 8080
CMD ["node", "./bin/server.js"]