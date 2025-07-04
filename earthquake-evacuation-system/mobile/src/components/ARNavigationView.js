import React, { Component } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Vibration,
  Dimensions,
  DeviceEventEmitter
} from 'react-native';
import {
  ViroARScene,
  ViroARSceneNavigator,
  ViroBox,
  ViroMaterials,
  ViroNode,
  ViroAnimations,
  ViroText,
  ViroSphere,
  ViroAmbientLight,
  ViroDirectionalLight,
  ViroARTrackingTargets,
  ViroARImageMarker,
  ViroQuad,
  ViroPolyline
} from '@viro-community/react-viro';
import Geolocation from '@react-native-community/geolocation';
import { magnetometer, gyroscope, accelerometer } from 'react-native-sensors';
import Tts from 'react-native-tts';
import HapticFeedback from 'react-native-haptic-feedback';
import Sound from 'react-native-sound';

class ARNavigationView extends Component {
  constructor(props) {
    super(props);
    
    this.state = {
      currentLocation: null,
      route: props.route || [],
      routeSegments: [],
      hazardZones: props.hazards || [],
      arObjects: [],
      heading: 0,
      deviceOrientation: { x: 0, y: 0, z: 0 },
      nextDirection: null,
      distanceToNext: 0,
      estimatedTime: 0,
      navigationState: 'tracking', // tracking, approaching, turning, warning
      pathColor: '#00FF00', // Green for safe path
      isARReady: false,
      cameraPosition: [0, 0, 0],
      trackingInitialized: false
    };

    // Sensor subscriptions
    this.magnetometerSubscription = null;
    this.gyroscopeSubscription = null;
    this.accelerometerSubscription = null;
    this.locationWatcher = null;

    // Audio guidance
    this.alertSounds = {};
    this.initializeAudio();

    // Haptic patterns
    this.hapticPatterns = {
      turn_left: [100, 200, 100],
      turn_right: [200, 100, 200],
      danger: [300, 100, 300, 100, 300],
      arrival: [500, 200, 500],
      warning: [100, 100, 100, 100, 100]
    };
  }

  componentDidMount() {
    this.initializeARNavigation();
    this.startLocationTracking();
    this.startSensorTracking();
  }

  componentWillUnmount() {
    this.cleanup();
  }

  /**
   * Initialize audio alerts and TTS
   */
  initializeAudio() {
    // Initialize Text-to-Speech
    Tts.setDefaultLanguage('en-US');
    Tts.setDefaultRate(0.8);
    Tts.setDefaultPitch(1.0);

    // Load alert sounds
    this.alertSounds.danger = new Sound('danger_alert.mp3', Sound.MAIN_BUNDLE);
    this.alertSounds.turn = new Sound('turn_notification.mp3', Sound.MAIN_BUNDLE);
    this.alertSounds.arrival = new Sound('destination_reached.mp3', Sound.MAIN_BUNDLE);
  }

  /**
   * Initialize AR navigation system
   */
  initializeARNavigation() {
    if (this.props.route && this.props.route.length > 0) {
      this.processRouteForAR(this.props.route);
      this.calculateNavigationInstructions();
    }

    // Create AR materials for different path types
    ViroMaterials.createMaterials({
      safe_path: {
        diffuseColor: '#00FF00',
        opacity: 0.7,
        lightingModel: 'Constant'
      },
      danger_path: {
        diffuseColor: '#FF0000',
        opacity: 0.8,
        lightingModel: 'Constant'
      },
      warning_path: {
        diffuseColor: '#FFAA00',
        opacity: 0.7,
        lightingModel: 'Constant'
      },
      direction_arrow: {
        diffuseTexture: require('../assets/ar/arrow_green.png'),
        opacity: 0.9
      },
      hazard_marker: {
        diffuseColor: '#FF0000',
        opacity: 0.9,
        lightingModel: 'Constant'
      }
    });

    // Create animations
    ViroAnimations.registerAnimations({
      pulse: {
        properties: { scaleX: 1.2, scaleY: 1.2, scaleZ: 1.2 },
        duration: 1000,
        loop: true,
        easing: 'Bounce'
      },
      float: {
        properties: { positionY: '+=0.5' },
        duration: 2000,
        loop: true,
        easing: 'EaseInEaseOut'
      },
      danger_pulse: {
        properties: { scaleX: 1.5, scaleY: 1.5, scaleZ: 1.5 },
        duration: 500,
        loop: true,
        easing: 'Bounce'
      }
    });
  }

  /**
   * Process route data for AR visualization
   */
  processRouteForAR(route) {
    const segments = [];
    const arObjects = [];

    for (let i = 0; i < route.length - 1; i++) {
      const start = route[i];
      const end = route[i + 1];
      
      // Calculate segment properties
      const segment = {
        id: `segment_${i}`,
        start: start,
        end: end,
        bearing: this.calculateBearing(start, end),
        distance: this.calculateDistance(start, end),
        riskLevel: this.calculateSegmentRisk(start, end),
        instructions: this.generateTurnInstructions(i, route)
      };

      segments.push(segment);

      // Create AR objects for this segment
      const segmentAR = this.createSegmentARObjects(segment, i);
      arObjects.push(...segmentAR);
    }

    // Add destination marker
    const destination = route[route.length - 1];
    arObjects.push(this.createDestinationMarker(destination));

    this.setState({
      routeSegments: segments,
      arObjects: arObjects
    });
  }

  /**
   * Create AR objects for a route segment
   */
  createSegmentARObjects(segment, index) {
    const objects = [];
    const pathColor = this.getPathColor(segment.riskLevel);
    const arPosition = this.convertGPSToAR(segment.start);

    // Path line
    objects.push({
      type: 'path',
      id: `path_${index}`,
      position: arPosition,
      material: this.getMaterialForRisk(segment.riskLevel),
      points: [
        this.convertGPSToAR(segment.start),
        this.convertGPSToAR(segment.end)
      ]
    });

    // Direction arrows every 50 meters
    const arrowCount = Math.max(1, Math.floor(segment.distance / 50));
    for (let i = 0; i < arrowCount; i++) {
      const progress = (i + 1) / (arrowCount + 1);
      const arrowPosition = this.interpolatePosition(segment.start, segment.end, progress);
      
      objects.push({
        type: 'arrow',
        id: `arrow_${index}_${i}`,
        position: this.convertGPSToAR(arrowPosition),
        rotation: [0, segment.bearing, 0],
        material: 'direction_arrow',
        scale: [0.3, 0.3, 0.3],
        animation: 'float'
      });
    }

    // Turn indicator at segment end
    if (segment.instructions) {
      objects.push({
        type: 'turn_indicator',
        id: `turn_${index}`,
        position: this.convertGPSToAR(segment.end),
        text: segment.instructions.text,
        direction: segment.instructions.direction,
        scale: [0.5, 0.5, 0.5],
        animation: 'pulse'
      });
    }

    return objects;
  }

  /**
   * Create destination marker
   */
  createDestinationMarker(destination) {
    return {
      type: 'destination',
      id: 'destination_marker',
      position: this.convertGPSToAR(destination),
      scale: [1.0, 1.0, 1.0],
      animation: 'pulse',
      text: 'SAFE ZONE'
    };
  }

  /**
   * Convert GPS coordinates to AR world coordinates
   */
  convertGPSToAR(gpsCoords) {
    if (!this.state.currentLocation) return [0, 0, -5];

    const { lat, lng } = gpsCoords;
    const { lat: currentLat, lng: currentLng } = this.state.currentLocation;

    // Convert to meters relative to current position
    const deltaLat = (lat - currentLat) * 111000; // ~111km per degree
    const deltaLng = (lng - currentLng) * 111000 * Math.cos(currentLat * Math.PI / 180);

    // Scale down for AR visualization (1:100 scale)
    const arX = deltaLng / 100;
    const arZ = -deltaLat / 100; // Negative Z for forward direction
    const arY = 0; // Ground level

    return [arX, arY, arZ];
  }

  /**
   * Start location tracking
   */
  startLocationTracking() {
    // Get initial position
    Geolocation.getCurrentPosition(
      (position) => {
        this.setState({
          currentLocation: {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
        });
        this.updateNavigationState();
      },
      (error) => console.error('Location error:', error),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 }
    );

    // Watch position changes
    this.locationWatcher = Geolocation.watchPosition(
      (position) => {
        const newLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        
        this.setState({ currentLocation: newLocation });
        this.updateNavigationState();
        this.checkProximityToHazards(newLocation);
        
        // Notify backend of location update
        this.props.onLocationUpdate?.(newLocation);
      },
      (error) => console.error('Location tracking error:', error),
      {
        enableHighAccuracy: true,
        distanceFilter: 1, // Update every meter
        interval: 1000 // Update every second
      }
    );
  }

  /**
   * Start sensor tracking for device orientation
   */
  startSensorTracking() {
    // Magnetometer for compass heading
    this.magnetometerSubscription = magnetometer.subscribe(({ x, y, z }) => {
      const heading = Math.atan2(y, x) * (180 / Math.PI);
      this.setState({ heading: (heading + 360) % 360 });
    });

    // Gyroscope for device rotation
    this.gyroscopeSubscription = gyroscope.subscribe(({ x, y, z }) => {
      this.setState({
        deviceOrientation: { x, y, z }
      });
    });
  }

  /**
   * Update navigation state based on current location
   */
  updateNavigationState() {
    if (!this.state.currentLocation || !this.state.routeSegments.length) return;

    const currentSegment = this.getCurrentSegment();
    if (!currentSegment) return;

    const distanceToNext = this.calculateDistance(
      this.state.currentLocation,
      currentSegment.end
    );

    const nextDirection = this.calculateNextDirection(currentSegment);
    
    // Determine navigation state
    let navigationState = 'tracking';
    if (distanceToNext < 20) {
      navigationState = 'approaching';
    }
    if (distanceToNext < 5) {
      navigationState = 'turning';
    }

    // Check for hazards nearby
    const nearbyHazards = this.checkNearbyHazards(this.state.currentLocation);
    if (nearbyHazards.length > 0) {
      navigationState = 'warning';
      this.handleHazardWarning(nearbyHazards);
    }

    this.setState({
      distanceToNext,
      nextDirection,
      navigationState,
      pathColor: this.getPathColorForState(navigationState)
    });

    // Provide audio guidance
    this.provideAudioGuidance(navigationState, distanceToNext, nextDirection);
  }

  /**
   * Provide audio and haptic guidance
   */
  provideAudioGuidance(state, distance, direction) {
    const shouldSpeak = this.shouldProvideGuidance();
    
    switch (state) {
      case 'approaching':
        if (shouldSpeak && distance < 15) {
          const directionText = this.getDirectionText(direction);
          Tts.speak(`In ${Math.round(distance)} meters, ${directionText}`);
          this.triggerHaptic('turn_' + (direction > 0 ? 'right' : 'left'));
        }
        break;
        
      case 'turning':
        if (shouldSpeak) {
          const directionText = this.getDirectionText(direction);
          Tts.speak(directionText);
          this.triggerHaptic('turn_' + (direction > 0 ? 'right' : 'left'));
        }
        break;
        
      case 'warning':
        this.alertSounds.danger?.play();
        Tts.speak('Danger ahead! Find alternate route.');
        this.triggerHaptic('danger');
        break;
    }
  }

  /**
   * Handle hazard warnings
   */
  handleHazardWarning(hazards) {
    const criticalHazards = hazards.filter(h => h.severity === 'critical');
    
    if (criticalHazards.length > 0) {
      Alert.alert(
        'CRITICAL HAZARD DETECTED',
        'Dangerous conditions ahead. Please find an alternate route immediately.',
        [
          { text: 'Find Alternate Route', onPress: this.requestAlternateRoute },
          { text: 'Continue (Dangerous)', style: 'destructive' }
        ]
      );
      
      // Continuous vibration for critical hazards
      Vibration.vibrate([300, 100, 300, 100, 300], true);
    }
  }

  /**
   * Trigger haptic feedback patterns
   */
  triggerHaptic(pattern) {
    const hapticPattern = this.hapticPatterns[pattern];
    if (hapticPattern) {
      Vibration.vibrate(hapticPattern);
    } else {
      HapticFeedback.trigger('notificationSuccess');
    }
  }

  /**
   * Check for nearby hazards
   */
  checkNearbyHazards(location) {
    return this.state.hazardZones.filter(hazard => {
      const distance = this.calculateDistance(location, hazard.location);
      return distance <= (hazard.radius || 0.1); // Default 100m radius
    });
  }

  /**
   * Render AR Scene
   */
  renderARScene = () => {
    return (
      <ViroARScene onTrackingUpdated={this.onTrackingUpdated}>
        <ViroAmbientLight color="#ffffff" intensity={0.3} />
        <ViroDirectionalLight color="#ffffff" direction={[0, -1, 0]} />
        
        {this.renderPathObjects()}
        {this.renderHazardMarkers()}
        {this.renderNavigationInstructions()}
      </ViroARScene>
    );
  };

  /**
   * Render path objects in AR
   */
  renderPathObjects() {
    return this.state.arObjects
      .filter(obj => obj.type === 'path' || obj.type === 'arrow')
      .map(obj => {
        if (obj.type === 'path') {
          return (
            <ViroPolyline
              key={obj.id}
              position={[0, 0, 0]}
              points={obj.points}
              thickness={0.1}
              materials={[obj.material]}
            />
          );
        } else if (obj.type === 'arrow') {
          return (
            <ViroNode key={obj.id} position={obj.position} rotation={obj.rotation}>
              <ViroQuad
                materials={[obj.material]}
                width={0.5}
                height={0.5}
                animation={obj.animation ? { name: obj.animation, run: true } : undefined}
              />
            </ViroNode>
          );
        }
      });
  }

  /**
   * Render hazard markers
   */
  renderHazardMarkers() {
    return this.state.hazardZones.map(hazard => {
      const arPosition = this.convertGPSToAR(hazard.location);
      const color = this.getHazardColor(hazard.severity);
      
      return (
        <ViroNode key={hazard.id} position={arPosition}>
          <ViroSphere
            radius={0.3}
            materials={['hazard_marker']}
            animation={{ name: 'danger_pulse', run: true }}
          />
          <ViroText
            text={hazard.type.toUpperCase()}
            scale={[0.3, 0.3, 0.3]}
            position={[0, 0.5, 0]}
            style={styles.hazardText}
          />
        </ViroNode>
      );
    });
  }

  /**
   * Render navigation instructions
   */
  renderNavigationInstructions() {
    if (!this.state.nextDirection) return null;

    const instruction = this.getNavigationInstruction();
    
    return (
      <ViroNode position={[0, 1, -2]}>
        <ViroText
          text={instruction}
          scale={[0.5, 0.5, 0.5]}
          materials={['safe_path']}
          style={styles.instructionText}
        />
      </ViroNode>
    );
  }

  /**
   * Calculate bearing between two points
   */
  calculateBearing(start, end) {
    const dLng = end.lng - start.lng;
    const dLat = end.lat - start.lat;
    return Math.atan2(dLng, dLat) * (180 / Math.PI);
  }

  /**
   * Calculate distance between two GPS coordinates
   */
  calculateDistance(point1, point2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLng = (point2.lng - point1.lng) * Math.PI / 180;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Get current route segment
   */
  getCurrentSegment() {
    // Find the closest segment to current location
    let closestSegment = null;
    let minDistance = Infinity;

    for (const segment of this.state.routeSegments) {
      const distToStart = this.calculateDistance(this.state.currentLocation, segment.start);
      const distToEnd = this.calculateDistance(this.state.currentLocation, segment.end);
      const minDist = Math.min(distToStart, distToEnd);
      
      if (minDist < minDistance) {
        minDistance = minDist;
        closestSegment = segment;
      }
    }

    return closestSegment;
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.locationWatcher) {
      Geolocation.clearWatch(this.locationWatcher);
    }
    
    if (this.magnetometerSubscription) {
      this.magnetometerSubscription.unsubscribe();
    }
    
    if (this.gyroscopeSubscription) {
      this.gyroscopeSubscription.unsubscribe();
    }

    // Stop any ongoing vibrations
    Vibration.cancel();
    
    // Stop TTS
    Tts.stop();
  }

  // Additional helper methods for navigation logic...
  getPathColor(riskLevel) {
    switch (riskLevel) {
      case 'high': return '#FF0000';
      case 'medium': return '#FFAA00';
      default: return '#00FF00';
    }
  }

  getMaterialForRisk(riskLevel) {
    switch (riskLevel) {
      case 'high': return 'danger_path';
      case 'medium': return 'warning_path';
      default: return 'safe_path';
    }
  }

  getDirectionText(angle) {
    if (Math.abs(angle) < 15) return 'continue straight';
    if (angle > 0) return 'turn right';
    return 'turn left';
  }

  onTrackingUpdated = (state, reason) => {
    if (state === 'TRACKING_NORMAL') {
      this.setState({ trackingInitialized: true });
    }
  };

  shouldProvideGuidance() {
    return Date.now() - (this.lastGuidanceTime || 0) > 5000; // 5 second interval
  }

  render() {
    return (
      <View style={styles.container}>
        <ViroARSceneNavigator
          autofocus={true}
          initialScene={{
            scene: this.renderARScene
          }}
          style={styles.arView}
        />
        
        {/* Overlay UI */}
        <View style={styles.overlay}>
          <View style={styles.statusBar}>
            <Text style={styles.statusText}>
              {this.state.navigationState.toUpperCase()}
            </Text>
            <Text style={styles.distanceText}>
              {Math.round(this.state.distanceToNext)}m to next turn
            </Text>
          </View>
          
          <View style={styles.bottomBar}>
            <Text style={styles.instructionText}>
              {this.getNavigationInstruction()}
            </Text>
          </View>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000'
  },
  arView: {
    flex: 1
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none'
  },
  statusBar: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 15,
    borderRadius: 10
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold'
  },
  distanceText: {
    color: '#AAAAAA',
    fontSize: 14,
    marginTop: 5
  },
  bottomBar: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 20,
    borderRadius: 15
  },
  instructionText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  hazardText: {
    fontSize: 14,
    color: '#FF0000',
    fontWeight: 'bold'
  }
});

export default ARNavigationView;