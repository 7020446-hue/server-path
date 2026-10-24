# Base Node.js image (Alpine for small footprint & high security)
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies needed for native modules / archiver / git if needed
RUN apk add --no-cache bash curl

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Set environment defaults
ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    REQUIRE_AUTH=true \
    CREATE_SAMPLE_DATA=false

# Expose default application port
EXPOSE 4000

# Health check to ensure server responds
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4000/api/system || exit 1

# Start the application
CMD ["node", "server.js"]
