# Dockerfile

# 1. Builder Stage: Build the Next.js application
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source code
COPY . .

# Build the app
RUN npm run build

# 2. Runner Stage: Create the final, minimal image
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy the standalone output from the builder stage with correct permissions.
# The 'standalone' output is a self-contained folder with all necessary files.
COPY --from=builder --chown=node:node /app/.next/standalone ./

# Run the application as a non-root user for security
USER node

EXPOSE 3000

# The port can be set via environment variable, defaulting to 3000
ENV PORT 3000

# Start the server
CMD ["node", "server.js"]
