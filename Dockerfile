# Use the official Node.js 20 slim image as a base for ARM64
FROM node:slim

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json, then install dependencies
COPY package*.json ./

RUN npm install

# Copy the rest of the application code
COPY . .

# Expose necessary ports
EXPOSE 57303

# Add and set permissions for startup script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Start the application
CMD ["sh", "/app/start.sh"]