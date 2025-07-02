# Dockerfile

# Stage 1: Install dependencies
# Using node:18-alpine as it's a small and common image.
FROM node:18-alpine AS deps
WORKDIR /app
# Copy package files and install dependencies.
# The asterisk handles package-lock.json for npm.
COPY package.json package-lock.json* ./
RUN npm install

# Stage 2: Build the application
FROM node:18-alpine AS builder
WORKDIR /app
# Copy dependencies from the 'deps' stage.
COPY --from=deps /app/node_modules ./node_modules
# Copy the rest of the application code.
COPY . .
# Disable Next.js telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED 1
# Build the Next.js application.
RUN npm run build

# Stage 3: Production image
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Disable Next.js telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED 1

# Create a non-root user for security.
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the standalone output from the builder stage.
# This includes all necessary files to run the app.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Set the user to the non-root user.
USER nextjs

EXPOSE 3000

# Set the port environment variable.
ENV PORT 3000

# The server.js file is created by 'next build' with 'output: standalone'.
CMD ["node", "server.js"]
