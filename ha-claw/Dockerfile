# ── Build Stage ────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install ALL dependencies (including devDeps for tsc)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source & compile TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# ── Runtime Stage (minimal image) ─────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Install only production dependencies (fresh, no devDeps)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JS from builder
COPY --from=builder /app/dist ./dist

# Copy agent definitions
COPY agents/ ./agents/

# /data is mounted by HA Supervisor (persistent across restarts/updates)
VOLUME /data

CMD ["node", "dist/index.js"]
