#!/bin/bash

# Download the latest stable release ZIP archive
curl -L -o t3vo-app.zip https://github.com/t3volabs/t3vo-app/archive/refs/heads/stable.zip

# Unzip the archive
unzip t3vo-app.zip

# Navigate into the extracted folder
cd t3vo-app-stable || exit 1

# Install dependencies
npm i

# Build the project
npm run build

# Move the generated `dist` folder to the root directory
mv dist ../

# Navigate back to the root directory
cd ..

# Cleanup
rm -rf t3vo-app-stable t3vo-app.zip

echo "Build complete. The dist folder is now in the root directory."
