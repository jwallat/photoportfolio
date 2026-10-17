FROM node:24-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY server.js ./
COPY public/ ./public/

# Writable cache for resized photos, owned by the unprivileged user.
# Mount a volume here to keep the cache across container re-creation.
ENV CACHE_DIR=/cache
RUN mkdir -p /cache && chown node:node /cache

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-3000}/healthz" || exit 1

CMD ["node", "server.js"]
