/**
 * Data Services
 * Abstraction layer for data persistence (localStorage, Firebase, etc.)
 */

/**
 * Storage Service
 * Handles localStorage operations with error handling
 */
class StorageService {
    constructor(storageKey = 'app_data') {
        this.storageKey = storageKey;
        this.isAvailable = this.checkAvailability();
    }

    /**
     * Check if localStorage is available
     * @returns {boolean} True if available
     */
    checkAvailability() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (error) {
            console.warn('localStorage not available:', error);
            return false;
        }
    }

    /**
     * Get item from storage
     * @param {string} key - Storage key
     * @param {*} defaultValue - Default value if not found
     * @returns {*} Stored value or default
     */
    get(key, defaultValue = null) {
        if (!this.isAvailable) return defaultValue;

        try {
            const fullKey = `${this.storageKey}_${key}`;
            const item = localStorage.getItem(fullKey);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error(`Error getting ${key} from storage:`, error);
            return defaultValue;
        }
    }

    /**
     * Set item in storage
     * @param {string} key - Storage key
     * @param {*} value - Value to store
     * @returns {boolean} Success
     */
    set(key, value) {
        if (!this.isAvailable) return false;

        try {
            const fullKey = `${this.storageKey}_${key}`;
            localStorage.setItem(fullKey, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error(`Error setting ${key} in storage:`, error);

            // Handle quota exceeded error
            if (error.name === 'QuotaExceededError') {
                console.warn('Storage quota exceeded. Consider clearing old data.');
            }

            return false;
        }
    }

    /**
     * Remove item from storage
     * @param {string} key - Storage key
     * @returns {boolean} Success
     */
    remove(key) {
        if (!this.isAvailable) return false;

        try {
            const fullKey = `${this.storageKey}_${key}`;
            localStorage.removeItem(fullKey);
            return true;
        } catch (error) {
            console.error(`Error removing ${key} from storage:`, error);
            return false;
        }
    }

    /**
     * Clear all storage for this app
     * @returns {boolean} Success
     */
    clear() {
        if (!this.isAvailable) return false;

        try {
            // Only clear items with our prefix
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.storageKey)) {
                    keysToRemove.push(key);
                }
            }

            keysToRemove.forEach(key => localStorage.removeItem(key));
            return true;
        } catch (error) {
            console.error('Error clearing storage:', error);
            return false;
        }
    }

    /**
     * Get all keys
     * @returns {Array} Array of keys
     */
    keys() {
        if (!this.isAvailable) return [];

        const keys = [];
        const prefix = `${this.storageKey}_`;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                keys.push(key.substring(prefix.length));
            }
        }

        return keys;
    }

    /**
     * Get storage size estimate (in bytes)
     * @returns {number} Estimated size in bytes
     */
    getSize() {
        if (!this.isAvailable) return 0;

        let size = 0;
        const prefix = `${this.storageKey}_`;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                const value = localStorage.getItem(key);
                size += key.length + (value ? value.length : 0);
            }
        }

        return size;
    }

    /**
     * Get storage info
     * @returns {Object} Storage information
     */
    getInfo() {
        return {
            available: this.isAvailable,
            keys: this.keys().length,
            estimatedSize: this.getSize(),
            estimatedSizeFormatted: Utils.formatFileSize(this.getSize())
        };
    }
}

/**
 * Firebase Service
 * Handles Firebase Realtime Database operations
 */
class FirebaseService {
    constructor(firebaseManager) {
        this.firebaseManager = firebaseManager;
        this.isConnected = false;
        this.listeners = new Map();
    }

    /**
     * Check if Firebase is available
     * @returns {boolean} True if available
     */
    isAvailable() {
        return this.firebaseManager && this.firebaseManager.db;
    }

    /**
     * Save data to Firebase
     * @param {string} path - Firebase path
     * @param {*} data - Data to save
     * @returns {Promise<boolean>} Success
     */
    async save(path, data) {
        if (!this.isAvailable()) {
            console.warn('Firebase not available');
            return false;
        }

        try {
            const ref = this.firebaseManager.db.ref(path);
            await ref.set({
                ...data,
                lastUpdated: Utils.formatDate(),
                version: '2.0'
            });

            console.log(`Data saved to Firebase: ${path}`);
            return true;
        } catch (error) {
            console.error(`Error saving to Firebase (${path}):`, error);
            return false;
        }
    }

    /**
     * Load data from Firebase
     * @param {string} path - Firebase path
     * @returns {Promise<*>} Data or null
     */
    async load(path) {
        if (!this.isAvailable()) {
            console.warn('Firebase not available');
            return null;
        }

        try {
            const ref = this.firebaseManager.db.ref(path);
            const snapshot = await ref.once('value');
            const data = snapshot.val();

            console.log(`Data loaded from Firebase: ${path}`);
            return data;
        } catch (error) {
            console.error(`Error loading from Firebase (${path}):`, error);
            return null;
        }
    }

    /**
     * Delete data from Firebase
     * @param {string} path - Firebase path
     * @returns {Promise<boolean>} Success
     */
    async delete(path) {
        if (!this.isAvailable()) {
            console.warn('Firebase not available');
            return false;
        }

        try {
            const ref = this.firebaseManager.db.ref(path);
            await ref.remove();

            console.log(`Data deleted from Firebase: ${path}`);
            return true;
        } catch (error) {
            console.error(`Error deleting from Firebase (${path}):`, error);
            return false;
        }
    }

    /**
     * Update data in Firebase
     * @param {string} path - Firebase path
     * @param {Object} updates - Updates to apply
     * @returns {Promise<boolean>} Success
     */
    async update(path, updates) {
        if (!this.isAvailable()) {
            console.warn('Firebase not available');
            return false;
        }

        try {
            const ref = this.firebaseManager.db.ref(path);
            await ref.update({
                ...updates,
                lastUpdated: Utils.formatDate()
            });

            console.log(`Data updated in Firebase: ${path}`);
            return true;
        } catch (error) {
            console.error(`Error updating Firebase (${path}):`, error);
            return false;
        }
    }

    /**
     * Listen for changes
     * @param {string} path - Firebase path
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    listen(path, callback) {
        if (!this.isAvailable()) {
            console.warn('Firebase not available');
            return () => {};
        }

        const ref = this.firebaseManager.db.ref(path);

        const listener = ref.on('value', (snapshot) => {
            const data = snapshot.val();
            callback(data);
        });

        // Store listener for cleanup
        this.listeners.set(path, { ref, listener });

        console.log(`Started listening to Firebase: ${path}`);

        // Return unsubscribe function
        return () => {
            ref.off('value', listener);
            this.listeners.delete(path);
            console.log(`Stopped listening to Firebase: ${path}`);
        };
    }

    /**
     * Stop all listeners
     */
    stopAllListeners() {
        this.listeners.forEach(({ ref, listener }, path) => {
            ref.off('value', listener);
        });
        this.listeners.clear();
        console.log('Stopped all Firebase listeners');
    }

    /**
     * Get connection status
     * @returns {Promise<boolean>} True if connected
     */
    async checkConnection() {
        if (!this.isAvailable()) {
            return false;
        }

        try {
            const ref = this.firebaseManager.db.ref('.info/connected');
            const snapshot = await ref.once('value');
            this.isConnected = snapshot.val() === true;
            return this.isConnected;
        } catch (error) {
            console.error('Error checking Firebase connection:', error);
            this.isConnected = false;
            return false;
        }
    }
}

/**
 * Data Sync Service
 * Coordinates syncing between localStorage and Firebase
 */
class DataSyncService {
    constructor(storageService, firebaseService) {
        this.storage = storageService;
        this.firebase = firebaseService;
        this.syncInProgress = false;
        this.lastSyncTime = null;
    }

    /**
     * Save data with automatic sync
     * @param {string} key - Data key
     * @param {*} data - Data to save
     * @param {boolean} syncToFirebase - Also sync to Firebase
     * @returns {Promise<boolean>} Success
     */
    async save(key, data, syncToFirebase = true) {
        // Always save to localStorage first
        const localSuccess = this.storage.set(key, data);

        if (!localSuccess) {
            console.error('Failed to save to localStorage');
            return false;
        }

        // Optionally sync to Firebase
        if (syncToFirebase && this.firebase.isAvailable()) {
            const firebaseSuccess = await this.firebase.save(key, data);
            if (!firebaseSuccess) {
                console.warn('Failed to sync to Firebase, but local save succeeded');
            }
        }

        this.lastSyncTime = Utils.formatDate();
        return true;
    }

    /**
     * Load data with fallback
     * @param {string} key - Data key
     * @param {boolean} preferFirebase - Prefer Firebase over localStorage
     * @returns {Promise<*>} Data or null
     */
    async load(key, preferFirebase = false) {
        // Try Firebase first if preferred and available
        if (preferFirebase && this.firebase.isAvailable()) {
            const firebaseData = await this.firebase.load(key);
            if (firebaseData) {
                // Update localStorage with Firebase data
                this.storage.set(key, firebaseData);
                return firebaseData;
            }
        }

        // Try localStorage
        const localData = this.storage.get(key);
        if (localData) {
            return localData;
        }

        // Fallback to Firebase if not in localStorage
        if (!preferFirebase && this.firebase.isAvailable()) {
            const firebaseData = await this.firebase.load(key);
            if (firebaseData) {
                // Update localStorage with Firebase data
                this.storage.set(key, firebaseData);
                return firebaseData;
            }
        }

        return null;
    }

    /**
     * Sync localStorage to Firebase
     * @returns {Promise<boolean>} Success
     */
    async syncToFirebase() {
        if (this.syncInProgress) {
            console.warn('Sync already in progress');
            return false;
        }

        if (!this.firebase.isAvailable()) {
            console.warn('Firebase not available for sync');
            return false;
        }

        this.syncInProgress = true;

        try {
            const keys = this.storage.keys();
            const syncPromises = keys.map(key => {
                const data = this.storage.get(key);
                return this.firebase.save(key, data);
            });

            await Promise.all(syncPromises);
            this.lastSyncTime = Utils.formatDate();

            console.log(`Synced ${keys.length} items to Firebase`);
            return true;
        } catch (error) {
            console.error('Error syncing to Firebase:', error);
            return false;
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * Sync Firebase to localStorage
     * @param {Array} keys - Keys to sync (if empty, sync all)
     * @returns {Promise<boolean>} Success
     */
    async syncFromFirebase(keys = []) {
        if (this.syncInProgress) {
            console.warn('Sync already in progress');
            return false;
        }

        if (!this.firebase.isAvailable()) {
            console.warn('Firebase not available for sync');
            return false;
        }

        this.syncInProgress = true;

        try {
            const keysToSync = keys.length > 0 ? keys : this.storage.keys();
            const syncPromises = keysToSync.map(async (key) => {
                const data = await this.firebase.load(key);
                if (data) {
                    this.storage.set(key, data);
                }
            });

            await Promise.all(syncPromises);
            this.lastSyncTime = Utils.formatDate();

            console.log(`Synced ${keysToSync.length} items from Firebase`);
            return true;
        } catch (error) {
            console.error('Error syncing from Firebase:', error);
            return false;
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * Clear all data (localStorage and Firebase)
     * @returns {Promise<boolean>} Success
     */
    async clearAll() {
        const localSuccess = this.storage.clear();

        if (this.firebase.isAvailable()) {
            const keys = this.storage.keys();
            const deletePromises = keys.map(key => this.firebase.delete(key));
            await Promise.all(deletePromises);
        }

        return localSuccess;
    }

    /**
     * Get sync status
     * @returns {Object} Sync status
     */
    getStatus() {
        return {
            storageAvailable: this.storage.isAvailable,
            firebaseAvailable: this.firebase.isAvailable(),
            firebaseConnected: this.firebase.isConnected,
            syncInProgress: this.syncInProgress,
            lastSyncTime: this.lastSyncTime,
            storageInfo: this.storage.getInfo()
        };
    }
}

// Create singleton instances
// Note: These will be initialized later when firebaseManager is available
let storageService;
let firebaseService;
let dataSyncService;

/**
 * Initialize data services
 * @param {Object} firebaseManager - Firebase manager instance
 */
function initializeDataServices(firebaseManager) {
    storageService = new StorageService(AppConfig.storage.localStorageKey);
    firebaseService = new FirebaseService(firebaseManager);
    dataSyncService = new DataSyncService(storageService, firebaseService);

    console.log('Data services initialized');

    return {
        storageService,
        firebaseService,
        dataSyncService
    };
}
