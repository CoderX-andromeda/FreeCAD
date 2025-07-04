const EventEmitter = require('events');

class EmergencyManagementService extends EventEmitter {
    constructor() {
        super();
        this.emergencyUnits = new Map(); // Available emergency units
        this.activeIncidents = new Map(); // Active emergency incidents
        this.sosRequests = new Map(); // SOS requests from users
        this.evacueeLocations = new Map(); // Tracked evacuee locations
        this.resourceAllocations = new Map(); // Resource deployment tracking
        this.emergencyContacts = new Map(); // Emergency service contacts
        
        // Initialize emergency services
        this.initializeEmergencyServices();
        
        // Start periodic status updates
        this.startStatusMonitoring();
    }

    /**
     * Initialize emergency service units and contacts
     */
    initializeEmergencyServices() {
        // Initialize emergency units (in production, this would come from a database)
        const units = [
            { id: 'fire-01', type: 'fire_department', location: { lat: 35.6762, lng: 139.6503 }, status: 'available', capacity: 6 },
            { id: 'police-01', type: 'police', location: { lat: 35.6812, lng: 139.7671 }, status: 'available', capacity: 4 },
            { id: 'medical-01', type: 'medical', location: { lat: 35.6586, lng: 139.7454 }, status: 'available', capacity: 8 },
            { id: 'rescue-01', type: 'search_rescue', location: { lat: 35.6895, lng: 139.6917 }, status: 'available', capacity: 10 },
            { id: 'hazmat-01', type: 'hazmat', location: { lat: 35.6654, lng: 139.7706 }, status: 'available', capacity: 4 }
        ];

        units.forEach(unit => {
            this.emergencyUnits.set(unit.id, {
                ...unit,
                deployedAt: null,
                currentIncident: null,
                lastUpdate: Date.now()
            });
        });

        // Initialize emergency contacts
        this.emergencyContacts.set('fire_department', {
            name: 'Tokyo Fire Department',
            phone: '119',
            radio: 'FIRE-DISPATCH',
            email: 'dispatch@tokyo-fire.jp'
        });

        this.emergencyContacts.set('police', {
            name: 'Tokyo Metropolitan Police',
            phone: '110',
            radio: 'POLICE-DISPATCH',
            email: 'emergency@keishicho.metro.tokyo.jp'
        });

        this.emergencyContacts.set('medical', {
            name: 'Emergency Medical Services',
            phone: '119',
            radio: 'EMS-DISPATCH',
            email: 'ems@tokyo-emergency.jp'
        });

        console.log(`Emergency Management System initialized with ${this.emergencyUnits.size} units`);
    }

    /**
     * Handle emergency SOS request from user
     * @param {Object} sosData - SOS request data
     */
    async handleEmergencySOS(sosData) {
        const { clientId, location, type, message, severity = 'high' } = sosData;
        
        const sosId = `sos_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        
        const sosRequest = {
            id: sosId,
            clientId,
            location,
            type,
            message,
            severity,
            timestamp: new Date(),
            status: 'active',
            assignedUnits: [],
            estimatedResponseTime: null
        };

        this.sosRequests.set(sosId, sosRequest);
        
        console.log(`Emergency SOS received: ${sosId} - ${type} at ${location.lat}, ${location.lng}`);
        
        // Auto-dispatch appropriate emergency services
        await this.autoDispatchEmergencyServices(sosRequest);
        
        // Notify emergency coordination center
        this.notifyEmergencyCenter(sosRequest);
        
        this.emit('sos_received', sosRequest);
        
        return {
            sosId,
            message: 'Emergency services have been notified',
            estimatedResponseTime: sosRequest.estimatedResponseTime
        };
    }

    /**
     * Automatically dispatch appropriate emergency services
     * @param {Object} sosRequest - SOS request object
     */
    async autoDispatchEmergencyServices(sosRequest) {
        const requiredServices = this.determineRequiredServices(sosRequest.type);
        const dispatchedUnits = [];

        for (const serviceType of requiredServices) {
            const availableUnit = this.findNearestAvailableUnit(serviceType, sosRequest.location);
            
            if (availableUnit) {
                const deployment = await this.deployUnit(availableUnit.id, sosRequest);
                if (deployment.success) {
                    dispatchedUnits.push(availableUnit);
                }
            } else {
                console.warn(`No available ${serviceType} units for SOS ${sosRequest.id}`);
            }
        }

        sosRequest.assignedUnits = dispatchedUnits.map(unit => unit.id);
        sosRequest.estimatedResponseTime = this.calculateResponseTime(dispatchedUnits, sosRequest.location);
        
        console.log(`Dispatched ${dispatchedUnits.length} units for SOS ${sosRequest.id}`);
    }

    /**
     * Determine required emergency services based on incident type
     * @param {string} incidentType - Type of emergency
     */
    determineRequiredServices(incidentType) {
        const serviceMap = {
            'building_collapse': ['search_rescue', 'medical', 'fire_department'],
            'fire': ['fire_department', 'medical'],
            'medical_emergency': ['medical'],
            'gas_leak': ['fire_department', 'hazmat'],
            'injury': ['medical'],
            'trapped': ['search_rescue', 'medical'],
            'general_emergency': ['police', 'medical'],
            'evacuation_assistance': ['police', 'search_rescue']
        };

        return serviceMap[incidentType] || ['police', 'medical'];
    }

    /**
     * Find nearest available emergency unit of specified type
     * @param {string} serviceType - Type of emergency service needed
     * @param {Object} location - Emergency location
     */
    findNearestAvailableUnit(serviceType, location) {
        let nearestUnit = null;
        let minDistance = Infinity;

        for (const unit of this.emergencyUnits.values()) {
            if (unit.type === serviceType && unit.status === 'available') {
                const distance = this.calculateDistance(
                    location.lat, location.lng,
                    unit.location.lat, unit.location.lng
                );

                if (distance < minDistance) {
                    minDistance = distance;
                    nearestUnit = unit;
                }
            }
        }

        return nearestUnit;
    }

    /**
     * Deploy an emergency unit to an incident
     * @param {string} unitId - Unit ID to deploy
     * @param {Object} incident - Incident object
     */
    async deployUnit(unitId, incident) {
        const unit = this.emergencyUnits.get(unitId);
        
        if (!unit || unit.status !== 'available') {
            return { success: false, message: 'Unit not available' };
        }

        // Update unit status
        unit.status = 'deployed';
        unit.deployedAt = new Date();
        unit.currentIncident = incident.id;
        unit.lastUpdate = Date.now();

        // Calculate route to incident (simplified)
        const distance = this.calculateDistance(
            unit.location.lat, unit.location.lng,
            incident.location.lat, incident.location.lng
        );
        
        const estimatedArrival = this.calculateArrivalTime(distance, unit.type);
        
        console.log(`Unit ${unitId} deployed to ${incident.id}, ETA: ${estimatedArrival} minutes`);
        
        // Notify unit dispatch
        this.notifyUnitDispatch(unit, incident, estimatedArrival);
        
        this.emit('unit_deployed', { unit, incident, estimatedArrival });
        
        return {
            success: true,
            unitId,
            estimatedArrival,
            message: `${unit.type} unit dispatched`
        };
    }

    /**
     * Calculate arrival time based on distance and unit type
     * @param {number} distanceKm - Distance in kilometers
     * @param {string} unitType - Type of emergency unit
     */
    calculateArrivalTime(distanceKm, unitType) {
        // Different unit types have different response speeds
        const speedMap = {
            'fire_department': 60, // km/h
            'police': 80,
            'medical': 70,
            'search_rescue': 50,
            'hazmat': 40
        };

        const speed = speedMap[unitType] || 60;
        const timeHours = distanceKm / speed;
        return Math.ceil(timeHours * 60); // Return minutes
    }

    /**
     * Calculate overall response time for multiple units
     * @param {Array} units - Array of emergency units
     * @param {Object} location - Incident location
     */
    calculateResponseTime(units, location) {
        if (units.length === 0) return null;

        const responseTimes = units.map(unit => {
            const distance = this.calculateDistance(
                unit.location.lat, unit.location.lng,
                location.lat, location.lng
            );
            return this.calculateArrivalTime(distance, unit.type);
        });

        return Math.max(...responseTimes); // Return the longest response time
    }

    /**
     * Update evacuee location for tracking
     * @param {string} sessionId - Evacuation session ID
     * @param {Object} location - Current location
     */
    updateEvacueeLocation(sessionId, location) {
        this.evacueeLocations.set(sessionId, {
            location,
            timestamp: new Date(),
            lastUpdate: Date.now()
        });

        // Check if evacuee is in distress (stopped moving for too long)
        this.checkEvacueeStatus(sessionId);
    }

    /**
     * Check evacuee status for potential distress
     * @param {string} sessionId - Evacuation session ID
     */
    checkEvacueeStatus(sessionId) {
        const evacuee = this.evacueeLocations.get(sessionId);
        if (!evacuee) return;

        const timeSinceUpdate = Date.now() - evacuee.lastUpdate;
        const distressThreshold = 5 * 60 * 1000; // 5 minutes

        if (timeSinceUpdate > distressThreshold) {
            console.warn(`Potential distress detected for evacuee ${sessionId}`);
            
            // Auto-create assistance request
            this.handleEmergencySOS({
                clientId: sessionId,
                location: evacuee.location,
                type: 'evacuation_assistance',
                message: 'Evacuee may need assistance - no movement detected',
                severity: 'medium'
            });
        }
    }

    /**
     * Get system status and operational overview
     */
    async getSystemStatus() {
        const totalUnits = this.emergencyUnits.size;
        const availableUnits = Array.from(this.emergencyUnits.values())
            .filter(unit => unit.status === 'available').length;
        const deployedUnits = Array.from(this.emergencyUnits.values())
            .filter(unit => unit.status === 'deployed').length;

        const activeSOS = this.sosRequests.size;
        const activeEvacuees = this.evacueeLocations.size;

        return {
            timestamp: new Date().toISOString(),
            emergencyUnits: {
                total: totalUnits,
                available: availableUnits,
                deployed: deployedUnits,
                utilization: (deployedUnits / totalUnits) * 100
            },
            incidents: {
                activeSOS,
                activeEvacuees,
                totalIncidents: this.activeIncidents.size
            },
            systemHealth: {
                status: 'operational',
                uptime: process.uptime(),
                lastUpdate: Date.now()
            },
            coverage: this.calculateCoverageArea()
        };
    }

    /**
     * Calculate emergency service coverage area
     */
    calculateCoverageArea() {
        const units = Array.from(this.emergencyUnits.values());
        if (units.length === 0) return { area: 0, radius: 0 };

        // Calculate average response radius (simplified)
        const avgResponseRadius = 10; // km - typical emergency response radius
        const coverageArea = Math.PI * Math.pow(avgResponseRadius, 2) * units.length;

        return {
            area: Math.round(coverageArea),
            radius: avgResponseRadius,
            units: units.length
        };
    }

    /**
     * Allocate resources for large-scale evacuation
     * @param {Object} evacuationZone - Zone requiring evacuation
     * @param {number} estimatedPopulation - Estimated people in zone
     */
    async allocateEvacuationResources(evacuationZone, estimatedPopulation) {
        const resourceNeeds = this.calculateResourceNeeds(estimatedPopulation);
        const allocation = {
            id: `evac_${Date.now()}`,
            zone: evacuationZone,
            population: estimatedPopulation,
            resourceNeeds,
            allocatedUnits: [],
            timestamp: new Date(),
            status: 'planned'
        };

        // Allocate available units
        for (const [serviceType, count] of Object.entries(resourceNeeds)) {
            const allocatedUnits = this.allocateUnitsOfType(serviceType, count, evacuationZone.center);
            allocation.allocatedUnits.push(...allocatedUnits);
        }

        this.resourceAllocations.set(allocation.id, allocation);
        
        console.log(`Resource allocation created: ${allocation.id} for ${estimatedPopulation} people`);
        
        this.emit('resources_allocated', allocation);
        
        return allocation;
    }

    /**
     * Calculate resource needs based on population
     * @param {number} population - Estimated population to evacuate
     */
    calculateResourceNeeds(population) {
        // Resource ratios based on emergency management guidelines
        return {
            police: Math.ceil(population / 1000), // 1 per 1000 people
            medical: Math.ceil(population / 500), // 1 per 500 people
            search_rescue: Math.ceil(population / 2000), // 1 per 2000 people
            fire_department: Math.ceil(population / 1500) // 1 per 1500 people
        };
    }

    /**
     * Allocate units of specific type
     * @param {string} serviceType - Type of service needed
     * @param {number} count - Number of units needed
     * @param {Object} location - Deployment location
     */
    allocateUnitsOfType(serviceType, count, location) {
        const availableUnits = Array.from(this.emergencyUnits.values())
            .filter(unit => unit.type === serviceType && unit.status === 'available')
            .sort((a, b) => {
                const distA = this.calculateDistance(location.lat, location.lng, a.location.lat, a.location.lng);
                const distB = this.calculateDistance(location.lat, location.lng, b.location.lat, b.location.lng);
                return distA - distB;
            });

        const allocated = availableUnits.slice(0, count);
        
        // Reserve these units
        allocated.forEach(unit => {
            unit.status = 'reserved';
            unit.lastUpdate = Date.now();
        });

        return allocated;
    }

    /**
     * Notify emergency coordination center
     * @param {Object} incident - Incident details
     */
    notifyEmergencyCenter(incident) {
        const notification = {
            type: 'emergency_notification',
            incident: incident,
            timestamp: new Date().toISOString(),
            priority: this.calculatePriority(incident)
        };

        // In production, this would integrate with actual emergency dispatch systems
        console.log('Emergency Center Notification:', notification);
        
        this.emit('emergency_center_notified', notification);
    }

    /**
     * Notify unit of dispatch
     * @param {Object} unit - Emergency unit
     * @param {Object} incident - Incident details
     * @param {number} eta - Estimated time of arrival
     */
    notifyUnitDispatch(unit, incident, eta) {
        const dispatch = {
            unitId: unit.id,
            unitType: unit.type,
            incidentId: incident.id,
            location: incident.location,
            eta: eta,
            priority: this.calculatePriority(incident),
            timestamp: new Date().toISOString()
        };

        // In production, this would send to unit dispatch systems
        console.log(`Unit Dispatch: ${unit.id} -> ${incident.type} (ETA: ${eta}min)`);
        
        this.emit('unit_dispatched', dispatch);
    }

    /**
     * Calculate incident priority
     * @param {Object} incident - Incident object
     */
    calculatePriority(incident) {
        const priorityMap = {
            'building_collapse': 'critical',
            'fire': 'high',
            'medical_emergency': 'high',
            'gas_leak': 'high',
            'trapped': 'high',
            'injury': 'medium',
            'evacuation_assistance': 'medium',
            'general_emergency': 'low'
        };

        let priority = priorityMap[incident.type] || 'medium';
        
        // Upgrade priority based on severity
        if (incident.severity === 'critical') {
            priority = 'critical';
        }

        return priority;
    }

    /**
     * Calculate distance between two points using Haversine formula
     */
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.toRadians(lat2 - lat1);
        const dLng = this.toRadians(lng2 - lng1);
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Convert degrees to radians
     */
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * Start periodic status monitoring
     */
    startStatusMonitoring() {
        // Update unit statuses every 30 seconds
        setInterval(() => {
            this.updateUnitStatuses();
        }, 30 * 1000);

        // Check evacuee statuses every minute
        setInterval(() => {
            this.checkAllEvacueeStatuses();
        }, 60 * 1000);

        // Clean up old data every 5 minutes
        setInterval(() => {
            this.cleanupOldData();
        }, 5 * 60 * 1000);
    }

    /**
     * Update statuses of all emergency units
     */
    updateUnitStatuses() {
        for (const unit of this.emergencyUnits.values()) {
            // Simulate unit status updates (in production, this would come from real systems)
            if (unit.status === 'deployed' && unit.deployedAt) {
                const deployedTime = Date.now() - unit.deployedAt.getTime();
                
                // Auto-return units after typical response time
                if (deployedTime > 30 * 60 * 1000) { // 30 minutes
                    unit.status = 'available';
                    unit.deployedAt = null;
                    unit.currentIncident = null;
                    console.log(`Unit ${unit.id} returned to service`);
                }
            }
        }
    }

    /**
     * Check all evacuee statuses
     */
    checkAllEvacueeStatuses() {
        for (const sessionId of this.evacueeLocations.keys()) {
            this.checkEvacueeStatus(sessionId);
        }
    }

    /**
     * Clean up old emergency data
     */
    cleanupOldData() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        // Clean up old SOS requests
        for (const [sosId, sos] of this.sosRequests) {
            if (now - sos.timestamp.getTime() > maxAge) {
                this.sosRequests.delete(sosId);
            }
        }

        // Clean up old evacuee locations
        for (const [sessionId, evacuee] of this.evacueeLocations) {
            if (now - evacuee.lastUpdate > maxAge) {
                this.evacueeLocations.delete(sessionId);
            }
        }

        // Clean up old resource allocations
        for (const [allocationId, allocation] of this.resourceAllocations) {
            if (now - allocation.timestamp.getTime() > maxAge) {
                this.resourceAllocations.delete(allocationId);
            }
        }
    }

    /**
     * Get real-time statistics
     */
    getStatistics() {
        return {
            emergencyUnits: {
                total: this.emergencyUnits.size,
                byType: this.getUnitsByType(),
                byStatus: this.getUnitsByStatus()
            },
            incidents: {
                activeSOS: this.sosRequests.size,
                activeEvacuees: this.evacueeLocations.size,
                resourceAllocations: this.resourceAllocations.size
            },
            responseMetrics: this.calculateResponseMetrics()
        };
    }

    /**
     * Get units grouped by type
     */
    getUnitsByType() {
        const byType = {};
        for (const unit of this.emergencyUnits.values()) {
            byType[unit.type] = (byType[unit.type] || 0) + 1;
        }
        return byType;
    }

    /**
     * Get units grouped by status
     */
    getUnitsByStatus() {
        const byStatus = {};
        for (const unit of this.emergencyUnits.values()) {
            byStatus[unit.status] = (byStatus[unit.status] || 0) + 1;
        }
        return byStatus;
    }

    /**
     * Calculate response metrics
     */
    calculateResponseMetrics() {
        const activeSOS = Array.from(this.sosRequests.values());
        
        if (activeSOS.length === 0) {
            return { avgResponseTime: 0, totalResponses: 0 };
        }

        const totalResponseTime = activeSOS.reduce((sum, sos) => {
            return sum + (sos.estimatedResponseTime || 0);
        }, 0);

        return {
            avgResponseTime: totalResponseTime / activeSOS.length,
            totalResponses: activeSOS.length,
            criticalIncidents: activeSOS.filter(sos => sos.severity === 'critical').length
        };
    }
}

module.exports = EmergencyManagementService;