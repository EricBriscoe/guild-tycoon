FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* tsconfig.json ./

# System deps to build native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Install all dependencies (including dev dependencies for TypeScript compilation)
RUN npm ci || npm install

# Copy TypeScript source code
COPY src ./src

# Compile TypeScript
RUN npm run build

# Prune dev dependencies to produce production-ready node_modules
RUN npm prune --omit=dev

# Production stage
FROM node:20-alpine AS production
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Copy production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist
COPY README.md ./

# Ensure data dir exists at runtime
RUN mkdir -p /app/data

CMD ["node", "dist/bot.js"]
