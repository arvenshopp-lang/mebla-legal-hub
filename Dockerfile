# ==============================================================================
# MEHLA LEGAL PLATFORM — PRODUCTION DOCKERFILE (ORCA SAUDI CLOUD)
# Multi-stage optimized Node.js container with security hardening & non-root user
# ==============================================================================

# Stage 1: Dependencies & Build
FROM node:22-alpine AS builder

WORKDIR /app

# Install build essentials for native dependencies if needed
RUN apk add --no-cache libc6-compat python3 make g++

# Copy package descriptors
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build production artifacts (SSR & Client bundles)
ENV NODE_ENV=production
RUN npx vite build

# Stage 2: Production Runner
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Create dedicated non-root user for security compliance (Saudi NCA / CIS benchmark)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 mehla

# Copy production node_modules and built output
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Set proper ownership
RUN chown -R mehla:nodejs /app

# Switch to non-root user
USER mehla

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start the SSR Nitro/TanStack server
CMD ["node", ".output/server/index.mjs"]
