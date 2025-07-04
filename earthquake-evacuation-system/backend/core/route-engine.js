const { PriorityQueue } = require('heap');
const turf = require('@turf/turf');
const { Matrix } = require('ml-matrix');

class RouteCalculationEngine {
    constructor() {
        this.cityGraph = new Map();
        this.safeZones = [];
        this.hazardMap = new Map();
        this.crowdDensityMap = new Map();
        this.structuralRiskMap = new Map();
        this.seismicData = null;
    }

    /**
     * Calculate optimal evacuation path using multi-factor weighting
     * @param {Object} userLocation - {lat, lng}
     * @param {Object} seismicData - Real-time seismic information
     * @param {Map} hazardMap - Current hazard reports
     * @returns {Array} Optimal evacuation route
     */
    calculateSafeRoute(userLocation, seismicData, hazardMap) {
        console.log('Calculating safe route for location:', userLocation);
        
        this.seismicData = seismicData;
        this.hazardMap = hazardMap;
        
        // Load city graph with current data
        const graph = this.loadCityGraph();
        
        // Adjust edge weights based on real-time factors
        this.updateEdgeWeights(graph);
        
        // Find nearest safe zone
        const targetSafeZone = this.findNearestSafeZone(userLocation);
        
        if (!targetSafeZone) {
            throw new Error('No safe zones available');
        }
        
        // Apply A* algorithm for pathfinding
        const route = this.aStarAlgorithm(
            userLocation,
            targetSafeZone,
            graph
        );
        
        return {
            route: route,
            estimatedTime: this.calculateEstimatedTime(route),
            riskLevel: this.calculateRouteRiskLevel(route),
            alternativeRoutes: this.generateAlternativeRoutes(userLocation, targetSafeZone, graph)
        };
    }

    /**
     * Update edge weights based on real-time risk factors
     */
    updateEdgeWeights(graph) {
        for (const [edgeId, edge] of graph.entries()) {
            const seismicRisk = this.calculateSeismicRisk(edge, this.seismicData);
            const structuralRisk = this.calculateStructuralRisk(edge);
            const crowdDensity = this.getCrowdDensity(edge);
            const hazardReports = this.getHazardReports(edge);
            
            // Multi-factor weighting as specified
            edge.weight = (
                0.4 * seismicRisk +
                0.3 * structuralRisk +
                0.2 * crowdDensity +
                0.1 * hazardReports
            );
            
            // Add base distance factor
            edge.weight += edge.baseDistance * 0.1;
            
            // Apply exponential penalty for extreme risks
            if (seismicRisk > 0.8 || structuralRisk > 0.9) {
                edge.weight *= 3.0;
            }
        }
    }

    /**
     * Calculate seismic risk for an edge based on Shindo scale
     */
    calculateSeismicRisk(edge, seismicData) {
        if (!seismicData || !seismicData.features) return 0.1;
        
        let maxRisk = 0;
        
        for (const earthquake of seismicData.features) {
            const eqLocation = earthquake.geometry.coordinates;
            const magnitude = earthquake.properties.mag;
            const depth = earthquake.geometry.coordinates[2];
            
            // Calculate distance from earthquake epicenter to edge
            const distance = turf.distance(
                turf.point([edge.startLng, edge.startLat]),
                turf.point([eqLocation[0], eqLocation[1]]),
                { units: 'kilometers' }
            );
            
            // Seismic intensity calculation (simplified Shindo scale)
            const intensity = this.calculateShindoIntensity(magnitude, distance, depth);
            const risk = Math.min(intensity / 7.0, 1.0); // Normalize to 0-1
            
            maxRisk = Math.max(maxRisk, risk);
        }
        
        return maxRisk;
    }

    /**
     * Calculate Shindo intensity based on magnitude, distance, and depth
     */
    calculateShindoIntensity(magnitude, distance, depth) {
        // Simplified Shindo scale calculation
        const attenuationFactor = Math.log10(distance + depth);
        const intensity = magnitude - 3.0 * attenuationFactor + 3.0;
        return Math.max(0, Math.min(7, intensity));
    }

    /**
     * Calculate structural risk based on building data
     */
    calculateStructuralRisk(edge) {
        const structuralData = this.structuralRiskMap.get(edge.id);
        if (!structuralData) return 0.2; // Default moderate risk
        
        // Factors: building age, construction type, previous damage
        const ageRisk = structuralData.averageAge > 50 ? 0.7 : 0.3;
        const constructionRisk = structuralData.constructionType === 'unreinforced_masonry' ? 0.9 : 0.2;
        const damageRisk = structuralData.previousDamage ? 0.8 : 0.1;
        
        return Math.min((ageRisk + constructionRisk + damageRisk) / 3, 1.0);
    }

    /**
     * Get crowd density for an edge
     */
    getCrowdDensity(edge) {
        const density = this.crowdDensityMap.get(edge.id) || 0;
        // Normalize to 0-1 scale where 1.0 represents maximum crowd density
        return Math.min(density / 1000.0, 1.0);
    }

    /**
     * Get hazard reports for an edge
     */
    getHazardReports(edge) {
        const hazards = this.hazardMap.get(edge.id) || [];
        
        let riskScore = 0;
        for (const hazard of hazards) {
            switch (hazard.type) {
                case 'building_collapse':
                    riskScore += 0.9;
                    break;
                case 'fire':
                    riskScore += 0.7;
                    break;
                case 'debris':
                    riskScore += 0.5;
                    break;
                case 'gas_leak':
                    riskScore += 0.8;
                    break;
                default:
                    riskScore += 0.3;
            }
        }
        
        return Math.min(riskScore, 1.0);
    }

    /**
     * A* pathfinding algorithm implementation
     */
    aStarAlgorithm(start, goal, graph) {
        const openSet = new PriorityQueue((a, b) => a.fScore - b.fScore);
        const closedSet = new Set();
        const gScore = new Map();
        const fScore = new Map();
        const cameFrom = new Map();
        
        const startNode = this.findNearestNode(start);
        const goalNode = this.findNearestNode(goal);
        
        gScore.set(startNode.id, 0);
        fScore.set(startNode.id, this.heuristic(startNode, goalNode));
        
        openSet.push({
            node: startNode,
            fScore: fScore.get(startNode.id)
        });
        
        while (openSet.length > 0) {
            const current = openSet.pop().node;
            
            if (current.id === goalNode.id) {
                return this.reconstructPath(cameFrom, current);
            }
            
            closedSet.add(current.id);
            
            for (const neighborId of current.neighbors) {
                if (closedSet.has(neighborId)) continue;
                
                const neighbor = this.getNode(neighborId);
                const edge = this.getEdge(current.id, neighborId);
                const tentativeGScore = gScore.get(current.id) + edge.weight;
                
                if (!gScore.has(neighborId) || tentativeGScore < gScore.get(neighborId)) {
                    cameFrom.set(neighborId, current.id);
                    gScore.set(neighborId, tentativeGScore);
                    fScore.set(neighborId, tentativeGScore + this.heuristic(neighbor, goalNode));
                    
                    if (!openSet.some(item => item.node.id === neighborId)) {
                        openSet.push({
                            node: neighbor,
                            fScore: fScore.get(neighborId)
                        });
                    }
                }
            }
        }
        
        throw new Error('No path found to safe zone');
    }

    /**
     * Heuristic function for A* (Euclidean distance)
     */
    heuristic(nodeA, nodeB) {
        return turf.distance(
            turf.point([nodeA.lng, nodeA.lat]),
            turf.point([nodeB.lng, nodeB.lat]),
            { units: 'kilometers' }
        );
    }

    /**
     * Reconstruct path from A* algorithm
     */
    reconstructPath(cameFrom, current) {
        const path = [current];
        
        while (cameFrom.has(current.id)) {
            current = this.getNode(cameFrom.get(current.id));
            path.unshift(current);
        }
        
        return path;
    }

    /**
     * Find nearest safe zone to user location
     */
    findNearestSafeZone(userLocation) {
        let nearest = null;
        let minDistance = Infinity;
        
        for (const safeZone of this.safeZones) {
            const distance = turf.distance(
                turf.point([userLocation.lng, userLocation.lat]),
                turf.point([safeZone.lng, safeZone.lat]),
                { units: 'kilometers' }
            );
            
            if (distance < minDistance) {
                minDistance = distance;
                nearest = safeZone;
            }
        }
        
        return nearest;
    }

    /**
     * Load and initialize city graph
     */
    loadCityGraph() {
        // This would typically load from a database or cache
        // For now, return the existing graph
        return this.cityGraph;
    }

    /**
     * Calculate estimated travel time for a route
     */
    calculateEstimatedTime(route) {
        let totalTime = 0;
        const walkingSpeed = 1.4; // m/s average walking speed
        
        for (let i = 0; i < route.length - 1; i++) {
            const distance = turf.distance(
                turf.point([route[i].lng, route[i].lat]),
                turf.point([route[i + 1].lng, route[i + 1].lat]),
                { units: 'meters' }
            );
            totalTime += distance / walkingSpeed;
        }
        
        return Math.ceil(totalTime / 60); // Return time in minutes
    }

    /**
     * Calculate overall risk level for a route
     */
    calculateRouteRiskLevel(route) {
        let totalRisk = 0;
        let segmentCount = 0;
        
        for (let i = 0; i < route.length - 1; i++) {
            const edgeId = `${route[i].id}-${route[i + 1].id}`;
            const edge = this.cityGraph.get(edgeId);
            if (edge) {
                totalRisk += edge.weight;
                segmentCount++;
            }
        }
        
        const averageRisk = segmentCount > 0 ? totalRisk / segmentCount : 0.5;
        
        if (averageRisk < 0.3) return 'LOW';
        if (averageRisk < 0.6) return 'MODERATE';
        if (averageRisk < 0.8) return 'HIGH';
        return 'CRITICAL';
    }

    /**
     * Generate alternative routes for redundancy
     */
    generateAlternativeRoutes(start, goal, graph, count = 2) {
        const alternatives = [];
        
        // Temporarily increase weights of primary route edges
        const primaryRoute = this.aStarAlgorithm(start, goal, graph);
        
        for (let i = 0; i < count; i++) {
            try {
                // Modify graph to avoid previous routes
                this.penalizePreviousRoutes(graph, [primaryRoute, ...alternatives]);
                const altRoute = this.aStarAlgorithm(start, goal, graph);
                alternatives.push(altRoute);
            } catch (error) {
                // If no alternative found, break
                break;
            }
        }
        
        return alternatives;
    }

    /**
     * Helper methods for graph operations
     */
    findNearestNode(location) {
        // Implementation to find nearest graph node to given location
        let nearest = null;
        let minDistance = Infinity;
        
        for (const [nodeId, node] of this.cityGraph) {
            if (node.type === 'node') {
                const distance = turf.distance(
                    turf.point([location.lng, location.lat]),
                    turf.point([node.lng, node.lat]),
                    { units: 'meters' }
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    nearest = node;
                }
            }
        }
        
        return nearest;
    }

    getNode(nodeId) {
        return this.cityGraph.get(nodeId);
    }

    getEdge(fromId, toId) {
        return this.cityGraph.get(`${fromId}-${toId}`) || this.cityGraph.get(`${toId}-${fromId}`);
    }

    penalizePreviousRoutes(graph, routes) {
        for (const route of routes) {
            for (let i = 0; i < route.length - 1; i++) {
                const edgeId = `${route[i].id}-${route[i + 1].id}`;
                const edge = graph.get(edgeId);
                if (edge) {
                    edge.weight *= 2.0; // Double the weight to discourage reuse
                }
            }
        }
    }
}

module.exports = RouteCalculationEngine;