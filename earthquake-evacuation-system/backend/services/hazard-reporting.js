const EventEmitter = require('events');

class HazardReportingService extends EventEmitter {
    constructor() {
        super();
        this.hazards = new Map();
        this.subscribers = [];
        this.confidenceThreshold = 0.6;
        this.maxHazardAge = 24 * 60 * 60 * 1000; // 24 hours
        
        // Start periodic cleanup
        this.startCleanupInterval();
    }

    /**
     * Subscribe to hazard updates
     * @param {Function} callback - Function to call when hazards are updated
     */
    subscribe(callback) {
        this.subscribers.push(callback);
    }

    /**
     * Unsubscribe from hazard updates
     * @param {Function} callback - Function to remove from subscribers
     */
    unsubscribe(callback) {
        const index = this.subscribers.indexOf(callback);
        if (index > -1) {
            this.subscribers.splice(index, 1);
        }
    }

    /**
     * Notify all subscribers of hazard updates
     * @param {Object} hazard - Hazard data to broadcast
     */
    notifySubscribers(hazard) {
        this.subscribers.forEach(callback => {
            try {
                callback(hazard);
            } catch (error) {
                console.error('Error notifying hazard subscriber:', error);
            }
        });
    }

    /**
     * Report a new hazard
     * @param {Object} hazardReport - Hazard report data
     */
    async reportHazard(hazardReport) {
        const {
            type,
            location,
            severity,
            description,
            reporterId,
            timestamp,
            imageUrl,
            confidence = 0.7
        } = hazardReport;

        // Validate required fields
        if (!type || !location || !location.lat || !location.lng) {
            throw new Error('Invalid hazard report: missing required fields');
        }

        // Generate hazard ID based on location and type
        const hazardId = this.generateHazardId(type, location);
        
        const existingHazard = this.hazards.get(hazardId);
        
        if (existingHazard) {
            // Update existing hazard with new report
            return this.updateExistingHazard(existingHazard, hazardReport);
        } else {
            // Create new hazard
            return this.createNewHazard(hazardId, hazardReport);
        }
    }

    /**
     * Generate a unique hazard ID based on type and location
     * @param {string} type - Hazard type
     * @param {Object} location - Location coordinates
     */
    generateHazardId(type, location) {
        // Round coordinates to create location clusters
        const lat = Math.round(location.lat * 10000) / 10000;
        const lng = Math.round(location.lng * 10000) / 10000;
        return `${type}_${lat}_${lng}`;
    }

    /**
     * Create a new hazard entry
     * @param {string} hazardId - Generated hazard ID
     * @param {Object} hazardReport - Initial hazard report
     */
    async createNewHazard(hazardId, hazardReport) {
        const hazard = {
            id: hazardId,
            type: hazardReport.type,
            location: hazardReport.location,
            severity: this.calculateSeverity(hazardReport),
            description: hazardReport.description || '',
            reports: [this.createReportEntry(hazardReport)],
            firstReported: new Date(hazardReport.timestamp || Date.now()),
            lastUpdated: new Date(),
            confidence: hazardReport.confidence || 0.7,
            status: 'active',
            affectedRadius: this.calculateAffectedRadius(hazardReport),
            verificationLevel: this.calculateVerificationLevel([hazardReport])
        };

        // Add hazard-specific properties
        this.enhanceHazardData(hazard);

        this.hazards.set(hazardId, hazard);
        
        console.log(`New hazard reported: ${hazard.type} at ${hazard.location.lat}, ${hazard.location.lng}`);
        
        // Notify subscribers
        this.notifySubscribers(hazard);
        this.emit('hazard_created', hazard);

        return {
            success: true,
            hazardId: hazardId,
            message: 'Hazard reported successfully'
        };
    }

    /**
     * Update an existing hazard with a new report
     * @param {Object} existingHazard - Existing hazard data
     * @param {Object} hazardReport - New hazard report
     */
    async updateExistingHazard(existingHazard, hazardReport) {
        // Add new report
        existingHazard.reports.push(this.createReportEntry(hazardReport));
        existingHazard.lastUpdated = new Date();
        
        // Recalculate confidence and verification
        existingHazard.confidence = this.calculateAggregateConfidence(existingHazard.reports);
        existingHazard.verificationLevel = this.calculateVerificationLevel(existingHazard.reports);
        
        // Update severity if new report indicates higher severity
        const newSeverity = this.calculateSeverity(hazardReport);
        if (this.getSeverityLevel(newSeverity) > this.getSeverityLevel(existingHazard.severity)) {
            existingHazard.severity = newSeverity;
        }

        // Update affected radius if needed
        const newRadius = this.calculateAffectedRadius(hazardReport);
        existingHazard.affectedRadius = Math.max(existingHazard.affectedRadius, newRadius);

        console.log(`Updated hazard: ${existingHazard.id} (${existingHazard.reports.length} reports)`);
        
        // Notify subscribers
        this.notifySubscribers(existingHazard);
        this.emit('hazard_updated', existingHazard);

        return {
            success: true,
            hazardId: existingHazard.id,
            message: 'Hazard updated successfully',
            reportCount: existingHazard.reports.length
        };
    }

    /**
     * Create a report entry
     * @param {Object} hazardReport - Hazard report data
     */
    createReportEntry(hazardReport) {
        return {
            reporterId: hazardReport.reporterId,
            timestamp: new Date(hazardReport.timestamp || Date.now()),
            description: hazardReport.description || '',
            imageUrl: hazardReport.imageUrl,
            confidence: hazardReport.confidence || 0.7,
            severity: hazardReport.severity,
            location: hazardReport.location
        };
    }

    /**
     * Calculate severity based on hazard type and report details
     * @param {Object} hazardReport - Hazard report data
     */
    calculateSeverity(hazardReport) {
        if (hazardReport.severity) {
            return hazardReport.severity;
        }

        // Auto-calculate severity based on hazard type
        const severityMap = {
            'building_collapse': 'critical',
            'fire': 'high',
            'gas_leak': 'high',
            'electrical_hazard': 'high',
            'debris': 'moderate',
            'flooding': 'moderate',
            'road_damage': 'moderate',
            'traffic_accident': 'low',
            'other': 'low'
        };

        return severityMap[hazardReport.type] || 'moderate';
    }

    /**
     * Get numeric severity level for comparison
     * @param {string} severity - Severity string
     */
    getSeverityLevel(severity) {
        const levels = {
            'low': 1,
            'moderate': 2,
            'high': 3,
            'critical': 4
        };
        return levels[severity] || 2;
    }

    /**
     * Calculate affected radius in kilometers
     * @param {Object} hazardReport - Hazard report data
     */
    calculateAffectedRadius(hazardReport) {
        const radiusMap = {
            'building_collapse': 0.5,
            'fire': 1.0,
            'gas_leak': 2.0,
            'electrical_hazard': 0.3,
            'debris': 0.2,
            'flooding': 3.0,
            'road_damage': 0.1,
            'traffic_accident': 0.1,
            'other': 0.5
        };

        return radiusMap[hazardReport.type] || 0.5;
    }

    /**
     * Calculate aggregate confidence from multiple reports
     * @param {Array} reports - Array of reports
     */
    calculateAggregateConfidence(reports) {
        if (reports.length === 0) return 0;
        if (reports.length === 1) return reports[0].confidence;

        // Weighted confidence calculation
        const totalWeight = reports.length;
        const weightedSum = reports.reduce((sum, report, index) => {
            // More recent reports have higher weight
            const timeWeight = 1 / (index + 1);
            return sum + (report.confidence * timeWeight);
        }, 0);

        return Math.min(weightedSum / totalWeight * 1.2, 1.0); // Boost for multiple reports
    }

    /**
     * Calculate verification level based on reports
     * @param {Array} reports - Array of reports
     */
    calculateVerificationLevel(reports) {
        const reportCount = reports.length;
        const avgConfidence = this.calculateAggregateConfidence(reports);

        if (reportCount >= 5 && avgConfidence >= 0.8) return 'verified';
        if (reportCount >= 3 && avgConfidence >= 0.7) return 'likely';
        if (reportCount >= 2 && avgConfidence >= 0.6) return 'possible';
        return 'unverified';
    }

    /**
     * Enhance hazard data with additional properties
     * @param {Object} hazard - Hazard object to enhance
     */
    enhanceHazardData(hazard) {
        // Add evacuation recommendations
        hazard.evacuationRecommendation = this.getEvacuationRecommendation(hazard);
        
        // Add emergency services needed
        hazard.emergencyServicesNeeded = this.getRequiredEmergencyServices(hazard);
        
        // Add estimated resolution time
        hazard.estimatedResolutionTime = this.estimateResolutionTime(hazard);
        
        // Add priority level
        hazard.priorityLevel = this.calculatePriorityLevel(hazard);
    }

    /**
     * Get evacuation recommendation for hazard type
     * @param {Object} hazard - Hazard object
     */
    getEvacuationRecommendation(hazard) {
        const recommendations = {
            'building_collapse': 'immediate_evacuation',
            'fire': 'immediate_evacuation',
            'gas_leak': 'immediate_evacuation',
            'electrical_hazard': 'avoid_area',
            'debris': 'find_alternate_route',
            'flooding': 'seek_higher_ground',
            'road_damage': 'find_alternate_route',
            'traffic_accident': 'find_alternate_route',
            'other': 'exercise_caution'
        };

        return recommendations[hazard.type] || 'exercise_caution';
    }

    /**
     * Get required emergency services for hazard type
     * @param {Object} hazard - Hazard object
     */
    getRequiredEmergencyServices(hazard) {
        const serviceMap = {
            'building_collapse': ['search_rescue', 'medical', 'structural_engineers'],
            'fire': ['fire_department', 'medical', 'police'],
            'gas_leak': ['gas_company', 'fire_department', 'hazmat'],
            'electrical_hazard': ['electrical_utility', 'fire_department'],
            'debris': ['public_works', 'cleanup_crew'],
            'flooding': ['public_works', 'rescue_services'],
            'road_damage': ['public_works', 'traffic_control'],
            'traffic_accident': ['police', 'medical', 'tow_services'],
            'other': ['police']
        };

        return serviceMap[hazard.type] || ['police'];
    }

    /**
     * Estimate resolution time in hours
     * @param {Object} hazard - Hazard object
     */
    estimateResolutionTime(hazard) {
        const timeMap = {
            'building_collapse': 48,
            'fire': 6,
            'gas_leak': 4,
            'electrical_hazard': 8,
            'debris': 2,
            'flooding': 12,
            'road_damage': 24,
            'traffic_accident': 1,
            'other': 4
        };

        return timeMap[hazard.type] || 4;
    }

    /**
     * Calculate priority level for emergency response
     * @param {Object} hazard - Hazard object
     */
    calculatePriorityLevel(hazard) {
        const severityWeight = this.getSeverityLevel(hazard.severity);
        const confidenceWeight = hazard.confidence;
        const typeWeight = hazard.type === 'building_collapse' || 
                          hazard.type === 'fire' || 
                          hazard.type === 'gas_leak' ? 2 : 1;

        const priority = severityWeight * confidenceWeight * typeWeight;

        if (priority >= 6) return 'critical';
        if (priority >= 4) return 'high';
        if (priority >= 2) return 'medium';
        return 'low';
    }

    /**
     * Get all current hazards
     */
    getCurrentHazards() {
        return this.hazards;
    }

    /**
     * Get hazards within a specific radius of a location
     * @param {Object} location - {lat, lng}
     * @param {number} radiusKm - Radius in kilometers
     */
    getHazardsNearLocation(location, radiusKm) {
        const nearbyHazards = [];
        
        for (const hazard of this.hazards.values()) {
            const distance = this.calculateDistance(
                location.lat, location.lng,
                hazard.location.lat, hazard.location.lng
            );
            
            if (distance <= radiusKm) {
                nearbyHazards.push(hazard);
            }
        }
        
        return nearbyHazards;
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
     * Resolve a hazard (mark as resolved)
     * @param {string} hazardId - Hazard ID to resolve
     * @param {string} resolutionNote - Optional note about resolution
     */
    resolveHazard(hazardId, resolutionNote = '') {
        const hazard = this.hazards.get(hazardId);
        if (!hazard) {
            throw new Error('Hazard not found');
        }

        hazard.status = 'resolved';
        hazard.resolvedAt = new Date();
        hazard.resolutionNote = resolutionNote;

        console.log(`Hazard resolved: ${hazardId}`);
        
        this.notifySubscribers(hazard);
        this.emit('hazard_resolved', hazard);

        return { success: true, message: 'Hazard marked as resolved' };
    }

    /**
     * Start periodic cleanup of old hazards
     */
    startCleanupInterval() {
        setInterval(() => {
            this.cleanupOldHazards();
        }, 60 * 60 * 1000); // Run every hour
    }

    /**
     * Clean up old or resolved hazards
     */
    cleanupOldHazards() {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [hazardId, hazard] of this.hazards) {
            const age = now - hazard.firstReported.getTime();
            
            // Remove resolved hazards older than 1 hour
            if (hazard.status === 'resolved' && age > (60 * 60 * 1000)) {
                this.hazards.delete(hazardId);
                cleanedCount++;
            }
            // Remove unverified hazards older than max age
            else if (hazard.verificationLevel === 'unverified' && age > this.maxHazardAge) {
                this.hazards.delete(hazardId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            console.log(`Cleaned up ${cleanedCount} old hazards`);
        }
    }

    /**
     * Get system statistics
     */
    getStatistics() {
        const hazards = Array.from(this.hazards.values());
        
        return {
            total: hazards.length,
            active: hazards.filter(h => h.status === 'active').length,
            resolved: hazards.filter(h => h.status === 'resolved').length,
            byType: this.getHazardsByType(hazards),
            bySeverity: this.getHazardsBySeverity(hazards),
            byVerification: this.getHazardsByVerification(hazards),
            avgConfidence: this.calculateAverageConfidence(hazards)
        };
    }

    /**
     * Get hazards grouped by type
     */
    getHazardsByType(hazards) {
        const byType = {};
        hazards.forEach(hazard => {
            byType[hazard.type] = (byType[hazard.type] || 0) + 1;
        });
        return byType;
    }

    /**
     * Get hazards grouped by severity
     */
    getHazardsBySeverity(hazards) {
        const bySeverity = {};
        hazards.forEach(hazard => {
            bySeverity[hazard.severity] = (bySeverity[hazard.severity] || 0) + 1;
        });
        return bySeverity;
    }

    /**
     * Get hazards grouped by verification level
     */
    getHazardsByVerification(hazards) {
        const byVerification = {};
        hazards.forEach(hazard => {
            byVerification[hazard.verificationLevel] = (byVerification[hazard.verificationLevel] || 0) + 1;
        });
        return byVerification;
    }

    /**
     * Calculate average confidence across all hazards
     */
    calculateAverageConfidence(hazards) {
        if (hazards.length === 0) return 0;
        const totalConfidence = hazards.reduce((sum, hazard) => sum + hazard.confidence, 0);
        return totalConfidence / hazards.length;
    }
}

module.exports = HazardReportingService;