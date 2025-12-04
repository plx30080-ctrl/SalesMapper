/**
 * Main Application - Updated with Layer Groups and Property-Based Styling
 * Coordinates all components and handles user interactions
 */

// Google Maps API key
const GOOGLE_MAPS_KEY = 'AIzaSyCUdAbY7osfgatmss5tCYOgybqE1mzEwzA';

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
 * Save current state to localStorage
 */
function saveToLocalStorage() {
    try {
        const layersData = layerManager.exportAllLayers();
        const groupsData = Array.from(layerGroups.values());
        const state = {
            layers: layersData,
            groups: groupsData,
            allLayersGroupId: allLayersGroupId,
            activeGroup: activeGroup,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem('salesMapperState', JSON.stringify(state));
        console.log('State auto-saved to localStorage');
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
}

/**
 * Load state from localStorage
 * @returns {boolean} True if data was loaded, false otherwise
 */
function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('salesMapperState');
        if (!saved) {
            console.log('No saved state found in localStorage');
            return false;
        }

        const state = JSON.parse(saved);
        console.log('Loading saved state from localStorage...', state);

        // Restore groups
        if (state.groups && state.groups.length > 0) {
            layerGroups.clear();
            state.groups.forEach(g => {
                layerGroups.set(g.id, g);
            });
            allLayersGroupId = state.allLayersGroupId;
            activeGroup = state.activeGroup;
            updateLayerGroupList();
        }

        // Restore layers
        if (state.layers && Object.keys(state.layers).length > 0) {
            layerManager.importLayers(state.layers);

            // Ensure "All Layers" group exists
            if (!allLayersGroupId || !layerGroups.has(allLayersGroupId)) {
                // Try to find existing "All Layers" group by name
                let foundAllLayersGroup = false;
                layerGroups.forEach((group, id) => {
                    if (group.name === 'All Layers') {
                        allLayersGroupId = id;
                        foundAllLayersGroup = true;
                    }
                });

                // Only create a new one if none exists
                if (!foundAllLayersGroup) {
                    allLayersGroupId = createLayerGroup('All Layers');
                }
            }

            // Ensure all layers are in the "All Layers" group
            const allLayersGroup = layerGroups.get(allLayersGroupId);
            if (allLayersGroup) {
                layerManager.getAllLayers().forEach(layer => {
                    addLayerToGroup(layer.id, allLayersGroupId);
                });
            }

            // Re-apply property-based styling for layers that have it
            layerManager.getAllLayers().forEach(layer => {
                if (layer.styleType && layer.styleProperty) {
                    applyPropertyBasedStyle(layer.id, layer.styleProperty, layer.styleType);
                }
            });

            console.log('State loaded successfully from localStorage');
            return true;
        }

        return false;
    } catch (error) {
        console.error('Error loading from localStorage:', error);
        return false;
    }
}

/**
 * Initialize the application
 */
async function initializeApp() {
    showLoading('Initializing application...');

    try {
        // Initialize components
        mapManager = new MapManager('googleMap', GOOGLE_MAPS_KEY);
        await mapManager.initialize();

        layerManager = new LayerManager(mapManager);
        csvParser = new CSVParser();
        geocodingService = new GeocodingService(GOOGLE_MAPS_KEY);

        // Setup event listeners
        setupEventListeners();

        // Setup map click handler for clearing selection
        setupMapClickHandler();

        // Setup map feature click handler
        mapManager.setOnFeatureClick(handleFeatureSelection);

        // Setup layer update handler
        layerManager.setOnLayerUpdate(updateLayerList);

        // Setup drawing complete handler
        mapManager.setOnDrawComplete(handleDrawingComplete);

        // Setup real-time Firebase listener
        enableRealtimeSync();

        // Try to load saved state from localStorage
        const loaded = loadFromLocalStorage();

        // Initialize with default "All Layers" group if no data was loaded
        if (!loaded) {
            allLayersGroupId = createLayerGroup('All Layers');
        }

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
 * Setup map click handler to clear selection
 */
function setupMapClickHandler() {
    google.maps.event.addListener(mapManager.map, 'click', (e) => {
        // Don't clear selection if in drawing mode
        if (mapManager.drawingMode) {
            return;
        }

        // For Google Maps, we clear selection on map click
        // Feature clicks are handled separately in the data layer
        mapManager.clearSelectedFeature();
        currentEditingFeature = null;

        // Reset feature info panel
        document.getElementById('featureInfo').innerHTML =
            '<p class="empty-state">Click on a feature to see details</p>';
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

    // Template Controls
    document.getElementById('saveTemplateBtn').addEventListener('click', handleSaveTemplate);
    document.getElementById('loadTemplateBtn').addEventListener('click', handleLoadTemplate);
    document.getElementById('deleteTemplateBtn').addEventListener('click', handleDeleteTemplate);
    document.getElementById('templateSelect').addEventListener('change', handleTemplateSelectChange);

    // Style Modal
    document.getElementById('styleType').addEventListener('change', handleStyleTypeChange);
    document.getElementById('applyStyleBtn').addEventListener('click', handleApplyStyle);
    document.getElementById('cancelStyleBtn').addEventListener('click', () => closeModal('styleModal'));

    // Opacity slider in style modal
    const opacitySlider = document.getElementById('layerOpacitySlider');
    opacitySlider.addEventListener('input', (e) => {
        document.getElementById('opacityValue').textContent = e.target.value;
    });

    // Layer Actions Menu
    document.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', handleLayerAction);
    });

    // Import Tabs
    document.querySelectorAll('.import-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.target.dataset.tab;
            switchImportTab(tabName);
        });
    });

    // Paste Import
    document.getElementById('importPasteBtn').addEventListener('click', handlePasteImport);

    // Validation Modal
    document.getElementById('importValidDataBtn').addEventListener('click', handleImportValidData);
    document.getElementById('downloadErrorsBtn').addEventListener('click', handleDownloadErrors);
    document.getElementById('closeValidationBtn').addEventListener('click', () => closeModal('validationModal'));

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
        visible: true,
        opacity: 1.0
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
            : (group.layerIds || []).length;

        const groupOpacity = group.opacity !== undefined ? group.opacity : 1.0;
        const groupOpacityPercent = Math.round(groupOpacity * 100);

        groupItem.innerHTML = `
            <input type="checkbox" class="layer-group-toggle" ${group.visible ? 'checked' : ''}>
            <span class="layer-group-name">${group.name}</span>
            <span class="layer-group-count">${layerCount}</span>
            <div class="layer-opacity-control">
                <input type="range" class="group-opacity-slider" min="0" max="100" value="${groupOpacityPercent}" title="Group Opacity: ${groupOpacityPercent}%">
            </div>
        `;

        // Toggle group visibility
        groupItem.querySelector('.layer-group-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            group.visible = e.target.checked;
            toggleGroupVisibility(group.id, group.visible);
        });

        // Group opacity slider
        const groupOpacitySlider = groupItem.querySelector('.group-opacity-slider');
        groupOpacitySlider.addEventListener('input', (e) => {
            e.stopPropagation();
            const newOpacity = parseInt(e.target.value) / 100;
            e.target.title = `Group Opacity: ${e.target.value}%`;
            group.opacity = newOpacity;
            setGroupOpacity(group.id, newOpacity);
        });

        // Select group
        groupItem.addEventListener('click', (e) => {
            if (!e.target.classList.contains('layer-group-toggle') &&
                !e.target.classList.contains('group-opacity-slider')) {
                selectGroup(group.id);
            }
        });

        groupList.appendChild(groupItem);
    });

    // Auto-save state after group updates
    saveToLocalStorage();
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

    // Get layer IDs based on group type
    let layerIds;
    if (groupId === allLayersGroupId) {
        // For "All Layers", apply to all layers
        layerIds = layerManager.getAllLayers().map(l => l.id);
    } else {
        layerIds = group.layerIds || [];
    }

    layerIds.forEach(layerId => {
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
 * Set opacity for all layers in a group
 */
function setGroupOpacity(groupId, opacity) {
    const group = layerGroups.get(groupId);
    if (!group) return;

    // Get layer IDs based on group type
    let layerIds;
    if (groupId === allLayersGroupId) {
        // For "All Layers", apply to all layers
        layerIds = layerManager.getAllLayers().map(l => l.id);
    } else {
        layerIds = group.layerIds || [];
    }

    // Set opacity for each layer in the group
    layerIds.forEach(layerId => {
        layerManager.setLayerOpacity(layerId, opacity);
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
function handleDrawingComplete(drawingData) {
    mapManager.stopDrawing();
    document.getElementById('drawingStatus').textContent = 'Select a tool to start drawing';

    const name = prompt('Enter a name for this feature:', 'New Feature');
    if (!name) {
        // Remove the drawn shape from map
        if (drawingData.shape) {
            drawingData.shape.setMap(null);
        }
        window.targetLayerForNewFeature = null;
        return;
    }

    // Create WKT geometry string
    let wkt;
    if (drawingData.type === 'Point') {
        wkt = `POINT(${drawingData.coordinates[0]} ${drawingData.coordinates[1]})`;
    } else if (drawingData.type === 'Polygon') {
        const coords = drawingData.coordinates[0].map(c => `${c[0]} ${c[1]}`).join(', ');
        wkt = `POLYGON((${coords}))`;
    }

    const properties = {
        name: name,
        id: `drawn_${Date.now()}`,
        source: 'manual',
        geometry: wkt,
        type: drawingData.type
    };

    let targetLayerId;

    // Check if we're adding to a specific layer
    if (window.targetLayerForNewFeature) {
        targetLayerId = window.targetLayerForNewFeature;
        window.targetLayerForNewFeature = null;
    } else {
        // Original behavior: add to first layer or create new one
        const layers = layerManager.getAllLayers();
        if (layers.length === 0) {
            targetLayerId = layerManager.createLayer('Drawn Features');
            // Always add to "All Layers" group
            addLayerToGroup(targetLayerId, allLayersGroupId);
        } else {
            targetLayerId = layers[0].id;
        }
    }

    const layer = layerManager.getLayer(targetLayerId);
    if (layer) {
        layer.features.push(properties);
        layerManager.notifyUpdate();

        // Remove the temporary drawn shape since it will be re-rendered as part of the layer
        if (drawingData.shape) {
            drawingData.shape.setMap(null);
        }

        showToast(`Feature added to "${layer.name}"`, 'success');
    }
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
    const files = Array.from(fileInput.files);

    if (files.length === 0) {
        showToast('Please select at least one file', 'warning');
        return;
    }

    closeModal('uploadModal');

    let successCount = 0;
    let errorCount = 0;

    // Process each file
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileNum = files.length > 1 ? ` (${i + 1}/${files.length})` : '';

        showLoading(`Parsing ${file.name}${fileNum}...`);

        try {
            const parsed = await csvParser.parseFile(file);
            console.log(`File parsed: ${file.name}`, parsed);

            if (parsed.needsGeocoding) {
                // For multi-file uploads with geocoding needed, pause and ask user
                if (files.length > 1) {
                    hideLoading();
                    const proceed = confirm(`File "${file.name}" contains addresses and needs geocoding. Skip this file and continue with remaining files?`);
                    if (!proceed) {
                        // Process this file for geocoding
                        currentCSVData = parsed;
                        currentCSVData.fileName = file.name;
                        const detectedMapping = geocodingService.detectAddressColumns(parsed.originalColumns);
                        showColumnMapModal(parsed.originalColumns, detectedMapping);
                        fileInput.value = '';
                        document.getElementById('uploadBtn').disabled = true;
                        return;
                    }
                    continue; // Skip this file
                } else {
                    // Single file needing geocoding
                    hideLoading();
                    currentCSVData = parsed;
                    currentCSVData.fileName = file.name;
                    const detectedMapping = geocodingService.detectAddressColumns(parsed.originalColumns);
                    showColumnMapModal(parsed.originalColumns, detectedMapping);
                    fileInput.value = '';
                    document.getElementById('uploadBtn').disabled = true;
                    return;
                }
            }

            // Validate data before creating layer
            showLoading(`Validating ${file.name}${fileNum}...`);

            // Get raw data from the parsed result
            const rawData = parsed.rawData || parsed.features;
            const validation = csvParser.validateData(rawData, parsed.columnMap, parsed.type);

            console.log(`Validation results for ${file.name}:`, validation);

            // If there are validation errors, show validation modal for single file
            // For multi-file, we'll just skip invalid rows automatically
            if (validation.invalidCount > 0) {
                if (files.length === 1) {
                    // Single file - show validation modal and let user decide
                    hideLoading();
                    showValidationResults(validation, file.name);
                    fileInput.value = '';
                    document.getElementById('uploadBtn').disabled = true;
                    return;
                } else {
                    // Multi-file - use only valid rows and continue
                    console.log(`Skipping ${validation.invalidCount} invalid rows from ${file.name}`);
                    if (validation.validCount === 0) {
                        errorCount++;
                        showToast(`${file.name}: All rows invalid, skipping file`, 'warning');
                        continue;
                    }
                    // Extract features from valid rows only
                    parsed.features = csvParser.extractFeatures(
                        validation.validRows,
                        validation.columnMap,
                        validation.dataType
                    );
                }
            }

            // Auto-generate layer name from file name
            const defaultName = file.name.replace(/\.(csv|xlsx|xls)$/i, '');
            const layerName = files.length === 1
                ? (prompt('Enter layer name:', defaultName) || defaultName)
                : defaultName; // Auto-name for multi-file uploads

            if (!layerName && files.length === 1) {
                hideLoading();
                fileInput.value = '';
                document.getElementById('uploadBtn').disabled = true;
                return;
            }

            const layerId = layerManager.createLayer(layerName, parsed.features, parsed.type, {
                sourceFile: file.name,
                columnMap: parsed.columnMap,
                importDate: new Date().toISOString()
            });

            // Always add to "All Layers" group
            addLayerToGroup(layerId, allLayersGroupId);

            // Also add to active group if one is selected (and it's not "All Layers")
            if (activeGroup && activeGroup !== allLayersGroupId) {
                addLayerToGroup(layerId, activeGroup);
            }

            successCount++;
            console.log(`Layer "${layerName}" created from ${file.name}`);
        } catch (error) {
            console.error(`Error parsing ${file.name}:`, error);
            errorCount++;

            if (files.length === 1) {
                // For single file, show detailed error
                hideLoading();
                const errorMsg = error.message || 'Unknown error occurred';
                showToast(`Error parsing ${file.name}: ${errorMsg}`, 'error', 8000);

                if (errorMsg.includes('\n')) {
                    setTimeout(() => {
                        alert(`File Parsing Error:\n\n${errorMsg}`);
                    }, 500);
                }
            }
            // For multi-file, continue with next file
        }
    }

    hideLoading();

    // Show summary for multi-file uploads
    if (files.length > 1) {
        if (successCount > 0 && errorCount > 0) {
            showToast(`Imported ${successCount} file(s). ${errorCount} file(s) failed.`, 'warning');
        } else if (successCount > 0) {
            showToast(`Successfully imported ${successCount} file(s)`, 'success');
        } else {
            showToast(`Failed to import all files`, 'error');
        }
    } else if (successCount > 0) {
        showToast(`Layer created successfully`, 'success');
    }

    fileInput.value = '';
    document.getElementById('uploadBtn').disabled = true;
    updateColumnSelects();
}

/**
 * Switch import tab
 */
function switchImportTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.import-tab').forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Update tab content
    document.querySelectorAll('.import-tab-content').forEach(content => {
        content.classList.remove('active');
    });

    if (tabName === 'file') {
        document.getElementById('fileTab').classList.add('active');
    } else if (tabName === 'paste') {
        document.getElementById('pasteTab').classList.add('active');
    }
}

/**
 * Handle paste import
 */
async function handlePasteImport() {
    const pasteInput = document.getElementById('pasteInput');
    const pastedData = pasteInput.value.trim();

    if (!pastedData) {
        showToast('Please paste some data first', 'warning');
        return;
    }

    closeModal('uploadModal');
    showLoading('Parsing pasted data...');

    try {
        // Parse pasted data using PapaParse
        const parsed = await new Promise((resolve, reject) => {
            Papa.parse(pastedData, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: true,
                delimiter: '', // Auto-detect delimiter (tab or comma)
                complete: (results) => {
                    try {
                        const processedData = csvParser.processData(results.data, results.meta.fields);
                        resolve(processedData);
                    } catch (error) {
                        reject(error);
                    }
                },
                error: (error) => {
                    reject(error);
                }
            });
        });

        console.log('Pasted data parsed:', parsed);

        if (parsed.needsGeocoding) {
            hideLoading();
            currentCSVData = parsed;
            currentCSVData.fileName = 'Pasted Data';
            const detectedMapping = geocodingService.detectAddressColumns(parsed.originalColumns);
            showColumnMapModal(parsed.originalColumns, detectedMapping);
            return;
        }

        // Validate data before creating layer
        showLoading('Validating pasted data...');

        const rawData = parsed.rawData || parsed.features;
        const validation = csvParser.validateData(rawData, parsed.columnMap, parsed.type);

        console.log('Validation results for pasted data:', validation);

        // If there are validation errors, show validation modal
        if (validation.invalidCount > 0) {
            hideLoading();
            showValidationResults(validation, 'Pasted Data');
            return;
        }

        const layerName = prompt('Enter layer name:', 'Pasted Data');
        if (!layerName) {
            hideLoading();
            return;
        }

        const layerId = layerManager.createLayer(layerName, parsed.features, parsed.type, {
            sourceFile: 'Pasted from clipboard',
            columnMap: parsed.columnMap,
            importDate: new Date().toISOString()
        });

        // Always add to "All Layers" group
        addLayerToGroup(layerId, allLayersGroupId);

        // Also add to active group if one is selected (and it's not "All Layers")
        if (activeGroup && activeGroup !== allLayersGroupId) {
            addLayerToGroup(layerId, activeGroup);
        }

        hideLoading();
        showToast(`Layer "${layerName}" created with ${parsed.features.length} features`, 'success');

        // Clear the textarea
        pasteInput.value = '';
        updateColumnSelects();
    } catch (error) {
        console.error('Error parsing pasted data:', error);
        hideLoading();
        showToast('Error parsing pasted data: ' + error.message, 'error');
    }
}

/**
 * Validate and show validation results
 * @param {Array} data - Raw data rows
 * @param {Object} columnMap - Column mappings
 * @param {string} dataType - Data type
 * @param {string} fileName - File name for reference
 * @returns {Object} Validation results
 */
function validateAndShowResults(data, columnMap, dataType, fileName) {
    // Run validation
    const validation = csvParser.validateData(data, columnMap, dataType);

    // If there are errors, show validation modal
    if (validation.invalidCount > 0) {
        showValidationResults(validation, fileName);
        return validation;
    }

    // If all valid, return validation results
    return validation;
}

/**
 * Show validation results in modal
 */
function showValidationResults(validation, fileName) {
    // Update summary
    const summaryHtml = `
        <p><strong>File:</strong> ${fileName || 'Imported Data'}</p>
        <p>Data validation completed. Review the results below:</p>
        <div class="validation-stats">
            <div class="validation-stat">
                <span class="validation-stat-value">${validation.totalRows}</span>
                <span class="validation-stat-label">Total Rows</span>
            </div>
            <div class="validation-stat">
                <span class="validation-stat-value success">${validation.validCount}</span>
                <span class="validation-stat-label">Valid</span>
            </div>
            <div class="validation-stat">
                <span class="validation-stat-value error">${validation.invalidCount}</span>
                <span class="validation-stat-label">Errors</span>
            </div>
        </div>
    `;
    document.getElementById('validationSummary').innerHTML = summaryHtml;

    // Show errors if any
    const errorsSection = document.getElementById('validationErrors');
    const errorList = document.getElementById('errorList');

    if (validation.errors.length > 0) {
        errorsSection.style.display = 'block';

        // Group errors by row
        const errorsByRow = new Map();
        validation.invalidRows.forEach(invalidRow => {
            errorsByRow.set(invalidRow.rowNum, invalidRow);
        });

        // Build error list HTML
        let errorsHtml = '';
        errorsByRow.forEach((invalidRow, rowNum) => {
            errorsHtml += `
                <div class="error-item">
                    <div class="error-item-header">
                        <span class="error-item-row">Row ${rowNum}</span>
                        <span class="error-item-type">${invalidRow.errors[0].type.replace('_', ' ')}</span>
                    </div>
                    ${invalidRow.errors.map(err => `
                        <div class="error-item-message">
                            <strong>${err.field}:</strong> ${err.message}
                            ${err.value ? `<div class="error-item-details">Value: "${err.value}"</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        });

        errorList.innerHTML = errorsHtml;
    } else {
        errorsSection.style.display = 'none';
    }

    // Show/hide action buttons
    const importValidBtn = document.getElementById('importValidDataBtn');
    const downloadErrorsBtn = document.getElementById('downloadErrorsBtn');

    if (validation.validCount > 0 && validation.invalidCount > 0) {
        importValidBtn.style.display = 'inline-block';
        importValidBtn.onclick = () => handleImportValidData(validation);
    } else {
        importValidBtn.style.display = 'none';
    }

    if (validation.invalidCount > 0) {
        downloadErrorsBtn.style.display = 'inline-block';
        downloadErrorsBtn.onclick = () => handleDownloadErrors(validation);
    } else {
        downloadErrorsBtn.style.display = 'none';
    }

    // Show modal
    showModal('validationModal');
}

/**
 * Import only valid data from validation results
 */
function handleImportValidData(validation) {
    if (!validation || validation.validCount === 0) {
        showToast('No valid data to import', 'warning');
        return;
    }

    closeModal('validationModal');
    showLoading('Processing valid data...');

    try {
        // Process only valid rows
        const features = csvParser.extractFeatures(
            validation.validRows,
            validation.columnMap,
            validation.dataType
        );

        // Create layer with valid data
        const layerName = prompt('Enter layer name:', 'Imported Data (validated)');
        if (layerName) {
            const layerId = layerManager.createLayer(layerName, features, validation.dataType, {
                sourceFile: 'Validated Import',
                columnMap: validation.columnMap,
                importDate: new Date().toISOString(),
                validatedRows: validation.validCount,
                skippedRows: validation.invalidCount
            });

            addLayerToGroup(layerId, allLayersGroupId);

            showToast(
                `Layer "${layerName}" created with ${features.length} valid features. ${validation.invalidCount} rows skipped.`,
                'success'
            );
        }
    } catch (error) {
        console.error('Error importing valid data:', error);
        showToast('Error importing valid data: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Download validation errors as CSV
 */
function handleDownloadErrors(validation) {
    if (!validation || validation.errors.length === 0) {
        showToast('No errors to download', 'warning');
        return;
    }

    try {
        // Build error report CSV
        const errorReport = validation.errors.map(err => ({
            'Row Number': err.rowNum,
            'Error Type': err.type,
            'Field': err.field,
            'Message': err.message,
            'Invalid Value': err.value || ''
        }));

        // Convert to CSV
        const csv = Papa.unparse(errorReport);

        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `validation_errors_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('Error report downloaded', 'success');
    } catch (error) {
        console.error('Error downloading error report:', error);
        showToast('Error downloading report: ' + error.message, 'error');
    }
}

/**
 * Add layer to group
 */
function addLayerToGroup(layerId, groupId) {
    const group = layerGroups.get(groupId);
    if (group) {
        // Ensure layerIds array exists
        if (!group.layerIds) {
            group.layerIds = [];
        }
        if (!group.layerIds.includes(layerId)) {
            group.layerIds.push(layerId);
            updateLayerGroupList();
        }
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

    // Update template dropdown
    updateTemplateSelect();

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

        // Always add to "All Layers" group
        addLayerToGroup(layerId, allLayersGroupId);

        // Also add to active group if one is selected (and it's not "All Layers")
        if (activeGroup && activeGroup !== allLayersGroupId) {
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
 * Template Management Functions
 */

/**
 * Get all saved templates from localStorage
 */
function getTemplates() {
    try {
        const templates = localStorage.getItem('columnMappingTemplates');
        return templates ? JSON.parse(templates) : {};
    } catch (error) {
        console.error('Error loading templates:', error);
        return {};
    }
}

/**
 * Save templates to localStorage
 */
function saveTemplates(templates) {
    try {
        localStorage.setItem('columnMappingTemplates', JSON.stringify(templates));
    } catch (error) {
        console.error('Error saving templates:', error);
        showToast('Error saving templates', 'error');
    }
}

/**
 * Update template select dropdown
 */
function updateTemplateSelect() {
    const templates = getTemplates();
    const templateSelect = document.getElementById('templateSelect');

    // Clear existing options except the first one
    templateSelect.innerHTML = '<option value="">-- No Template --</option>';

    // Add template options
    Object.keys(templates).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        templateSelect.appendChild(option);
    });
}

/**
 * Handle template select change
 */
function handleTemplateSelectChange() {
    const templateSelect = document.getElementById('templateSelect');
    const deleteBtn = document.getElementById('deleteTemplateBtn');

    // Show/hide delete button based on selection
    if (templateSelect.value) {
        deleteBtn.style.display = 'inline-block';
    } else {
        deleteBtn.style.display = 'none';
    }
}

/**
 * Handle save template button click
 */
function handleSaveTemplate() {
    const columnMapping = {
        street1: document.getElementById('street1Column').value,
        street2: document.getElementById('street2Column').value,
        city: document.getElementById('cityColumn').value,
        state: document.getElementById('stateColumn').value,
        zip: document.getElementById('zipColumn').value
    };

    // Validate that at least required fields are filled
    if (!columnMapping.street1 || !columnMapping.city || !columnMapping.zip) {
        showToast('Please select at least Street, City, and Zip columns before saving', 'warning');
        return;
    }

    // Prompt for template name
    const templateName = prompt('Enter a name for this template:');
    if (!templateName || templateName.trim() === '') {
        return;
    }

    // Save template
    const templates = getTemplates();
    templates[templateName.trim()] = columnMapping;
    saveTemplates(templates);

    // Update dropdown
    updateTemplateSelect();

    // Select the newly saved template
    document.getElementById('templateSelect').value = templateName.trim();
    handleTemplateSelectChange();

    showToast(`Template "${templateName}" saved`, 'success');
}

/**
 * Handle load template button click
 */
function handleLoadTemplate() {
    const templateSelect = document.getElementById('templateSelect');
    const templateName = templateSelect.value;

    if (!templateName) {
        showToast('Please select a template to load', 'warning');
        return;
    }

    const templates = getTemplates();
    const template = templates[templateName];

    if (!template) {
        showToast('Template not found', 'error');
        return;
    }

    // Apply template to form
    document.getElementById('street1Column').value = template.street1 || '';
    document.getElementById('street2Column').value = template.street2 || '';
    document.getElementById('cityColumn').value = template.city || '';
    document.getElementById('stateColumn').value = template.state || '';
    document.getElementById('zipColumn').value = template.zip || '';

    showToast(`Template "${templateName}" loaded`, 'success');
}

/**
 * Handle delete template button click
 */
function handleDeleteTemplate() {
    const templateSelect = document.getElementById('templateSelect');
    const templateName = templateSelect.value;

    if (!templateName) {
        showToast('Please select a template to delete', 'warning');
        return;
    }

    if (!confirm(`Are you sure you want to delete template "${templateName}"?`)) {
        return;
    }

    // Delete template
    const templates = getTemplates();
    delete templates[templateName];
    saveTemplates(templates);

    // Update dropdown
    updateTemplateSelect();

    // Reset selection
    templateSelect.value = '';
    handleTemplateSelectChange();

    showToast(`Template "${templateName}" deleted`, 'success');
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
            displayLayers = layers.filter(l => (group.layerIds || []).includes(l.id));
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

    // Auto-save state after layer updates
    saveToLocalStorage();
}

/**
 * Create layer item element (compact version)
 */
function createLayerItem(layer) {
    const div = document.createElement('div');
    div.className = 'layer-item';
    div.dataset.layerId = layer.id;

    const opacity = layer.opacity !== undefined ? layer.opacity : 1.0;
    const opacityPercent = Math.round(opacity * 100);

    div.innerHTML = `
        <div class="layer-header">
            <div class="layer-reorder-btns">
                <button class="layer-move-btn" data-direction="up" title="Move layer up">▲</button>
                <button class="layer-move-btn" data-direction="down" title="Move layer down">▼</button>
            </div>
            <button class="layer-expand-btn" title="Expand layer">▶</button>
            <div class="layer-info">
                <input type="checkbox" class="layer-checkbox" ${layer.visible ? 'checked' : ''}>
                <span class="layer-name" title="${layer.name}">${layer.name}</span>
                <span class="layer-count">${layer.features.length}</span>
            </div>
            <div class="layer-opacity-control">
                <input type="range" class="opacity-slider" min="0" max="100" value="${opacityPercent}" title="Opacity: ${opacityPercent}%">
            </div>
            <button class="layer-menu-btn">⋮</button>
        </div>
        <div class="layer-features-list" style="display: none;"></div>
    `;

    const layerHeader = div.querySelector('.layer-header');
    const featuresContainer = div.querySelector('.layer-features-list');
    const expandBtn = div.querySelector('.layer-expand-btn');

    // Expand/collapse layer
    expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isExpanded = featuresContainer.style.display !== 'none';

        if (isExpanded) {
            featuresContainer.style.display = 'none';
            expandBtn.textContent = '▶';
            expandBtn.title = 'Expand layer';
        } else {
            // Populate features list
            populateFeaturesList(featuresContainer, layer);
            featuresContainer.style.display = 'block';
            expandBtn.textContent = '▼';
            expandBtn.title = 'Collapse layer';
        }
    });

    // Visibility toggle
    div.querySelector('.layer-checkbox').addEventListener('change', (e) => {
        e.stopPropagation();
        layerManager.toggleLayerVisibility(layer.id);
    });

    // Layer reorder buttons
    div.querySelectorAll('.layer-move-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const direction = e.target.dataset.direction;
            layerManager.moveLayer(layer.id, direction);
        });
    });

    // Opacity slider
    const opacitySlider = div.querySelector('.opacity-slider');
    opacitySlider.addEventListener('input', (e) => {
        e.stopPropagation();
        const newOpacity = parseInt(e.target.value) / 100;
        e.target.title = `Opacity: ${e.target.value}%`;
        layerManager.setLayerOpacity(layer.id, newOpacity);
    });

    // Layer menu button
    div.querySelector('.layer-menu-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        showLayerActionsMenu(e.target, layer.id);
    });

    return div;
}

/**
 * Populate the features list for a layer
 */
function populateFeaturesList(container, layer) {
    container.innerHTML = '';

    if (!layer.features || layer.features.length === 0) {
        container.innerHTML = '<p class="empty-state" style="padding: 0.5rem; font-size: 0.85rem;">No features in this layer</p>';
        return;
    }

    layer.features.forEach((feature, index) => {
        const featureItem = document.createElement('div');
        featureItem.className = 'feature-item';
        featureItem.dataset.featureId = feature.id;

        // Get feature name or create a default one
        const featureName = feature.name || feature.Name ||
                           feature.description || feature.Description ||
                           `Feature ${index + 1}`;

        featureItem.innerHTML = `
            <input type="checkbox" class="feature-checkbox" ${!feature.hidden ? 'checked' : ''} title="Toggle visibility">
            <span class="feature-name" title="${featureName}">${featureName}</span>
            <button class="feature-edit-btn" title="Edit feature">✏️</button>
            <button class="feature-delete-btn" title="Delete feature">🗑️</button>
        `;

        // Feature visibility toggle
        const checkbox = featureItem.querySelector('.feature-checkbox');
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            toggleFeatureVisibility(layer.id, feature.id, checkbox.checked);
        });

        // Feature name click - select and show in info panel
        const nameSpan = featureItem.querySelector('.feature-name');
        nameSpan.style.cursor = 'pointer';
        nameSpan.addEventListener('click', (e) => {
            e.stopPropagation();
            selectFeature(layer.id, feature);
        });

        // Edit button
        featureItem.querySelector('.feature-edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            editFeature(layer.id, feature);
        });

        // Delete button
        featureItem.querySelector('.feature-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteFeature(layer.id, feature);
        });

        container.appendChild(featureItem);
    });
}

/**
 * Toggle individual feature visibility
 */
function toggleFeatureVisibility(layerId, featureId, visible) {
    const layer = mapManager.layers.get(layerId);
    if (!layer) return;

    // Find the marker for this feature
    if (layer.markers) {
        const marker = layer.markers.find(m => {
            const mFeature = m.feature;
            return mFeature && (mFeature.getId() === featureId ||
                               (mFeature.getProperty && mFeature.getProperty('id') === featureId));
        });

        if (marker) {
            marker.setVisible(visible);
        }
    }

    // Update feature hidden property
    const layerData = layerManager.getLayer(layerId);
    if (layerData) {
        const feature = layerData.features.find(f => f.id === featureId);
        if (feature) {
            feature.hidden = !visible;
        }
    }
}

/**
 * Select a feature and show its info
 */
function selectFeature(layerId, feature) {
    currentEditingFeature = {
        layerId: layerId,
        id: feature.id,
        properties: feature
    };
    updateFeatureInfo(feature);
}

/**
 * Edit a feature
 */
function editFeature(layerId, feature) {
    currentEditingFeature = {
        layerId: layerId,
        id: feature.id,
        properties: feature
    };
    openEditModal();
}

/**
 * Delete a feature
 */
function deleteFeature(layerId, feature) {
    const featureName = feature.name || feature.Name || 'this feature';
    if (!confirm(`Delete ${featureName}?`)) {
        return;
    }

    layerManager.deleteFeature(layerId, feature.id);
    showToast('Feature deleted', 'success');

    // Refresh the expanded layer if it's still open
    const layerItem = document.querySelector(`[data-layer-id="${layerId}"]`);
    if (layerItem) {
        const featuresContainer = layerItem.querySelector('.layer-features-list');
        if (featuresContainer && featuresContainer.style.display !== 'none') {
            const layer = layerManager.getLayer(layerId);
            populateFeaturesList(featuresContainer, layer);
        }
    }
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
        case 'add':
            handleAddFeatureToLayer(layerId, layer);
            break;

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
 * Handle adding a new feature to a specific layer
 */
function handleAddFeatureToLayer(layerId, layer) {
    // Store the target layer for when drawing completes
    window.targetLayerForNewFeature = layerId;

    // Determine drawing mode based on layer type
    const mode = layer.type === 'point' ? 'draw-point' : 'draw-polygon';
    mapManager.startDrawing(mode);

    const statusText = layer.type === 'point'
        ? `Click on the map to add a point to "${layer.name}"`
        : `Click to draw polygon vertices for "${layer.name}". Double-click to finish.`;

    showToast(statusText, 'info');
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

    // Set current layer opacity
    const currentOpacity = layer.opacity !== undefined ? layer.opacity : 1.0;
    const opacityPercent = Math.round(currentOpacity * 100);
    document.getElementById('layerOpacitySlider').value = opacityPercent;
    document.getElementById('opacityValue').textContent = opacityPercent;

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

    // Get opacity value
    const opacityPercent = parseInt(document.getElementById('layerOpacitySlider').value);
    const opacity = opacityPercent / 100;

    closeModal('styleModal');
    showLoading('Applying style...');

    try {
        if (styleType === 'single') {
            const color = document.getElementById('singleColor').value;
            applySingleColorStyle(layerId, color);
        } else {
            applyPropertyBasedStyle(layerId, property, styleType);
        }

        // Apply opacity to the layer
        layerManager.setLayerOpacity(layerId, opacity);

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
    try {
        const layer = layerManager.getLayer(layerId);
        if (!layer) return;

        // Find the actual property name (case-insensitive)
        let actualPropertyName = property;
        if (layer.features.length > 0) {
            const firstFeature = layer.features[0];
            const foundKey = Object.keys(firstFeature).find(
                key => key.toLowerCase() === property.toLowerCase()
            );
            if (foundKey) {
                actualPropertyName = foundKey;
            }
        }

        // Get unique values for the property
        const uniqueValues = [...new Set(layer.features.map(f => f[actualPropertyName]))].filter(v => v != null);

        console.log('=== PROPERTY STYLING DEBUG ===');
        console.log('Property to style by:', property);
        console.log('Actual property name (case-matched):', actualPropertyName);
        console.log('Unique values found:', uniqueValues);
        console.log('Sample features (first 3):', layer.features.slice(0, 3).map(f => ({
            id: f.id,
            [actualPropertyName]: f[actualPropertyName],
            allProps: Object.keys(f)
        })));

        if (uniqueValues.length === 0) {
            showToast(`No values found for property "${property}"`, 'warning');
            return;
        }

        // Define color schemes (support both number and string keys)
        const tierColors = {
            1: '#107c10',      // Green (number)
            '1': '#107c10',    // Green (string)
            'tier 1': '#107c10',
            2: '#ffb900',      // Yellow (number)
            '2': '#ffb900',    // Yellow (string)
            'tier 2': '#ffb900',
            3: '#d13438',      // Red (number)
            '3': '#d13438',    // Red (string)
            'tier 3': '#d13438'
        };

        const defaultColors = [
            '#0078d4', '#d13438', '#107c10', '#ffb900', '#8764b8',
            '#00b7c3', '#f7630c', '#ca5010', '#038387', '#486860'
        ];

        // Create color mapping
        const colorMap = {};
        uniqueValues.forEach((value, index) => {
            if (styleType === 'tier') {
                // Check direct match first (for numbers), then try string conversion
                const color = tierColors[value] || tierColors[String(value).toLowerCase()];
                if (color) {
                    colorMap[value] = color;
                } else {
                    colorMap[value] = defaultColors[index % defaultColors.length];
                }
            } else {
                colorMap[value] = defaultColors[index % defaultColors.length];
            }
        });

        console.log('Color map created:', colorMap);

        // Remove existing layer
        mapManager.removeLayer(layerId);

        // Enable clustering for point layers
        const enableClustering = layer.type === 'point';
        const dataLayer = mapManager.createDataSource(layerId, enableClustering);

        // Add all features to data source
        const geoJsonFeatures = layer.features.map((feature, index) => {
            let geometry;

            if (layer.type === 'polygon' && feature.wkt) {
                geometry = mapManager.parseWKT(feature.wkt);
            } else if (layer.type === 'point' && feature.latitude && feature.longitude) {
                geometry = {
                    type: 'Point',
                    coordinates: [parseFloat(feature.longitude), parseFloat(feature.latitude)]
                };
            } else {
                return null;
            }

            return {
                type: 'Feature',
                id: feature.id || `${layerId}-${index}`,
                geometry: geometry,
                properties: { ...feature, layerId: layerId }
            };
        }).filter(f => f !== null);

        console.log('GeoJSON features created (first 3):', geoJsonFeatures.slice(0, 3).map(f => ({
            id: f.id,
            geometry: f.geometry.type,
            properties: f.properties
        })));

        // Add features to data layer
        geoJsonFeatures.forEach(geoJsonFeature => {
            dataLayer.addGeoJson(geoJsonFeature);
        });

        console.log('=== END PROPERTY STYLING DEBUG ===');

        // Apply data-driven styling for Google Maps
        if (layer.type === 'polygon') {
            // For polygons, use data layer styling
            dataLayer.setStyle((feature) => {
                const propValue = feature.getProperty(actualPropertyName);
                const color = colorMap[propValue] || '#cccccc';

                return {
                    fillColor: color,
                    fillOpacity: 0.5,
                    strokeColor: color,
                    strokeWeight: 2,
                    clickable: true
                };
            });

            // Store layer reference
            mapManager.layers.set(layerId, {
                dataLayer: dataLayer,
                type: 'polygon',
                color: 'data-driven'
            });

            // Add click event
            dataLayer.addListener('click', (event) => {
                mapManager.handleFeatureClick(event, layerId);
            });
        } else {
            // For points, create markers with appropriate colors
            const markers = [];

            // Hide data layer features so we only see markers (prevents duplicates)
            dataLayer.setStyle({ visible: false });

            // SVG path for teardrop/pin marker
            const pinPath = 'M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1,1 10,-30 C 10,-22 2,-20 0,0 z';

            dataLayer.forEach((feature) => {
                const geometry = feature.getGeometry();
                if (geometry.getType() === 'Point') {
                    const position = geometry.get();
                    const propValue = feature.getProperty(actualPropertyName);
                    const color = colorMap[propValue] || '#cccccc';

                    // Create marker with teardrop icon
                    // Don't set map yet if clustering - let clusterer handle it
                    const marker = new google.maps.Marker({
                        position: { lat: position.lat(), lng: position.lng() },
                        map: enableClustering ? null : mapManager.map, // Only set map if NOT clustering
                        title: feature.getProperty('name') || '',
                        icon: {
                            path: pinPath,
                            fillColor: color,
                            fillOpacity: 0.9,
                            strokeColor: '#ffffff',
                            strokeWeight: 1.5,
                            scale: 0.7, // Smaller size
                            anchor: new google.maps.Point(0, 0), // Anchor at bottom point of pin
                            labelOrigin: new google.maps.Point(0, -30)
                        }
                    });

                    // Store feature reference in marker
                    marker.feature = feature;
                    marker.layerId = layerId;

                    // Add click listener
                    marker.addListener('click', () => {
                        mapManager.handleMarkerClick(marker, layerId);
                    });

                    markers.push(marker);
                }
            });

            // Store markers for later reference
            if (!mapManager.markers.has(layerId)) {
                mapManager.markers.set(layerId, []);
            }
            mapManager.markers.get(layerId).push(...markers);

            // Setup clustering if enabled and MarkerClusterer is available
            let clusterer = null;
            if (enableClustering && markers.length > 0) {
                // Check if MarkerClusterer is available in global scope
                if (typeof markerClusterer !== 'undefined' && markerClusterer.MarkerClusterer) {
                    clusterer = new markerClusterer.MarkerClusterer({
                        map: mapManager.map,
                        markers: markers
                    });
                    console.log(`MarkerClusterer initialized for ${layerId} with ${markers.length} markers`);
                } else {
                    console.warn(`Clustering requested for ${layerId} but MarkerClusterer library not loaded yet`);
                    // Fallback: add markers to map manually
                    markers.forEach(m => m.setMap(mapManager.map));
                }
            }

            // Store layer reference
            mapManager.layers.set(layerId, {
                dataLayer: dataLayer,
                markers: markers,
                clusterer: clusterer,
                type: 'point',
                color: 'data-driven'
            });
        }

        // Fit map to data source
        mapManager.fitMapToDataSource(dataLayer);

        // Store style info
        layer.styleType = styleType;
        layer.styleProperty = actualPropertyName;
        layer.colorMap = colorMap;

        layerManager.notifyUpdate();

        showToast(`Styled by ${property}`, 'success');
    } catch (error) {
        console.error('Error applying style:', error);
        showToast('Error applying style: ' + error.message, 'error');
    }
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
        if (!group.layerIds) {
            group.layerIds = [];
        }
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

    // Handle null/undefined properties
    if (!properties || typeof properties !== 'object') {
        featureInfo.innerHTML = '<p class="empty-state">No details available</p>';
        return;
    }

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
                     properties[key.toUpperCase()] ||
                     properties[key.charAt(0).toUpperCase() + key.slice(1)];

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

    // Add button container
    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '0.5rem';
    btnContainer.style.marginTop = '1rem';

    // Add edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-primary';
    editBtn.textContent = 'Edit';
    editBtn.style.flex = '1';
    editBtn.addEventListener('click', openEditModal);
    btnContainer.appendChild(editBtn);

    // Add delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.flex = '1';
    deleteBtn.addEventListener('click', handleDeleteFeatureFromInfo);
    btnContainer.appendChild(deleteBtn);

    featureInfo.appendChild(btnContainer);
}

/**
 * Handle deleting a feature from the info panel
 */
function handleDeleteFeatureFromInfo() {
    if (!currentEditingFeature) return;

    const featureName = currentEditingFeature.name || 'this feature';
    if (!confirm(`Delete ${featureName}?`)) {
        return;
    }

    layerManager.deleteFeature(currentEditingFeature.layerId, currentEditingFeature.id);

    // Clear selection
    mapManager.clearSelectedFeature();
    currentEditingFeature = null;

    // Reset feature info panel
    document.getElementById('featureInfo').innerHTML =
        '<p class="empty-state">Click on a feature to see details</p>';

    showToast('Feature deleted', 'success');
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

    // Helper function to create form field
    const createFormField = (key, value = '') => {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';

        const label = document.createElement('label');
        label.textContent = key.charAt(0).toUpperCase() + key.slice(1);
        label.setAttribute('for', `edit_${key}`);

        const input = document.createElement('input');
        input.type = 'text';
        input.id = `edit_${key}`;
        input.name = key;
        input.value = value || '';

        formGroup.appendChild(label);
        formGroup.appendChild(input);
        formFields.appendChild(formGroup);
    };

    // Priority fields that should always be shown first
    const priorityFields = ['name', 'description', 'territory', 'bdm', 'tier'];
    const systemFields = ['layerid', 'wkt', 'id'];
    const addedFields = new Set();

    // Add priority fields first (always visible)
    priorityFields.forEach(field => {
        const value = properties[field] || properties[field.toLowerCase()] ||
                     properties[field.toUpperCase()] ||
                     properties[field.charAt(0).toUpperCase() + field.slice(1)] || '';

        createFormField(field, value);
        addedFields.add(field.toLowerCase());
    });

    // Add remaining properties (except system fields and already added)
    for (let [key, value] of Object.entries(properties)) {
        const keyLower = key.toLowerCase();
        if (systemFields.includes(keyLower) || addedFields.has(keyLower)) continue;

        createFormField(key, value);
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

            // Ensure "All Layers" group exists
            if (!allLayersGroupId || !layerGroups.has(allLayersGroupId)) {
                // Try to find existing "All Layers" group by name
                let foundAllLayersGroup = false;
                layerGroups.forEach((group, id) => {
                    if (group.name === 'All Layers') {
                        allLayersGroupId = id;
                        foundAllLayersGroup = true;
                    }
                });

                // Only create a new one if none exists
                if (!foundAllLayersGroup) {
                    allLayersGroupId = createLayerGroup('All Layers');
                }
            }

            // Ensure all layers are in the "All Layers" group
            const allLayersGroup = layerGroups.get(allLayersGroupId);
            if (allLayersGroup) {
                layerManager.getAllLayers().forEach(layer => {
                    addLayerToGroup(layer.id, allLayersGroupId);
                });
            }

            // Re-apply property-based styling for layers that have it
            layerManager.getAllLayers().forEach(layer => {
                if (layer.styleType && layer.styleProperty) {
                    applyPropertyBasedStyle(layer.id, layer.styleProperty, layer.styleType);
                }
            });

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

            // Ensure "All Layers" group exists
            if (!allLayersGroupId || !layerGroups.has(allLayersGroupId)) {
                // Try to find existing "All Layers" group by name
                let foundAllLayersGroup = false;
                layerGroups.forEach((group, id) => {
                    if (group.name === 'All Layers') {
                        allLayersGroupId = id;
                        foundAllLayersGroup = true;
                    }
                });

                // Only create a new one if none exists
                if (!foundAllLayersGroup) {
                    allLayersGroupId = createLayerGroup('All Layers');
                }
            }

            // Ensure all layers are in the "All Layers" group
            const allLayersGroup = layerGroups.get(allLayersGroupId);
            if (allLayersGroup) {
                layerManager.getAllLayers().forEach(layer => {
                    addLayerToGroup(layer.id, allLayersGroupId);
                });
            }

            // Re-apply property-based styling for layers that have it
            layerManager.getAllLayers().forEach(layer => {
                if (layer.styleType && layer.styleProperty) {
                    applyPropertyBasedStyle(layer.id, layer.styleProperty, layer.styleType);
                }
            });

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
function showToast(message, type = 'info', duration = 3000) {
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
    }, duration);

    console.log(`[${type.toUpperCase()}] ${message}`);
}

// Wait for both DOM and Google Maps to be ready
let domReady = false;
let mapsReady = false;

function tryInitialize() {
    if (domReady && mapsReady) {
        initializeApp();
    }
}

// Handle DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        domReady = true;
        tryInitialize();
    });
} else {
    domReady = true;
}

// Handle Google Maps ready (callback for async loading)
window.initMap = function() {
    mapsReady = true;
    tryInitialize();
};

// Fallback: If Google Maps is already loaded (non-async scenario)
if (typeof google !== 'undefined' && google.maps) {
    mapsReady = true;
    tryInitialize();
}
