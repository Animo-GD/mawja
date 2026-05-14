# ──────────────────────────────────────────────────────────────────────────────
# SocialFlow — Multi-stage Dockerfile
# Stage 1: deps        → install production + dev deps
# Stage 2: builder     → build Next.js standalone output
# Stage 3: runner      → minimal image with only what's needed to run
# ──────────────────────────────────────────────────────────────────────────────

# ── 1. Install dependencies ───────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Install libc compat for Alpine (required by some native modules)
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
RUN npm ci


# ── 2. Build ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Expose env vars needed at BUILD time (public vars only — secrets go at runtime)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_URL

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build


# ── 3. Production runner ──────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy standalone build output
COPY --from=builder /app/public            ./public
COPY --from=builder --chown=nextjs:nodejs  /app/.next/standalone  ./
COPY --from=builder --chown=nextjs:nodejs  /app/.next/static      ./.next/static

USER nextjs

EXPOSE 3000

# Runtime secrets — injected by Coolify via env vars, NOT baked into the image
# Required:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   NEXT_PUBLIC_API_URL
#   NEXTAUTH_SECRET
#   N8N_CONTENT_GENERATE_URL
# Optional:
#   N8N_POST_SCHEDULE_URL

# Health check using the existing /api/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
