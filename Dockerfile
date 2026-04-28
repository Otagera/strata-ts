# Use the official Bun image
FROM oven/bun:latest

# Set the working directory
WORKDIR /app

# Copy package.json and bun.lock (if it exists)
COPY package.json ./
COPY bun.lock ./

# Install dependencies
RUN bun install

# Copy the rest of the application
COPY . .

# Create the data directory for persistence
RUN mkdir -p data

# Expose the port the app runs on
EXPOSE 2345

# Set environment to production
ENV NODE_ENV=production

# Command to run the application
# We use src/server.ts which is the UI + API server
CMD ["bun", "run", "src/server.ts"]
