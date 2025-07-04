#!/bin/bash

# Earthquake Evacuation iOS Build Script
echo "Building iOS app for Earthquake Evacuation App..."

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "Error: iOS builds require macOS"
  exit 1
fi

# Check if Xcode is installed
if ! command -v xcodebuild &> /dev/null; then
  echo "Error: Xcode is not installed"
  exit 1
fi

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf ios/build/
rm -rf node_modules/.cache/

# Install dependencies
echo "Installing dependencies..."
npm install

# Install iOS dependencies
echo "Installing iOS dependencies..."
cd ios
pod install --repo-update
cd ..

# Generate iOS bundle
echo "Generating JavaScript bundle..."
npx react-native bundle --platform ios --dev false --entry-file index.js --bundle-output ios/main.jsbundle

# Build for simulator (debug)
echo "Building for iOS Simulator (Debug)..."
xcodebuild -workspace ios/EarthquakeEvacuation.xcworkspace \
           -scheme EarthquakeEvacuation \
           -configuration Debug \
           -sdk iphonesimulator \
           -derivedDataPath ios/build

echo "iOS Simulator build completed!"
echo "Location: ios/build/Build/Products/Debug-iphonesimulator/EarthquakeEvacuation.app"

# Build for device (release)
echo "Building for iOS Device (Release)..."
xcodebuild -workspace ios/EarthquakeEvacuation.xcworkspace \
           -scheme EarthquakeEvacuation \
           -configuration Release \
           -sdk iphoneos \
           -derivedDataPath ios/build \
           CODE_SIGN_IDENTITY="" \
           CODE_SIGNING_REQUIRED=NO

echo "iOS Device build completed!"
echo "Location: ios/build/Build/Products/Release-iphoneos/EarthquakeEvacuation.app"

# Create IPA (if building for release)
echo "Creating IPA file..."
mkdir -p ios/build/Payload
cp -r ios/build/Build/Products/Release-iphoneos/EarthquakeEvacuation.app ios/build/Payload/
cd ios/build
zip -r EarthquakeEvacuation.ipa Payload/
cd ../..

echo "IPA created: ios/build/EarthquakeEvacuation.ipa"

echo ""
echo "Build Instructions:"
echo "1. For App Store: Open project in Xcode, configure signing, and use Archive"
echo "2. For TestFlight: Use Xcode's Archive and Upload to App Store Connect"
echo "3. For AdHoc: Configure provisioning profile and use Archive with distribution certificate"

echo "iOS build completed!"