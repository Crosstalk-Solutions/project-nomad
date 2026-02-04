FROM node:22.16.0-alpine3.22 AS base

# Install bash & curl for entrypoint script compatibility, graphicsmagick for pdf2pic, and vips-dev & build-base for sharp 
RUN apk add --no-cache bash curl graphicsmagick vips-dev build-base

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
COPY README.md /app/README.md
EXPOSE 8080
CMD ["node", "./bin/server.js"]