# Use the official Node.js 20 slim image as a base for ARM64
FROM node:slim

# Set the working directory in the container
WORKDIR /app

# install necessary packages
RUN apt-get update && apt-get install -y curl unzip

# Copy package.json and package-lock.json, then install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the application
RUN npm run build

# Expose necessary ports
EXPOSE 57303

# Start the application
CMD ["npm", "run", "start"]
