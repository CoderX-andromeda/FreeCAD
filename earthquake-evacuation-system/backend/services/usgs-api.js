const axios = require('axios');
const cron = require('node-cron');

class USGSApiService {
    constructor() {
        this.baseUrl = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0';
        this.cache = new Map();
        this.subscribers = [];
        this.lastUpdate = null;
        this.updateInterval = 30000; // 30 seconds
        
        // Start automatic data fetching
        this.startPolling();
    }

    /**
     * Subscribe to earthquake data updates
     * @param {Function} callback - Function to call when new data arrives
     */
    subscribe(callback) {
        this.subscribers.push(callback);
    }

    /**
     * Unsubscribe from earthquake data updates
     * @param {Function} callback - Function to remove from subscribers
     */
    unsubscribe(callback) {
        const index = this.subscribers.indexOf(callback);
        if (index > -1) {
            this.subscribers.splice(index, 1);
        }
    }

    /**
     * Notify all subscribers of new earthquake data
     * @param {Object} data - Earthquake data to broadcast
     */
    notifySubscribers(data) {
        this.subscribers.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error('Error notifying subscriber:', error);
            }
        });
    }

    /**
     * Start polling USGS API for real-time earthquake data
     */
    startPolling() {
        console.log('Starting USGS API polling...');
        
        // Initial fetch
        this.fetchAllEarthquakeData();
        
        // Set up periodic updates every 30 seconds
        setInterval(() => {
            this.fetchAllEarthquakeData();
        }, this.updateInterval);
        
        // Also use cron for more reliable scheduling
        cron.schedule('*/30 * * * * *', () => {
            this.fetchSignificantEarthquakes();
        });
    }

    /**
     * Fetch all earthquake data from multiple USGS feeds
     */
    async fetchAllEarthquakeData() {
        try {
            const [hour, day, week, month] = await Promise.all([
                this.fetchEarthquakesByTimeframe('hour'),
                this.fetchEarthquakesByTimeframe('day'), 
                this.fetchEarthquakesByTimeframe('week'),
                this.fetchEarthquakesByTimeframe('month')
            ]);

            const combinedData = this.mergeEarthquakeData([hour, day, week, month]);
            const processedData = this.processEarthquakeData(combinedData);
            
            this.cache.set('current_earthquakes', processedData);
            this.lastUpdate = new Date();
            
            // Notify subscribers of new data
            this.notifySubscribers(processedData);
            
            console.log(`Updated earthquake data: ${processedData.features.length} earthquakes`);
            
            return processedData;
        } catch (error) {
            console.error('Error fetching earthquake data:', error);
            throw error;
        }
    }

    /**
     * Fetch earthquakes by specific timeframe and magnitude
     * @param {string} timeframe - 'hour', 'day', 'week', 'month'
     * @param {string} magnitude - 'significant', 'all', '4.5', '2.5', '1.0'
     */
    async fetchEarthquakesByTimeframe(timeframe, magnitude = 'all') {
        const url = `${this.baseUrl}/summary/${magnitude}_${timeframe}.geojson`;
        
        try {
            const response = await axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'EarthquakeEvacuationSystem/1.0'
                }
            });
            
            return response.data;
        } catch (error) {
            console.error(`Error fetching ${magnitude} earthquakes for ${timeframe}:`, error.message);
            return { type: 'FeatureCollection', features: [] };
        }
    }

    /**
     * Fetch significant earthquakes (M4.5+) from the past week
     */
    async fetchSignificantEarthquakes() {
        try {
            const data = await this.fetchEarthquakesByTimeframe('week', 'significant');
            const processed = this.processEarthquakeData(data);
            
            // Cache significant earthquakes separately
            this.cache.set('significant_earthquakes', processed);
            
            return processed;
        } catch (error) {
            console.error('Error fetching significant earthquakes:', error);
            return { type: 'FeatureCollection', features: [] };
        }
    }

    /**
     * Get earthquakes within a specific radius of a location
     * @param {Object} location - {lat, lng}
     * @param {number} radiusKm - Radius in kilometers
     * @param {string} timeframe - Time period to search
     */
    async getEarthquakesNearLocation(location, radiusKm = 100, timeframe = 'day') {
        const allEarthquakes = await this.fetchEarthquakesByTimeframe(timeframe);
        
        const nearbyEarthquakes = allEarthquakes.features.filter(earthquake => {
            const eqLat = earthquake.geometry.coordinates[1];
            const eqLng = earthquake.geometry.coordinates[0];
            
            const distance = this.calculateDistance(
                location.lat, location.lng,
                eqLat, eqLng
            );
            
            return distance <= radiusKm;
        });
        
        return {
            type: 'FeatureCollection',
            features: nearbyEarthquakes
        };
    }

    /**
     * Merge multiple earthquake datasets and remove duplicates
     * @param {Array} datasets - Array of GeoJSON earthquake data
     */
    mergeEarthquakeData(datasets) {
        const mergedFeatures = [];
        const seenIds = new Set();
        
        for (const dataset of datasets) {
            if (dataset && dataset.features) {
                for (const feature of dataset.features) {
                    const id = feature.id || feature.properties.ids;
                    if (!seenIds.has(id)) {
                        seenIds.add(id);
                        mergedFeatures.push(feature);
                    }
                }
            }
        }
        
        // Sort by time (most recent first)
        mergedFeatures.sort((a, b) => {
            return new Date(b.properties.time) - new Date(a.properties.time);
        });
        
        return {
            type: 'FeatureCollection',
            features: mergedFeatures,
            metadata: {
                generated: Date.now(),
                count: mergedFeatures.length
            }
        };
    }

    /**
     * Process and enhance earthquake data with additional calculations
     * @param {Object} rawData - Raw GeoJSON earthquake data
     */
    processEarthquakeData(rawData) {
        if (!rawData || !rawData.features) {
            return { type: 'FeatureCollection', features: [] };
        }
        
        const processedFeatures = rawData.features.map(feature => {
            const enhanced = { ...feature };
            const props = enhanced.properties;
            
            // Add risk level based on magnitude and depth
            enhanced.properties.riskLevel = this.calculateRiskLevel(
                props.mag,
                feature.geometry.coordinates[2]
            );
            
            // Add Shindo intensity estimation
            enhanced.properties.shindoIntensity = this.estimateShindoIntensity(
                props.mag,
                feature.geometry.coordinates[2]
            );
            
            // Add time since earthquake
            enhanced.properties.timeSince = Date.now() - props.time;
            
            // Add urgency flag for recent significant earthquakes
            enhanced.properties.urgent = (
                props.mag >= 5.0 && 
                enhanced.properties.timeSince < 3600000 // 1 hour
            );
            
            // Add affected radius estimation
            enhanced.properties.affectedRadiusKm = this.estimateAffectedRadius(props.mag);
            
            return enhanced;
        });
        
        return {
            type: 'FeatureCollection',
            features: processedFeatures,
            metadata: {
                ...rawData.metadata,
                processed: Date.now(),
                urgent_count: processedFeatures.filter(f => f.properties.urgent).length
            }
        };
    }

    /**
     * Calculate risk level based on magnitude and depth
     * @param {number} magnitude 
     * @param {number} depth 
     */
    calculateRiskLevel(magnitude, depth) {
        if (magnitude >= 7.0) return 'EXTREME';
        if (magnitude >= 6.0) return 'SEVERE';
        if (magnitude >= 5.0) return 'HIGH';
        if (magnitude >= 4.0) return 'MODERATE';
        return 'LOW';
    }

    /**
     * Estimate Shindo intensity based on magnitude and depth
     * @param {number} magnitude 
     * @param {number} depth 
     */
    estimateShindoIntensity(magnitude, depth) {
        // Simplified Shindo scale estimation
        const intensityAtSource = magnitude - 3.0 * Math.log10(depth) + 3.0;
        return Math.max(0, Math.min(7, Math.round(intensityAtSource)));
    }

    /**
     * Estimate affected radius in kilometers
     * @param {number} magnitude 
     */
    estimateAffectedRadius(magnitude) {
        // Empirical formula for earthquake affected radius
        return Math.pow(10, magnitude - 3.0) * 10;
    }

    /**
     * Calculate distance between two points using Haversine formula
     * @param {number} lat1 
     * @param {number} lng1 
     * @param {number} lat2 
     * @param {number} lng2 
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
     * @param {number} degrees 
     */
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * Get cached earthquake data
     * @param {string} key - Cache key
     */
    getCachedData(key = 'current_earthquakes') {
        return this.cache.get(key);
    }

    /**
     * Get earthquakes by magnitude threshold
     * @param {number} minMagnitude - Minimum magnitude threshold
     */
    getEarthquakesByMagnitude(minMagnitude) {
        const data = this.getCachedData();
        if (!data) return { type: 'FeatureCollection', features: [] };
        
        const filtered = data.features.filter(
            feature => feature.properties.mag >= minMagnitude
        );
        
        return {
            type: 'FeatureCollection',
            features: filtered
        };
    }

    /**
     * Get earthquakes within time window
     * @param {number} hoursBack - Hours to look back
     */
    getRecentEarthquakes(hoursBack = 24) {
        const data = this.getCachedData();
        if (!data) return { type: 'FeatureCollection', features: [] };
        
        const cutoffTime = Date.now() - (hoursBack * 60 * 60 * 1000);
        const recent = data.features.filter(
            feature => feature.properties.time >= cutoffTime
        );
        
        return {
            type: 'FeatureCollection',
            features: recent
        };
    }

    /**
     * Get system status and health
     */
    getSystemStatus() {
        return {
            isActive: true,
            lastUpdate: this.lastUpdate,
            cacheSize: this.cache.size,
            subscriberCount: this.subscribers.length,
            updateInterval: this.updateInterval,
            dataAge: this.lastUpdate ? Date.now() - this.lastUpdate.getTime() : null
        };
    }

    /**
     * Force a manual update of earthquake data
     */
    async forceUpdate() {
        console.log('Forcing USGS data update...');
        return await this.fetchAllEarthquakeData();
    }
}

module.exports = USGSApiService;