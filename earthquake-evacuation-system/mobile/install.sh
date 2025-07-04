#!/bin/bash

# Earthquake Evacuation Mobile App Installation Script
echo "🚨 Earthquake Evacuation Mobile App Installer 🚨"
echo "=================================================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version is too old. Please install Node.js 16 or higher."
    exit 1
fi

echo "✅ Node.js $(node -v) found"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    exit 1
fi
echo "✅ npm $(npm -v) found"

# Platform selection
echo ""
echo "Select platform to build:"
echo "1) Android APK"
echo "2) iOS App (macOS only)"
echo "3) Both platforms"
echo "4) Development setup only"
read -p "Enter your choice (1-4): " platform_choice

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install Node.js dependencies"
    exit 1
fi
echo "✅ Node.js dependencies installed"

# Setup environment
if [ ! -f ".env" ]; then
    echo ""
    echo "⚙️ Setting up environment configuration..."
    cp .env.example .env
    echo "✅ Environment file created (.env)"
    echo "📝 Please edit .env file with your configuration"
fi

# Platform-specific setup
case $platform_choice in
    1|3) # Android
        echo ""
        echo "🤖 Setting up Android..."
        
        # Check Android SDK
        if [ -z "$ANDROID_HOME" ]; then
            echo "⚠️  ANDROID_HOME not set. Please install Android Studio and set ANDROID_HOME"
            echo "   Example: export ANDROID_HOME=~/Library/Android/sdk"
        else
            echo "✅ Android SDK found at $ANDROID_HOME"
        fi
        
        # Check Java
        if ! command -v javac &> /dev/null; then
            echo "⚠️  Java JDK not found. Please install JDK 11+"
        else
            echo "✅ Java JDK found"
        fi
        
        if [ "$platform_choice" = "1" ]; then
            echo ""
            echo "🔨 Building Android APK..."
            ./scripts/build-android.sh
        fi
        ;;
esac

case $platform_choice in
    2|3) # iOS
        echo ""
        echo "🍎 Setting up iOS..."
        
        # Check if running on macOS
        if [[ "$OSTYPE" != "darwin"* ]]; then
            echo "❌ iOS development requires macOS"
            if [ "$platform_choice" = "2" ]; then
                exit 1
            fi
        else
            # Check Xcode
            if ! command -v xcodebuild &> /dev/null; then
                echo "⚠️  Xcode not found. Please install Xcode from App Store"
            else
                echo "✅ Xcode found"
            fi
            
            # Check CocoaPods
            if ! command -v pod &> /dev/null; then
                echo "📦 Installing CocoaPods..."
                sudo gem install cocoapods
            else
                echo "✅ CocoaPods found"
            fi
            
            # Install iOS dependencies
            echo "📦 Installing iOS dependencies..."
            cd ios
            pod install --repo-update
            cd ..
            echo "✅ iOS dependencies installed"
            
            if [ "$platform_choice" = "2" ] || [ "$platform_choice" = "3" ]; then
                echo ""
                echo "🔨 Building iOS app..."
                ./scripts/build-ios.sh
            fi
        fi
        ;;
esac

case $platform_choice in
    4) # Development only
        echo ""
        echo "🔧 Development setup completed!"
        echo ""
        echo "To run in development mode:"
        echo "1. Start Metro bundler: npx react-native start"
        echo "2. Run Android: npx react-native run-android"
        echo "3. Run iOS: npx react-native run-ios"
        ;;
esac

echo ""
echo "🎉 Installation completed!"
echo ""
echo "📱 Mobile App Features:"
echo "  • AR navigation with camera overlay"
echo "  • Real-time earthquake detection"
echo "  • Dynamic route optimization"
echo "  • Emergency SOS functionality"
echo "  • Push notifications for alerts"
echo "  • Background monitoring"
echo ""
echo "📋 Next Steps:"
echo "1. Configure .env file with your API endpoints"
echo "2. Test the app on real devices for full functionality"
echo "3. Set up push notification certificates"
echo "4. Configure signing for app store distribution"
echo ""
echo "📖 Documentation: See README.md for detailed instructions"
echo "🐛 Issues: Report bugs and feature requests on GitHub"
echo ""
echo "🚨 Ready for earthquake emergencies! 🚨"