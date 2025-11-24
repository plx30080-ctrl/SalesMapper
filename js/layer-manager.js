/**
 * Layer Manager
 * Manages layer creation, editing, filtering, and sorting
 */

class LayerManager {
    constructor(mapManager) {
        this.mapManager = mapManager;
        this.layers = new Map(); // layerId -> layer data
        this.layerOrder = []; // Array of layer IDs in display order
        this.activeFilters = new Map(); // layerId -> filter config
        this.activeSorts = new Map(); // layerId -> sort config
        this.onLayerUpdate = null;
    }

    /**
     * Create a new layer
     * @param {string} name - Layer name
     * @param {Array} features - Array of features
     * @param {string} type - Layer type ('polygon' or 'point')
     * @param {Object} metadata - Additional layer metadata
     * @returns {string} Layer ID
     */
    createLayer(name, features = [], type = 'point', metadata = {}) {
        const layerId = this.generateLayerId(name);

        const layer = {
            id: layerId,
            name: name,
            type: type,
            features: features,
            visible: true,
            opacity: 1.0,
            color: null,
            metadata: metadata,
            createdAt: new Date().toISOString()
        };

        // Store layer
        this.layers.set(layerId, layer);
        this.layerOrder.push(layerId);

        // Add to map if there are features
        if (features.length > 0) {
            const color = this.mapManager.addFeaturesToLayer(layerId, features, type);
            layer.color = color;
        } else {
            // Create empty data source
            this.mapManager.createDataSource(layerId);
            layer.color = this.mapManager.getNextColor();
        }

        // Notify update
        this.notifyUpdate();

        return layerId;
    }

    /**
     * Add features to an existing layer
     * @param {string} layerId - Layer ID
     * @param {Array} features - Array of features to add
     */
    addFeaturesToLayer(layerId, features) {
        const layer = this.layers.get(layerId);
        if (!layer) {
            console.error(`Layer ${layerId} not found`);
            return;
        }

        // Add to layer data
        layer.features.push(...features);

        // Add to map
        this.mapManager.addFeaturesToLayer(layerId, features, layer.type);

        // Notify update
        this.notifyUpdate();
    }

    /**
     * Toggle layer visibility
     * @param {string} layerId - Layer ID
     */
    toggleLayerVisibility(layerId) {
        const layer = this.layers.get(layerId);
        if (!layer) return;

        layer.visible = !layer.visible;
        this.mapManager.toggleLayerVisibility(layerId, layer.visible);

        // Notify update
        this.notifyUpdate();
    }

    /**
     * Delete a layer
     * @param {string} layerId - Layer ID
     */
    deleteLayer(layerId) {
        const layer = this.layers.get(layerId);
        if (!layer) return;

        // Remove from map
        this.mapManager.removeLayer(layerId);

        // Remove from storage
        this.layers.delete(layerId);
        this.activeFilters.delete(layerId);
        this.activeSorts.delete(layerId);

        // Remove from order
        const index = this.layerOrder.indexOf(layerId);
        if (index > -1) {
            this.layerOrder.splice(index, 1);
        }

        // Notify update
        this.notifyUpdate();

        return layer;
    }

    /**
     * Get layer by ID
     * @param {string} layerId - Layer ID
     * @returns {Object} Layer data
     */
    getLayer(layerId) {
        return this.layers.get(layerId);
    }

    /**
     * Get all layers
     * @returns {Array} Array of all layers
     */
    getAllLayers() {
        // Return layers in the specified order
        return this.layerOrder
            .map(id => this.layers.get(id))
            .filter(layer => layer !== undefined);
    }

    /**
     * Move layer up or down in display order
     * @param {string} layerId - Layer ID
     * @param {string} direction - 'up' or 'down'
     */
    moveLayer(layerId, direction) {
        const index = this.layerOrder.indexOf(layerId);
        if (index === -1) return;

        if (direction === 'up' && index > 0) {
            // Swap with previous
            [this.layerOrder[index - 1], this.layerOrder[index]] =
            [this.layerOrder[index], this.layerOrder[index - 1]];
            this.syncLayerZOrder();
            this.notifyUpdate();
        } else if (direction === 'down' && index < this.layerOrder.length - 1) {
            // Swap with next
            [this.layerOrder[index], this.layerOrder[index + 1]] =
            [this.layerOrder[index + 1], this.layerOrder[index]];
            this.syncLayerZOrder();
            this.notifyUpdate();
        }
    }

    /**
     * Sync map layer z-order with layerOrder array
     * Layers at the top of the list appear on top on the map
     */
    syncLayerZOrder() {
        // Reverse the order because Azure Maps renders layers bottom-to-top
        // (last added layer appears on top)
        const reversedOrder = [...this.layerOrder].reverse();

        reversedOrder.forEach(layerId => {
            const mapLayers = this.mapManager.layers.get(layerId);
            if (mapLayers) {
                // Remove and re-add layers to move them to the top
                if (mapLayers.polygon) {
                    this.mapManager.map.layers.remove(mapLayers.polygon);
                    this.mapManager.map.layers.add(mapLayers.polygon);
                }
                if (mapLayers.line) {
                    this.mapManager.map.layers.remove(mapLayers.line);
                    this.mapManager.map.layers.add(mapLayers.line);
                }
                if (mapLayers.symbol) {
                    this.mapManager.map.layers.remove(mapLayers.symbol);
                    this.mapManager.map.layers.add(mapLayers.symbol);
                }
            }
        });
    }

    /**
     * Set layer opacity
     * @param {string} layerId - Layer ID
     * @param {number} opacity - Opacity value (0-1)
     */
    setLayerOpacity(layerId, opacity) {
        const layer = this.layers.get(layerId);
        if (!layer) return;

        layer.opacity = opacity;

        // Update map layers
        const mapLayers = this.mapManager.layers.get(layerId);
        if (mapLayers) {
            if (mapLayers.polygon) {
                mapLayers.polygon.setOptions({ fillOpacity: opacity * 0.5 });
            }
            if (mapLayers.line) {
                mapLayers.line.setOptions({ strokeOpacity: opacity });
            }
            if (mapLayers.symbol) {
                mapLayers.symbol.setOptions({ iconOptions: { opacity: opacity } });
            }
            if (mapLayers.bubble) {
                mapLayers.bubble.setOptions({ opacity: opacity });
            }
        }

        this.notifyUpdate();
    }

    /**
     * Update feature in a layer
     * @param {string} layerId - Layer ID
     * @param {string} featureId - Feature ID
     * @param {Object} newProperties - Updated properties
     */
    updateFeature(layerId, featureId, newProperties) {
        const layer = this.layers.get(layerId);
        if (!layer) return;

        // Find and update feature in layer data
        const featureIndex = layer.features.findIndex(f => f.id === featureId);
        if (featureIndex !== -1) {
            layer.features[featureIndex] = {
                ...layer.features[featureIndex],
                ...newProperties
            };

            // Update on map
            this.mapManager.updateFeatureProperties(layerId, featureId, newProperties);

            // Notify update
            this.notifyUpdate();
        }
    }

    /**
     * Delete feature from a layer
     * @param {string} layerId - Layer ID
     * @param {string} featureId - Feature ID
     */
    deleteFeature(layerId, featureId) {
        const layer = this.layers.get(layerId);
        if (!layer) return;

        // Remove from layer data
        layer.features = layer.features.filter(f => f.id !== featureId);

        // Remove from map
        this.mapManager.removeFeature(layerId, featureId);

        // Notify update
        this.notifyUpdate();
    }

    /**
     * Apply filter to a layer
     * @param {string} layerId - Layer ID
     * @param {string} column - Column to filter by
     * @param {string} value - Filter value
     */
    applyFilter(layerId, column, value) {
        const layer = this.layers.get(layerId);
        if (!layer) return;

        // Store filter
        this.activeFilters.set(layerId, { column, value });

        // Get filtered features
        const filteredFeatures = layer.features.filter(feature => {
            const featureValue = String(feature[column] || '').toLowerCase();
            const filterValue = String(value).toLowerCase();
            return featureValue.includes(filterValue);
        });

        // Re-render layer with filtered features
        this.rerenderLayer(layerId, filteredFeatures);
    }

    /**
     * Clear filter from a layer
     * @param {string} layerId - Layer ID
     */
    clearFilter(layerId) {
        const layer = this.layers.get(layerId);
        if (!layer) return;

        // Remove filter
        this.activeFilters.delete(layerId);

        // Re-render layer with all features
        this.rerenderLayer(layerId, layer.features);
    }

    /**
     * Sort layer features
     * @param {string} layerId - Layer ID
     * @param {string} column - Column to sort by
     * @param {string} direction - Sort direction ('asc' or 'desc')
     */
    sortLayer(layerId, column, direction = 'asc') {
        const layer = this.layers.get(layerId);
        if (!layer) return;

        // Store sort config
        this.activeSorts.set(layerId, { column, direction });

        // Sort features
        const sortedFeatures = [...layer.features].sort((a, b) => {
            let aVal = a[column];
            let bVal = b[column];

            // Handle numeric values
            if (!isNaN(aVal) && !isNaN(bVal)) {
                aVal = parseFloat(aVal);
                bVal = parseFloat(bVal);
            }

            if (direction === 'asc') {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            } else {
                return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
            }
        });

        // Update layer features order
        layer.features = sortedFeatures;

        // Notify update
        this.notifyUpdate();
    }

    /**
     * Re-render a layer with specific features
     * @param {string} layerId - Layer ID
     * @param {Array} features - Features to render
     */
    rerenderLayer(layerId, features) {
        const layer = this.layers.get(layerId);
        if (!layer) return;

        // Remove existing layer from map
        this.mapManager.removeLayer(layerId);

        // Create new data source
        this.mapManager.createDataSource(layerId);

        // Add filtered features
        if (features.length > 0) {
            this.mapManager.addFeaturesToLayer(layerId, features, layer.type);
        }

        // Restore visibility state
        this.mapManager.toggleLayerVisibility(layerId, layer.visible);
    }

    /**
     * Get all unique values for a column across all layers
     * @param {string} column - Column name
     * @returns {Array} Unique values
     */
    getUniqueColumnValues(column) {
        const values = new Set();

        for (let layer of this.layers.values()) {
            for (let feature of layer.features) {
                if (feature[column]) {
                    values.add(feature[column]);
                }
            }
        }

        return Array.from(values).sort();
    }

    /**
     * Get all column names across all layers
     * @returns {Array} Column names
     */
    getAllColumnNames() {
        const columns = new Set();

        for (let layer of this.layers.values()) {
            for (let feature of layer.features) {
                Object.keys(feature).forEach(key => {
                    // Skip certain properties
                    if (!['id', 'wkt', 'layerId'].includes(key)) {
                        columns.add(key);
                    }
                });
            }
        }

        return Array.from(columns).sort();
    }

    /**
     * Export layer data
     * @param {string} layerId - Layer ID
     * @returns {Object} Layer data
     */
    exportLayer(layerId) {
        const layer = this.layers.get(layerId);
        if (!layer) return null;

        const exported = {
            id: layer.id,
            name: layer.name,
            type: layer.type,
            features: layer.features,
            visible: layer.visible,
            opacity: layer.opacity !== undefined ? layer.opacity : 1.0,
            color: layer.color,
            metadata: layer.metadata,
            createdAt: layer.createdAt
        };

        // Only add style properties if they exist (Firebase can't save undefined)
        if (layer.styleType !== undefined) {
            exported.styleType = layer.styleType;
        }
        if (layer.styleProperty !== undefined) {
            exported.styleProperty = layer.styleProperty;
        }
        if (layer.colorMap !== undefined) {
            exported.colorMap = layer.colorMap;
        }

        return exported;
    }

    /**
     * Export all layers
     * @returns {Object} All layers data
     */
    exportAllLayers() {
        const data = {
            layers: {},
            layerOrder: this.layerOrder
        };

        for (let [layerId, layer] of this.layers) {
            data.layers[layerId] = this.exportLayer(layerId);
        }

        return data;
    }

    /**
     * Import layers from data
     * @param {Object} data - Layers data
     */
    importLayers(data) {
        // Clear existing layers
        for (let layerId of this.layers.keys()) {
            this.deleteLayer(layerId);
        }

        // Handle both old format (direct object) and new format (with layerOrder)
        const layersData = data.layers || data;
        const layerOrder = data.layerOrder || Object.keys(layersData);

        // Import each layer
        for (let [layerId, layerData] of Object.entries(layersData)) {
            // Create layer object with preserved ID
            const layer = {
                id: layerId,  // Preserve original ID
                name: layerData.name,
                type: layerData.type,
                features: layerData.features || [],
                visible: layerData.visible !== undefined ? layerData.visible : true,
                opacity: layerData.opacity !== undefined ? layerData.opacity : 1.0,
                color: layerData.color || null,
                metadata: layerData.metadata || {},
                createdAt: layerData.createdAt || new Date().toISOString(),
                styleType: layerData.styleType,
                styleProperty: layerData.styleProperty,
                colorMap: layerData.colorMap
            };

            // Store layer (don't add to layerOrder yet)
            this.layers.set(layerId, layer);

            // Add to map if there are features and layer is visible
            if (layer.features.length > 0) {
                // Check if this layer has property-based styling
                if (layer.styleType && layer.styleProperty && layer.colorMap) {
                    // Will be re-styled by app.js after import
                    const color = this.mapManager.addFeaturesToLayer(layerId, layer.features, layer.type);
                    layer.color = color;
                } else {
                    // Normal styling
                    const color = this.mapManager.addFeaturesToLayer(layerId, layer.features, layer.type);
                    layer.color = color;
                }

                // Set visibility on map
                if (!layer.visible) {
                    this.mapManager.toggleLayerVisibility(layerId, false);
                }

                // Set opacity on map
                if (layer.opacity !== undefined && layer.opacity !== 1.0) {
                    this.setLayerOpacity(layerId, layer.opacity);
                }
            } else {
                // Create empty data source
                this.mapManager.createDataSource(layerId);
                layer.color = this.mapManager.getNextColor();
            }
        }

        // Restore layer order
        this.layerOrder = layerOrder.filter(id => this.layers.has(id));

        // Sync the layer z-order on the map to match the restored order
        this.syncLayerZOrder();

        // Notify update
        this.notifyUpdate();
    }

    /**
     * Generate unique layer ID
     * @param {string} name - Layer name
     * @returns {string} Layer ID
     */
    generateLayerId(name) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        const safeName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        return `${safeName}_${timestamp}_${random}`;
    }

    /**
     * Set update callback
     * @param {Function} callback - Callback function
     */
    setOnLayerUpdate(callback) {
        this.onLayerUpdate = callback;
    }

    /**
     * Notify layer update
     */
    notifyUpdate() {
        if (this.onLayerUpdate) {
            this.onLayerUpdate(this.getAllLayers());
        }
    }

    /**
     * Get layer statistics
     * @param {string} layerId - Layer ID
     * @returns {Object} Layer statistics
     */
    getLayerStats(layerId) {
        const layer = this.layers.get(layerId);
        if (!layer) return null;

        return {
            featureCount: layer.features.length,
            type: layer.type,
            visible: layer.visible,
            hasFilter: this.activeFilters.has(layerId),
            hasSort: this.activeSorts.has(layerId)
        };
    }
}
