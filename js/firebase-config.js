/**
 * Firebase Configuration and Database Manager
 * Handles all Firebase Realtime Database operations
 * Integrated with AppConfig and Utils
 */

// Initialize Firebase using AppConfig
firebase.initializeApp(AppConfig.firebase);
const database = firebase.database();

/**
 * Firebase Database Manager
 */
class FirebaseManager {
    constructor() {
        this.db = database;
        this.dataRef = this.db.ref('salesTerritoryData');
        this.layersRef = this.db.ref('layers');
        this.profilesRef = this.db.ref('salesTerritoryData/profiles');
        this.currentProfileId = null;
    }

    /**
     * Set the current profile
     * @param {string} profileId - Profile ID
     */
    setCurrentProfile(profileId) {
        this.currentProfileId = profileId;
        console.log(`Current profile set to: ${profileId}`);
    }

    /**
     * Get current profile reference
     * @returns {firebase.database.Reference}
     */
    getCurrentProfileRef() {
        if (!this.currentProfileId) {
            throw new Error('No profile selected');
        }
        return this.profilesRef.child(this.currentProfileId);
    }

    /**
     * Save all layers to Firebase (profile-aware)
     * @param {Object} layersData - Object containing all layers data
     * @param {string} profileName - Optional profile name for metadata
     * @returns {Promise}
     */
    async saveAllLayers(layersData, profileName = null) {
        try {
            const timestamp = Utils.formatDate();
            const profileRef = this.getCurrentProfileRef();

            const dataToSave = {
                layers: layersData,
                lastUpdated: timestamp,
                version: '2.0'
            };

            // Add profile name if provided
            if (profileName) {
                dataToSave.name = profileName;
            }

            await profileRef.set(dataToSave);
            console.log(`Data saved to Firebase for profile ${this.currentProfileId}`);
            eventBus.emit('firebase.saved', { timestamp, profileId: this.currentProfileId });
            return { success: true, timestamp };
        } catch (error) {
            console.error('Error saving to Firebase:', error);
            eventBus.emit('firebase.error', { operation: 'save', error });
            throw error;
        }
    }

    /**
     * Load all layers from Firebase (profile-aware)
     * @returns {Promise<Object>}
     */
    async loadAllLayers() {
        try {
            const profileRef = this.getCurrentProfileRef();
            const snapshot = await profileRef.once('value');
            const data = snapshot.val();

            if (data && data.layers) {
                console.log(`Data loaded from Firebase for profile ${this.currentProfileId}`);
                eventBus.emit('firebase.loaded', {
                    layerCount: Object.keys(data.layers).length,
                    profileId: this.currentProfileId
                });
                return {
                    success: true,
                    layers: data.layers,
                    lastUpdated: data.lastUpdated,
                    profileName: data.name || null
                };
            } else {
                console.log('No data found in Firebase for this profile');
                return { success: true, layers: {}, lastUpdated: null };
            }
        } catch (error) {
            console.error('Error loading from Firebase:', error);
            eventBus.emit('firebase.error', { operation: 'load', error });
            throw error;
        }
    }

    /**
     * Save a single layer to Firebase
     * @param {string} layerId - Layer ID
     * @param {Object} layerData - Layer data
     * @returns {Promise}
     */
    async saveLayer(layerId, layerData) {
        try {
            const timestamp = Utils.formatDate();
            const dataToSave = {
                ...layerData,
                lastUpdated: timestamp
            };

            await this.layersRef.child(layerId).set(dataToSave);
            console.log(`Layer ${layerId} saved to Firebase`);
            return { success: true, timestamp };
        } catch (error) {
            console.error(`Error saving layer ${layerId}:`, error);
            throw error;
        }
    }

    /**
     * Delete a layer from Firebase
     * @param {string} layerId - Layer ID
     * @returns {Promise}
     */
    async deleteLayer(layerId) {
        try {
            await this.layersRef.child(layerId).remove();
            console.log(`Layer ${layerId} deleted from Firebase`);
            return { success: true };
        } catch (error) {
            console.error(`Error deleting layer ${layerId}:`, error);
            throw error;
        }
    }

    /**
     * Update a feature in a layer
     * @param {string} layerId - Layer ID
     * @param {string} featureId - Feature ID
     * @param {Object} featureData - Updated feature data
     * @returns {Promise}
     */
    async updateFeature(layerId, featureId, featureData) {
        try {
            const timestamp = Utils.formatDate();
            await this.layersRef.child(layerId).child('features').child(featureId).update({
                ...featureData,
                lastUpdated: timestamp
            });
            console.log(`Feature ${featureId} in layer ${layerId} updated`);
            return { success: true, timestamp };
        } catch (error) {
            console.error(`Error updating feature ${featureId}:`, error);
            throw error;
        }
    }

    /**
     * Delete a feature from a layer
     * @param {string} layerId - Layer ID
     * @param {string} featureId - Feature ID
     * @returns {Promise}
     */
    async deleteFeature(layerId, featureId) {
        try {
            await this.layersRef.child(layerId).child('features').child(featureId).remove();
            console.log(`Feature ${featureId} deleted from layer ${layerId}`);
            return { success: true };
        } catch (error) {
            console.error(`Error deleting feature ${featureId}:`, error);
            throw error;
        }
    }

    /**
     * Listen for real-time updates to layers (profile-aware)
     * @param {Function} callback - Callback function to handle updates
     */
    listenForUpdates(callback) {
        if (!this.currentProfileId) {
            console.warn('No profile selected for listening to updates');
            return;
        }

        const profileRef = this.getCurrentProfileRef();
        profileRef.on('value', (snapshot) => {
            try {
                const data = snapshot.val();
                if (data && data.layers) {
                    callback(data.layers);
                }
            } catch (error) {
                console.error('Error in real-time listener callback:', error);
                // Emit error event for app-level handling
                if (window.eventBus) {
                    eventBus.emit('firebase.listener.error', { error });
                }
            }
        });
    }

    /**
     * Stop listening for updates
     */
    stopListening() {
        if (this.currentProfileId) {
            this.getCurrentProfileRef().off();
        }
    }

    /**
     * Get database reference for custom queries
     * @returns {firebase.database.Reference}
     */
    getReference() {
        return this.dataRef;
    }

    // ==================== PROFILE MANAGEMENT ====================

    /**
     * Create a new profile
     * @param {string} profileName - Name of the profile
     * @returns {Promise<Object>} Created profile info
     */
    async createProfile(profileName) {
        try {
            const profileId = 'profile_' + Utils.generateId();
            const timestamp = Utils.formatDate();

            const profileData = {
                name: profileName,
                layers: {},
                _groups: [],
                createdAt: timestamp,
                lastUpdated: timestamp,
                version: '2.0'
            };

            await this.profilesRef.child(profileId).set(profileData);
            console.log(`Profile ${profileName} created with ID ${profileId}`);

            eventBus.emit('profile.created', { profileId, profileName });

            return {
                success: true,
                profileId,
                profileName,
                createdAt: timestamp
            };
        } catch (error) {
            console.error('Error creating profile:', error);
            throw error;
        }
    }

    /**
     * Get all profiles
     * @returns {Promise<Array>} List of profiles
     */
    async getAllProfiles() {
        try {
            const snapshot = await this.profilesRef.once('value');
            const data = snapshot.val();

            if (!data) {
                return [];
            }

            const profiles = Object.keys(data).map(profileId => ({
                id: profileId,
                name: data[profileId].name || 'Unnamed Profile',
                createdAt: data[profileId].createdAt,
                lastUpdated: data[profileId].lastUpdated,
                layerCount: data[profileId].layers ? Object.keys(data[profileId].layers).length - (data[profileId].layers._groups ? 1 : 0) : 0
            }));

            return profiles;
        } catch (error) {
            console.error('Error loading profiles:', error);
            throw error;
        }
    }

    /**
     * Delete a profile
     * @param {string} profileId - Profile ID to delete
     * @returns {Promise<Object>}
     */
    async deleteProfile(profileId) {
        try {
            await this.profilesRef.child(profileId).remove();
            console.log(`Profile ${profileId} deleted`);

            eventBus.emit('profile.deleted', { profileId });

            return { success: true };
        } catch (error) {
            console.error('Error deleting profile:', error);
            throw error;
        }
    }

    /**
     * Rename a profile
     * @param {string} profileId - Profile ID
     * @param {string} newName - New name
     * @returns {Promise<Object>}
     */
    async renameProfile(profileId, newName) {
        try {
            await this.profilesRef.child(profileId).update({
                name: newName,
                lastUpdated: Utils.formatDate()
            });

            console.log(`Profile ${profileId} renamed to ${newName}`);
            eventBus.emit('profile.renamed', { profileId, newName });

            return { success: true };
        } catch (error) {
            console.error('Error renaming profile:', error);
            throw error;
        }
    }

    /**
     * Migrate old data structure to profile-based structure
     * @param {string} defaultProfileName - Name for the default profile
     * @returns {Promise<Object>}
     */
    async migrateToProfiles(defaultProfileName = 'Default Workspace') {
        try {
            // Check if old data exists
            const oldDataSnapshot = await this.dataRef.once('value');
            const oldData = oldDataSnapshot.val();

            // Check if already migrated (has profiles)
            if (oldData && oldData.profiles) {
                console.log('Data already migrated to profiles');
                return { success: true, alreadyMigrated: true };
            }

            // If no old data or only profiles, nothing to migrate
            if (!oldData || !oldData.layers) {
                console.log('No old data to migrate');
                return { success: true, noDataToMigrate: true };
            }

            // Create default profile with old data
            const profileId = 'profile_' + Utils.generateId();
            const timestamp = Utils.formatDate();

            const profileData = {
                name: defaultProfileName,
                layers: oldData.layers,
                version: oldData.version || '2.0',
                createdAt: timestamp,
                lastUpdated: oldData.lastUpdated || timestamp
            };

            // Save to new profile structure
            await this.profilesRef.child(profileId).set(profileData);

            console.log(`Migration complete. Old data moved to profile: ${defaultProfileName}`);

            return {
                success: true,
                migrated: true,
                profileId,
                profileName: defaultProfileName
            };
        } catch (error) {
            console.error('Error migrating to profiles:', error);
            throw error;
        }
    }
}

// Create and export Firebase manager instance
const firebaseManager = new FirebaseManager();
