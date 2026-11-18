# Stage 1: Install dependencies
FROM node:26.12.1-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build the application
FROM node:26.12.1-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Production runner
FROM node:26.12.1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nuxt
USER nuxt

COPY --from=builder --chown=nuxt:nodejs /app/.output ./.output
COPY --from=builder --chown=nuxt:nodejs /app/server/database/migrations ./server/database/migrations

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
