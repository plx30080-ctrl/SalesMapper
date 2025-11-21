/**
 * Main Application
 * Coordinates all components and handles user interactions
 */

// Azure Maps subscription key
const AZURE_MAPS_KEY = '8zaoREb1sCrPeAeKbs8051yFk7WFAB1O8i4CzIpVvLJicQqszva4JQQJ99BKACYeBjFmJl7UAAAgAZMP3wj3';

// Global instances
let mapManager;
let layerManager;
let csvParser;
let geocodingService;
let currentEditingFeature = null;
let currentCSVData = null; // Store CSV data for geocoding
let realtimeListenerEnabled = false;

/**
 * Initialize the application
 */
async function initializeApp() {
    showLoading('Initializing application...');

    try {
        // Initialize components
        mapManager = new MapManager('azureMap', AZURE_MAPS_KEY);
        await mapManager.initialize();

        layerManager = new LayerManager(mapManager);
        csvParser = new CSVParser();
        geocodingService = new GeocodingService(AZURE_MAPS_KEY);

        // Setup event listeners
        setupEventListeners();

        // Setup map feature click handler
        mapManager.setOnFeatureClick(handleFeatureSelection);

        // Setup layer update handler
        layerManager.setOnLayerUpdate(updateLayerList);

        // Setup drawing complete handler
        mapManager.setOnDrawComplete(handleDrawingComplete);

        // Setup real-time Firebase listener
        enableRealtimeSync();

        console.log('Application initialized successfully');
        hideLoading();

        showToast('Application ready! Upload a CSV to get started.', 'success');
    } catch (error) {
        console.error('Error initializing application:', error);
        hideLoading();
        showToast('Error initializing application: ' + error.message, 'error');
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // CSV Upload
    document.getElementById('uploadBtn').addEventListener('click', handleCSVUpload);
    document.getElementById('csvFileInput').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            document.getElementById('uploadBtn').disabled = false;
        }
    });

    // Address Search
    document.getElementById('searchBtn').addEventListener('click', handleAddressSearch);
    document.getElementById('addressSearch').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleAddressSearch();
        }
    });

    // Drawing Tools
    document.getElementById('drawPointBtn').addEventListener('click', () => startDrawingMode('point'));
    document.getElementById('drawPolygonBtn').addEventListener('click', () => startDrawingMode('polygon'));
    document.getElementById('deleteDrawingBtn').addEventListener('click', handleDeleteDrawing);

    // Layer Management
    document.getElementById('createLayerBtn').addEventListener('click', handleCreateLayer);

    // Filtering
    document.getElementById('applyFilterBtn').addEventListener('click', handleApplyFilter);
    document.getElementById('clearFilterBtn').addEventListener('click', handleClearFilter);

    // Sorting
    document.getElementById('sortAscBtn').addEventListener('click', () => handleSort('asc'));
    document.getElementById('sortDescBtn').addEventListener('click', () => handleSort('desc'));

    // Firebase
    document.getElementById('saveToFirebase').addEventListener('click', handleSaveToFirebase);
    document.getElementById('loadFromFirebase').addEventListener('click', handleLoadFromFirebase);

    // Map Controls
    document.getElementById('zoomIn').addEventListener('click', () => mapManager.zoomIn());
    document.getElementById('zoomOut').addEventListener('click', () => mapManager.zoomOut());
    document.getElementById('resetView').addEventListener('click', () => mapManager.resetView());

    // Edit Modal
    document.getElementById('cancelEdit').addEventListener('click', closeEditModal);
    document.getElementById('deleteFeature').addEventListener('click', handleDeleteFeature);
    document.getElementById('editForm').addEventListener('submit', handleEditFormSubmit);

    // Column Mapping Modal
    document.getElementById('columnMapForm').addEventListener('submit', handleColumnMapSubmit);
    document.getElementById('cancelMapping').addEventListener('click', closeColumnMapModal);

    // Modal close buttons
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = e.target.dataset.modal;
            if (modalId) {
                document.getElementById(modalId).classList.remove('show');
            }
        });
    });

    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('show');
        }
    });
}

/**
 * Handle address search
 */
async function handleAddressSearch() {
    const searchInput = document.getElementById('addressSearch');
    const query = searchInput.value.trim();

    if (!query) {
        showToast('Please enter an address to search', 'warning');
        return;
    }

    showLoading('Searching for address...');

    try {
        const result = await mapManager.searchAddress(query);

        hideLoading();

        if (result.success) {
            showToast(`Found: ${result.address}`, 'success');
            searchInput.value = '';
        } else {
            showToast(`No results found for "${query}"`, 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Error searching address: ' + error.message, 'error');
    }
}

/**
 * Start drawing mode
 * @param {string} type - Type of drawing ('point' or 'polygon')
 */
function startDrawingMode(type) {
    const mode = type === 'point' ? 'draw-point' : 'draw-polygon';
    mapManager.startDrawing(mode);

    const statusText = type === 'point' ? 'Click on the map to add a point' : 'Click to draw polygon vertices';
    document.getElementById('drawingStatus').textContent = statusText;

    showToast(`Drawing mode: ${type}. Click on map to draw.`, 'info');
}

/**
 * Handle drawing complete
 * @param {Object} shape - Drawn shape
 */
function handleDrawingComplete(shape) {
    mapManager.stopDrawing();
    document.getElementById('drawingStatus').textContent = 'Select a tool to start drawing';

    // Prompt for feature name
    const name = prompt('Enter a name for this feature:', 'New Feature');

    if (!name) {
        // User cancelled, remove the shape
        mapManager.clearDrawings();
        return;
    }

    // Get shape properties
    const geometry = shape.toJson();
    const properties = {
        name: name,
        id: `drawn_${Date.now()}`,
        source: 'manual'
    };

    // Determine layer to add to
    const layers = layerManager.getAllLayers();
    let targetLayerId;

    if (layers.length === 0) {
        // Create new layer
        targetLayerId = layerManager.createLayer('Drawn Features');
    } else {
        // Use first layer or prompt
        targetLayerId = layers[0].id;
    }

    // Create feature
    const feature = {
        ...properties,
        ...geometry
    };

    // Add to layer
    const layer = layerManager.getLayer(targetLayerId);
    if (layer) {
        layer.features.push(feature);
        layerManager.notifyUpdate();
    }

    // Clear drawing
    mapManager.clearDrawings();

    showToast('Feature added successfully', 'success');
}

/**
 * Handle delete drawing
 */
function handleDeleteDrawing() {
    const deleted = mapManager.deleteSelectedDrawing();

    if (deleted) {
        showToast('Drawing deleted', 'success');
    } else {
        showToast('No drawing selected. Click on a drawn feature first.', 'warning');
    }
}

/**
 * Handle CSV file upload
 */
async function handleCSVUpload() {
    const fileInput = document.getElementById('csvFileInput');
    const file = fileInput.files[0];

    if (!file) {
        showToast('Please select a CSV file', 'warning');
        return;
    }

    showLoading('Parsing CSV file...');

    try {
        // Parse CSV
        const parsed = await csvParser.parseFile(file);

        console.log('CSV parsed:', parsed);

        // Check if geocoding is needed
        if (parsed.needsGeocoding) {
            hideLoading();

            // Store CSV data
            currentCSVData = parsed;

            // Auto-detect address columns
            const detectedMapping = geocodingService.detectAddressColumns(parsed.originalColumns);

            // Show column mapping modal
            showColumnMapModal(parsed.originalColumns, detectedMapping);
            return;
        }

        // Prompt for layer name
        const layerName = prompt('Enter layer name:', file.name.replace('.csv', ''));

        if (!layerName) {
            hideLoading();
            return;
        }

        // Create layer with features
        const layerId = layerManager.createLayer(layerName, parsed.features, parsed.type, {
            sourceFile: file.name,
            columnMap: parsed.columnMap,
            importDate: new Date().toISOString()
        });

        hideLoading();
        showToast(`Layer "${layerName}" created with ${parsed.features.length} features`, 'success');

        // Clear file input
        fileInput.value = '';
        document.getElementById('uploadBtn').disabled = true;

        // Update filter/sort dropdowns with new columns
        updateColumnSelects();
    } catch (error) {
        console.error('Error uploading CSV:', error);
        hideLoading();
        showToast('Error parsing CSV: ' + error.message, 'error');
    }
}

/**
 * Show column mapping modal
 * @param {Array} columns - Available columns
 * @param {Object} detectedMapping - Auto-detected column mapping
 */
function showColumnMapModal(columns, detectedMapping) {
    const modal = document.getElementById('columnMapModal');

    // Populate dropdowns
    const selects = ['street1Column', 'street2Column', 'cityColumn', 'stateColumn', 'zipColumn'];

    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        select.innerHTML = selectId === 'street1Column' || selectId === 'cityColumn' || selectId === 'zipColumn'
            ? '<option value="">-- Select Column --</option>'
            : '<option value="">-- None --</option>';

        columns.forEach(col => {
            const option = document.createElement('option');
            option.value = col;
            option.textContent = col;
            select.appendChild(option);
        });

        // Set detected value if available
        const mappingKey = selectId.replace('Column', '');
        if (detectedMapping[mappingKey]) {
            select.value = detectedMapping[mappingKey];
        }
    });

    modal.classList.add('show');
}

/**
 * Close column map modal
 */
function closeColumnMapModal() {
    document.getElementById('columnMapModal').classList.remove('show');
    currentCSVData = null;
}

/**
 * Handle column mapping form submission
 */
async function handleColumnMapSubmit(e) {
    e.preventDefault();

    if (!currentCSVData) {
        showToast('No CSV data available', 'error');
        return;
    }

    // Get column mapping
    const columnMapping = {
        street1: document.getElementById('street1Column').value,
        street2: document.getElementById('street2Column').value,
        city: document.getElementById('cityColumn').value,
        state: document.getElementById('stateColumn').value,
        zip: document.getElementById('zipColumn').value
    };

    // Validate required fields
    if (!columnMapping.street1 || !columnMapping.city || !columnMapping.zip) {
        showToast('Please select at least Street, City, and Zip columns', 'warning');
        return;
    }

    // Close modal
    closeColumnMapModal();

    // Show geocoding progress modal
    showGeocodingModal();

    // Start geocoding
    try {
        const geocodedFeatures = await geocodingService.geocodeBatch(
            currentCSVData.rawData,
            columnMapping,
            updateGeocodingProgress
        );

        // Get statistics
        const stats = geocodingService.getStatistics(geocodedFeatures);

        // Close geocoding modal
        closeGeocodingModal();

        // Prompt for layer name
        const layerName = prompt(
            `Geocoding complete! ${stats.successful} of ${stats.total} addresses geocoded.\nEnter layer name:`,
            'Geocoded Locations'
        );

        if (!layerName) {
            currentCSVData = null;
            return;
        }

        // Filter out failed geocodes
        const validFeatures = geocodedFeatures.filter(f => f.latitude && f.longitude);

        // Create layer
        const layerId = layerManager.createLayer(layerName, validFeatures, 'point', {
            sourceFile: currentCSVData.originalColumns,
            geocoded: true,
            geocodingStats: stats,
            columnMapping: columnMapping,
            importDate: new Date().toISOString()
        });

        showToast(`Layer "${layerName}" created with ${validFeatures.length} geocoded locations`, 'success');

        // Update filter/sort dropdowns
        updateColumnSelects();

        // Clear stored data
        currentCSVData = null;

        // Clear file input
        const fileInput = document.getElementById('csvFileInput');
        fileInput.value = '';
        document.getElementById('uploadBtn').disabled = true;

    } catch (error) {
        console.error('Error geocoding:', error);
        closeGeocodingModal();
        showToast('Error geocoding addresses: ' + error.message, 'error');
    }
}

/**
 * Show geocoding progress modal
 */
function showGeocodingModal() {
    const modal = document.getElementById('geocodingModal');
    modal.classList.add('show');

    // Reset progress
    document.getElementById('geocodingProgress').style.width = '0%';
    document.getElementById('geocodingProgress').textContent = '';
    document.getElementById('geocodingStatus').textContent = 'Starting geocoding...';
    document.getElementById('geocodingStats').textContent = '';
}

/**
 * Close geocoding modal
 */
function closeGeocodingModal() {
    document.getElementById('geocodingModal').classList.remove('show');
}

/**
 * Update geocoding progress
 * @param {Object} progress - Progress information
 */
function updateGeocodingProgress(progress) {
    const progressBar = document.getElementById('geocodingProgress');
    const statusText = document.getElementById('geocodingStatus');
    const statsText = document.getElementById('geocodingStats');

    progressBar.style.width = progress.percentage + '%';
    progressBar.textContent = Math.round(progress.percentage) + '%';

    statusText.textContent = `Geocoding: ${progress.current} of ${progress.total}`;
    statsText.textContent = `Success: ${progress.successCount} | Failed: ${progress.errorCount}`;
}

/**
 * Handle create empty layer
 */
function handleCreateLayer() {
    const nameInput = document.getElementById('newLayerName');
    const name = nameInput.value.trim();

    if (!name) {
        showToast('Please enter a layer name', 'warning');
        return;
    }

    // Create empty layer
    layerManager.createLayer(name);

    showToast(`Layer "${name}" created`, 'success');

    // Clear input
    nameInput.value = '';
}

/**
 * Update layer list in sidebar
 */
function updateLayerList(layers) {
    const layerList = document.getElementById('layerList');
    layerList.innerHTML = '';

    if (layers.length === 0) {
        layerList.innerHTML = '<p class="empty-state">No layers yet. Upload a CSV to create one.</p>';
        return;
    }

    layers.forEach(layer => {
        const layerItem = createLayerItem(layer);
        layerList.appendChild(layerItem);
    });

    // Update legend
    updateLegend(layers);
}

/**
 * Create layer item element
 */
function createLayerItem(layer) {
    const div = document.createElement('div');
    div.className = 'layer-item';
    div.dataset.layerId = layer.id;

    div.innerHTML = `
        <div class="layer-info">
            <input type="checkbox" class="layer-checkbox" ${layer.visible ? 'checked' : ''}>
            <span class="layer-name">${layer.name}</span>
            <span class="layer-count">${layer.features.length}</span>
        </div>
        <div class="layer-actions">
            <button class="layer-btn zoom" title="Zoom to layer">🔍</button>
            <button class="layer-btn export" title="Export layer">📥</button>
            <button class="layer-btn delete" title="Delete layer">🗑️</button>
        </div>
    `;

    // Visibility toggle
    div.querySelector('.layer-checkbox').addEventListener('change', (e) => {
        e.stopPropagation();
        layerManager.toggleLayerVisibility(layer.id);
    });

    // Zoom to layer
    div.querySelector('.zoom').addEventListener('click', (e) => {
        e.stopPropagation();
        const dataSource = mapManager.dataSources.get(layer.id);
        if (dataSource) {
            mapManager.fitMapToDataSource(dataSource);
        }
    });

    // Export layer
    div.querySelector('.export').addEventListener('click', (e) => {
        e.stopPropagation();
        const features = layerManager.getLayer(layer.id).features;
        csvParser.exportToCSV(features, `${layer.name}.csv`);
        showToast(`Layer "${layer.name}" exported`, 'success');
    });

    // Delete layer
    div.querySelector('.delete').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete layer "${layer.name}"?`)) {
            layerManager.deleteLayer(layer.id);
            showToast(`Layer "${layer.name}" deleted`, 'success');
        }
    });

    return div;
}

/**
 * Update map legend
 */
function updateLegend(layers) {
    const legendContent = document.getElementById('legendContent');
    legendContent.innerHTML = '';

    const visibleLayers = layers.filter(l => l.visible);

    if (visibleLayers.length === 0) {
        legendContent.innerHTML = '<p class="empty-state">No visible layers</p>';
        return;
    }

    visibleLayers.forEach(layer => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
            <div class="legend-color" style="background-color: ${layer.color}"></div>
            <span>${layer.name} (${layer.features.length})</span>
        `;
        legendContent.appendChild(item);
    });
}

/**
 * Handle feature selection on map
 */
function handleFeatureSelection(selectedFeature) {
    currentEditingFeature = selectedFeature;

    // Update feature info panel
    updateFeatureInfo(selectedFeature.properties);

    console.log('Feature selected:', selectedFeature);
}

/**
 * Update feature info panel
 */
function updateFeatureInfo(properties) {
    const featureInfo = document.getElementById('featureInfo');
    featureInfo.innerHTML = '';

    for (let [key, value] of Object.entries(properties)) {
        if (key !== 'layerId' && value !== null && value !== undefined) {
            const propDiv = document.createElement('div');
            propDiv.className = 'feature-property';
            propDiv.innerHTML = `
                <span class="property-label">${key}:</span>
                <span class="property-value">${value}</span>
            `;
            featureInfo.appendChild(propDiv);
        }
    }

    // Add edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-primary';
    editBtn.textContent = 'Edit Feature';
    editBtn.style.marginTop = '1rem';
    editBtn.style.width = '100%';
    editBtn.addEventListener('click', openEditModal);
    featureInfo.appendChild(editBtn);
}

/**
 * Open edit modal
 */
function openEditModal() {
    if (!currentEditingFeature) {
        showToast('No feature selected', 'warning');
        return;
    }

    const modal = document.getElementById('editModal');
    const formFields = document.getElementById('editFormFields');
    formFields.innerHTML = '';

    const properties = currentEditingFeature.properties;

    // Create form fields for each property
    for (let [key, value] of Object.entries(properties)) {
        if (key === 'layerId' || key === 'wkt') continue;

        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';

        const label = document.createElement('label');
        label.textContent = key;
        label.setAttribute('for', `edit_${key}`);

        const input = document.createElement('input');
        input.type = 'text';
        input.id = `edit_${key}`;
        input.name = key;
        input.value = value || '';

        formGroup.appendChild(label);
        formGroup.appendChild(input);
        formFields.appendChild(formGroup);
    }

    modal.classList.add('show');
}

/**
 * Close edit modal
 */
function closeEditModal() {
    const modal = document.getElementById('editModal');
    modal.classList.remove('show');
}

/**
 * Handle edit form submission
 */
function handleEditFormSubmit(e) {
    e.preventDefault();

    if (!currentEditingFeature) return;

    const formData = new FormData(e.target);
    const updatedProperties = {};

    for (let [key, value] of formData.entries()) {
        updatedProperties[key] = value;
    }

    // Update feature in layer
    layerManager.updateFeature(
        currentEditingFeature.layerId,
        currentEditingFeature.properties.id,
        updatedProperties
    );

    // Update display
    updateFeatureInfo({ ...currentEditingFeature.properties, ...updatedProperties });

    closeEditModal();
    showToast('Feature updated', 'success');
}

/**
 * Handle delete feature
 */
function handleDeleteFeature() {
    if (!currentEditingFeature) return;

    if (confirm('Delete this feature?')) {
        layerManager.deleteFeature(
            currentEditingFeature.layerId,
            currentEditingFeature.properties.id
        );

        closeEditModal();
        mapManager.clearSelectedFeature();

        document.getElementById('featureInfo').innerHTML =
            '<p class="empty-state">Click on a feature to see details</p>';

        currentEditingFeature = null;

        showToast('Feature deleted', 'success');
    }
}

/**
 * Handle apply filter
 */
function handleApplyFilter() {
    const column = document.getElementById('filterColumn').value;
    const value = document.getElementById('filterValue').value;

    if (!column || !value) {
        showToast('Please select a column and enter a filter value', 'warning');
        return;
    }

    // Apply filter to all visible layers
    const layers = layerManager.getAllLayers();
    layers.forEach(layer => {
        if (layer.visible) {
            layerManager.applyFilter(layer.id, column, value);
        }
    });

    showToast(`Filter applied: ${column} contains "${value}"`, 'success');
}

/**
 * Handle clear filter
 */
function handleClearFilter() {
    const layers = layerManager.getAllLayers();
    layers.forEach(layer => {
        layerManager.clearFilter(layer.id);
    });

    document.getElementById('filterValue').value = '';
    showToast('Filters cleared', 'success');
}

/**
 * Handle sort
 */
function handleSort(direction) {
    const column = document.getElementById('sortColumn').value;

    if (!column) {
        showToast('Please select a column to sort by', 'warning');
        return;
    }

    // Sort all layers
    const layers = layerManager.getAllLayers();
    layers.forEach(layer => {
        layerManager.sortLayer(layer.id, column, direction);
    });

    showToast(`Sorted by ${column} (${direction})`, 'success');
}

/**
 * Update column selects
 */
function updateColumnSelects() {
    const columns = layerManager.getAllColumnNames();

    const filterSelect = document.getElementById('filterColumn');
    const sortSelect = document.getElementById('sortColumn');

    // Keep current selections
    const currentFilter = filterSelect.value;
    const currentSort = sortSelect.value;

    // Clear and repopulate
    filterSelect.innerHTML = '<option value="">Select column...</option>';
    sortSelect.innerHTML = '<option value="">Sort by...</option>';

    columns.forEach(col => {
        const option1 = document.createElement('option');
        option1.value = col;
        option1.textContent = col;
        filterSelect.appendChild(option1);

        const option2 = document.createElement('option');
        option2.value = col;
        option2.textContent = col;
        sortSelect.appendChild(option2);
    });

    // Restore selections if still available
    if (columns.includes(currentFilter)) {
        filterSelect.value = currentFilter;
    }
    if (columns.includes(currentSort)) {
        sortSelect.value = currentSort;
    }
}

/**
 * Handle save to Firebase
 */
async function handleSaveToFirebase() {
    showLoading('Saving to Firebase...');

    try {
        const layersData = layerManager.exportAllLayers();
        await firebaseManager.saveAllLayers(layersData);

        hideLoading();
        showToast('Data saved to Firebase successfully', 'success');
    } catch (error) {
        console.error('Error saving to Firebase:', error);
        hideLoading();
        showToast('Error saving to Firebase: ' + error.message, 'error');
    }
}

/**
 * Handle load from Firebase
 */
async function handleLoadFromFirebase() {
    if (layerManager.getAllLayers().length > 0) {
        if (!confirm('Loading from Firebase will replace current data. Continue?')) {
            return;
        }
    }

    showLoading('Loading from Firebase...');

    try {
        const result = await firebaseManager.loadAllLayers();

        if (result.layers && Object.keys(result.layers).length > 0) {
            layerManager.importLayers(result.layers);
            hideLoading();
            showToast('Data loaded from Firebase successfully', 'success');
        } else {
            hideLoading();
            showToast('No data found in Firebase', 'info');
        }
    } catch (error) {
        console.error('Error loading from Firebase:', error);
        hideLoading();
        showToast('Error loading from Firebase: ' + error.message, 'error');
    }
}

/**
 * Enable real-time Firebase sync
 */
function enableRealtimeSync() {
    if (realtimeListenerEnabled) return;

    firebaseManager.listenForUpdates((updatedLayers) => {
        console.log('Real-time update received from Firebase');

        // Only import if there are changes and user isn't currently editing
        if (Object.keys(updatedLayers).length > 0 && !document.getElementById('editModal').classList.contains('show')) {
            layerManager.importLayers(updatedLayers);
            showToast('Data synced from Firebase', 'info');
        }
    });

    realtimeListenerEnabled = true;
    console.log('Real-time Firebase sync enabled');
}

/**
 * Show loading overlay
 */
function showLoading(message = 'Loading...') {
    const overlay = document.getElementById('loadingOverlay');
    overlay.querySelector('p').textContent = message;
    overlay.classList.add('show');
}

/**
 * Hide loading overlay
 */
function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    overlay.classList.remove('show');
}

/**
 * Show toast notification
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success, error, warning, info)
 */
function showToast(message, type = 'info') {
    // Create toast container if it doesn't exist
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '✓',
        error: '✗',
        warning: '⚠',
        info: 'ℹ'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${message}</span>
        <span class="toast-close">×</span>
    `;

    // Add close functionality
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });

    // Add to container
    container.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.remove();
    }, 3000);

    console.log(`[${type.toUpperCase()}] ${message}`);
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
