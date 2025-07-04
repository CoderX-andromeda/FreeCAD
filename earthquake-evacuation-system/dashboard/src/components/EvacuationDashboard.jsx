import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  CardHeader,
  Alert,
  Chip,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Badge,
  Tooltip,
  LinearProgress,
  CircularProgress,
  Divider,
  Switch,
  FormControlLabel
} from '@mui/material';
import {
  Warning,
  Emergency,
  People,
  LocationOn,
  Earthquake,
  FireTruck,
  LocalHospital,
  Security,
  Build,
  Refresh,
  Fullscreen,
  Download,
  Settings,
  NotificationImportant,
  TrendingUp,
  Speed,
  Timeline
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline } from 'react-leaflet';
import io from 'socket.io-client';
import axios from 'axios';
import moment from 'moment';
import { toast } from 'react-toastify';

class EvacuationDashboard extends React.Component {
  constructor(props) {
    super(props);
    
    this.state = {
      // Real-time data
      earthquakeData: { features: [], metadata: {} },
      hazards: [],
      activeEvacuations: [],
      emergencyUnits: [],
      crowdDensity: {},
      systemStatus: {},
      
      // Dashboard state
      selectedEvacuation: null,
      selectedHazard: null,
      mapCenter: [35.6762, 139.6503], // Tokyo default
      mapZoom: 11,
      autoRefresh: true,
      refreshInterval: 30000, // 30 seconds
      
      // UI state
      loading: true,
      error: null,
      showSettings: false,
      fullscreenMode: false,
      alertsOpen: false,
      
      // Metrics
      evacuationMetrics: {
        totalEvacuees: 0,
        evacuationRate: 0,
        averageTime: 0,
        bottlenecks: []
      },
      
      // Filters and display options
      filters: {
        showResolved: false,
        riskLevel: 'all',
        timeRange: '24h'
      }
    };
    
    this.socket = null;
    this.refreshTimer = null;
    this.mapRef = React.createRef();
  }

  componentDidMount() {
    this.initializeWebSocket();
    this.loadInitialData();
    this.startAutoRefresh();
    
    // Keyboard shortcuts
    document.addEventListener('keydown', this.handleKeyPress);
  }

  componentWillUnmount() {
    this.cleanup();
  }

  /**
   * Initialize WebSocket connection for real-time updates
   */
  initializeWebSocket() {
    this.socket = io(process.env.REACT_APP_API_URL || 'http://localhost:3000');
    
    // Real-time event handlers
    this.socket.on('earthquake_update', this.handleEarthquakeUpdate);
    this.socket.on('hazard_alert', this.handleHazardAlert);
    this.socket.on('route_updated', this.handleRouteUpdate);
    this.socket.on('sos_received', this.handleSOSAlert);
    this.socket.on('unit_deployed', this.handleUnitDeployment);
    this.socket.on('emergency_center_notified', this.handleEmergencyNotification);
    
    this.socket.on('connect', () => {
      console.log('Connected to emergency management system');
      toast.success('Connected to emergency management system');
    });
    
    this.socket.on('disconnect', () => {
      console.log('Disconnected from emergency management system');
      toast.error('Connection lost - attempting to reconnect...');
    });
  }

  /**
   * Load initial dashboard data
   */
  async loadInitialData() {
    try {
      this.setState({ loading: true });
      
      const [
        dashboardData,
        earthquakeData,
        hazardData,
        evacuationData,
        emergencyStatus
      ] = await Promise.all([
        axios.get('/api/dashboard/overview'),
        axios.get('/api/earthquakes/current'),
        axios.get('/api/hazards/current'),
        axios.get('/api/emergency/active-evacuations'),
        axios.get('/api/emergency/status')
      ]);
      
      this.setState({
        earthquakeData: earthquakeData.data,
        hazards: hazardData.data,
        activeEvacuations: evacuationData.data,
        systemStatus: emergencyStatus.data,
        evacuationMetrics: this.calculateEvacuationMetrics(evacuationData.data),
        loading: false
      });
      
      // Update map center based on current activity
      this.updateMapCenter();
      
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      this.setState({ 
        error: 'Failed to load dashboard data',
        loading: false 
      });
      toast.error('Failed to load dashboard data');
    }
  }

  /**
   * Start auto-refresh timer
   */
  startAutoRefresh() {
    if (this.state.autoRefresh) {
      this.refreshTimer = setInterval(() => {
        this.refreshData();
      }, this.state.refreshInterval);
    }
  }

  /**
   * Refresh dashboard data
   */
  async refreshData() {
    try {
      const response = await axios.get('/api/dashboard/overview');
      
      this.setState(prevState => ({
        ...prevState,
        systemStatus: response.data,
        evacuationMetrics: this.calculateEvacuationMetrics(prevState.activeEvacuations)
      }));
      
    } catch (error) {
      console.error('Failed to refresh data:', error);
    }
  }

  /**
   * Handle real-time earthquake updates
   */
  handleEarthquakeUpdate = (data) => {
    this.setState({ earthquakeData: data });
    
    // Check for urgent earthquakes
    const urgentEarthquakes = data.features.filter(eq => 
      eq.properties.urgent || eq.properties.mag >= 6.0
    );
    
    if (urgentEarthquakes.length > 0) {
      toast.warning(`${urgentEarthquakes.length} urgent earthquake(s) detected!`);
      
      // Play alert sound
      this.playAlertSound('earthquake');
    }
  };

  /**
   * Handle hazard alerts
   */
  handleHazardAlert = (hazard) => {
    this.setState(prevState => ({
      hazards: [...prevState.hazards.filter(h => h.id !== hazard.id), hazard]
    }));
    
    if (hazard.severity === 'critical') {
      toast.error(`Critical hazard: ${hazard.type} at ${hazard.location.lat}, ${hazard.location.lng}`);
      this.playAlertSound('critical');
    }
  };

  /**
   * Handle SOS alerts
   */
  handleSOSAlert = (sosData) => {
    toast.error(`SOS Alert: ${sosData.type} - Emergency services dispatched`);
    this.playAlertSound('sos');
    
    // Add to evacuation tracking
    this.setState(prevState => ({
      activeEvacuations: [...prevState.activeEvacuations, {
        id: sosData.sosId,
        type: 'sos',
        location: sosData.location,
        status: 'emergency',
        timestamp: new Date()
      }]
    }));
  };

  /**
   * Handle unit deployment notifications
   */
  handleUnitDeployment = (deployment) => {
    console.log('Unit deployed:', deployment);
    toast.info(`${deployment.unit.type} unit deployed - ETA: ${deployment.estimatedArrival}min`);
  };

  /**
   * Calculate evacuation metrics
   */
  calculateEvacuationMetrics(evacuations) {
    const totalEvacuees = evacuations.length;
    const completedEvacuations = evacuations.filter(e => e.status === 'completed').length;
    const evacuationRate = totalEvacuees > 0 ? (completedEvacuations / totalEvacuees) * 100 : 0;
    
    const totalTime = evacuations.reduce((sum, e) => {
      if (e.estimatedTime) return sum + e.estimatedTime;
      return sum;
    }, 0);
    
    const averageTime = totalEvacuees > 0 ? totalTime / totalEvacuees : 0;
    
    return {
      totalEvacuees,
      evacuationRate: Math.round(evacuationRate),
      averageTime: Math.round(averageTime),
      bottlenecks: this.identifyBottlenecks(evacuations)
    };
  }

  /**
   * Identify evacuation bottlenecks
   */
  identifyBottlenecks(evacuations) {
    // Simple bottleneck detection based on evacuation density
    const locationCounts = {};
    
    evacuations.forEach(evacuation => {
      if (evacuation.currentLocation) {
        const key = `${Math.round(evacuation.currentLocation.lat * 1000)}_${Math.round(evacuation.currentLocation.lng * 1000)}`;
        locationCounts[key] = (locationCounts[key] || 0) + 1;
      }
    });
    
    return Object.entries(locationCounts)
      .filter(([_, count]) => count > 5) // More than 5 evacuees in same area
      .map(([key, count]) => {
        const [lat, lng] = key.split('_').map(n => parseInt(n) / 1000);
        return { location: { lat, lng }, count };
      });
  }

  /**
   * Play alert sounds
   */
  playAlertSound(type) {
    // In production, this would play different sounds for different alert types
    const audio = new Audio(`/sounds/${type}_alert.mp3`);
    audio.play().catch(e => console.log('Could not play alert sound:', e));
  }

  /**
   * Handle keyboard shortcuts
   */
  handleKeyPress = (event) => {
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 'r':
          event.preventDefault();
          this.refreshData();
          break;
        case 'f':
          event.preventDefault();
          this.toggleFullscreen();
          break;
        case 's':
          event.preventDefault();
          this.setState({ showSettings: true });
          break;
      }
    }
  };

  /**
   * Toggle fullscreen mode
   */
  toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      this.setState({ fullscreenMode: true });
    } else {
      document.exitFullscreen();
      this.setState({ fullscreenMode: false });
    }
  };

  /**
   * Update map center based on current activity
   */
  updateMapCenter() {
    if (this.state.activeEvacuations.length > 0) {
      // Center on most recent evacuation
      const latest = this.state.activeEvacuations[0];
      if (latest.currentLocation) {
        this.setState({
          mapCenter: [latest.currentLocation.lat, latest.currentLocation.lng],
          mapZoom: 13
        });
      }
    }
  }

  /**
   * Export dashboard data
   */
  exportData = () => {
    const data = {
      timestamp: new Date().toISOString(),
      earthquakes: this.state.earthquakeData,
      hazards: this.state.hazards,
      evacuations: this.state.activeEvacuations,
      metrics: this.state.evacuationMetrics,
      systemStatus: this.state.systemStatus
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evacuation-report-${moment().format('YYYY-MM-DD-HH-mm')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.socket) {
      this.socket.disconnect();
    }
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    document.removeEventListener('keydown', this.handleKeyPress);
  }

  /**
   * Render system status overview
   */
  renderSystemStatus() {
    const { systemStatus } = this.state;
    
    return (
      <Card>
        <CardHeader 
          title="System Status" 
          avatar={<Speed color="primary" />}
        />
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <Typography variant="body2" color="textSecondary">
                Emergency Units
              </Typography>
              <Typography variant="h6">
                {systemStatus.emergencyUnits?.available || 0} / {systemStatus.emergencyUnits?.total || 0}
              </Typography>
              <LinearProgress 
                variant="determinate" 
                value={systemStatus.emergencyUnits?.utilization || 0}
                color={systemStatus.emergencyUnits?.utilization > 80 ? 'error' : 'primary'}
              />
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="textSecondary">
                Active Incidents
              </Typography>
              <Typography variant="h6">
                {systemStatus.incidents?.activeSOS || 0}
              </Typography>
              <Typography variant="body2">
                {systemStatus.incidents?.activeEvacuees || 0} evacuees tracked
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    );
  }

  /**
   * Render earthquake monitoring
   */
  renderEarthquakeMonitoring() {
    const { earthquakeData } = this.state;
    const urgentCount = earthquakeData.metadata?.urgent_count || 0;
    
    return (
      <Card>
        <CardHeader 
          title="Earthquake Activity"
          avatar={
            <Badge badgeContent={urgentCount} color="error">
              <Earthquake color="primary" />
            </Badge>
          }
          action={
            <Chip 
              label={`${earthquakeData.features?.length || 0} total`}
              color="primary"
              size="small"
            />
          }
        />
        <CardContent>
          {urgentCount > 0 && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {urgentCount} urgent earthquake(s) detected
            </Alert>
          )}
          
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Recent Activity (24h)
          </Typography>
          
          {earthquakeData.features?.slice(0, 3).map(earthquake => (
            <Box key={earthquake.id} sx={{ mb: 1 }}>
              <Typography variant="body2">
                M{earthquake.properties.mag.toFixed(1)} - {earthquake.properties.place}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {moment(earthquake.properties.time).fromNow()}
              </Typography>
            </Box>
          ))}
        </CardContent>
      </Card>
    );
  }

  /**
   * Render hazard monitoring
   */
  renderHazardMonitoring() {
    const { hazards } = this.state;
    const criticalHazards = hazards.filter(h => h.severity === 'critical');
    
    return (
      <Card>
        <CardHeader 
          title="Active Hazards"
          avatar={
            <Badge badgeContent={criticalHazards.length} color="error">
              <Warning color="primary" />
            </Badge>
          }
        />
        <CardContent>
          {criticalHazards.length > 0 && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {criticalHazards.length} critical hazard(s) requiring immediate attention
            </Alert>
          )}
          
          <List dense>
            {hazards.slice(0, 5).map(hazard => (
              <ListItem key={hazard.id} button onClick={() => this.setState({ selectedHazard: hazard })}>
                <ListItemIcon>
                  <Warning color={hazard.severity === 'critical' ? 'error' : 'warning'} />
                </ListItemIcon>
                <ListItemText
                  primary={hazard.type.replace('_', ' ').toUpperCase()}
                  secondary={`${hazard.verificationLevel} - ${moment(hazard.firstReported).fromNow()}`}
                />
                <Chip 
                  label={hazard.severity}
                  color={hazard.severity === 'critical' ? 'error' : 'warning'}
                  size="small"
                />
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>
    );
  }

  /**
   * Render evacuation metrics
   */
  renderEvacuationMetrics() {
    const { evacuationMetrics } = this.state;
    
    return (
      <Card>
        <CardHeader 
          title="Evacuation Progress"
          avatar={<People color="primary" />}
        />
        <CardContent>
          <Grid container spacing={3}>
            <Grid item xs={4}>
              <Typography variant="h4" color="primary">
                {evacuationMetrics.totalEvacuees}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Active Evacuees
              </Typography>
            </Grid>
            <Grid item xs={4}>
              <Typography variant="h4" color="success.main">
                {evacuationMetrics.evacuationRate}%
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Completion Rate
              </Typography>
            </Grid>
            <Grid item xs={4}>
              <Typography variant="h4">
                {evacuationMetrics.averageTime}min
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Avg. Time
              </Typography>
            </Grid>
          </Grid>
          
          {evacuationMetrics.bottlenecks.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Alert severity="warning">
                {evacuationMetrics.bottlenecks.length} bottleneck(s) detected
              </Alert>
            </Box>
          )}
        </CardContent>
      </Card>
    );
  }

  /**
   * Render interactive map
   */
  renderInteractiveMap() {
    const { mapCenter, mapZoom, activeEvacuations, hazards, earthquakeData } = this.state;
    
    return (
      <Card sx={{ height: 500 }}>
        <CardHeader 
          title="Real-time Evacuation Map"
          action={
            <IconButton onClick={() => this.updateMapCenter()}>
              <LocationOn />
            </IconButton>
          }
        />
        <CardContent sx={{ height: '100%', p: 0 }}>
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            style={{ height: '100%', width: '100%' }}
            ref={this.mapRef}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            
            {/* Evacuation markers */}
            {activeEvacuations.map(evacuation => (
              evacuation.currentLocation && (
                <Marker
                  key={evacuation.id}
                  position={[evacuation.currentLocation.lat, evacuation.currentLocation.lng]}
                >
                  <Popup>
                    <div>
                      <strong>Evacuation {evacuation.id}</strong><br />
                      Status: {evacuation.status}<br />
                      ETA: {evacuation.estimatedTime}min<br />
                      Risk: {evacuation.riskLevel}
                    </div>
                  </Popup>
                </Marker>
              )
            ))}
            
            {/* Hazard markers */}
            {hazards.map(hazard => (
              <div key={hazard.id}>
                <Marker position={[hazard.location.lat, hazard.location.lng]}>
                  <Popup>
                    <div>
                      <strong>{hazard.type.toUpperCase()}</strong><br />
                      Severity: {hazard.severity}<br />
                      Verification: {hazard.verificationLevel}<br />
                      Reports: {hazard.reports?.length || 0}
                    </div>
                  </Popup>
                </Marker>
                <Circle
                  center={[hazard.location.lat, hazard.location.lng]}
                  radius={hazard.affectedRadius * 1000}
                  color={hazard.severity === 'critical' ? 'red' : 'orange'}
                  fillOpacity={0.2}
                />
              </div>
            ))}
            
            {/* Earthquake markers */}
            {earthquakeData.features?.slice(0, 10).map(earthquake => (
              <Circle
                key={earthquake.id}
                center={[
                  earthquake.geometry.coordinates[1],
                  earthquake.geometry.coordinates[0]
                ]}
                radius={Math.pow(10, earthquake.properties.mag) * 100}
                color={earthquake.properties.urgent ? 'red' : 'blue'}
                fillOpacity={0.3}
              />
            ))}
          </MapContainer>
        </CardContent>
      </Card>
    );
  }

  render() {
    const { loading, error, autoRefresh } = this.state;
    
    if (loading) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ ml: 2 }}>
            Loading Emergency Management Dashboard...
          </Typography>
        </Box>
      );
    }
    
    if (error) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
          <Alert severity="error">
            {error}
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </Alert>
        </Box>
      );
    }

    return (
      <Box sx={{ p: 3 }}>
        {/* Header */}
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h4" component="h1">
            Emergency Management Dashboard
          </Typography>
          
          <Box display="flex" alignItems="center" gap={1}>
            <FormControlLabel
              control={
                <Switch
                  checked={autoRefresh}
                  onChange={(e) => this.setState({ autoRefresh: e.target.checked })}
                />
              }
              label="Auto Refresh"
            />
            
            <Tooltip title="Refresh Data (Ctrl+R)">
              <IconButton onClick={this.refreshData}>
                <Refresh />
              </IconButton>
            </Tooltip>
            
            <Tooltip title="Export Data">
              <IconButton onClick={this.exportData}>
                <Download />
              </IconButton>
            </Tooltip>
            
            <Tooltip title="Fullscreen (Ctrl+F)">
              <IconButton onClick={this.toggleFullscreen}>
                <Fullscreen />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        
        {/* Main Dashboard Grid */}
        <Grid container spacing={3}>
          {/* Status Cards Row */}
          <Grid item xs={12} md={3}>
            {this.renderSystemStatus()}
          </Grid>
          <Grid item xs={12} md={3}>
            {this.renderEarthquakeMonitoring()}
          </Grid>
          <Grid item xs={12} md={3}>
            {this.renderHazardMonitoring()}
          </Grid>
          <Grid item xs={12} md={3}>
            {this.renderEvacuationMetrics()}
          </Grid>
          
          {/* Map */}
          <Grid item xs={12} lg={8}>
            {this.renderInteractiveMap()}
          </Grid>
          
          {/* Real-time Activity Feed */}
          <Grid item xs={12} lg={4}>
            <Card sx={{ height: 500 }}>
              <CardHeader title="Live Activity Feed" />
              <CardContent>
                <Typography variant="body2" color="textSecondary">
                  Real-time emergency events and system updates will appear here...
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    );
  }
}

export default EvacuationDashboard;