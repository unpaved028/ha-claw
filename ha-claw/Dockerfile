# node:22-alpine index digest as of 2026-08-31 (multi-arch: amd64 + aarch64).
# The same commit then produces the same image. Refresh the digest when bumping Node.
ARG NODE_IMAGE=node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

# ── Build Stage ────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS builder

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
FROM ${NODE_IMAGE}

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY agents/ ./agents/
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Supervisor mounts /data. Do not declare VOLUME — it is already a mount.
# The process drops to user `node` in the entrypoint after chowning /data.

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["/entrypoint.sh"]
