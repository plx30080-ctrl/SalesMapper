/**
 * Main Application - Updated with Layer Groups and Property-Based Styling
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
let currentCSVData = null;
let realtimeListenerEnabled = false;
let layerGroups = new Map(); // groupId -> {name, layerIds: []}
let activeGroup = null;
let allLayersGroupId = null; // Special group that shows all layers
let currentLayerForActions = null;

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

        // Setup map click handler for closing popup
        setupMapClickHandler();

        // Setup map feature click handler
        mapManager.setOnFeatureClick(handleFeatureSelection);

        // Setup layer update handler
        layerManager.setOnLayerUpdate(updateLayerList);

        // Setup drawing complete handler
        mapManager.setOnDrawComplete(handleDrawingComplete);

        // Setup real-time Firebase listener
        enableRealtimeSync();

        // Initialize with default "All Layers" group
        allLayersGroupId = createLayerGroup('All Layers');

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
 * Setup map click handler to close popups
 */
function setupMapClickHandler() {
    mapManager.map.events.add('click', (e) => {
        // Check if click was on map background (not on a feature)
        if (!e.shapes || e.shapes.length === 0) {
            // Clear selection and close popup
            mapManager.clearSelectedFeature();
            currentEditingFeature = null;

            // Reset feature info panel
            document.getElementById('featureInfo').innerHTML =
                '<p class="empty-state">Click on a feature to see details</p>';
        }
    });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Quick Action Buttons
    document.getElementById('showUploadBtn').addEventListener('click', () => showModal('uploadModal'));
    document.getElementById('showSearchBtn').addEventListener('click', () => showModal('searchModal'));
    document.getElementById('showDrawToolsBtn').addEventListener('click', () => showModal('drawToolsModal'));
    document.getElementById('showFilterBtn').addEventListener('click', () => showModal('filterModal'));

    // CSV Upload
    document.getElementById('uploadBtn').addEventListener('click', handleCSVUpload);
    document.getElementById('csvFileInput').addEventListener('change', (e) => {
        document.getElementById('uploadBtn').disabled = e.target.files.length === 0;
    });

    // Address Search
    document.getElementById('searchBtn').addEventListener('click', handleAddressSearch);
    document.getElementById('addressSearch').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAddressSearch();
    });

    // Drawing Tools
    document.getElementById('drawPointBtn').addEventListener('click', () => {
        startDrawingMode('point');
        closeModal('drawToolsModal');
    });
    document.getElementById('drawPolygonBtn').addEventListener('click', () => {
        startDrawingMode('polygon');
        closeModal('drawToolsModal');
    });
    document.getElementById('deleteDrawingBtn').addEventListener('click', handleDeleteDrawing);

    // Layer Group Management
    document.getElementById('addGroupBtn').addEventListener('click', handleAddGroup);

    // Layer Management
    document.getElementById('addLayerBtn').addEventListener('click', () => showModal('uploadModal'));

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
    document.getElementById('cancelEdit').addEventListener('click', () => closeModal('editModal'));
    document.getElementById('deleteFeature').addEventListener('click', handleDeleteFeature);
    document.getElementById('editForm').addEventListener('submit', handleEditFormSubmit);

    // Column Mapping Modal
    document.getElementById('columnMapForm').addEventListener('submit', handleColumnMapSubmit);
    document.getElementById('cancelMapping').addEventListener('click', () => closeModal('columnMapModal'));

    // Style Modal
    document.getElementById('styleType').addEventListener('change', handleStyleTypeChange);
    document.getElementById('applyStyleBtn').addEventListener('click', handleApplyStyle);
    document.getElementById('cancelStyleBtn').addEventListener('click', () => closeModal('styleModal'));

    // Layer Actions Menu
    document.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', handleLayerAction);
    });

    // Modal close buttons
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = e.target.dataset.modal;
            if (modalId) closeModal(modalId);
        });
    });

    // Close modals and menus when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModal(e.target.id);
        }
        // Close context menu
        const contextMenu = document.getElementById('layerActionsMenu');
        if (!e.target.closest('.layer-menu-btn') && !e.target.closest('.context-menu')) {
            contextMenu.classList.remove('show');
        }
    });
}

/**
 * Show/close modal helpers
 */
function showModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
}

/**
 * Handle layer group creation
 */
function handleAddGroup() {
    const name = prompt('Enter group name:', 'New Group');
    if (!name) return;

    createLayerGroup(name);
    showToast(`Group "${name}" created`, 'success');
}

/**
 * Create a layer group
 */
function createLayerGroup(name) {
    const groupId = `group_${Date.now()}`;
    layerGroups.set(groupId, {
        id: groupId,
        name: name,
        layerIds: [],
        visible: true
    });

    updateLayerGroupList();
    return groupId;
}

/**
 * Update layer group list
 */
function updateLayerGroupList() {
    const groupList = document.getElementById('layerGroupList');
    groupList.innerHTML = '';

    if (layerGroups.size === 0) {
        groupList.innerHTML = '<p class="empty-state">No groups. Click + to add one.</p>';
        return;
    }

    layerGroups.forEach(group => {
        const groupItem = document.createElement('div');
        // Highlight "All Layers" when activeGroup is null, or highlight the active group
        const isActive = (activeGroup === group.id) || (activeGroup === null && group.id === allLayersGroupId);
        groupItem.className = 'layer-group-item' + (isActive ? ' active' : '');
        groupItem.dataset.groupId = group.id;

        // For "All Layers", show total count of all layers
        const layerCount = group.id === allLayersGroupId
            ? layerManager.getAllLayers().length
            : group.layerIds.length;

        groupItem.innerHTML = `
            <input type="checkbox" class="layer-group-toggle" ${group.visible ? 'checked' : ''}>
            <span class="layer-group-name">${group.name}</span>
            <span class="layer-group-count">${layerCount}</span>
        `;

        // Toggle group visibility
        groupItem.querySelector('.layer-group-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            group.visible = e.target.checked;
            toggleGroupVisibility(group.id, group.visible);
        });

        // Select group
        groupItem.addEventListener('click', (e) => {
            if (!e.target.classList.contains('layer-group-toggle')) {
                selectGroup(group.id);
            }
        });

        groupList.appendChild(groupItem);
    });
}

/**
 * Select a layer group
 */
function selectGroup(groupId) {
    // Special handling for "All Layers" - show all layers
    if (groupId === allLayersGroupId) {
        activeGroup = null;
    } else {
        activeGroup = groupId;
    }
    updateLayerGroupList();
    updateLayerList(layerManager.getAllLayers());
}

/**
 * Toggle group visibility
 */
function toggleGroupVisibility(groupId, visible) {
    const group = layerGroups.get(groupId);
    if (!group) return;

    group.layerIds.forEach(layerId => {
        const layer = layerManager.getLayer(layerId);
        if (layer) {
            if (visible) {
                mapManager.toggleLayerVisibility(layerId, true);
                layer.visible = true;
            } else {
                mapManager.toggleLayerVisibility(layerId, false);
                layer.visible = false;
            }
        }
    });

    layerManager.notifyUpdate();
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
            closeModal('searchModal');
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
 */
function startDrawingMode(type) {
    const mode = type === 'point' ? 'draw-point' : 'draw-polygon';
    mapManager.startDrawing(mode);

    const statusText = type === 'point' ? 'Click on the map to add a point' : 'Click to draw polygon vertices. Double-click to finish.';
    document.getElementById('drawingStatus').textContent = statusText;

    showToast(`Drawing mode: ${type}. ${statusText}`, 'info');
}

/**
 * Handle drawing complete
 */
function handleDrawingComplete(shape) {
    mapManager.stopDrawing();
    document.getElementById('drawingStatus').textContent = 'Select a tool to start drawing';

    const name = prompt('Enter a name for this feature:', 'New Feature');
    if (!name) {
        mapManager.clearDrawings();
        return;
    }

    const geometry = shape.toJson();
    const properties = {
        name: name,
        id: `drawn_${Date.now()}`,
        source: 'manual'
    };

    const layers = layerManager.getAllLayers();
    let targetLayerId;

    if (layers.length === 0) {
        targetLayerId = layerManager.createLayer('Drawn Features');
        addLayerToGroup(targetLayerId, Array.from(layerGroups.keys())[0]);
    } else {
        targetLayerId = layers[0].id;
    }

    const feature = { ...properties, ...geometry };
    const layer = layerManager.getLayer(targetLayerId);
    if (layer) {
        layer.features.push(feature);
        layerManager.notifyUpdate();
    }

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

    closeModal('uploadModal');
    showLoading('Parsing CSV file...');

    try {
        const parsed = await csvParser.parseFile(file);
        console.log('CSV parsed:', parsed);

        if (parsed.needsGeocoding) {
            hideLoading();
            currentCSVData = parsed;
            const detectedMapping = geocodingService.detectAddressColumns(parsed.originalColumns);
            showColumnMapModal(parsed.originalColumns, detectedMapping);
            return;
        }

        const layerName = prompt('Enter layer name:', file.name.replace('.csv', ''));
        if (!layerName) {
            hideLoading();
            return;
        }

        const layerId = layerManager.createLayer(layerName, parsed.features, parsed.type, {
            sourceFile: file.name,
            columnMap: parsed.columnMap,
            importDate: new Date().toISOString()
        });

        // Add to active group
        if (activeGroup) {
            addLayerToGroup(layerId, activeGroup);
        }

        hideLoading();
        showToast(`Layer "${layerName}" created with ${parsed.features.length} features`, 'success');

        fileInput.value = '';
        document.getElementById('uploadBtn').disabled = true;

        updateColumnSelects();
    } catch (error) {
        console.error('Error uploading CSV:', error);
        hideLoading();
        showToast('Error parsing CSV: ' + error.message, 'error');
    }
}

/**
 * Add layer to group
 */
function addLayerToGroup(layerId, groupId) {
    const group = layerGroups.get(groupId);
    if (group && !group.layerIds.includes(layerId)) {
        group.layerIds.push(layerId);
        updateLayerGroupList();
    }
}

/**
 * Show column mapping modal
 */
function showColumnMapModal(columns, detectedMapping) {
    const modal = document.getElementById('columnMapModal');
    const selects = ['street1Column', 'street2Column', 'cityColumn', 'stateColumn', 'zipColumn'];

    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        select.innerHTML = ['street1Column', 'cityColumn', 'zipColumn'].includes(selectId)
            ? '<option value="">-- Select Column --</option>'
            : '<option value="">-- None --</option>';

        columns.forEach(col => {
            const option = document.createElement('option');
            option.value = col;
            option.textContent = col;
            select.appendChild(option);
        });

        const mappingKey = selectId.replace('Column', '');
        if (detectedMapping[mappingKey]) {
            select.value = detectedMapping[mappingKey];
        }
    });

    showModal('columnMapModal');
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

    const columnMapping = {
        street1: document.getElementById('street1Column').value,
        street2: document.getElementById('street2Column').value,
        city: document.getElementById('cityColumn').value,
        state: document.getElementById('stateColumn').value,
        zip: document.getElementById('zipColumn').value
    };

    if (!columnMapping.street1 || !columnMapping.city || !columnMapping.zip) {
        showToast('Please select at least Street, City, and Zip columns', 'warning');
        return;
    }

    closeModal('columnMapModal');
    showModal('geocodingModal');

    try {
        const geocodedFeatures = await geocodingService.geocodeBatch(
            currentCSVData.rawData,
            columnMapping,
            updateGeocodingProgress
        );

        const stats = geocodingService.getStatistics(geocodedFeatures);
        closeModal('geocodingModal');

        const layerName = prompt(
            `Geocoding complete! ${stats.successful} of ${stats.total} addresses geocoded.\nEnter layer name:`,
            'Geocoded Locations'
        );

        if (!layerName) {
            currentCSVData = null;
            return;
        }

        const validFeatures = geocodedFeatures.filter(f => f.latitude && f.longitude);
        const layerId = layerManager.createLayer(layerName, validFeatures, 'point', {
            geocoded: true,
            geocodingStats: stats,
            columnMapping: columnMapping,
            importDate: new Date().toISOString()
        });

        if (activeGroup) {
            addLayerToGroup(layerId, activeGroup);
        }

        showToast(`Layer "${layerName}" created with ${validFeatures.length} geocoded locations`, 'success');
        updateColumnSelects();

        currentCSVData = null;
        document.getElementById('csvFileInput').value = '';
        document.getElementById('uploadBtn').disabled = true;

    } catch (error) {
        console.error('Error geocoding:', error);
        closeModal('geocodingModal');
        showToast('Error geocoding addresses: ' + error.message, 'error');
    }
}

/**
 * Update geocoding progress
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
 * Update layer list in sidebar
 */
function updateLayerList(layers) {
    const layerList = document.getElementById('layerList');
    layerList.innerHTML = '';

    // Filter layers by active group
    let displayLayers = layers;
    if (activeGroup) {
        const group = layerGroups.get(activeGroup);
        if (group) {
            displayLayers = layers.filter(l => group.layerIds.includes(l.id));
        }
    }

    if (displayLayers.length === 0) {
        layerList.innerHTML = '<p class="empty-state">No layers in this group. Upload a CSV to add one.</p>';
        return;
    }

    displayLayers.forEach(layer => {
        const layerItem = createLayerItem(layer);
        layerList.appendChild(layerItem);
    });

    updateLegend(layers.filter(l => l.visible));
}

/**
 * Create layer item element (compact version)
 */
function createLayerItem(layer) {
    const div = document.createElement('div');
    div.className = 'layer-item';
    div.dataset.layerId = layer.id;

    div.innerHTML = `
        <div class="layer-info">
            <input type="checkbox" class="layer-checkbox" ${layer.visible ? 'checked' : ''}>
            <span class="layer-name" title="${layer.name}">${layer.name}</span>
            <span class="layer-count">${layer.features.length}</span>
        </div>
        <button class="layer-menu-btn">⋮</button>
    `;

    // Visibility toggle
    div.querySelector('.layer-checkbox').addEventListener('change', (e) => {
        e.stopPropagation();
        layerManager.toggleLayerVisibility(layer.id);
    });

    // Layer menu button
    div.querySelector('.layer-menu-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        showLayerActionsMenu(e.target, layer.id);
    });

    return div;
}

/**
 * Show layer actions context menu
 */
function showLayerActionsMenu(button, layerId) {
    const menu = document.getElementById('layerActionsMenu');
    const rect = button.getBoundingClientRect();

    menu.style.top = `${rect.bottom + 5}px`;
    menu.style.left = `${rect.left - 150}px`;
    menu.classList.add('show');

    currentLayerForActions = layerId;
}

/**
 * Handle layer action
 */
function handleLayerAction(e) {
    const action = e.currentTarget.dataset.action;
    const layerId = currentLayerForActions;
    const layer = layerManager.getLayer(layerId);

    if (!layer) return;

    document.getElementById('layerActionsMenu').classList.remove('show');

    switch (action) {
        case 'zoom':
            const dataSource = mapManager.dataSources.get(layerId);
            if (dataSource) {
                mapManager.fitMapToDataSource(dataSource);
            }
            break;

        case 'style':
            showStyleModal(layerId);
            break;

        case 'export':
            csvParser.exportToCSV(layer.features, `${layer.name}.csv`);
            showToast(`Layer "${layer.name}" exported`, 'success');
            break;

        case 'group':
            showMoveToGroupDialog(layerId);
            break;

        case 'delete':
            if (confirm(`Delete layer "${layer.name}"?`)) {
                layerManager.deleteLayer(layerId);
                removeLayerFromAllGroups(layerId);
                showToast(`Layer "${layer.name}" deleted`, 'success');
            }
            break;
    }
}

/**
 * Show style modal for layer
 */
function showStyleModal(layerId) {
    currentLayerForActions = layerId;
    const layer = layerManager.getLayer(layerId);

    // Populate custom property dropdown
    const columns = layerManager.getAllColumnNames();
    const select = document.getElementById('customProperty');
    select.innerHTML = '<option value="">Select property...</option>';
    columns.forEach(col => {
        const option = document.createElement('option');
        option.value = col;
        option.textContent = col;
        select.appendChild(option);
    });

    showModal('styleModal');
}

/**
 * Handle style type change
 */
function handleStyleTypeChange(e) {
    const styleType = e.target.value;
    const customGroup = document.getElementById('customPropertyGroup');
    const colorGroup = document.getElementById('singleColorGroup');

    if (styleType === 'custom') {
        customGroup.style.display = 'block';
        colorGroup.style.display = 'none';
    } else if (styleType === 'single') {
        customGroup.style.display = 'none';
        colorGroup.style.display = 'block';
    } else {
        customGroup.style.display = 'none';
        colorGroup.style.display = 'none';
    }
}

/**
 * Apply style to layer
 */
function handleApplyStyle() {
    const layerId = currentLayerForActions;
    const layer = layerManager.getLayer(layerId);
    if (!layer) return;

    const styleType = document.getElementById('styleType').value;
    let property = null;

    switch (styleType) {
        case 'tier':
            property = 'tier';
            break;
        case 'zone':
            property = 'name'; // or territory, zone, etc.
            break;
        case 'bdm':
            property = 'bdm';
            break;
        case 'custom':
            property = document.getElementById('customProperty').value;
            if (!property) {
                showToast('Please select a property', 'warning');
                return;
            }
            break;
    }

    closeModal('styleModal');
    showLoading('Applying style...');

    try {
        if (styleType === 'single') {
            const color = document.getElementById('singleColor').value;
            applySingleColorStyle(layerId, color);
        } else {
            applyPropertyBasedStyle(layerId, property, styleType);
        }

        hideLoading();
        showToast('Style applied successfully', 'success');
    } catch (error) {
        hideLoading();
        showToast('Error applying style: ' + error.message, 'error');
    }
}

/**
 * Apply single color style
 */
function applySingleColorStyle(layerId, color) {
    const layer = layerManager.getLayer(layerId);
    if (!layer) return;

    layer.color = color;

    // Re-render layer with new color
    mapManager.removeLayer(layerId);
    mapManager.createDataSource(layerId);
    mapManager.addFeaturesToLayer(layerId, layer.features, layer.type);

    layerManager.notifyUpdate();
}

/**
 * Apply property-based style (Tier Map, Zone Map, etc.)
 */
function applyPropertyBasedStyle(layerId, property, styleType) {
    const layer = layerManager.getLayer(layerId);
    if (!layer) return;

    // Get unique values for the property
    const uniqueValues = [...new Set(layer.features.map(f => f[property]))].filter(v => v != null);

    // Define color schemes
    const tierColors = {
        '1': '#107c10',    // Green
        'tier 1': '#107c10',
        '2': '#ffb900',    // Yellow
        'tier 2': '#ffb900',
        '3': '#d13438',    // Red
        'tier 3': '#d13438'
    };

    const defaultColors = [
        '#0078d4', '#d13438', '#107c10', '#ffb900', '#8764b8',
        '#00b7c3', '#f7630c', '#ca5010', '#038387', '#486860'
    ];

    // Create color mapping
    const colorMap = {};
    uniqueValues.forEach((value, index) => {
        if (styleType === 'tier' && tierColors[String(value).toLowerCase()]) {
            colorMap[value] = tierColors[String(value).toLowerCase()];
        } else {
            colorMap[value] = defaultColors[index % defaultColors.length];
        }
    });

    // Remove existing layer
    mapManager.removeLayer(layerId);
    mapManager.createDataSource(layerId);

    // Group features by property value and add with corresponding colors
    uniqueValues.forEach(value => {
        const featuresForValue = layer.features.filter(f => f[property] === value);
        const color = colorMap[value];

        // Temporarily override color selection
        const originalGetNextColor = mapManager.getNextColor;
        mapManager.getNextColor = () => color;

        mapManager.addFeaturesToLayer(layerId, featuresForValue, layer.type);

        mapManager.getNextColor = originalGetNextColor;
    });

    // Store style info
    layer.styleType = styleType;
    layer.styleProperty = property;
    layer.colorMap = colorMap;

    layerManager.notifyUpdate();
}

/**
 * Show move to group dialog
 */
function showMoveToGroupDialog(layerId) {
    const groupNames = [];
    layerGroups.forEach(g => groupNames.push(g.name));

    const groupName = prompt('Move to group:\n' + groupNames.join('\n') + '\n\nEnter group name:');
    if (!groupName) return;

    let targetGroupId = null;
    layerGroups.forEach((g, id) => {
        if (g.name === groupName) targetGroupId = id;
    });

    if (!targetGroupId) {
        showToast('Group not found', 'error');
        return;
    }

    // Remove from all groups
    removeLayerFromAllGroups(layerId);

    // Add to target group
    addLayerToGroup(layerId, targetGroupId);

    showToast('Layer moved to group', 'success');
}

/**
 * Remove layer from all groups
 */
function removeLayerFromAllGroups(layerId) {
    layerGroups.forEach(group => {
        const index = group.layerIds.indexOf(layerId);
        if (index > -1) {
            group.layerIds.splice(index, 1);
        }
    });
    updateLayerGroupList();
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
        // If layer has property-based styling, show color map
        if (layer.colorMap) {
            const legendSection = document.createElement('div');
            legendSection.style.marginBottom = '1rem';

            const title = document.createElement('div');
            title.style.fontWeight = '600';
            title.style.marginBottom = '0.5rem';
            title.textContent = layer.name;
            legendSection.appendChild(title);

            Object.entries(layer.colorMap).forEach(([value, color]) => {
                const item = document.createElement('div');
                item.className = 'legend-item';
                item.innerHTML = `
                    <div class="legend-color" style="background-color: ${color}"></div>
                    <span>${value}</span>
                `;
                legendSection.appendChild(item);
            });

            legendContent.appendChild(legendSection);
        } else {
            // Standard legend item
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.innerHTML = `
                <div class="legend-color" style="background-color: ${layer.color}"></div>
                <span>${layer.name} (${layer.features.length})</span>
            `;
            legendContent.appendChild(item);
        }
    });
}

/**
 * Handle feature selection on map
 */
function handleFeatureSelection(selectedFeature) {
    currentEditingFeature = selectedFeature;
    updateFeatureInfo(selectedFeature.properties);
    console.log('Feature selected:', selectedFeature);
}

/**
 * Update feature info panel - ONLY show Name, Description, Tier, BDM
 */
function updateFeatureInfo(properties) {
    const featureInfo = document.getElementById('featureInfo');
    featureInfo.innerHTML = '';

    // Define which properties to display (in order)
    const displayProps = ['name', 'description', 'tier', 'bdm'];
    const propLabels = {
        name: 'Name',
        description: 'Description',
        tier: 'Tier',
        bdm: 'BDM'
    };

    let hasData = false;

    displayProps.forEach(key => {
        const value = properties[key] || properties[key.toLowerCase()] ||
                     properties[key.toUpperCase()] || properties[key.charAt(0).toUpperCase() + key.slice(1)];

        if (value !== null && value !== undefined && value !== '') {
            hasData = true;
            const propDiv = document.createElement('div');
            propDiv.className = 'feature-property';
            propDiv.innerHTML = `
                <span class="property-label">${propLabels[key]}:</span>
                <span class="property-value">${value}</span>
            `;
            featureInfo.appendChild(propDiv);
        }
    });

    if (!hasData) {
        featureInfo.innerHTML = '<p class="empty-state">No details available</p>';
        return;
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

    const formFields = document.getElementById('editFormFields');
    formFields.innerHTML = '';

    const properties = currentEditingFeature.properties;

    // Create form fields for each property (exclude system fields)
    for (let [key, value] of Object.entries(properties)) {
        if (['layerId', 'wkt', 'id'].includes(key.toLowerCase())) continue;

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

    showModal('editModal');
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

    layerManager.updateFeature(
        currentEditingFeature.layerId,
        currentEditingFeature.properties.id,
        updatedProperties
    );

    updateFeatureInfo({ ...currentEditingFeature.properties, ...updatedProperties });

    closeModal('editModal');
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

        closeModal('editModal');
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

    const layers = layerManager.getAllLayers();
    layers.forEach(layer => {
        if (layer.visible) {
            layerManager.applyFilter(layer.id, column, value);
        }
    });

    showToast(`Filter applied: ${column} contains "${value}"`, 'success');
    closeModal('filterModal');
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

    const layers = layerManager.getAllLayers();
    layers.forEach(layer => {
        layerManager.sortLayer(layer.id, column, direction);
    });

    showToast(`Sorted by ${column} (${direction})`, 'success');
    closeModal('filterModal');
}

/**
 * Update column selects
 */
function updateColumnSelects() {
    const columns = layerManager.getAllColumnNames();

    const filterSelect = document.getElementById('filterColumn');
    const sortSelect = document.getElementById('sortColumn');

    const currentFilter = filterSelect.value;
    const currentSort = sortSelect.value;

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

    if (columns.includes(currentFilter)) filterSelect.value = currentFilter;
    if (columns.includes(currentSort)) sortSelect.value = currentSort;
}

/**
 * Handle save to Firebase
 */
async function handleSaveToFirebase() {
    showLoading('Saving to Firebase...');

    try {
        const layersData = layerManager.exportAllLayers();
        const groupsData = Array.from(layerGroups.values());

        await firebaseManager.saveAllLayers({
            ...layersData,
            _groups: groupsData
        });

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
            // Load groups if available
            if (result.layers._groups) {
                layerGroups.clear();
                result.layers._groups.forEach(g => {
                    layerGroups.set(g.id, g);
                });
                delete result.layers._groups;
            }

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

        if (Object.keys(updatedLayers).length > 0 && !document.getElementById('editModal').classList.contains('show')) {
            if (updatedLayers._groups) {
                layerGroups.clear();
                updatedLayers._groups.forEach(g => {
                    layerGroups.set(g.id, g);
                });
                delete updatedLayers._groups;
            }

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
 */
function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

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

    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });

    container.appendChild(toast);

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
