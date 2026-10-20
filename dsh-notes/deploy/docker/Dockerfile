# Build from the dsh-notes package root:
#   docker build -f deploy/docker/Dockerfile -t dsh-notes:0.1.0 .
#
# Runtime needs only Node 24. Accounts and tokens are created with `docker compose
# exec notes node server/bin.js user add ...`; they are never accepted over HTTP.
FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./package.json
COPY server ./server
COPY web ./web
COPY README.md ./README.md
COPY docs ./docs

RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 8787
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# The container port is never published directly: Caddy reaches it over the
# private compose network. `--trusted-proxy *` is safe only because the service
# has no published port and listens on the container network.
CMD ["node", "server/bin.js", "serve", "--data-dir", "/data", "--host", "0.0.0.0", "--port", "8787", "--behind-proxy", "--trusted-proxy", "*"]
