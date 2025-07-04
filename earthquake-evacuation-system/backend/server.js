const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

const RouteCalculationEngine = require('./core/route-engine');
const USGSApiService = require('./services/usgs-api');
const HazardReportingService = require('./services/hazard-reporting');
const CrowdDensityService = require('./services/crowd-density');
const EmergencyManagementService = require('./services/emergency-management');

class EarthquakeEvacuationServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        // Initialize services
        this.routeEngine = new RouteCalculationEngine();
        this.usgsService = new USGSApiService();
        this.hazardService = new HazardReportingService();
        this.crowdService = new CrowdDensityService();
        this.emergencyService = new EmergencyManagementService();
        
        // Active evacuation sessions
        this.activeSessions = new Map();
        this.connectedClients = new Map();
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
        this.setupServices();
    }

    setupMiddleware() {
        this.app.use(helmet());
        this.app.use(cors());
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.static(path.join(__dirname, '../public')));
        
        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
            next();
        });
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                services: {
                    usgs: this.usgsService.getSystemStatus(),
                    routing: 'active',
                    websocket: this.io.sockets.sockets.size
                }
            });
        });

        // Earthquake data endpoints
        this.app.get('/api/earthquakes/current', async (req, res) => {
            try {
                const data = this.usgsService.getCachedData();
                res.json(data || { type: 'FeatureCollection', features: [] });
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch earthquake data' });
            }
        });

        this.app.get('/api/earthquakes/near/:lat/:lng/:radius?', async (req, res) => {
            try {
                const { lat, lng, radius = 100 } = req.params;
                const location = { lat: parseFloat(lat), lng: parseFloat(lng) };
                const data = await this.usgsService.getEarthquakesNearLocation(
                    location, 
                    parseInt(radius)
                );
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch nearby earthquakes' });
            }
        });

        this.app.get('/api/earthquakes/significant', async (req, res) => {
            try {
                const data = await this.usgsService.fetchSignificantEarthquakes();
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch significant earthquakes' });
            }
        });

        // Route calculation endpoints
        this.app.post('/api/route/calculate', async (req, res) => {
            try {
                const { userLocation, preferences = {} } = req.body;
                
                if (!userLocation || !userLocation.lat || !userLocation.lng) {
                    return res.status(400).json({ error: 'Invalid user location' });
                }

                const seismicData = this.usgsService.getCachedData();
                const hazardMap = this.hazardService.getCurrentHazards();
                
                const routeResult = this.routeEngine.calculateSafeRoute(
                    userLocation,
                    seismicData,
                    hazardMap
                );

                // Create evacuation session
                const sessionId = this.createEvacuationSession(userLocation, routeResult);
                
                res.json({
                    sessionId,
                    ...routeResult,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                console.error('Route calculation error:', error);
                res.status(500).json({ error: 'Failed to calculate route' });
            }
        });

        this.app.post('/api/route/update/:sessionId', async (req, res) => {
            try {
                const { sessionId } = req.params;
                const { currentLocation, reportedHazards = [] } = req.body;
                
                const session = this.activeSessions.get(sessionId);
                if (!session) {
                    return res.status(404).json({ error: 'Session not found' });
                }

                // Update session location
                session.currentLocation = currentLocation;
                session.lastUpdate = new Date();

                // Process any reported hazards
                for (const hazard of reportedHazards) {
                    await this.hazardService.reportHazard(hazard);
                }

                // Recalculate route if needed
                const needsRecalculation = await this.checkRouteRecalculation(session);
                
                if (needsRecalculation) {
                    const seismicData = this.usgsService.getCachedData();
                    const hazardMap = this.hazardService.getCurrentHazards();
                    
                    const newRoute = this.routeEngine.calculateSafeRoute(
                        currentLocation,
                        seismicData,
                        hazardMap
                    );
                    
                    session.route = newRoute;
                    
                    // Notify client of route change
                    this.io.to(sessionId).emit('route_updated', {
                        route: newRoute,
                        reason: 'hazard_detected'
                    });
                }

                res.json({
                    session: {
                        id: sessionId,
                        currentLocation: session.currentLocation,
                        route: session.route,
                        status: session.status
                    }
                });
            } catch (error) {
                console.error('Route update error:', error);
                res.status(500).json({ error: 'Failed to update route' });
            }
        });

        // Hazard reporting endpoints
        this.app.post('/api/hazards/report', async (req, res) => {
            try {
                const hazardReport = req.body;
                const result = await this.hazardService.reportHazard(hazardReport);
                
                // Broadcast hazard to relevant clients
                this.broadcastHazardUpdate(hazardReport);
                
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: 'Failed to report hazard' });
            }
        });

        this.app.get('/api/hazards/current', (req, res) => {
            try {
                const hazards = this.hazardService.getCurrentHazards();
                res.json(Array.from(hazards.values()));
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch hazards' });
            }
        });

        // Emergency management endpoints
        this.app.get('/api/emergency/status', async (req, res) => {
            try {
                const status = await this.emergencyService.getSystemStatus();
                res.json(status);
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch emergency status' });
            }
        });

        this.app.get('/api/emergency/active-evacuations', (req, res) => {
            try {
                const evacuations = Array.from(this.activeSessions.values()).map(session => ({
                    id: session.id,
                    startTime: session.startTime,
                    currentLocation: session.currentLocation,
                    destination: session.route.route[session.route.route.length - 1],
                    estimatedTime: session.route.estimatedTime,
                    riskLevel: session.route.riskLevel,
                    status: session.status
                }));
                
                res.json(evacuations);
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch active evacuations' });
            }
        });

        // Dashboard data endpoint
        this.app.get('/api/dashboard/overview', async (req, res) => {
            try {
                const earthquakeData = this.usgsService.getCachedData();
                const hazards = this.hazardService.getCurrentHazards();
                const activeEvacuations = this.activeSessions.size;
                const connectedDevices = this.connectedClients.size;
                
                res.json({
                    earthquakes: {
                        total: earthquakeData?.features?.length || 0,
                        urgent: earthquakeData?.metadata?.urgent_count || 0,
                        lastUpdate: this.usgsService.lastUpdate
                    },
                    hazards: {
                        total: hazards.size,
                        critical: Array.from(hazards.values()).filter(h => h.severity === 'critical').length
                    },
                    evacuations: {
                        active: activeEvacuations,
                        connectedDevices
                    },
                    system: {
                        status: 'operational',
                        uptime: process.uptime()
                    }
                });
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch dashboard data' });
            }
        });

        // Crowd density endpoint
        this.app.get('/api/crowd/density/:lat/:lng/:radius?', async (req, res) => {
            try {
                const { lat, lng, radius = 1 } = req.params;
                const location = { lat: parseFloat(lat), lng: parseFloat(lng) };
                const density = await this.crowdService.getDensityAtLocation(location, parseInt(radius));
                res.json({ density, location, radius: parseInt(radius) });
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch crowd density' });
            }
        });
    }

    setupWebSocket() {
        this.io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);
            
            // Store client connection
            this.connectedClients.set(socket.id, {
                socket,
                connectedAt: new Date(),
                location: null,
                sessionId: null
            });

            // Handle evacuation session joining
            socket.on('join_evacuation', (data) => {
                const { sessionId, location } = data;
                socket.join(sessionId);
                
                const client = this.connectedClients.get(socket.id);
                if (client) {
                    client.location = location;
                    client.sessionId = sessionId;
                }
                
                console.log(`Client ${socket.id} joined evacuation session ${sessionId}`);
            });

            // Handle location updates
            socket.on('location_update', (data) => {
                const client = this.connectedClients.get(socket.id);
                if (client && client.sessionId) {
                    const session = this.activeSessions.get(client.sessionId);
                    if (session) {
                        session.currentLocation = data.location;
                        session.lastUpdate = new Date();
                        
                        // Broadcast location to emergency services
                        this.emergencyService.updateEvacueeLocation(client.sessionId, data.location);
                    }
                }
            });

            // Handle emergency SOS
            socket.on('emergency_sos', (data) => {
                const client = this.connectedClients.get(socket.id);
                if (client) {
                    console.log('Emergency SOS received from:', socket.id);
                    this.emergencyService.handleEmergencySOS({
                        clientId: socket.id,
                        location: data.location,
                        type: data.type || 'general_emergency',
                        message: data.message
                    });
                    
                    // Acknowledge SOS
                    socket.emit('sos_acknowledged', {
                        timestamp: new Date().toISOString(),
                        emergencyId: `sos_${socket.id}_${Date.now()}`
                    });
                }
            });

            // Handle hazard reports
            socket.on('report_hazard', async (data) => {
                try {
                    await this.hazardService.reportHazard({
                        ...data,
                        reporterId: socket.id,
                        timestamp: new Date().toISOString()
                    });
                    
                    // Broadcast to nearby clients
                    this.broadcastHazardUpdate(data);
                    
                    socket.emit('hazard_reported', { success: true });
                } catch (error) {
                    socket.emit('hazard_reported', { success: false, error: error.message });
                }
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
                
                const client = this.connectedClients.get(socket.id);
                if (client && client.sessionId) {
                    const session = this.activeSessions.get(client.sessionId);
                    if (session) {
                        session.status = 'disconnected';
                        session.disconnectedAt = new Date();
                    }
                }
                
                this.connectedClients.delete(socket.id);
            });
        });
    }

    setupServices() {
        // Subscribe to earthquake data updates
        this.usgsService.subscribe((earthquakeData) => {
            // Broadcast earthquake updates to all clients
            this.io.emit('earthquake_update', earthquakeData);
            
            // Check if any active routes need recalculation
            this.checkAllRoutesForRecalculation(earthquakeData);
        });

        // Subscribe to hazard updates
        this.hazardService.subscribe((hazard) => {
            this.broadcastHazardUpdate(hazard);
        });
    }

    createEvacuationSession(userLocation, routeResult) {
        const sessionId = `evac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const session = {
            id: sessionId,
            startLocation: userLocation,
            currentLocation: userLocation,
            route: routeResult,
            startTime: new Date(),
            lastUpdate: new Date(),
            status: 'active'
        };
        
        this.activeSessions.set(sessionId, session);
        
        // Clean up old sessions (older than 24 hours)
        this.cleanupOldSessions();
        
        return sessionId;
    }

    async checkRouteRecalculation(session) {
        // Check for new hazards on current route
        const currentHazards = this.hazardService.getCurrentHazards();
        const routeHasNewHazards = this.routeEngine.checkRouteForHazards(
            session.route.route,
            currentHazards
        );
        
        // Check for significant new earthquake activity
        const recentEarthquakes = this.usgsService.getRecentEarthquakes(1); // Last hour
        const hasSignificantActivity = recentEarthquakes.features.some(
            eq => eq.properties.mag >= 5.0
        );
        
        return routeHasNewHazards || hasSignificantActivity;
    }

    async checkAllRoutesForRecalculation(earthquakeData) {
        for (const [sessionId, session] of this.activeSessions) {
            if (session.status === 'active') {
                const needsRecalc = await this.checkRouteRecalculation(session);
                if (needsRecalc) {
                    // Recalculate route
                    try {
                        const hazardMap = this.hazardService.getCurrentHazards();
                        const newRoute = this.routeEngine.calculateSafeRoute(
                            session.currentLocation,
                            earthquakeData,
                            hazardMap
                        );
                        
                        session.route = newRoute;
                        session.lastUpdate = new Date();
                        
                        // Notify client
                        this.io.to(sessionId).emit('route_updated', {
                            route: newRoute,
                            reason: 'earthquake_activity'
                        });
                    } catch (error) {
                        console.error(`Failed to recalculate route for session ${sessionId}:`, error);
                    }
                }
            }
        }
    }

    broadcastHazardUpdate(hazard) {
        // Broadcast to clients within affected radius
        const affectedRadius = hazard.radius || 1; // km
        
        for (const [clientId, client] of this.connectedClients) {
            if (client.location) {
                const distance = this.usgsService.calculateDistance(
                    client.location.lat,
                    client.location.lng,
                    hazard.location.lat,
                    hazard.location.lng
                );
                
                if (distance <= affectedRadius) {
                    client.socket.emit('hazard_alert', hazard);
                }
            }
        }
    }

    cleanupOldSessions() {
        const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
        
        for (const [sessionId, session] of this.activeSessions) {
            if (session.startTime.getTime() < cutoffTime) {
                this.activeSessions.delete(sessionId);
            }
        }
    }

    start(port = process.env.PORT || 3000) {
        this.server.listen(port, () => {
            console.log(`Earthquake Evacuation Server running on port ${port}`);
            console.log(`Dashboard: http://localhost:${port}/dashboard`);
            console.log(`API: http://localhost:${port}/api`);
        });
    }
}

// Create and start server
const server = new EarthquakeEvacuationServer();
server.start();

module.exports = EarthquakeEvacuationServer;