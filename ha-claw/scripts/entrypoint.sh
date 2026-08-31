#!/bin/sh
set -e
mkdir -p /data/store
# Supervisor mounts /data as root. Become node after the directory is writable.
if [ "$(id -u)" = "0" ]; then
  chown -R node:node /data 2>/dev/null || true
  exec su node -s /bin/sh -c 'exec node dist/index.js'
fi
exec node dist/index.js
