# =============================================================================
# Web Terminal — Production Dockerfile
# =============================================================================
# Build:  docker build -t web-terminal .
# Run:    docker run -p 3000:3000 web-terminal
# Detach: docker run -d -p 3000:3000 --name terminal web-terminal
# =============================================================================

# ---------- Stage 1: Dependencies ----------
FROM oven/bun:1 AS deps
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# ---------- Stage 2: Build ----------
FROM oven/bun:1 AS builder
WORKDIR /app

# Copy lockfile first for cache, then node_modules from deps stage
COPY package.json bun.lock* ./
COPY --from=deps /app/node_modules ./node_modules

# Copy source files
COPY src/ ./src/
COPY public/ ./public/
COPY next.config.ts tsconfig.json postcss.config.mjs tailwind.config.ts components.json ./

# Build the Next.js application
RUN bun run build

# ---------- Stage 3: Production ----------
FROM oven/bun:1 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Ensure home directory exists
RUN mkdir -p /home/nextjs && chown nextjs:nodejs /home/nextjs

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
