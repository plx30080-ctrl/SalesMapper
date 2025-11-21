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
let currentEditingFeature = null;

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

        // Setup event listeners
        setupEventListeners();

        // Setup map feature click handler
        mapManager.setOnFeatureClick(handleFeatureSelection);

        // Setup layer update handler
        layerManager.setOnLayerUpdate(updateLayerList);

        console.log('Application initialized successfully');
        hideLoading();

        showNotification('Application ready! Upload a CSV to get started.', 'success');
    } catch (error) {
        console.error('Error initializing application:', error);
        hideLoading();
        showNotification('Error initializing application: ' + error.message, 'error');
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
    document.querySelector('.close').addEventListener('click', closeEditModal);

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('editModal');
        if (e.target === modal) {
            closeEditModal();
        }
    });
}

/**
 * Handle CSV file upload
 */
async function handleCSVUpload() {
    const fileInput = document.getElementById('csvFileInput');
    const file = fileInput.files[0];

    if (!file) {
        showNotification('Please select a CSV file', 'warning');
        return;
    }

    showLoading('Parsing CSV file...');

    try {
        // Parse CSV
        const parsed = await csvParser.parseFile(file);

        console.log('CSV parsed:', parsed);

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
        showNotification(`Layer "${layerName}" created with ${parsed.features.length} features`, 'success');

        // Clear file input
        fileInput.value = '';
        document.getElementById('uploadBtn').disabled = true;

        // Update filter/sort dropdowns with new columns
        updateColumnSelects();
    } catch (error) {
        console.error('Error uploading CSV:', error);
        hideLoading();
        showNotification('Error parsing CSV: ' + error.message, 'error');
    }
}

/**
 * Handle create empty layer
 */
function handleCreateLayer() {
    const nameInput = document.getElementById('newLayerName');
    const name = nameInput.value.trim();

    if (!name) {
        showNotification('Please enter a layer name', 'warning');
        return;
    }

    // Create empty layer
    layerManager.createLayer(name);

    showNotification(`Layer "${name}" created`, 'success');

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
        showNotification(`Layer "${layer.name}" exported`, 'success');
    });

    // Delete layer
    div.querySelector('.delete').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete layer "${layer.name}"?`)) {
            layerManager.deleteLayer(layer.id);
            showNotification(`Layer "${layer.name}" deleted`, 'success');
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
        showNotification('No feature selected', 'warning');
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
    showNotification('Feature updated', 'success');
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

        showNotification('Feature deleted', 'success');
    }
}

/**
 * Handle apply filter
 */
function handleApplyFilter() {
    const column = document.getElementById('filterColumn').value;
    const value = document.getElementById('filterValue').value;

    if (!column || !value) {
        showNotification('Please select a column and enter a filter value', 'warning');
        return;
    }

    // Apply filter to all visible layers
    const layers = layerManager.getAllLayers();
    layers.forEach(layer => {
        if (layer.visible) {
            layerManager.applyFilter(layer.id, column, value);
        }
    });

    showNotification(`Filter applied: ${column} contains "${value}"`, 'success');
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
    showNotification('Filters cleared', 'success');
}

/**
 * Handle sort
 */
function handleSort(direction) {
    const column = document.getElementById('sortColumn').value;

    if (!column) {
        showNotification('Please select a column to sort by', 'warning');
        return;
    }

    // Sort all layers
    const layers = layerManager.getAllLayers();
    layers.forEach(layer => {
        layerManager.sortLayer(layer.id, column, direction);
    });

    showNotification(`Sorted by ${column} (${direction})`, 'success');
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
        showNotification('Data saved to Firebase successfully', 'success');
    } catch (error) {
        console.error('Error saving to Firebase:', error);
        hideLoading();
        showNotification('Error saving to Firebase: ' + error.message, 'error');
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
            showNotification('Data loaded from Firebase successfully', 'success');
        } else {
            hideLoading();
            showNotification('No data found in Firebase', 'info');
        }
    } catch (error) {
        console.error('Error loading from Firebase:', error);
        hideLoading();
        showNotification('Error loading from Firebase: ' + error.message, 'error');
    }
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
 * Show notification
 */
function showNotification(message, type = 'info') {
    // Simple console notification for now
    console.log(`[${type.toUpperCase()}] ${message}`);

    // You could enhance this with a toast notification library
    alert(message);
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
