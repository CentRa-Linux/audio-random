# === Base: Install Dependencies ===
# Get base image
FROM node:20-alpine AS base
# Set working directory
WORKDIR /app
# Copy package.json and package-lock.json
COPY package*.json ./
# Install dependencies
RUN npm install

# === Builder: Build the Application ===
FROM base AS builder
# Set working directory
WORKDIR /app
# Copy all files
COPY . .
# Generate the Next.js build
RUN npm run build

# === Runner: Production Image ===
FROM node:20-alpine AS runner
# Set working directory
WORKDIR /app
ENV NODE_ENV=production

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the entire standalone application output from the builder stage.
# The trailing dot on the source path is crucial to copy the contents.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/. ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static/. ./.next/static/

# Set the user to the non-root user
USER nextjs

# Expose the port the app runs on
EXPOSE 3000
ENV PORT=3000

# Start the app
CMD ["node", "server.js"]
