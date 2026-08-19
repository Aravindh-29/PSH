# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build React client
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS client-builder

WORKDIR /build/client

COPY client/package.json client/package-lock.json* ./
RUN npm ci --prefer-offline

COPY client/ ./
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Production image
# argon2 is a native module → needs build tools during npm ci
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install server dependencies (production only)
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev --prefer-offline

# Copy server source
COPY server/ ./server/

# Copy database init scripts
COPY database/ ./database/

# Copy built React app — server.js serves it as static files in production
COPY --from=client-builder /build/client/dist ./client/dist

# NODE_PATH lets database/init.js resolve argon2/pg from server/node_modules
# without requiring a separate npm install in the database directory
ENV NODE_PATH=/app/server/node_modules
ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "server/src/server.js"]
