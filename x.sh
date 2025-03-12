#!/bin/bash

# Clone the repository and checkout the 'stable' tag
git clone --branch stable --depth 1 https://github.com/t3volabs/t3vo-app.git

# Navigate into the cloned repository
cd t3vo-app || exit 1

# Install dependencies
npm i

# Build the project
npm run build

# Move the generated `dist` folder to the root directory
mv dist ../

# Navigate back to the root directory
cd ..

# Remove the cloned repository
rm -rf t3vo-app

echo "Build complete. The dist folder is now in the root directory."
