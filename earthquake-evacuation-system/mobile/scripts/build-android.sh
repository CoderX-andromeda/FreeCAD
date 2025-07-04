#!/bin/bash

# Earthquake Evacuation Android Build Script
echo "Building Android APK for Earthquake Evacuation App..."

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf android/app/build/
rm -rf node_modules/.cache/

# Install dependencies
echo "Installing dependencies..."
npm install

# Generate Android bundle
echo "Generating JavaScript bundle..."
npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res

# Create assets directory if it doesn't exist
mkdir -p android/app/src/main/assets

# Build debug APK
echo "Building debug APK..."
cd android
./gradlew assembleDebug

echo "Debug APK built successfully!"
echo "Location: android/app/build/outputs/apk/debug/app-debug.apk"

# Build release APK (unsigned)
echo "Building release APK..."
./gradlew assembleRelease

echo "Release APK built successfully!"
echo "Location: android/app/build/outputs/apk/release/app-release-unsigned.apk"

# Instructions for signing
echo ""
echo "To sign the release APK:"
echo "1. Generate a keystore: keytool -genkey -v -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000"
echo "2. Sign the APK: jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -keystore my-release-key.keystore app-release-unsigned.apk my-key-alias"
echo "3. Align the APK: zipalign -v 4 app-release-unsigned.apk earthquake-evacuation-release.apk"

cd ..
echo "Android build completed!"