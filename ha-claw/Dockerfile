# ── Build Stage ────────────────────────────────────────────────
# Multi-arch: node:22-alpine supports aarch64 (HA Green) + amd64 natively
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy source & compile TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# ── Runtime Stage (minimal image) ─────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Copy only production artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Copy agent definitions
COPY agents/ ./agents/

# /data is mounted by HA Supervisor (persistent across restarts/updates)
# SUPERVISOR_TOKEN is injected by HA Supervisor at runtime
VOLUME /data

CMD ["node", "dist/index.js"]
