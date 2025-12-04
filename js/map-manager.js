/**
 * Google Maps Manager
 * Handles all Google Maps operations including initialization, rendering, and interactions
 */

class MapManager {
    constructor(containerId, apiKey) {
        this.containerId = containerId;
        this.apiKey = apiKey;
        this.map = null;
        this.dataSources = new Map(); // Store data layers by layer ID
        this.layers = new Map(); // Store map layers by layer ID
        this.markers = new Map(); // Store markers by layer ID
        this.selectedFeature = null;
        this.onFeatureClick = null;
        this.drawingManager = null;
        this.onDrawComplete = null;
        this.colorPalette = [
            '#0078d4', '#d13438', '#107c10', '#ffb900', '#8764b8',
            '#00b7c3', '#f7630c', '#ca5010', '#038387', '#486860'
        ];
        this.colorIndex = 0;
        this.infoWindow = null;
        this.searchMarker = null;
    }

    /**
     * Initialize the Google Map
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            try {
                const mapElement = document.getElementById(this.containerId);
                if (!mapElement) {
                    reject(new Error(`Map container '${this.containerId}' not found`));
                    return;
                }

                this.map = new google.maps.Map(mapElement, {
                    center: { lat: 37.0902, lng: -95.7129 }, // Center of USA
                    zoom: 4,
                    mapTypeControl: true,
                    mapTypeControlOptions: {
                        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
                        position: google.maps.ControlPosition.TOP_LEFT,
                        mapTypeIds: ['roadmap', 'satellite', 'hybrid', 'terrain']
                    },
                    streetViewControl: true,
                    fullscreenControl: true,
                    zoomControl: true,
                    zoomControlOptions: {
                        position: google.maps.ControlPosition.RIGHT_TOP
                    }
                });

                // Initialize info window
                this.infoWindow = new google.maps.InfoWindow();

                // Setup drawing tools
                this.setupDrawingTools();

                console.log('Google Map initialized successfully');
                resolve();
            } catch (error) {
                console.error('Error initializing map:', error);
                reject(error);
            }
        });
    }

    /**
     * Setup drawing tools
     * Note: Drawing library is deprecated. Using simplified custom implementation.
     */
    setupDrawingTools() {
        // Drawing library is deprecated as of August 2025
        // For now, we'll use a simple polygon drawing implementation
        this.drawingMode = null;
        this.currentDrawing = null;
        this.drawnShapes = [];

        console.log('Drawing tools initialized (custom implementation)');
    }

    /**
     * Enable drawing mode
     * @param {string} mode - Drawing mode ('point', 'polygon', etc.)
     */
    startDrawing(mode) {
        this.drawingMode = mode;
        console.log(`Drawing mode enabled: ${mode}`);
        // Simple implementation - user can click on map to add points/polygons
        // Full implementation would require custom UI and event handlers
    }

    /**
     * Stop drawing mode
     */
    stopDrawing() {
        this.drawingMode = null;
        console.log('Drawing mode disabled');
    }

    /**
     * Delete selected drawing
     */
    deleteSelectedDrawing() {
        if (this.currentDrawing) {
            this.currentDrawing.setMap(null);
            this.drawnShapes = this.drawnShapes.filter(s => s !== this.currentDrawing);
            this.currentDrawing = null;
            return true;
        }
        return false;
    }

    /**
     * Get all drawn shapes
     * @returns {Array} Array of shapes
     */
    getDrawnShapes() {
        return this.drawnShapes;
    }

    /**
     * Clear all drawings
     */
    clearDrawings() {
        this.drawnShapes.forEach(shape => shape.setMap(null));
        this.drawnShapes = [];
        this.currentDrawing = null;
    }

    /**
     * Set callback for draw complete
     * @param {Function} callback - Callback function
     */
    setOnDrawComplete(callback) {
        this.onDrawComplete = callback;
    }

    /**
     * Search for address and navigate to it
     * @param {string} query - Search query
     * @returns {Promise<Object>} Search result
     */
    async searchAddress(query) {
        const geocoder = new google.maps.Geocoder();

        return new Promise((resolve) => {
            geocoder.geocode({ address: query }, (results, status) => {
                if (status === 'OK' && results.length > 0) {
                    const result = results[0];
                    const location = result.geometry.location;

                    // Navigate to location
                    this.map.setCenter(location);
                    this.map.setZoom(15);

                    // Add marker
                    this.addSearchMarker(location.lat(), location.lng(), result.formatted_address);

                    resolve({
                        success: true,
                        latitude: location.lat(),
                        longitude: location.lng(),
                        address: result.formatted_address
                    });
                } else {
                    resolve({
                        success: false,
                        error: 'No results found'
                    });
                }
            });
        });
    }

    /**
     * Add search result marker
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {string} address - Address text
     */
    addSearchMarker(lat, lng, address) {
        // Remove existing search marker if any
        if (this.searchMarker) {
            this.searchMarker.setMap(null);
        }

        // Create new marker
        this.searchMarker = new google.maps.Marker({
            position: { lat, lng },
            map: this.map,
            title: 'Search Result',
            animation: google.maps.Animation.DROP
        });

        // Add info window
        const infoWindow = new google.maps.InfoWindow({
            content: `<div><strong>Search Result</strong><br>${address}</div>`
        });

        this.searchMarker.addListener('click', () => {
            infoWindow.open(this.map, this.searchMarker);
        });
    }

    /**
     * Create a data source for a layer
     * @param {string} layerId - Layer ID
     * @returns {google.maps.Data}
     */
    createDataSource(layerId, enableClustering = false) {
        const dataLayer = new google.maps.Data();
        dataLayer.setMap(this.map);
        this.dataSources.set(layerId, { dataLayer, enableClustering });
        return dataLayer;
    }

    /**
     * Add polygon layer to the map
     * @param {string} layerId - Layer ID
     * @param {string} color - Polygon color
     * @param {Object} options - Additional layer options
     */
    addPolygonLayer(layerId, color, options = {}) {
        const dataSource = this.dataSources.get(layerId);
        if (!dataSource || !dataSource.dataLayer) {
            console.error(`Data source for layer ${layerId} not found`);
            return;
        }

        const dataLayer = dataSource.dataLayer;

        // Set style for polygons
        dataLayer.setStyle((feature) => {
            return {
                fillColor: color,
                fillOpacity: 0.5,
                strokeColor: color,
                strokeWeight: 2,
                clickable: true
            };
        });

        // Store layer reference
        this.layers.set(layerId, {
            dataLayer: dataLayer,
            type: 'polygon',
            color: color
        });

        // Add click event
        dataLayer.addListener('click', (event) => {
            this.handleFeatureClick(event, layerId);
        });
    }

    /**
     * Create a custom marker pin element with color
     * @param {string} color - Hex color
     * @returns {Element} Pin element
     */
    createColoredPin(color) {
        const pin = document.createElement('div');
        pin.style.width = '16px';
        pin.style.height = '16px';
        pin.style.borderRadius = '50%';
        pin.style.backgroundColor = color;
        pin.style.border = '2px solid white';
        pin.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
        return pin;
    }

    /**
     * Add point layer to the map with clustering
     * @param {string} layerId - Layer ID
     * @param {string} color - Point color
     * @param {Object} options - Additional layer options
     */
    addPointLayer(layerId, color, options = {}) {
        const dataSource = this.dataSources.get(layerId);
        if (!dataSource) {
            console.error(`Data source for layer ${layerId} not found`);
            return;
        }

        const markers = [];
        const dataLayer = dataSource.dataLayer;

        // Hide data layer features so we only see markers (prevents duplicates)
        dataLayer.setStyle({ visible: false });

        // SVG path for teardrop/pin marker
        const pinPath = 'M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1,1 10,-30 C 10,-22 2,-20 0,0 z';

        // Get all features from data layer
        dataLayer.forEach((feature) => {
            const geometry = feature.getGeometry();
            if (geometry.getType() === 'Point') {
                const position = geometry.get();

                // Create marker with teardrop icon
                // Don't set map yet if clustering - let clusterer handle it
                const marker = new google.maps.Marker({
                    position: { lat: position.lat(), lng: position.lng() },
                    map: dataSource.enableClustering ? null : this.map, // Only set map if NOT clustering
                    title: feature.getProperty('name') || '',
                    icon: {
                        path: pinPath,
                        fillColor: color,
                        fillOpacity: 0.9,
                        strokeColor: '#ffffff',
                        strokeWeight: 1.5,
                        scale: 0.7, // Smaller size
                        anchor: new google.maps.Point(0, 0), // Anchor at bottom point of pin
                        labelOrigin: new google.maps.Point(0, -30)
                    }
                });

                // Store feature reference in marker
                marker.feature = feature;
                marker.layerId = layerId;

                // Add click listener
                marker.addListener('click', () => {
                    this.handleMarkerClick(marker, layerId);
                });

                markers.push(marker);
            }
        });

        // Store markers for later reference
        if (!this.markers.has(layerId)) {
            this.markers.set(layerId, []);
        }
        this.markers.get(layerId).push(...markers);

        // Setup clustering if enabled and MarkerClusterer is available
        let clusterer = null;
        if (dataSource.enableClustering && markers.length > 0) {
            // Check if MarkerClusterer is available in global scope
            if (typeof markerClusterer !== 'undefined' && markerClusterer.MarkerClusterer) {
                clusterer = new markerClusterer.MarkerClusterer({
                    map: this.map,
                    markers: markers
                });
                console.log(`MarkerClusterer initialized for ${layerId} with ${markers.length} markers`);
            } else {
                console.warn(`Clustering requested for ${layerId} but MarkerClusterer library not loaded yet`);
                // Fallback: add markers to map manually
                markers.forEach(m => m.setMap(this.map));
            }
        }

        // Store layer reference
        this.layers.set(layerId, {
            dataLayer: dataLayer,
            markers: markers,
            clusterer: clusterer,
            type: 'point',
            color: color
        });
    }

    /**
     * Handle marker click
     * @param {google.maps.Marker} marker - Clicked marker
     * @param {string} layerId - Layer ID
     */
    handleMarkerClick(marker, layerId) {
        const feature = marker.feature;
        this.selectedFeature = {
            feature: feature,
            layerId: layerId,
            properties: this.featurePropertiesToObject(feature)
        };

        // Call callback if provided
        if (this.onFeatureClick) {
            this.onFeatureClick(this.selectedFeature);
        }
    }

    /**
     * Convert feature properties to plain object
     * @param {google.maps.Data.Feature} feature - Feature
     * @returns {Object} Properties object
     */
    featurePropertiesToObject(feature) {
        const properties = {};
        feature.forEachProperty((value, key) => {
            properties[key] = value;
        });
        return properties;
    }

    /**
     * Add features to a layer from CSV data
     * @param {string} layerId - Layer ID
     * @param {Array} features - Array of features
     * @param {string} type - Feature type ('polygon' or 'point')
     */
    addFeaturesToLayer(layerId, features, type) {
        let dataSource = this.dataSources.get(layerId);

        // Create data source if it doesn't exist
        if (!dataSource) {
            const enableClustering = (type === 'point');
            const dataLayer = this.createDataSource(layerId, enableClustering);
            dataSource = this.dataSources.get(layerId);
        }

        // Get next color
        const color = this.getNextColor();

        // Convert features to GeoJSON and add to data layer
        const geoJsonFeatures = features.map((feature, index) => {
            let geometry;

            if (type === 'polygon' && feature.wkt) {
                // Parse WKT to GeoJSON
                geometry = this.parseWKT(feature.wkt);
            } else if (type === 'point' && feature.latitude && feature.longitude) {
                // Create point geometry
                geometry = {
                    type: 'Point',
                    coordinates: [parseFloat(feature.longitude), parseFloat(feature.latitude)]
                };
            } else {
                console.warn('Invalid feature data:', feature);
                return null;
            }

            return {
                type: 'Feature',
                id: feature.id || `${layerId}-${index}`,
                geometry: geometry,
                properties: { ...feature, layerId: layerId }
            };
        }).filter(f => f !== null);

        // Add features to data layer
        const dataLayer = dataSource.dataLayer;
        geoJsonFeatures.forEach(geoJsonFeature => {
            dataLayer.addGeoJson(geoJsonFeature);
        });

        // Add appropriate layer type
        if (type === 'polygon') {
            this.addPolygonLayer(layerId, color);
        } else {
            this.addPointLayer(layerId, color);
        }

        // Fit map to show all features
        this.fitMapToDataSource(dataLayer);

        return color;
    }

    /**
     * Parse WKT string to GeoJSON geometry
     * @param {string} wkt - WKT string
     * @returns {Object} GeoJSON geometry
     */
    parseWKT(wkt) {
        try {
            // Use wellknown library to parse WKT
            const geoJson = wellknown.parse(wkt);
            return geoJson;
        } catch (error) {
            console.error('Error parsing WKT:', error);
            return null;
        }
    }

    /**
     * Handle feature click
     * @param {google.maps.Data.MouseEvent} event - Event object
     * @param {string} layerId - Layer ID
     */
    handleFeatureClick(event, layerId) {
        const feature = event.feature;
        this.selectedFeature = {
            feature: feature,
            layerId: layerId,
            properties: this.featurePropertiesToObject(feature)
        };

        // Call callback if provided
        if (this.onFeatureClick) {
            this.onFeatureClick(this.selectedFeature);
        }
    }

    /**
     * Toggle layer visibility
     * @param {string} layerId - Layer ID
     * @param {boolean} visible - Visibility state
     */
    toggleLayerVisibility(layerId, visible) {
        const layer = this.layers.get(layerId);
        if (!layer) return;

        // Toggle data layer visibility (polygons use this)
        if (layer.dataLayer && layer.type === 'polygon') {
            layer.dataLayer.setMap(visible ? this.map : null);
        }

        // Toggle clusterer visibility
        if (layer.clusterer) {
            if (visible) {
                layer.clusterer.setMap(this.map);
            } else {
                layer.clusterer.setMap(null);
            }
        } else if (layer.markers) {
            // Toggle markers visibility (only if not using clusterer)
            layer.markers.forEach(marker => {
                marker.setMap(visible ? this.map : null);
            });
        }
    }

    /**
     * Remove layer from map
     * @param {string} layerId - Layer ID
     */
    removeLayer(layerId) {
        const layer = this.layers.get(layerId);
        const dataSource = this.dataSources.get(layerId);

        // Remove data layer
        if (layer && layer.dataLayer) {
            layer.dataLayer.setMap(null);
        }

        // Clear clusterer if exists
        if (layer && layer.clusterer) {
            layer.clusterer.clearMarkers();
            layer.clusterer.setMap(null);
        }

        // Remove markers
        if (layer && layer.markers) {
            layer.markers.forEach(marker => marker.setMap(null));
        }

        // Remove from storage
        this.layers.delete(layerId);
        this.dataSources.delete(layerId);
        this.markers.delete(layerId);
    }

    /**
     * Update feature properties
     * @param {string} layerId - Layer ID
     * @param {string} featureId - Feature ID
     * @param {Object} newProperties - Updated properties
     */
    updateFeatureProperties(layerId, featureId, newProperties) {
        const dataSource = this.dataSources.get(layerId);
        if (!dataSource || !dataSource.dataLayer) return;

        const dataLayer = dataSource.dataLayer;
        let targetFeature = null;

        dataLayer.forEach((feature) => {
            if (feature.getId() === featureId) {
                targetFeature = feature;
            }
        });

        if (targetFeature) {
            Object.keys(newProperties).forEach(key => {
                targetFeature.setProperty(key, newProperties[key]);
            });
        }
    }

    /**
     * Remove feature from layer
     * @param {string} layerId - Layer ID
     * @param {string} featureId - Feature ID
     */
    removeFeature(layerId, featureId) {
        const dataSource = this.dataSources.get(layerId);
        if (!dataSource || !dataSource.dataLayer) return;

        const dataLayer = dataSource.dataLayer;
        let targetFeature = null;

        dataLayer.forEach((feature) => {
            if (feature.getId() === featureId) {
                targetFeature = feature;
            }
        });

        if (targetFeature) {
            dataLayer.remove(targetFeature);
        }
    }

    /**
     * Fit map to show all features in a data layer
     * @param {google.maps.Data} dataLayer - Data layer
     */
    fitMapToDataSource(dataLayer) {
        const bounds = new google.maps.LatLngBounds();
        let hasFeatures = false;

        dataLayer.forEach((feature) => {
            hasFeatures = true;
            const geometry = feature.getGeometry();

            if (geometry) {
                geometry.forEachLatLng((latLng) => {
                    bounds.extend(latLng);
                });
            }
        });

        if (hasFeatures) {
            this.map.fitBounds(bounds, 50); // 50px padding
        }
    }

    /**
     * Get next color from palette
     * @returns {string} Color hex code
     */
    getNextColor() {
        const color = this.colorPalette[this.colorIndex];
        this.colorIndex = (this.colorIndex + 1) % this.colorPalette.length;
        return color;
    }

    /**
     * Reset map view
     */
    resetView() {
        this.map.setCenter({ lat: 37.0902, lng: -95.7129 });
        this.map.setZoom(4);
    }

    /**
     * Zoom in
     */
    zoomIn() {
        const currentZoom = this.map.getZoom();
        this.map.setZoom(currentZoom + 1);
    }

    /**
     * Zoom out
     */
    zoomOut() {
        const currentZoom = this.map.getZoom();
        this.map.setZoom(currentZoom - 1);
    }

    /**
     * Get selected feature
     * @returns {Object} Selected feature
     */
    getSelectedFeature() {
        return this.selectedFeature;
    }

    /**
     * Clear selected feature
     */
    clearSelectedFeature() {
        this.selectedFeature = null;
        if (this.infoWindow) {
            this.infoWindow.close();
        }
    }

    /**
     * Set feature click callback
     * @param {Function} callback - Callback function
     */
    setOnFeatureClick(callback) {
        this.onFeatureClick = callback;
    }

    /**
     * Close popup/info window
     */
    closePopup() {
        if (this.infoWindow) {
            this.infoWindow.close();
        }
    }
}
