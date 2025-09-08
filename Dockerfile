FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* tsconfig.json ./

# Install system build deps for canvas (chartjs-node-canvas)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    pkgconfig \
    cairo-dev \
    pango-dev \
    libjpeg-turbo-dev \
    giflib-dev \
    pixman-dev

# Install all dependencies (including dev dependencies for TypeScript compilation and native builds)
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

# Runtime libs for canvas
RUN apk add --no-cache \
    cairo \
    pango \
    fontconfig \
    ttf-dejavu \
    libjpeg-turbo \
    giflib \
    pixman
RUN fc-cache -f

CMD ["node", "dist/bot.js"]
