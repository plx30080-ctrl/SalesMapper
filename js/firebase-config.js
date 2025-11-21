/**
 * Firebase Configuration and Database Manager
 * Handles all Firebase Realtime Database operations
 */

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCmGwFI88fAzx3zddzqyYguS4OAGOmprME",
    authDomain: "ebsalesmapping.firebaseapp.com",
    projectId: "ebsalesmapping",
    storageBucket: "ebsalesmapping.firebasestorage.app",
    messagingSenderId: "623364027452",
    appId: "1:623364027452:web:b152a2c17ae2b5b5d7ff39",
    measurementId: "G-9X2LB8LH84"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

/**
 * Firebase Database Manager
 */
class FirebaseManager {
    constructor() {
        this.db = database;
        this.dataRef = this.db.ref('salesTerritoryData');
        this.layersRef = this.db.ref('layers');
    }

    /**
     * Save all layers to Firebase
     * @param {Object} layersData - Object containing all layers data
     * @returns {Promise}
     */
    async saveAllLayers(layersData) {
        try {
            const timestamp = new Date().toISOString();
            const dataToSave = {
                layers: layersData,
                lastUpdated: timestamp,
                version: '1.0'
            };

            await this.dataRef.set(dataToSave);
            console.log('Data saved to Firebase successfully');
            return { success: true, timestamp };
        } catch (error) {
            console.error('Error saving to Firebase:', error);
            throw error;
        }
    }

    /**
     * Load all layers from Firebase
     * @returns {Promise<Object>}
     */
    async loadAllLayers() {
        try {
            const snapshot = await this.dataRef.once('value');
            const data = snapshot.val();

            if (data && data.layers) {
                console.log('Data loaded from Firebase successfully');
                return {
                    success: true,
                    layers: data.layers,
                    lastUpdated: data.lastUpdated
                };
            } else {
                console.log('No data found in Firebase');
                return { success: true, layers: {}, lastUpdated: null };
            }
        } catch (error) {
            console.error('Error loading from Firebase:', error);
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
            const timestamp = new Date().toISOString();
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
            const timestamp = new Date().toISOString();
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
     * Listen for real-time updates to layers
     * @param {Function} callback - Callback function to handle updates
     */
    listenForUpdates(callback) {
        this.dataRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data && data.layers) {
                callback(data.layers);
            }
        });
    }

    /**
     * Stop listening for updates
     */
    stopListening() {
        this.dataRef.off();
    }

    /**
     * Get database reference for custom queries
     * @returns {firebase.database.Reference}
     */
    getReference() {
        return this.dataRef;
    }
}

// Create and export Firebase manager instance
const firebaseManager = new FirebaseManager();
