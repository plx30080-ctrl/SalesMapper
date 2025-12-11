/**
 * State Manager
 * Centralized state management for the application
 * Implements observer pattern for state changes
 */

class StateManager {
    constructor() {
        this.state = {
            // Core managers
            mapManager: null,
            layerManager: null,
            csvParser: null,
            geocodingService: null,

            // Profile state
            currentProfile: null, // { id, name, createdAt, lastUpdated }
            profiles: [], // Array of all available profiles

            // Application state
            layers: new Map(),
            layerGroups: new Map(),
            layerOrder: [],
            allLayersGroupId: null,
            activeGroup: null,

            // UI state
            currentEditingFeature: null,
            currentCSVData: null,
            currentLayerForActions: null,

            // Feature toggles
            realtimeListenerEnabled: false,
            drawingMode: null,

            // Temporary state
            targetLayerForNewFeature: null,

            // Metadata
            lastSaved: null,
            isDirty: false
        };

        // Subscribers for state changes
        this.subscribers = new Map();

        // Auto-save timer
        this.autoSaveTimer = null;
    }

    /**
     * Initialize state manager
     */
    initialize() {
        console.log('StateManager initialized');
        this.setupAutoSave();
    }

    /**
     * Get entire state
     * @returns {Object} Current state
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Get specific state value
     * @param {string} key - State key
     * @returns {*} State value
     */
    get(key) {
        return Utils.getNestedProperty(this.state, key);
    }

    /**
     * Set specific state value
     * @param {string} key - State key
     * @param {*} value - New value
     * @param {boolean} silent - Don't trigger subscribers
     */
    set(key, value, silent = false) {
        const oldValue = this.get(key);

        Utils.setNestedProperty(this.state, key, value);

        this.state.isDirty = true;

        if (!silent) {
            this.notify(key, value, oldValue);
        }
    }

    /**
     * Update multiple state values at once
     * @param {Object} updates - Object with key-value pairs
     * @param {boolean} silent - Don't trigger subscribers
     */
    update(updates, silent = false) {
        Object.entries(updates).forEach(([key, value]) => {
            this.set(key, value, true);
        });

        if (!silent) {
            this.notify('*', updates);
        }
    }

    /**
     * Subscribe to state changes
     * @param {string} key - State key to watch ('*' for all changes)
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    subscribe(key, callback) {
        if (!this.subscribers.has(key)) {
            this.subscribers.set(key, []);
        }

        this.subscribers.get(key).push(callback);

        // Return unsubscribe function
        return () => {
            const callbacks = this.subscribers.get(key);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        };
    }

    /**
     * Notify subscribers of state change
     * @param {string} key - Changed key
     * @param {*} newValue - New value
     * @param {*} oldValue - Old value
     */
    notify(key, newValue, oldValue) {
        // Notify specific subscribers
        if (this.subscribers.has(key)) {
            this.subscribers.get(key).forEach(callback => {
                try {
                    callback(newValue, oldValue, key);
                } catch (error) {
                    console.error(`Error in state subscriber for ${key}:`, error);
                }
            });
        }

        // Notify wildcard subscribers
        if (this.subscribers.has('*')) {
            this.subscribers.get('*').forEach(callback => {
                try {
                    callback(newValue, oldValue, key);
                } catch (error) {
                    console.error('Error in wildcard state subscriber:', error);
                }
            });
        }
    }

    /**
     * Clear all subscribers
     */
    clearSubscribers() {
        this.subscribers.clear();
    }

    /**
     * Reset state to defaults
     */
    reset() {
        const managers = {
            mapManager: this.state.mapManager,
            layerManager: this.state.layerManager,
            csvParser: this.state.csvParser,
            geocodingService: this.state.geocodingService
        };

        this.state = {
            ...managers,
            layers: new Map(),
            layerGroups: new Map(),
            layerOrder: [],
            allLayersGroupId: null,
            activeGroup: null,
            currentEditingFeature: null,
            currentCSVData: null,
            currentLayerForActions: null,
            realtimeListenerEnabled: false,
            drawingMode: null,
            targetLayerForNewFeature: null,
            lastSaved: null,
            isDirty: false
        };

        this.notify('*', this.state);
    }

    /**
     * Save state to localStorage
     * @returns {boolean} Success
     */
    saveToLocalStorage() {
        try {
            const layerManager = this.get('layerManager');
            if (!layerManager) {
                console.warn('LayerManager not available for save');
                return false;
            }

            const layersData = layerManager.exportAllLayers();
            const groupsData = Array.from(this.state.layerGroups.values());

            const stateData = {
                layers: layersData,
                groups: groupsData,
                allLayersGroupId: this.state.allLayersGroupId,
                activeGroup: this.state.activeGroup,
                timestamp: Utils.formatDate()
            };

            // Use profile-aware storage key
            const storageKey = this.getProfileStorageKey();
            localStorage.setItem(storageKey, JSON.stringify(stateData));

            this.state.isDirty = false;
            this.state.lastSaved = Utils.formatDate();

            console.log(`State saved to localStorage for profile: ${this.state.currentProfile?.id || 'default'}`);
            return true;
        } catch (error) {
            console.error('Error saving state to localStorage:', error);
            return false;
        }
    }

    /**
     * Load state from localStorage
     * @returns {Object|null} Loaded state or null
     */
    loadFromLocalStorage() {
        try {
            // Use profile-aware storage key
            const storageKey = this.getProfileStorageKey();
            const saved = localStorage.getItem(storageKey);
            if (!saved) {
                console.log(`No saved state found in localStorage for profile: ${this.state.currentProfile?.id || 'default'}`);
                return null;
            }

            const stateData = JSON.parse(saved);
            console.log(`State loaded from localStorage for profile: ${this.state.currentProfile?.id || 'default'}:`, stateData);

            return stateData;
        } catch (error) {
            console.error('Error loading from localStorage:', error);
            return null;
        }
    }

    /**
     * Clear localStorage for current profile
     */
    clearLocalStorage() {
        try {
            const storageKey = this.getProfileStorageKey();
            localStorage.removeItem(storageKey);
            console.log(`localStorage cleared for profile: ${this.state.currentProfile?.id || 'default'}`);
        } catch (error) {
            console.error('Error clearing localStorage:', error);
        }
    }

    /**
     * Setup auto-save
     */
    setupAutoSave() {
        if (!AppConfig.storage.autoSaveEnabled) {
            return;
        }

        // Auto-save every 30 seconds if dirty
        this.autoSaveTimer = setInterval(() => {
            if (this.state.isDirty) {
                this.saveToLocalStorage();
            }
        }, 30000);

        // Save on window unload
        window.addEventListener('beforeunload', () => {
            if (this.state.isDirty) {
                this.saveToLocalStorage();
            }
        });
    }

    /**
     * Get export data for Firebase
     * @returns {Object} Export data
     */
    getExportData() {
        const layerManager = this.get('layerManager');
        if (!layerManager) {
            return {};
        }

        const layersData = layerManager.exportAllLayers();
        const groupsData = Array.from(this.state.layerGroups.values());

        return {
            ...layersData,
            _groups: groupsData,
            _metadata: {
                lastSaved: this.state.lastSaved,
                timestamp: Utils.formatDate()
            }
        };
    }

    /**
     * Import data from Firebase
     * @param {Object} data - Import data
     */
    importData(data) {
        // Extract groups
        if (data._groups) {
            this.state.layerGroups.clear();
            data._groups.forEach(g => {
                this.state.layerGroups.set(g.id, g);
            });
            delete data._groups;
        }

        // Extract metadata
        if (data._metadata) {
            this.state.lastSaved = data._metadata.lastSaved;
            delete data._metadata;
        }

        this.notify('layerGroups', this.state.layerGroups);
        this.notify('lastSaved', this.state.lastSaved);
    }

    /**
     * Get layer by ID
     * @param {string} layerId - Layer ID
     * @returns {Object|null} Layer or null
     */
    getLayer(layerId) {
        const layerManager = this.get('layerManager');
        return layerManager ? layerManager.getLayer(layerId) : null;
    }

    /**
     * Get all layers
     * @returns {Array} Array of layers
     */
    getAllLayers() {
        const layerManager = this.get('layerManager');
        return layerManager ? layerManager.getAllLayers() : [];
    }

    /**
     * Get layer group by ID
     * @param {string} groupId - Group ID
     * @returns {Object|null} Group or null
     */
    getLayerGroup(groupId) {
        return this.state.layerGroups.get(groupId) || null;
    }

    /**
     * Get all layer groups
     * @returns {Array} Array of groups
     */
    getAllLayerGroups() {
        return Array.from(this.state.layerGroups.values());
    }

    /**
     * Add layer to group
     * @param {string} layerId - Layer ID
     * @param {string} groupId - Group ID
     */
    addLayerToGroup(layerId, groupId) {
        const group = this.state.layerGroups.get(groupId);
        if (group) {
            if (!group.layerIds) {
                group.layerIds = [];
            }
            if (!group.layerIds.includes(layerId)) {
                group.layerIds.push(layerId);
                this.notify('layerGroups', this.state.layerGroups);
            }
        }
    }

    /**
     * Remove layer from group
     * @param {string} layerId - Layer ID
     * @param {string} groupId - Group ID
     */
    removeLayerFromGroup(layerId, groupId) {
        const group = this.state.layerGroups.get(groupId);
        if (group && group.layerIds) {
            const index = group.layerIds.indexOf(layerId);
            if (index > -1) {
                group.layerIds.splice(index, 1);
                this.notify('layerGroups', this.state.layerGroups);
            }
        }
    }

    /**
     * Remove layer from all groups
     * @param {string} layerId - Layer ID
     */
    removeLayerFromAllGroups(layerId) {
        this.state.layerGroups.forEach((group, groupId) => {
            this.removeLayerFromGroup(layerId, groupId);
        });
    }

    /**
     * Create layer group
     * @param {string} name - Group name
     * @returns {string} Group ID
     */
    createLayerGroup(name) {
        const groupId = Utils.generateId('group');
        const group = {
            id: groupId,
            name: name,
            layerIds: [],
            visible: true,
            opacity: 1.0
        };

        this.state.layerGroups.set(groupId, group);
        this.notify('layerGroups', this.state.layerGroups);

        return groupId;
    }

    /**
     * Delete layer group
     * @param {string} groupId - Group ID
     */
    deleteLayerGroup(groupId) {
        if (this.state.layerGroups.delete(groupId)) {
            this.notify('layerGroups', this.state.layerGroups);
        }
    }

    /**
     * Get summary statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const layerManager = this.get('layerManager');
        const layers = layerManager ? layerManager.getAllLayers() : [];

        return {
            layerCount: layers.length,
            featureCount: layers.reduce((sum, layer) => sum + (layer.features?.length || 0), 0),
            groupCount: this.state.layerGroups.size,
            lastSaved: this.state.lastSaved,
            isDirty: this.state.isDirty
        };
    }

    /**
     * Destroy state manager
     */
    destroy() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }

        // Save before destroying
        if (this.state.isDirty) {
            this.saveToLocalStorage();
        }

        this.clearSubscribers();
        console.log('StateManager destroyed');
    }

    // ==================== PROFILE MANAGEMENT ====================

    /**
     * Set current profile
     * @param {Object} profile - Profile object { id, name, createdAt, lastUpdated }
     */
    setCurrentProfile(profile) {
        this.state.currentProfile = profile;
        this.notify('currentProfile', profile);
        console.log(`Current profile set to: ${profile.name}`);
    }

    /**
     * Get current profile
     * @returns {Object|null} Current profile or null
     */
    getCurrentProfile() {
        return this.state.currentProfile;
    }

    /**
     * Update profiles list
     * @param {Array} profiles - Array of profile objects
     */
    updateProfiles(profiles) {
        this.state.profiles = profiles;
        this.notify('profiles', profiles);
    }

    /**
     * Get profiles list
     * @returns {Array} Array of profiles
     */
    getProfiles() {
        return this.state.profiles;
    }

    /**
     * Get profile-aware localStorage key
     * @returns {string} Storage key
     */
    getProfileStorageKey() {
        const profileId = this.state.currentProfile?.id || 'default';
        return `${AppConfig.storage.localStorageKey}_${profileId}`;
    }

    /**
     * Save current profile preference to localStorage
     */
    saveCurrentProfilePreference() {
        try {
            if (this.state.currentProfile) {
                localStorage.setItem('salesMapper_currentProfile', JSON.stringify(this.state.currentProfile));
            }
        } catch (error) {
            console.error('Error saving profile preference:', error);
        }
    }

    /**
     * Load current profile preference from localStorage
     * @returns {Object|null} Saved profile preference or null
     */
    loadCurrentProfilePreference() {
        try {
            const saved = localStorage.getItem('salesMapper_currentProfile');
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (error) {
            console.error('Error loading profile preference:', error);
        }
        return null;
    }
}

// Create singleton instance
const stateManager = new StateManager();
