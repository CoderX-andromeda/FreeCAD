class CrowdDensityService {
    constructor() {
        this.densityMap = new Map(); // Grid-based density storage
        this.gridSize = 0.001; // ~100m grid cells (in degrees)
        this.maxAge = 10 * 60 * 1000; // 10 minutes data retention
        this.deviceLocations = new Map(); // Anonymous device tracking
        this.crowdFlowData = new Map(); // Movement patterns
        
        // Start periodic cleanup and analysis
        this.startDataProcessing();
    }

    /**
     * Update location data for crowd density calculation
     * @param {string} deviceId - Anonymous device identifier
     * @param {Object} location - {lat, lng, timestamp}
     */
    updateDeviceLocation(deviceId, location) {
        const { lat, lng, timestamp = Date.now() } = location;
        
        // Anonymize and hash device ID for privacy
        const anonymousId = this.anonymizeDeviceId(deviceId);
        
        // Get grid cell for this location
        const gridCell = this.getGridCell(lat, lng);
        
        // Store previous location for flow analysis
        const previousLocation = this.deviceLocations.get(anonymousId);
        
        // Update device location
        this.deviceLocations.set(anonymousId, {
            lat,
            lng,
            timestamp,
            gridCell,
            previousCell: previousLocation?.gridCell
        });

        // Update density map
        this.updateDensityGrid(gridCell, timestamp);
        
        // Update flow data if device moved
        if (previousLocation && previousLocation.gridCell !== gridCell) {
            this.updateFlowData(previousLocation.gridCell, gridCell, timestamp);
        }

        // Clean up old data
        this.cleanupOldData();
    }

    /**
     * Anonymize device ID using hash function
     * @param {string} deviceId - Original device ID
     */
    anonymizeDeviceId(deviceId) {
        // Simple hash function for anonymization
        let hash = 0;
        for (let i = 0; i < deviceId.length; i++) {
            const char = deviceId.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return `anon_${Math.abs(hash).toString(36)}`;
    }

    /**
     * Get grid cell identifier for coordinates
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     */
    getGridCell(lat, lng) {
        const gridLat = Math.floor(lat / this.gridSize) * this.gridSize;
        const gridLng = Math.floor(lng / this.gridSize) * this.gridSize;
        return `${gridLat.toFixed(6)}_${gridLng.toFixed(6)}`;
    }

    /**
     * Update density data for a grid cell
     * @param {string} gridCell - Grid cell identifier
     * @param {number} timestamp - Current timestamp
     */
    updateDensityGrid(gridCell, timestamp) {
        if (!this.densityMap.has(gridCell)) {
            this.densityMap.set(gridCell, {
                count: 0,
                lastUpdate: timestamp,
                devices: new Set(),
                peakCount: 0,
                avgCount: 0,
                samples: []
            });
        }

        const cellData = this.densityMap.get(gridCell);
        
        // Count unique devices in this cell
        const devicesInCell = Array.from(this.deviceLocations.values())
            .filter(device => device.gridCell === gridCell)
            .length;
        
        cellData.count = devicesInCell;
        cellData.lastUpdate = timestamp;
        cellData.peakCount = Math.max(cellData.peakCount, devicesInCell);
        
        // Update running average
        cellData.samples.push({ count: devicesInCell, timestamp });
        if (cellData.samples.length > 20) {
            cellData.samples.shift(); // Keep only recent samples
        }
        
        cellData.avgCount = cellData.samples.reduce((sum, s) => sum + s.count, 0) / cellData.samples.length;
    }

    /**
     * Update crowd flow data between grid cells
     * @param {string} fromCell - Source grid cell
     * @param {string} toCell - Destination grid cell
     * @param {number} timestamp - Movement timestamp
     */
    updateFlowData(fromCell, toCell, timestamp) {
        const flowKey = `${fromCell}->${toCell}`;
        
        if (!this.crowdFlowData.has(flowKey)) {
            this.crowdFlowData.set(flowKey, {
                count: 0,
                lastUpdate: timestamp,
                fromCell,
                toCell,
                avgFlowRate: 0,
                samples: []
            });
        }

        const flowData = this.crowdFlowData.get(flowKey);
        flowData.count++;
        flowData.lastUpdate = timestamp;
        
        // Track flow rate over time
        flowData.samples.push(timestamp);
        
        // Calculate flow rate (movements per minute)
        const recentSamples = flowData.samples.filter(
            t => timestamp - t < 60000 // Last minute
        );
        flowData.avgFlowRate = recentSamples.length;
        
        // Keep only recent samples
        if (flowData.samples.length > 100) {
            flowData.samples = flowData.samples.slice(-50);
        }
    }

    /**
     * Get crowd density at a specific location
     * @param {Object} location - {lat, lng}
     * @param {number} radiusKm - Radius to check around location
     */
    async getDensityAtLocation(location, radiusKm = 0.5) {
        const { lat, lng } = location;
        const radius = radiusKm / 111; // Convert km to degrees (approximate)
        
        let totalDensity = 0;
        let cellCount = 0;
        let peakDensity = 0;
        let deviceCount = 0;

        // Check all grid cells within radius
        for (const [cellId, cellData] of this.densityMap) {
            const [cellLat, cellLng] = cellId.split('_').map(Number);
            const distance = Math.sqrt(
                Math.pow(lat - cellLat, 2) + Math.pow(lng - cellLng, 2)
            );

            if (distance <= radius) {
                totalDensity += cellData.count;
                peakDensity = Math.max(peakDensity, cellData.peakCount);
                deviceCount += cellData.count;
                cellCount++;
            }
        }

        const avgDensity = cellCount > 0 ? totalDensity / cellCount : 0;

        return {
            avgDensity,
            peakDensity,
            totalDevices: deviceCount,
            cellsCovered: cellCount,
            densityLevel: this.calculateDensityLevel(avgDensity),
            estimatedPeople: Math.round(deviceCount * 2.5), // Assume 2.5 people per device
            timestamp: Date.now()
        };
    }

    /**
     * Calculate density level category
     * @param {number} density - Average density value
     */
    calculateDensityLevel(density) {
        if (density < 5) return 'low';
        if (density < 15) return 'moderate';
        if (density < 30) return 'high';
        return 'critical';
    }

    /**
     * Get crowd flow patterns around a location
     * @param {Object} location - {lat, lng}
     * @param {number} radiusKm - Radius to analyze
     */
    getFlowPatternsNearLocation(location, radiusKm = 1.0) {
        const { lat, lng } = location;
        const radius = radiusKm / 111; // Convert km to degrees
        
        const nearbyFlows = [];
        
        for (const [flowKey, flowData] of this.crowdFlowData) {
            const [fromLat, fromLng] = flowData.fromCell.split('_').map(Number);
            const [toLat, toLng] = flowData.toCell.split('_').map(Number);
            
            // Check if flow is within radius
            const fromDistance = Math.sqrt(
                Math.pow(lat - fromLat, 2) + Math.pow(lng - fromLng, 2)
            );
            const toDistance = Math.sqrt(
                Math.pow(lat - toLat, 2) + Math.pow(lng - toLng, 2)
            );
            
            if (fromDistance <= radius || toDistance <= radius) {
                nearbyFlows.push({
                    from: { lat: fromLat, lng: fromLng },
                    to: { lat: toLat, lng: toLng },
                    flowRate: flowData.avgFlowRate,
                    totalCount: flowData.count,
                    direction: this.calculateDirection(fromLat, fromLng, toLat, toLng),
                    lastUpdate: flowData.lastUpdate
                });
            }
        }
        
        return this.analyzeFlowPatterns(nearbyFlows);
    }

    /**
     * Calculate direction between two points
     * @param {number} lat1 - From latitude
     * @param {number} lng1 - From longitude
     * @param {number} lat2 - To latitude
     * @param {number} lng2 - To longitude
     */
    calculateDirection(lat1, lng1, lat2, lng2) {
        const dLng = lng2 - lng1;
        const dLat = lat2 - lat1;
        const bearing = Math.atan2(dLng, dLat) * (180 / Math.PI);
        
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const index = Math.round(((bearing + 360) % 360) / 45) % 8;
        return directions[index];
    }

    /**
     * Analyze flow patterns and identify trends
     * @param {Array} flows - Array of flow data
     */
    analyzeFlowPatterns(flows) {
        const directionCounts = {};
        let totalFlow = 0;
        let avgFlowRate = 0;

        flows.forEach(flow => {
            directionCounts[flow.direction] = (directionCounts[flow.direction] || 0) + flow.flowRate;
            totalFlow += flow.totalCount;
            avgFlowRate += flow.flowRate;
        });

        if (flows.length > 0) {
            avgFlowRate /= flows.length;
        }

        // Find dominant direction
        const dominantDirection = Object.keys(directionCounts).reduce((a, b) =>
            directionCounts[a] > directionCounts[b] ? a : b, 'N'
        );

        return {
            flows,
            totalFlows: flows.length,
            totalMovement: totalFlow,
            avgFlowRate,
            dominantDirection,
            directionBreakdown: directionCounts,
            congestionLevel: this.calculateCongestionLevel(avgFlowRate, flows.length)
        };
    }

    /**
     * Calculate congestion level based on flow data
     * @param {number} avgFlowRate - Average flow rate
     * @param {number} flowCount - Number of active flows
     */
    calculateCongestionLevel(avgFlowRate, flowCount) {
        const congestionScore = (avgFlowRate * flowCount) / 10;
        
        if (congestionScore < 5) return 'free_flow';
        if (congestionScore < 15) return 'moderate';
        if (congestionScore < 30) return 'congested';
        return 'severely_congested';
    }

    /**
     * Get evacuation bottlenecks
     * @param {Array} evacuationRoutes - Array of route coordinates
     */
    identifyEvacuationBottlenecks(evacuationRoutes) {
        const bottlenecks = [];
        
        for (const route of evacuationRoutes) {
            for (let i = 0; i < route.length - 1; i++) {
                const segment = route[i];
                const density = this.getDensityAtLocation(segment, 0.2); // 200m radius
                
                if (density.densityLevel === 'critical' || density.densityLevel === 'high') {
                    bottlenecks.push({
                        location: segment,
                        density: density,
                        routeIndex: evacuationRoutes.indexOf(route),
                        segmentIndex: i,
                        severity: density.densityLevel === 'critical' ? 'severe' : 'moderate'
                    });
                }
            }
        }
        
        return bottlenecks.sort((a, b) => b.density.avgDensity - a.density.avgDensity);
    }

    /**
     * Predict crowd movement based on current patterns
     * @param {Object} location - Center location for prediction
     * @param {number} minutesAhead - How many minutes to predict
     */
    predictCrowdMovement(location, minutesAhead = 10) {
        const flowPatterns = this.getFlowPatternsNearLocation(location, 2.0);
        const currentDensity = this.getDensityAtLocation(location, 1.0);
        
        // Simple prediction based on dominant flow direction
        const prediction = {
            currentDensity: currentDensity.avgDensity,
            predictedDensity: currentDensity.avgDensity,
            trend: 'stable',
            confidence: 0.7
        };

        if (flowPatterns.dominantDirection) {
            const flowIntensity = flowPatterns.avgFlowRate;
            
            // Predict based on flow direction and intensity
            if (flowIntensity > 10) {
                if (this.isFlowingTowards(location, flowPatterns.dominantDirection)) {
                    prediction.predictedDensity += flowIntensity * (minutesAhead / 10);
                    prediction.trend = 'increasing';
                } else {
                    prediction.predictedDensity -= flowIntensity * (minutesAhead / 10);
                    prediction.trend = 'decreasing';
                }
            }
        }

        prediction.predictedDensity = Math.max(0, prediction.predictedDensity);
        prediction.confidence = Math.min(0.9, 0.5 + (flowPatterns.totalFlows / 20));

        return prediction;
    }

    /**
     * Check if flow is moving towards a location
     * @param {Object} location - Target location
     * @param {string} direction - Flow direction
     */
    isFlowingTowards(location, direction) {
        // Simplified logic - in reality this would be more complex
        const towardsMap = {
            'N': 'south',
            'S': 'north',
            'E': 'west',
            'W': 'east',
            'NE': 'southwest',
            'NW': 'southeast',
            'SE': 'northwest',
            'SW': 'northeast'
        };
        return towardsMap[direction] !== undefined;
    }

    /**
     * Start periodic data processing
     */
    startDataProcessing() {
        // Clean up old data every 2 minutes
        setInterval(() => {
            this.cleanupOldData();
        }, 2 * 60 * 1000);

        // Update density calculations every 30 seconds
        setInterval(() => {
            this.recalculateDensities();
        }, 30 * 1000);
    }

    /**
     * Clean up old location and flow data
     */
    cleanupOldData() {
        const now = Date.now();
        
        // Clean up old device locations
        for (const [deviceId, deviceData] of this.deviceLocations) {
            if (now - deviceData.timestamp > this.maxAge) {
                this.deviceLocations.delete(deviceId);
            }
        }

        // Clean up old density data
        for (const [cellId, cellData] of this.densityMap) {
            if (now - cellData.lastUpdate > this.maxAge) {
                this.densityMap.delete(cellId);
            }
        }

        // Clean up old flow data
        for (const [flowKey, flowData] of this.crowdFlowData) {
            if (now - flowData.lastUpdate > this.maxAge) {
                this.crowdFlowData.delete(flowKey);
            }
        }
    }

    /**
     * Recalculate density values for all grid cells
     */
    recalculateDensities() {
        // Update all density cells based on current device locations
        for (const [cellId, cellData] of this.densityMap) {
            const devicesInCell = Array.from(this.deviceLocations.values())
                .filter(device => device.gridCell === cellId)
                .length;
            
            cellData.count = devicesInCell;
            cellData.lastUpdate = Date.now();
        }
    }

    /**
     * Get system statistics
     */
    getStatistics() {
        return {
            activeDevices: this.deviceLocations.size,
            densityCells: this.densityMap.size,
            activeFlows: this.crowdFlowData.size,
            avgDensity: this.calculateOverallAvgDensity(),
            totalMovement: this.calculateTotalMovement(),
            lastUpdate: Math.max(
                ...Array.from(this.deviceLocations.values()).map(d => d.timestamp),
                0
            )
        };
    }

    /**
     * Calculate overall average density
     */
    calculateOverallAvgDensity() {
        if (this.densityMap.size === 0) return 0;
        
        const totalDensity = Array.from(this.densityMap.values())
            .reduce((sum, cell) => sum + cell.count, 0);
        
        return totalDensity / this.densityMap.size;
    }

    /**
     * Calculate total movement activity
     */
    calculateTotalMovement() {
        return Array.from(this.crowdFlowData.values())
            .reduce((sum, flow) => sum + flow.count, 0);
    }

    /**
     * Simulate crowd density for testing (remove in production)
     */
    simulateCrowdData(centerLat, centerLng, deviceCount = 100) {
        console.log('Simulating crowd data for testing...');
        
        for (let i = 0; i < deviceCount; i++) {
            const deviceId = `sim_device_${i}`;
            const randomLat = centerLat + (Math.random() - 0.5) * 0.01; // ~1km spread
            const randomLng = centerLng + (Math.random() - 0.5) * 0.01;
            
            this.updateDeviceLocation(deviceId, {
                lat: randomLat,
                lng: randomLng,
                timestamp: Date.now()
            });
        }
    }
}

module.exports = CrowdDensityService;