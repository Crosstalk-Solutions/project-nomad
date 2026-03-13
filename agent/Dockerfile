# =============================================================================
# PROJECT N.O.M.A.D. — Homelab Edition
# Lightweight Monitoring Agent
# =============================================================================
# A minimal monitoring agent that collects system metrics and reports
# them to the Nomad server. Designed for low resource usage.
#
# Build:  docker build -t nomad-agent ./agent
# Run:    docker run -d --name nomad-agent \
#           -e NOMAD_SERVER_URL=http://your-nomad-server:8080 \
#           -e AGENT_SECRET=your-secret \
#           -v /var/run/docker.sock:/var/run/docker.sock:ro \
#           -v /proc:/host/proc:ro \
#           -v /sys:/host/sys:ro \
#           nomad-agent
# =============================================================================

FROM node:22-alpine

RUN apk add --no-cache curl

WORKDIR /agent

COPY package.json ./
RUN npm ci --omit=dev 2>/dev/null || npm init -y

COPY agent.mjs ./
COPY healthcheck.mjs ./

# Run as non-root
RUN addgroup -g 1001 -S nomad && \
    adduser -S nomad -u 1001 -G nomad
USER nomad

ENV NODE_ENV=production
ENV AGENT_PORT=9100
ENV COLLECT_INTERVAL=30

EXPOSE 9100

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node healthcheck.mjs || exit 1

CMD ["node", "agent.mjs"]
