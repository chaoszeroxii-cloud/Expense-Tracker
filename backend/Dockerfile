# ── Development ──────────────────────────────────────────────
FROM node:20-alpine AS development
WORKDIR /app
COPY package*.json ./
RUN npm install
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
RUN npm install --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost:3001/api/auth/me || exit 0

EXPOSE 3001
CMD ["node", "dist/main"]
