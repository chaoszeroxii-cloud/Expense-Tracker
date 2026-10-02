# ── Development ──────────────────────────────────────────────
FROM node:20-alpine AS development
WORKDIR /app
COPY package*.json ./
# `ci` not `install`: there is a lockfile, and `install` is free to resolve a different
# tree than the one that was tested.
RUN npm ci
COPY . .
EXPOSE 3001

# ── Builder ───────────────────────────────────────────────────
FROM development AS builder
RUN npm run build

# ── Production ────────────────────────────────────────────────
FROM node:20-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# /api/health, not /api/auth/me: the latter requires a JWT and answers 401 to the
# healthcheck's unauthenticated request, so wget failed every time — and `|| exit 0`
# swallowed that, reporting the container healthy whether or not it was serving.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

EXPOSE 3001
# Migrations first, then boot — the same contract as `npm run start:prod`.
CMD ["npm", "run", "start:prod"]
