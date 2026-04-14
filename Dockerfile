FROM node:20-bullseye-slim AS base

# Install system dependencies: Icarus Verilog for simulation pipeline
RUN apt-get update && apt-get install -y --no-install-recommends iverilog && rm -rf /var/lib/apt/lists/*

# Step 1. Install dependencies and build
FROM base AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Step 2. Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PATH="/usr/bin:${PATH}"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets (may be empty, that's OK)
COPY --from=builder /app/public ./public

# Prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copy standalone server and static files
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy PDK liberty files (needed at runtime for synthesis)
COPY --from=builder --chown=nextjs:nodejs /app/lib/pdks ./lib/pdks

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
