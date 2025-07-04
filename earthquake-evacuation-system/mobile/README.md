# Earthquake Evacuation Mobile App

This is the mobile application for the Earthquake Evacuation System with AR navigation, real-time route optimization, and emergency coordination features.

## Features

- **AR Navigation**: Real-time camera overlay with evacuation route guidance
- **Emergency Detection**: Automatic earthquake detection and emergency alerts
- **Route Optimization**: Dynamic route calculation based on real-time hazards
- **Push Notifications**: Emergency alerts and evacuation instructions
- **Background Monitoring**: Continuous earthquake monitoring
- **Emergency Communication**: SOS functionality and emergency contacts
- **Offline Maps**: Cached maps for areas without connectivity

## Prerequisites

### For Android Development
- Node.js 16+ and npm
- Android Studio with Android SDK
- Java Development Kit (JDK) 11+
- Android API Level 33 (targetSdkVersion)

### For iOS Development
- macOS with Xcode 12+
- Node.js 16+ and npm
- CocoaPods
- iOS 12.4+ deployment target

## Installation

### 1. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# For iOS only (requires macOS)
cd ios && pod install && cd ..
```

### 2. Setup Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# API_BASE_URL=http://localhost:3000
# USGS_API_KEY=your_usgs_api_key
```

### 3. Run Development Version

```bash
# Start Metro bundler
npx react-native start

# Run on Android (in another terminal)
npx react-native run-android

# Run on iOS (in another terminal, macOS only)
npx react-native run-ios
```

## Building for Distribution

### Android APK

```bash
# Make build script executable
chmod +x scripts/build-android.sh

# Build APK
./scripts/build-android.sh
```

This will generate:
- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Release APK: `android/app/build/outputs/apk/release/app-release-unsigned.apk`

### iOS App

```bash
# Make build script executable (macOS only)
chmod +x scripts/build-ios.sh

# Build iOS app
./scripts/build-ios.sh
```

This will generate:
- Simulator app: `ios/build/Build/Products/Debug-iphonesimulator/EarthquakeEvacuation.app`
- Device app: `ios/build/Build/Products/Release-iphoneos/EarthquakeEvacuation.app`
- IPA file: `ios/build/EarthquakeEvacuation.ipa`

## Installation on Devices

### Android Installation

1. **Enable Developer Options**:
   - Go to Settings > About Phone
   - Tap "Build Number" 7 times

2. **Enable USB Debugging**:
   - Go to Settings > Developer Options
   - Enable "USB Debugging"

3. **Install APK**:
   ```bash
   # Via ADB
   adb install android/app/build/outputs/apk/debug/app-debug.apk
   
   # Or copy APK to device and install manually
   ```

### iOS Installation

1. **For Development**:
   - Connect iOS device to Mac
   - Open project in Xcode
   - Select your device and run

2. **For Distribution**:
   - Use Apple Developer account
   - Configure signing in Xcode
   - Archive and distribute via App Store Connect or AdHoc

## App Store Distribution

### Google Play Store (Android)

1. **Generate Signed APK**:
   ```bash
   # Generate keystore
   keytool -genkey -v -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
   
   # Configure gradle.properties with keystore details
   # Build signed APK
   cd android && ./gradlew assembleRelease
   ```

2. **Upload to Play Console**:
   - Create app listing
   - Upload AAB/APK
   - Configure app details and pricing
   - Submit for review

### Apple App Store (iOS)

1. **Configure in Xcode**:
   - Set up Apple Developer account
   - Configure provisioning profiles
   - Set app identifier and signing

2. **Archive and Submit**:
   - Product > Archive in Xcode
   - Upload to App Store Connect
   - Configure app metadata
   - Submit for review

## Permissions Required

### Android
- Location (fine and coarse)
- Camera (for AR navigation)
- Storage (for offline maps)
- Vibrate (haptic feedback)
- Internet (API communication)
- Wake lock (background monitoring)
- Boot completed (auto-start monitoring)

### iOS
- Location (always and when in use)
- Camera (AR navigation)
- Motion sensors (earthquake detection)
- Push notifications (emergency alerts)
- Background app refresh (monitoring)
- Contacts (emergency contacts)

## Architecture

```
src/
├── components/          # React Native components
│   ├── ARNavigationView.js    # AR navigation interface
│   ├── EmergencyPanel.js      # Emergency controls
│   └── RouteDisplay.js        # Route visualization
├── services/           # Core services
│   ├── LocationService.js     # GPS and location tracking
│   ├── MotionService.js       # Earthquake detection
│   ├── RouteService.js        # Route calculation
│   └── NotificationService.js # Push notifications
├── utils/              # Utility functions
└── config/             # Configuration files
```

## API Integration

The mobile app communicates with the backend server for:
- Real-time route calculation
- Emergency coordination
- USGS earthquake data
- Crowd density information
- Hazard reporting

API endpoints:
- `GET /api/routes/calculate` - Route calculation
- `POST /api/emergency/sos` - SOS alerts
- `GET /api/earthquakes/latest` - Earthquake data
- `WebSocket /ws` - Real-time updates

## Troubleshooting

### Common Issues

1. **Metro bundler issues**:
   ```bash
   npx react-native start --reset-cache
   ```

2. **Android build failures**:
   ```bash
   cd android && ./gradlew clean && cd ..
   ```

3. **iOS pod install issues**:
   ```bash
   cd ios && pod deintegrate && pod install && cd ..
   ```

4. **Permission denied on scripts**:
   ```bash
   chmod +x scripts/*.sh
   ```

### Development Tips

- Use React Native Debugger for debugging
- Test on real devices for accurate sensor data
- Use Flipper for network inspection
- Test background modes thoroughly
- Verify push notifications in production environment

## Security Considerations

- API keys stored securely
- HTTPS communication enforced
- Location data encrypted
- User consent for all permissions
- Emergency contacts stored locally only

## Contributing

1. Fork the repository
2. Create feature branch
3. Test on both platforms
4. Submit pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.