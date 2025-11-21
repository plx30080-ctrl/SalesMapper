/**
 * Azure Maps Manager
 * Handles all Azure Maps operations including initialization, rendering, and interactions
 */

class MapManager {
    constructor(containerId, subscriptionKey) {
        this.containerId = containerId;
        this.subscriptionKey = subscriptionKey;
        this.map = null;
        this.dataSources = new Map(); // Store data sources by layer ID
        this.layers = new Map(); // Store map layers by layer ID
        this.popups = new Map(); // Store popups
        this.selectedFeature = null;
        this.onFeatureClick = null;
        this.drawingManager = null;
        this.drawingDataSource = null;
        this.onDrawComplete = null;
        this.colorPalette = [
            '#0078d4', '#d13438', '#107c10', '#ffb900', '#8764b8',
            '#00b7c3', '#f7630c', '#ca5010', '#038387', '#486860'
        ];
        this.colorIndex = 0;
    }

    /**
     * Initialize the Azure Map
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            try {
                this.map = new atlas.Map(this.containerId, {
                    center: [-95.7129, 37.0902], // Center of USA
                    zoom: 4,
                    language: 'en-US',
                    authOptions: {
                        authType: 'subscriptionKey',
                        subscriptionKey: this.subscriptionKey
                    },
                    style: 'road'
                });

                // Wait for map to be ready
                this.map.events.add('ready', () => {
                    console.log('Azure Map initialized successfully');
                    this.setupMapControls();
                    resolve();
                });

                this.map.events.add('error', (error) => {
                    console.error('Map error:', error);
                    reject(error);
                });
            } catch (error) {
                console.error('Error initializing map:', error);
                reject(error);
            }
        });
    }

    /**
     * Setup map controls
     */
    setupMapControls() {
        // Add zoom control
        this.map.controls.add(new atlas.control.ZoomControl(), {
            position: 'top-right'
        });

        // Add compass control
        this.map.controls.add(new atlas.control.CompassControl(), {
            position: 'top-right'
        });

        // Add pitch control
        this.map.controls.add(new atlas.control.PitchControl(), {
            position: 'top-right'
        });

        // Add style control
        this.map.controls.add(new atlas.control.StyleControl({
            mapStyles: ['road', 'satellite', 'satellite_road_labels', 'grayscale_dark', 'night']
        }), {
            position: 'top-left'
        });

        // Initialize drawing tools
        this.setupDrawingTools();
    }

    /**
     * Setup drawing tools
     */
    setupDrawingTools() {
        // Create data source for drawing
        this.drawingDataSource = new atlas.source.DataSource();
        this.map.sources.add(this.drawingDataSource);

        // Create drawing manager
        this.drawingManager = new atlas.drawing.DrawingManager(this.map, {
            source: this.drawingDataSource,
            toolbar: null, // We'll use custom toolbar
            mode: 'idle'
        });

        // Add event listener for drawing complete
        this.map.events.add('drawingcomplete', this.drawingManager, (shape) => {
            if (this.onDrawComplete) {
                this.onDrawComplete(shape);
            }
        });

        // Add layers to render drawn shapes
        this.map.layers.add([
            new atlas.layer.PolygonLayer(this.drawingDataSource, 'drawing-polygons', {
                fillColor: 'rgba(0, 120, 212, 0.3)',
                strokeColor: '#0078d4',
                strokeWidth: 2
            }),
            new atlas.layer.LineLayer(this.drawingDataSource, 'drawing-lines', {
                strokeColor: '#0078d4',
                strokeWidth: 2
            }),
            new atlas.layer.SymbolLayer(this.drawingDataSource, 'drawing-points', {
                iconOptions: {
                    image: 'marker-blue',
                    allowOverlap: true
                }
            })
        ]);
    }

    /**
     * Enable drawing mode
     * @param {string} mode - Drawing mode ('draw-point', 'draw-polygon', etc.)
     */
    startDrawing(mode) {
        if (!this.drawingManager) {
            console.error('Drawing manager not initialized');
            return;
        }

        this.drawingManager.setOptions({ mode: mode });
    }

    /**
     * Stop drawing mode
     */
    stopDrawing() {
        if (this.drawingManager) {
            this.drawingManager.setOptions({ mode: 'idle' });
        }
    }

    /**
     * Delete selected drawing
     */
    deleteSelectedDrawing() {
        if (this.drawingManager) {
            const selectedShapes = this.drawingManager.getSelected();
            if (selectedShapes && selectedShapes.length > 0) {
                this.drawingDataSource.remove(selectedShapes);
                return true;
            }
        }
        return false;
    }

    /**
     * Get all drawn shapes
     * @returns {Array} Array of shapes
     */
    getDrawnShapes() {
        if (this.drawingDataSource) {
            return this.drawingDataSource.getShapes();
        }
        return [];
    }

    /**
     * Clear all drawings
     */
    clearDrawings() {
        if (this.drawingDataSource) {
            this.drawingDataSource.clear();
        }
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
        const params = new URLSearchParams({
            'api-version': '1.0',
            'subscription-key': this.subscriptionKey,
            'query': query,
            'limit': '1'
        });

        try {
            const response = await fetch(`https://atlas.microsoft.com/search/address/json?${params}`);
            const data = await response.json();

            if (data.results && data.results.length > 0) {
                const result = data.results[0];
                const position = result.position;

                // Navigate to location
                this.map.setCamera({
                    center: [position.lon, position.lat],
                    zoom: 15,
                    type: 'ease',
                    duration: 1000
                });

                // Add marker
                this.addSearchMarker(position.lon, position.lat, result.address.freeformAddress);

                return {
                    success: true,
                    latitude: position.lat,
                    longitude: position.lon,
                    address: result.address.freeformAddress
                };
            }

            return {
                success: false,
                error: 'No results found'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Add search result marker
     * @param {number} lon - Longitude
     * @param {number} lat - Latitude
     * @param {string} address - Address text
     */
    addSearchMarker(lon, lat, address) {
        // Remove existing search marker if any
        if (this.searchMarkerDataSource) {
            this.map.sources.remove(this.searchMarkerDataSource);
        }

        // Create new data source
        this.searchMarkerDataSource = new atlas.source.DataSource();
        this.map.sources.add(this.searchMarkerDataSource);

        // Add marker
        const marker = new atlas.data.Feature(new atlas.data.Point([lon, lat]), {
            title: 'Search Result',
            description: address
        });

        this.searchMarkerDataSource.add(marker);

        // Add symbol layer
        const symbolLayer = new atlas.layer.SymbolLayer(this.searchMarkerDataSource, null, {
            iconOptions: {
                image: 'marker-red',
                anchor: 'center',
                allowOverlap: true
            }
        });

        this.map.layers.add(symbolLayer);

        // Show popup
        const popup = new atlas.Popup({
            position: [lon, lat],
            content: `<div style="padding: 10px;"><strong>${address}</strong></div>`,
            pixelOffset: [0, -18]
        });

        popup.open(this.map);
        this.searchPopup = popup;
    }

    /**
     * Create a data source for a layer
     * @param {string} layerId - Layer ID
     * @returns {atlas.source.DataSource}
     */
    createDataSource(layerId) {
        const dataSource = new atlas.source.DataSource();
        this.map.sources.add(dataSource);
        this.dataSources.set(layerId, dataSource);
        return dataSource;
    }

    /**
     * Add polygon layer to the map
     * @param {string} layerId - Layer ID
     * @param {string} color - Polygon color
     * @param {Object} options - Additional layer options
     */
    addPolygonLayer(layerId, color, options = {}) {
        const dataSource = this.dataSources.get(layerId);
        if (!dataSource) {
            console.error(`Data source for layer ${layerId} not found`);
            return;
        }

        // Create polygon layer
        const polygonLayer = new atlas.layer.PolygonLayer(dataSource, `${layerId}-polygons`, {
            fillColor: color,
            fillOpacity: 0.5,
            ...options
        });

        // Create line layer for borders
        const lineLayer = new atlas.layer.LineLayer(dataSource, `${layerId}-lines`, {
            strokeColor: color,
            strokeWidth: 2,
            ...options
        });

        // Add layers to map
        this.map.layers.add([polygonLayer, lineLayer]);

        // Store layer references
        this.layers.set(layerId, {
            polygon: polygonLayer,
            line: lineLayer,
            color: color
        });

        // Add click event
        this.map.events.add('click', polygonLayer, (e) => {
            this.handleFeatureClick(e, layerId);
        });
    }

    /**
     * Add point layer to the map
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

        // Create symbol layer for points
        const symbolLayer = new atlas.layer.SymbolLayer(dataSource, `${layerId}-symbols`, {
            iconOptions: {
                image: 'marker-blue',
                anchor: 'center',
                allowOverlap: true
            },
            textOptions: {
                textField: ['get', 'name'],
                offset: [0, 1.5],
                color: '#333333',
                haloColor: '#ffffff',
                haloWidth: 2
            },
            ...options
        });

        // Add layer to map
        this.map.layers.add(symbolLayer);

        // Store layer reference
        this.layers.set(layerId, {
            symbol: symbolLayer,
            color: color
        });

        // Add click event
        this.map.events.add('click', symbolLayer, (e) => {
            this.handleFeatureClick(e, layerId);
        });
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
            dataSource = this.createDataSource(layerId);
        }

        // Get next color
        const color = this.getNextColor();

        // Convert features to GeoJSON
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

        // Add features to data source
        dataSource.add(geoJsonFeatures);

        // Add appropriate layer type
        if (type === 'polygon') {
            this.addPolygonLayer(layerId, color);
        } else {
            this.addPointLayer(layerId, color);
        }

        // Fit map to show all features
        this.fitMapToDataSource(dataSource);

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
     * @param {Object} e - Event object
     * @param {string} layerId - Layer ID
     */
    handleFeatureClick(e, layerId) {
        if (e.shapes && e.shapes.length > 0) {
            const shape = e.shapes[0];
            this.selectedFeature = {
                shape: shape,
                layerId: layerId,
                properties: shape.getProperties()
            };

            // Show popup
            this.showPopup(e.position, shape.getProperties());

            // Call callback if provided
            if (this.onFeatureClick) {
                this.onFeatureClick(this.selectedFeature);
            }
        }
    }

    /**
     * Show popup at location
     * @param {Array} position - [longitude, latitude]
     * @param {Object} properties - Feature properties
     */
    showPopup(position, properties) {
        // Create popup content
        let content = '<div style="padding: 10px;">';
        for (let key in properties) {
            if (key !== 'layerId' && properties[key]) {
                content += `<strong>${key}:</strong> ${properties[key]}<br>`;
            }
        }
        content += '</div>';

        // Create or update popup
        if (!this.popup) {
            this.popup = new atlas.Popup({
                pixelOffset: [0, -18]
            });
        }

        this.popup.setOptions({
            content: content,
            position: position
        });

        this.popup.open(this.map);
    }

    /**
     * Close popup
     */
    closePopup() {
        if (this.popup) {
            this.popup.close();
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

        const visibility = visible ? 'visible' : 'none';

        // Update visibility for all layer types
        if (layer.polygon) {
            layer.polygon.setOptions({ visible: visible });
        }
        if (layer.line) {
            layer.line.setOptions({ visible: visible });
        }
        if (layer.symbol) {
            layer.symbol.setOptions({ visible: visible });
        }
    }

    /**
     * Remove layer from map
     * @param {string} layerId - Layer ID
     */
    removeLayer(layerId) {
        const layer = this.layers.get(layerId);
        const dataSource = this.dataSources.get(layerId);

        // Remove layers
        if (layer) {
            if (layer.polygon) this.map.layers.remove(layer.polygon);
            if (layer.line) this.map.layers.remove(layer.line);
            if (layer.symbol) this.map.layers.remove(layer.symbol);
            this.layers.delete(layerId);
        }

        // Remove data source
        if (dataSource) {
            this.map.sources.remove(dataSource);
            this.dataSources.delete(layerId);
        }
    }

    /**
     * Update feature properties
     * @param {string} layerId - Layer ID
     * @param {string} featureId - Feature ID
     * @param {Object} newProperties - Updated properties
     */
    updateFeatureProperties(layerId, featureId, newProperties) {
        const dataSource = this.dataSources.get(layerId);
        if (!dataSource) return;

        const features = dataSource.getShapes();
        const feature = features.find(f => f.getId() === featureId);

        if (feature) {
            feature.setProperties({ ...feature.getProperties(), ...newProperties });
        }
    }

    /**
     * Remove feature from layer
     * @param {string} layerId - Layer ID
     * @param {string} featureId - Feature ID
     */
    removeFeature(layerId, featureId) {
        const dataSource = this.dataSources.get(layerId);
        if (!dataSource) return;

        const features = dataSource.getShapes();
        const feature = features.find(f => f.getId() === featureId);

        if (feature) {
            dataSource.remove(feature);
        }
    }

    /**
     * Fit map to show all features in a data source
     * @param {atlas.source.DataSource} dataSource - Data source
     */
    fitMapToDataSource(dataSource) {
        const shapes = dataSource.getShapes();
        if (shapes.length === 0) return;

        try {
            const bounds = atlas.data.BoundingBox.fromData(shapes);

            // Validate bounds - check if they contain valid numbers
            if (bounds &&
                !isNaN(bounds[0]) && !isNaN(bounds[1]) &&
                !isNaN(bounds[2]) && !isNaN(bounds[3])) {
                this.map.setCamera({
                    bounds: bounds,
                    padding: 50
                });
            } else {
                console.warn('Invalid bounds detected, skipping map fit:', bounds);
            }
        } catch (error) {
            console.error('Error fitting map to data source:', error);
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
        this.map.setCamera({
            center: [-95.7129, 37.0902],
            zoom: 4
        });
    }

    /**
     * Zoom in
     */
    zoomIn() {
        const currentZoom = this.map.getCamera().zoom;
        this.map.setCamera({ zoom: currentZoom + 1 });
    }

    /**
     * Zoom out
     */
    zoomOut() {
        const currentZoom = this.map.getCamera().zoom;
        this.map.setCamera({ zoom: currentZoom - 1 });
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
        this.closePopup();
    }

    /**
     * Set feature click callback
     * @param {Function} callback - Callback function
     */
    setOnFeatureClick(callback) {
        this.onFeatureClick = callback;
    }
}
