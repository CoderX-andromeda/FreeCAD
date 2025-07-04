import React, { Component } from 'react';
import {
  StyleSheet,
  Text,
  View,
  StatusBar,
  Alert,
  Platform,
  PermissionsAndroid,
  AppState,
  Linking
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import Icon from 'react-native-vector-icons/MaterialIcons';
import Geolocation from '@react-native-community/geolocation';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import KeepAwake from 'react-native-keep-awake';

// Import screens
import HomeScreen from './src/screens/HomeScreen';
import ARNavigationScreen from './src/screens/ARNavigationScreen';
import HazardReportScreen from './src/screens/HazardReportScreen';
import EmergencyScreen from './src/screens/EmergencyScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import SplashScreen from './src/screens/SplashScreen';

// Import services
import LocationService from './src/services/LocationService';
import NotificationService from './src/services/NotificationService';
import SocketService from './src/services/SocketService';
import OfflineService from './src/services/OfflineService';

// Import Redux store
import { store, persistor } from './src/store/store';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

class EarthquakeEvacuationApp extends Component {
  constructor(props) {
    super(props);
    
    this.state = {
      isLoading: true,
      hasPermissions: false,
      isFirstLaunch: true,
      appState: AppState.currentState,
      emergencyMode: false
    };
    
    this.locationService = new LocationService();
    this.notificationService = new NotificationService();
    this.socketService = new SocketService();
    this.offlineService = new OfflineService();
  }

  async componentDidMount() {
    // Keep screen awake during emergency situations
    KeepAwake.activate();
    
    // Set up app state change listener
    AppState.addEventListener('change', this.handleAppStateChange);
    
    // Initialize services
    await this.initializeApp();
  }

  componentWillUnmount() {
    AppState.removeEventListener('change', this.handleAppStateChange);
    KeepAwake.deactivate();
  }

  handleAppStateChange = (nextAppState) => {
    if (this.state.appState.match(/inactive|background/) && nextAppState === 'active') {
      // App has come to the foreground
      this.checkForEmergencyAlerts();
    }
    this.setState({ appState: nextAppState });
  };

  async initializeApp() {
    try {
      // Check if first launch
      const isFirstLaunch = await this.checkFirstLaunch();
      
      // Request permissions
      const hasPermissions = await this.requestPermissions();
      
      if (hasPermissions) {
        // Initialize services
        await this.initializeServices();
        
        // Check for emergency alerts
        await this.checkForEmergencyAlerts();
      }
      
      this.setState({
        isLoading: false,
        hasPermissions,
        isFirstLaunch
      });
      
    } catch (error) {
      console.error('App initialization error:', error);
      this.setState({ isLoading: false });
      Alert.alert('Initialization Error', 'Failed to initialize the app. Please restart.');
    }
  }

  async checkFirstLaunch() {
    // Implementation would check AsyncStorage for first launch flag
    return false; // Simplified for this example
  }

  async requestPermissions() {
    try {
      const permissions = Platform.select({
        android: [
          PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
          PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION,
          PERMISSIONS.ANDROID.CAMERA,
          PERMISSIONS.ANDROID.RECORD_AUDIO,
          PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE,
          PERMISSIONS.ANDROID.VIBRATE,
          PERMISSIONS.ANDROID.WAKE_LOCK
        ],
        ios: [
          PERMISSIONS.IOS.LOCATION_WHEN_IN_USE,
          PERMISSIONS.IOS.LOCATION_ALWAYS,
          PERMISSIONS.IOS.CAMERA,
          PERMISSIONS.IOS.MICROPHONE
        ]
      });

      const results = await Promise.all(
        permissions.map(permission => request(permission))
      );

      const allGranted = results.every(result => result === RESULTS.GRANTED);
      
      if (!allGranted) {
        Alert.alert(
          'Permissions Required',
          'This app requires location, camera, and other permissions to provide emergency evacuation guidance.',
          [
            { text: 'Settings', onPress: () => Linking.openSettings() },
            { text: 'Exit', onPress: () => this.exitApp() }
          ]
        );
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Permission request error:', error);
      return false;
    }
  }

  async initializeServices() {
    try {
      // Initialize location service
      await this.locationService.initialize();
      
      // Initialize notifications
      await this.notificationService.initialize();
      
      // Initialize socket connection
      await this.socketService.connect();
      
      // Initialize offline service
      await this.offlineService.initialize();
      
      console.log('All services initialized successfully');
    } catch (error) {
      console.error('Service initialization error:', error);
    }
  }

  async checkForEmergencyAlerts() {
    try {
      // Check for active earthquake alerts
      const alerts = await this.socketService.getEmergencyAlerts();
      
      if (alerts && alerts.length > 0) {
        const criticalAlerts = alerts.filter(alert => alert.severity === 'critical');
        
        if (criticalAlerts.length > 0) {
          this.setState({ emergencyMode: true });
          this.showEmergencyAlert(criticalAlerts[0]);
        }
      }
    } catch (error) {
      console.error('Emergency alert check error:', error);
    }
  }

  showEmergencyAlert(alert) {
    Alert.alert(
      '🚨 EMERGENCY ALERT',
      `${alert.type}: ${alert.message}`,
      [
        { 
          text: 'Start Evacuation', 
          onPress: () => this.startEmergencyEvacuation(alert) 
        },
        { 
          text: 'Dismiss', 
          style: 'cancel' 
        }
      ],
      { cancelable: false }
    );
  }

  startEmergencyEvacuation(alert) {
    // Navigate directly to AR navigation with emergency mode
    this.setState({ emergencyMode: true });
    // Navigation would be handled by the NavigationContainer
  }

  exitApp() {
    if (Platform.OS === 'android') {
      // For Android, we can't truly exit, but we can minimize
      // In production, you might want to handle this differently
    }
  }

  // Main Tab Navigator
  MainTabNavigator = () => {
    return (
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;
            
            switch (route.name) {
              case 'Home':
                iconName = 'home';
                break;
              case 'Navigation':
                iconName = 'navigation';
                break;
              case 'Report':
                iconName = 'report-problem';
                break;
              case 'Emergency':
                iconName = 'emergency';
                break;
              case 'Settings':
                iconName = 'settings';
                break;
              default:
                iconName = 'help';
            }
            
            return <Icon name={iconName} size={size} color={color} />;
          },
        })}
        tabBarOptions={{
          activeTintColor: this.state.emergencyMode ? '#FF0000' : '#2196F3',
          inactiveTintColor: 'gray',
          style: {
            backgroundColor: this.state.emergencyMode ? '#FFEBEE' : '#FFFFFF'
          }
        }}
      >
        <Tab.Screen 
          name="Home" 
          component={HomeScreen}
          options={{ title: 'Dashboard' }}
        />
        <Tab.Screen 
          name="Navigation" 
          component={ARNavigationScreen}
          options={{ title: 'AR Guide' }}
        />
        <Tab.Screen 
          name="Report" 
          component={HazardReportScreen}
          options={{ title: 'Report Hazard' }}
        />
        <Tab.Screen 
          name="Emergency" 
          component={EmergencyScreen}
          options={{ 
            title: 'SOS',
            tabBarBadge: this.state.emergencyMode ? '!' : null
          }}
        />
        <Tab.Screen 
          name="Settings" 
          component={SettingsScreen}
          options={{ title: 'Settings' }}
        />
      </Tab.Navigator>
    );
  };

  render() {
    if (this.state.isLoading) {
      return <SplashScreen />;
    }

    if (!this.state.hasPermissions) {
      return (
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>
            Permissions Required
          </Text>
          <Text style={styles.permissionSubtext}>
            Please grant location and camera permissions to use this app
          </Text>
        </View>
      );
    }

    return (
      <Provider store={store}>
        <PersistGate loading={<SplashScreen />} persistor={persistor}>
          <NavigationContainer>
            <StatusBar 
              barStyle="dark-content" 
              backgroundColor={this.state.emergencyMode ? '#FFCDD2' : '#FFFFFF'}
            />
            <Stack.Navigator 
              screenOptions={{ 
                headerShown: false,
                gestureEnabled: !this.state.emergencyMode // Disable swipe back in emergency mode
              }}
            >
              {this.state.isFirstLaunch ? (
                <Stack.Screen 
                  name="Onboarding" 
                  component={OnboardingScreen}
                />
              ) : null}
              <Stack.Screen 
                name="Main" 
                component={this.MainTabNavigator}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </PersistGate>
      </Provider>
    );
  }
}

const styles = StyleSheet.create({
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FFFFFF'
  },
  permissionText: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
    color: '#333'
  },
  permissionSubtext: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    lineHeight: 24
  }
});

export default EarthquakeEvacuationApp;