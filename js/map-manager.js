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
     */
    setupDrawingTools() {
        this.drawingManager = new google.maps.drawing.DrawingManager({
            drawingMode: null,
            drawingControl: false, // We'll use custom toolbar
            polygonOptions: {
                fillColor: '#0078d4',
                fillOpacity: 0.3,
                strokeColor: '#0078d4',
                strokeWeight: 2,
                clickable: true,
                editable: true,
                zIndex: 1
            },
            markerOptions: {
                draggable: true
            }
        });

        this.drawingManager.setMap(this.map);

        // Add event listeners for drawing complete
        google.maps.event.addListener(this.drawingManager, 'overlaycomplete', (event) => {
            if (this.onDrawComplete) {
                this.onDrawComplete(event);
            }
        });
    }

    /**
     * Enable drawing mode
     * @param {string} mode - Drawing mode ('point', 'polygon', etc.)
     */
    startDrawing(mode) {
        if (!this.drawingManager) {
            console.error('Drawing manager not initialized');
            return;
        }

        const drawingModeMap = {
            'draw-point': google.maps.drawing.OverlayType.MARKER,
            'draw-polygon': google.maps.drawing.OverlayType.POLYGON,
            'draw-line': google.maps.drawing.OverlayType.POLYLINE
        };

        this.drawingManager.setDrawingMode(drawingModeMap[mode] || null);
    }

    /**
     * Stop drawing mode
     */
    stopDrawing() {
        if (this.drawingManager) {
            this.drawingManager.setDrawingMode(null);
        }
    }

    /**
     * Delete selected drawing
     */
    deleteSelectedDrawing() {
        // This would need to track selected overlays
        // For now, return false
        return false;
    }

    /**
     * Get all drawn shapes
     * @returns {Array} Array of shapes
     */
    getDrawnShapes() {
        // This would need to track all drawn overlays
        return [];
    }

    /**
     * Clear all drawings
     */
    clearDrawings() {
        // This would need to remove all tracked drawing overlays
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

        // Get all features from data layer
        dataLayer.forEach((feature) => {
            const geometry = feature.getGeometry();
            if (geometry.getType() === 'Point') {
                const position = geometry.get();
                const marker = new google.maps.Marker({
                    position: { lat: position.lat(), lng: position.lng() },
                    map: this.map,
                    title: feature.getProperty('name') || '',
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        fillColor: color,
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 2,
                        scale: 8
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

        // Setup clustering if enabled
        if (dataSource.enableClustering && markers.length > 0) {
            // Note: For full clustering support, you would need to include the MarkerClusterer library
            // For now, we'll just display the markers without clustering
            console.log(`Clustering requested for ${layerId} but MarkerClusterer library not included`);
        }

        // Store layer reference
        this.layers.set(layerId, {
            dataLayer: dataLayer,
            markers: markers,
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

        // Toggle data layer visibility
        if (layer.dataLayer) {
            layer.dataLayer.setMap(visible ? this.map : null);
        }

        // Toggle markers visibility
        if (layer.markers) {
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
