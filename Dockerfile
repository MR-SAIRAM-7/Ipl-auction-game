# syntax=docker/dockerfile:1

# ---------- build the client ----------
FROM node:22-alpine AS client
WORKDIR /app

COPY client/package*.json ./client/
RUN npm --prefix client ci

COPY client ./client
RUN npm --prefix client run build

# ---------- server dependencies, production only ----------
FROM node:22-alpine AS deps
WORKDIR /app

COPY server/package*.json ./server/
RUN npm --prefix server ci --omit=dev

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Tini reaps zombies and forwards SIGTERM, so the graceful shutdown actually runs.
RUN apk add --no-cache tini

COPY --from=deps  /app/server/node_modules ./server/node_modules
COPY server/package.json ./server/package.json
COPY server/src ./server/src

# The server serves the built client from ../../client/dist relative to server/src.
COPY --from=client /app/client/dist ./client/dist

# Never run as root.
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/src/index.js"]
