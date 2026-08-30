# ── Build Stage ────────────────────────────────────────────────
FROM node:26-alpine AS builder

WORKDIR /app

# Install ALL dependencies including devDeps (typescript needed for build)
COPY package.json package-lock.json* ./
RUN npm ci && echo "build-deps-installed"

# Copy source & compile TypeScript.
# "npm run build" runs the prebuild hook first, which regenerates
# src/web/dashboard.ts from src/web/ui/ – so the image can never ship a
# dashboard that is out of sync with its sources.
COPY tsconfig.json ./
COPY scripts/ ./scripts/
COPY src/ ./src/
RUN npm run build

# ── Runtime Stage (minimal image) ─────────────────────────────
FROM node:26-alpine

WORKDIR /app

# Install only production dependencies (no devDeps = smaller image)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JS from builder
COPY --from=builder /app/dist ./dist

# Copy agent definitions
COPY agents/ ./agents/

# /data is mounted by HA Supervisor (persistent across restarts/updates)
VOLUME /data

CMD ["node", "dist/index.js"]
