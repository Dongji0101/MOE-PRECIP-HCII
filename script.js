// Shared map configuration
const mapConfig = {
    center: [25.7, -80.5],
    zoom: 10,
    minZoom: 1,
    maxZoom: 18,
    zoomControl: false,
    doubleClickZoom: false,
    scrollWheelZoom: false,
    boxZoom: false,
    keyboard: false,
    dragging: false,
    touchZoom: false,
    zoomSnap: 0,
    zoomDelta: 0,
    preferCanvas: true
};

const floridaBounds = [[25.15, -81.05], [26.25, -80]];
const floridaFitBounds = [[25.1, -81.1], [26.3, -79.95]];

function createMap(containerId) {
    const m = L.map(containerId, mapConfig);
    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '' });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: '' });
    const terrain = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '' });
    street.addTo(m);
    L.control.layers({ "Street Map": street, "Satellite": satellite, "Terrain": terrain }).addTo(m);
    m.setMaxBounds(floridaBounds);
    m.fitBounds(floridaFitBounds);
    return m;
}

const map = createMap('map');

// --- Prediction Map (lazy-initialized) ---
let predictionMap = null;
let predictionMapInitialized = false;

function initPredictionMap() {
    if (predictionMapInitialized) return;
    predictionMap = createMap('predictionMap');
    predictionMapInitialized = true;
}

// --- Error Map (lazy-initialized) ---

function initErrorMap() {
    if (errorMapInitialized) return;
    errorMap = createMap('errorMap');
    errorMapInitialized = true;
}


// Global variables for data management
let currentDataLayer = null;
let currentData = null;
let timeColumns = [];
let gridMarkers = [];
let gridLayers = [];

// Prediction state
let predictionDataLayer = null;
let predictionData = null;
let predictionGridLayers = [];
let isPredictionMode = false;
let syncListeners = [];

// Error map state
let errorMap = null;
let errorMapInitialized = false;
let errorDataLayer = null;
let errorGridLayers = [];
let isErrorMode = false;

let dataFiles = {
    'Temperature': [
        { value: '21', label: 'Dew Point Temperature (70000 Pa)' },
        { value: '71', label: '2m Temperature' }
    ],
    'Hydrology': [
        { value: '88', label: 'Storm Surface Runoff' },
        { value: '89', label: 'Baseflow-Groundwater Runoff' }
    ],
    'Radiation': [
        { value: '170', label: 'GOES 12 Ch 3 Brightness Temperature' },
        { value: '171', label: 'GOES 12 Ch 4 Brightness Temperature' },
        { value: '172', label: 'GOES 11 Ch 3 Brightness Temperature' },
        { value: '173', label: 'GOES 11 Ch 4 Brightness Temperature' }
    ],
    'Moisture': [
        { value: '66', label: 'Moisture Availability' },
        { value: '67', label: 'Plant Canopy Surface Water' },
        { value: '83', label: 'Precipitation Rate' },
        { value: '84', label: 'Total Precipitation' },
        { value: '143', label: 'Relative Humidity' }
    ],
    'Cloud': [
        { value: '115', label: 'Total Cloud Cover' },
        { value: '116', label: 'Low Cloud Cover' },
        { value: '117', label: 'Medium Cloud Cover' }
    ],
    'Mass': [
        { value: '122', label: 'Pressure (Cloud Base)' },
        { value: '123', label: 'Pressure (Cloud Top)' }
    ],
    'Momentum': [
        { value: '9', label: 'Wind Speed (Gust)' },
        { value: '10', label: 'U Component of Wind (25000 Pa)' },
        { value: '11', label: 'V Component of Wind (25000 Pa)' }
    ]
};

const dataDescriptions = {
    '21': { unit: 'K', name: 'Dew Point Temperature' },
    '71': { unit: 'K', name: '2m Temperature' },
    '88': { unit: 'kg m⁻²', name: 'Storm Surface Runoff' },
    '89': { unit: 'kg m⁻²', name: 'Baseflow-Groundwater Runoff' },
    '170': { unit: 'K', name: 'GOES 12 Ch 3 Brightness Temp' },
    '171': { unit: 'K', name: 'GOES 12 Ch 4 Brightness Temp' },
    '172': { unit: 'K', name: 'GOES 11 Ch 3 Brightness Temp' },
    '173': { unit: 'K', name: 'GOES 11 Ch 4 Brightness Temp' },
    '66': { unit: '%', name: 'Moisture Availability' },
    '67': { unit: 'kg m⁻²', name: 'Plant Canopy Surface Water' },
    '83': { unit: 'kg m⁻² s⁻¹', name: 'Precipitation Rate' },
    '84': { unit: 'kg m⁻²', name: 'Total Precipitation' },
    '143': { unit: '%', name: 'Relative Humidity' },
    '115': { unit: '%', name: 'Total Cloud Cover' },
    '116': { unit: '%', name: 'Low Cloud Cover' },
    '117': { unit: '%', name: 'Medium Cloud Cover' },
    '122': { unit: 'Pa', name: 'Pressure (Cloud Base)' },
    '123': { unit: 'Pa', name: 'Pressure (Cloud Top)' },
    '9': { unit: 'm s⁻¹', name: 'Wind Speed (Gust)' },
    '10': { unit: 'm s⁻¹', name: 'U Wind Component' },
    '11': { unit: 'm s⁻¹', name: 'V Wind Component' }
};

// Fixed global min/max per variable (union of actual + prediction ranges, rounded outward)
const globalBounds = {
    '21':  { min: 230.0,  max: 289.0 },
    '71':  { min: 291.0,  max: 307.0 },
    '88':  { min: 0,      max: 5.0 },
    '89':  { min: 0,      max: 66.0 },
    '170': { min: 190.0,  max: 266.0 },
    '171': { min: 188.0,  max: 307.0 },
    '172': { min: 191.0,  max: 257.0 },
    '173': { min: 189.0,  max: 302.0 },
    '66':  { min: 0,      max: 100 },
    '67':  { min: 0,      max: 0.52 },
    '83':  { min: 0,      max: 0.08 },
    '84':  { min: 0,      max: 371.0 },
    '143': { min: 0,      max: 100 },
    '115': { min: 0,      max: 100 },
    '116': { min: 0,      max: 100 },
    '117': { min: 0,      max: 100 },
    '122': { min: 6400,   max: 102200 },
    '123': { min: 6600,   max: 101500 },
    '9':   { min: 0,      max: 46.0 },
    '10':  { min: -35.0,  max: 31.0 },
    '11':  { min: -26.0,  max: 39.0 }
};

// Shared palette definitions
const tempPalette = [
    [5, 48, 97], [33, 102, 172], [67, 147, 195],
    [146, 197, 222], [209, 229, 240], [253, 219, 149],
    [244, 165, 130], [214, 96, 77], [178, 24, 43], [103, 0, 31]
];
const moisturePalette = [
    [255, 255, 255], [198, 219, 239], [107, 174, 214],
    [33, 113, 181], [8, 81, 156], [129, 15, 124]
];
const defaultPalette = [
    [255, 255, 255], [0, 0, 0]
];

const errorPalette = [
    [5, 48, 97], [33, 102, 172], [146, 197, 222],
    [247, 247, 247],
    [244, 165, 130], [214, 96, 77], [178, 24, 43]
];

const categoryPalettes = {
    'Temperature': tempPalette,
    'Moisture': moisturePalette
};

// Color scale function
function getColor(value, min, max, category, isError) {
    if (value === null || isNaN(value)) return '#cccccc';

    let ratio = (value - min) / (max - min);
    ratio = Math.max(0, Math.min(1, ratio));

    const colors = isError ? errorPalette : (categoryPalettes[category] || defaultPalette);

    const colorIndex = Math.floor(ratio * (colors.length - 1));
    const nextIndex = Math.min(colorIndex + 1, colors.length - 1);
    const localRatio = (ratio * (colors.length - 1)) - colorIndex;

    const color1 = colors[colorIndex];
    const color2 = colors[nextIndex];

    const r = Math.round(color1[0] + (color2[0] - color1[0]) * localRatio);
    const g = Math.round(color1[1] + (color2[1] - color1[1]) * localRatio);
    const b = Math.round(color1[2] + (color2[2] - color1[2]) * localRatio);

    return `rgb(${r}, ${g}, ${b})`;
}


// Generate grid coordinates for Florida
function generateFloridaGrid(gridSize = 25) {
    const bounds = {
        north: 26.2,
        south: 25.2,
        east: -80.0,
        west: -81.0
    };

    const step = 0.01;
    const latSteps = Math.round((bounds.north - bounds.south) / step);
    const lonSteps = Math.round((bounds.east - bounds.west) / step);

    const coordinates = [];
    let gridId = 0;

    for (let row = 0; row <= 99; row++) {
        for (let col = 0; col <= 99; col++) {
            const latCoord = bounds.south + (row * step);
            const lonCoord = bounds.west + (col * step);

            coordinates.push({
                gridId,
                lat: parseFloat(latCoord.toFixed(4)),
                lon: parseFloat(lonCoord.toFixed(4))
            });

            gridId++;
        }
    }

    return coordinates;
}

function getPredictionFilename(filename) {
    return filename === '84' ? 'cyclone_' + filename : filename + '_pred';
}

// Load CSV data -- accepts a full path relative to Data/
async function loadCSVData(category, filename) {
    try {
        showLoading(true);
        const response = await fetch(`./Data/${filename}.csv`);
        if (!response.ok) {
            showLoading(false);
            return null;
        }
        const text = await response.text();

        const lines = text.trim().split('\n');
        const headers = lines[0].split(',');
        const parsedTimeColumns = headers.slice(1);

        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const gridId = parseInt(values[0]);
            const timeSeriesData = values.slice(1).map(v => parseFloat(v));
            data.push({ gridId, values: timeSeriesData });
        }

        showLoading(false);
        return { data, timeColumns: parsedTimeColumns };
    } catch (error) {
        console.error('Error loading CSV data:', error);
        showLoading(false);
        return null;
    }
}

// Refactored: accepts a target map and returns { layerGroup, gridLayers }
function initializeGridLayer(data, targetMap) {
    const layerGroup = L.layerGroup().addTo(targetMap);
    const layers = [];

    const gridCoordinates = generateFloridaGrid(data.length);

    data.forEach((gridData, index) => {
        if (index < gridCoordinates.length) {
            const coord = gridCoordinates[index];

            const rect = L.rectangle(
                [[coord.lat, coord.lon], [coord.lat + .01, coord.lon + .01]],
                {
                    weight: 0.5,
                    color: 0,
                    stroke: false,
                    fillOpacity: 0.6,
                    fillColor: '#cccccc'
                }
            );

            rect.gridMetadata = {
                gridId: coord.gridId,
                lat: coord.lat,
                lon: coord.lon,
                dataValues: gridData.values
            };

            rect.bindTooltip("Loading...", { direction: 'auto' });

            layers.push(rect);
            layerGroup.addLayer(rect);
        }
    });

    return { layerGroup, gridLayers: layers };
}

function formatValue(value, unit) {
    if (unit === 'K') {
        const celsius = value - 273.15;
        return `${celsius.toFixed(2)} °C`;
    }
    return `${value.toFixed(3)} ${unit}`;
}

// Legend DOM configs
const actualLegendConfig = {
    legendId: 'legend', titleId: 'legendTitle',
    minId: 'minValue', maxId: 'maxValue',
    unitId: 'unitLabel', barSelector: '#legend .color-bar'
};
const errorLegendConfig = {
    legendId: 'errorLegend', titleId: 'errorLegendTitle',
    minId: 'errorMinValue', maxId: 'errorMaxValue',
    unitId: 'errorUnitLabel', barSelector: '#errorColorBar'
};

function updateLegend(min, max, category, isError, fileInfo, cfg) {
    const unit = fileInfo ? fileInfo.unit : '';

    document.getElementById(cfg.titleId).textContent = fileInfo ? fileInfo.name : 'Data Range';
    document.getElementById(cfg.unitId).textContent = unit === 'K' ? 'Unit: °C' : `Unit: ${unit}`;
    document.getElementById(cfg.minId).textContent = formatValue(min, unit);
    document.getElementById(cfg.maxId).textContent = formatValue(max, unit);

    const stops = [];
    for (let i = 0; i <= 10; i++) {
        const val = min + (max - min) * (i / 10);
        stops.push(getColor(val, min, max, category, isError));
    }
    document.querySelector(cfg.barSelector).style.background = `linear-gradient(to right, ${stops.join(', ')})`;

    document.getElementById(cfg.legendId).style.display = 'block';
}

// --- Global Playback Variables ---
let playbackInterval = null;
let isPlaying = false;
let playbackSpeed = 500;

// --- Event Listeners ---

document.getElementById('speedSelect').addEventListener('change', function () {
    playbackSpeed = parseInt(this.value);
    if (isPlaying) {
        stopPlayback();
        startPlayback(forward);
    }
});

let forward = true;

document.getElementById('btnPlay').addEventListener('click', function () {
    if (isPlaying) {
        stopPlayback();
    } else {
        startPlayback(forward);
    }
});

document.getElementById('btnRewind').addEventListener('click', function () {
    stopPlayback();
    forward = false;
    startPlayback(forward);
});

document.getElementById('btnFastForward').addEventListener('click', function () {
    stopPlayback();
    forward = true;
    startPlayback(forward);
});

// --- Playback Logic ---

function startPlayback(forward) {
    const slider = document.getElementById('timeSlider');
    if (slider.disabled) return;

    const btn = document.getElementById('btnPlay');
    btn.innerHTML = "&#10074;&#10074;";
    btn.classList.add('btn-playing');

    isPlaying = true;
    const step = forward ? 1 : -1;

    playbackInterval = setInterval(() => {
        const maxVal = parseInt(slider.max);
        let currentVal = parseInt(slider.value);

        if (currentVal >= maxVal) {
            slider.value = 0;
            stopPlayback();
            return;
        } else {
            slider.value = currentVal + step;
        }

        slider.dispatchEvent(new Event('input'));
    }, playbackSpeed);
}

function stopPlayback() {
    clearInterval(playbackInterval);
    isPlaying = false;

    const btn = document.getElementById('btnPlay');
    btn.innerHTML = "&#9658;";
    btn.classList.remove('btn-playing');
}

function stepSlider(step) {
    const slider = document.getElementById('timeSlider');
    if (slider.disabled) return;

    let newVal = parseInt(slider.value) + step;
    const maxVal = parseInt(slider.max);

    if (newVal < 0) newVal = 0;
    if (newVal > maxVal) newVal = maxVal;

    slider.value = newVal;
    slider.dispatchEvent(new Event('input'));
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

// --- Category / File selection ---

document.getElementById('dataCategory').addEventListener('change', function () {
    const category = this.value;
    const dataFileSelect = document.getElementById('dataFile');

    dataFileSelect.innerHTML = '<option value="">Select data type...</option>';
    dataFileSelect.disabled = !category;

    if (category && dataFiles[category]) {
        dataFiles[category].forEach(file => {
            const option = document.createElement('option');
            option.value = file.value;
            option.textContent = file.label;
            dataFileSelect.appendChild(option);
        });
        dataFileSelect.disabled = false;
    }

    document.getElementById('timeSlider').disabled = true;
    document.getElementById('loadData').disabled = true;
    document.getElementById('timeLabel').textContent = 'Select data first';
});

document.getElementById('dataFile').addEventListener('change', function () {
    const hasFile = this.value !== '';
    document.getElementById('loadData').disabled = !hasFile;
});

// --- Load Data ---

document.getElementById('loadData').addEventListener('click', async function () {
    stopPlayback();
    const category = document.getElementById('dataCategory').value;
    const filename = document.getElementById('dataFile').value;

    if (!category || !filename) return;

    // Load actual data
    const actualResult = await loadCSVData(category, filename);
    if (!actualResult) {
        alert('Error loading data. Please check the file path and try again.');
        return;
    }

    currentData = actualResult.data;
    timeColumns = actualResult.timeColumns;

    // Tear down old actual layers
    if (currentDataLayer) {
        map.removeLayer(currentDataLayer);
        currentDataLayer = null;
    }
    gridLayers = [];

    const actualGrid = initializeGridLayer(currentData, map);
    currentDataLayer = actualGrid.layerGroup;
    gridLayers = actualGrid.gridLayers;

    // Handle prediction side
    clearPredictionLayers();
    clearErrorLayers();
    predictionData = null;
    document.getElementById('predictionStatus').textContent = '';

    if (isPredictionMode) {
        const predResult = await loadCSVData(category, getPredictionFilename(filename));
        if (predResult) {
            predictionData = predResult.data;
            initPredictionMap();
            const predGrid = initializeGridLayer(predictionData, predictionMap);
            predictionDataLayer = predGrid.layerGroup;
            predictionGridLayers = predGrid.gridLayers;
            document.getElementById('predictionStatus').textContent = '';

            if (isErrorMode && errorMap) {
                buildErrorGrid();
            }

            syncMapTooltips();
        } else {
            document.getElementById('predictionStatus').textContent = 'No prediction file found for this variable.';
        }
    }

    // Enable time slider
    const timeSlider = document.getElementById('timeSlider');
    timeSlider.max = timeColumns.length - 1;
    timeSlider.value = 0;
    timeSlider.disabled = false;

    updateVisualization(0);
    updateTimeLabel(0);
});

// --- Time Slider ---

document.getElementById('timeSlider').addEventListener('input', function () {
    const timeIndex = parseInt(this.value);
    updateVisualization(timeIndex);
    updateTimeLabel(timeIndex);
});

// --- Prediction Toggle ---

document.getElementById('predictionToggle').addEventListener('change', function () {
    isPredictionMode = this.checked;
    const predContainer = document.getElementById('prediction-map-container');
    const actualLabel = document.getElementById('actualMapLabel');
    const controlPanel = document.querySelector('.control-panel');
    const errorToggleGroup = document.getElementById('errorToggleGroup');

    if (isPredictionMode) {
        controlPanel.classList.add('compact');
        initPredictionMap();
        predContainer.style.display = '';
        actualLabel.style.display = '';
        errorToggleGroup.style.display = '';

        setTimeout(() => {
            map.invalidateSize();
            map.fitBounds(floridaFitBounds);
            predictionMap.invalidateSize();
            predictionMap.fitBounds(floridaFitBounds);
            if (isErrorMode && errorMap) {
                errorMap.invalidateSize();
                errorMap.fitBounds(floridaFitBounds);
            }
        }, 50);

        if (currentData) {
            loadPredictionForCurrentFile();
        }
    } else {
        controlPanel.classList.remove('compact');
        predContainer.style.display = 'none';
        actualLabel.style.display = 'none';
        document.getElementById('predictionStatus').textContent = '';

        // Tear down error map state
        document.getElementById('errorToggle').checked = false;
        isErrorMode = false;
        errorToggleGroup.style.display = 'none';
        document.getElementById('error-map-container').style.display = 'none';
        clearErrorLayers();

        setTimeout(() => {
            map.invalidateSize();
            map.fitBounds(floridaFitBounds);
        }, 50);

        clearPredictionLayers();
        predictionData = null;
    }
});

// --- Error Toggle ---

document.getElementById('errorToggle').addEventListener('change', function () {
    isErrorMode = this.checked;
    const errContainer = document.getElementById('error-map-container');

    if (isErrorMode) {
        initErrorMap();
        errContainer.style.display = '';

        if (currentData && predictionData) {
            buildErrorGrid();
            syncMapTooltips();
            const timeIndex = parseInt(document.getElementById('timeSlider').value);
            updateVisualization(timeIndex);
        }

        setTimeout(() => {
            map.invalidateSize();
            map.fitBounds(floridaFitBounds);
            if (predictionMap) {
                predictionMap.invalidateSize();
                predictionMap.fitBounds(floridaFitBounds);
            }
            errorMap.invalidateSize();
            errorMap.fitBounds(floridaFitBounds);
        }, 50);
    } else {
        errContainer.style.display = 'none';
        clearErrorLayers();
        syncMapTooltips();

        setTimeout(() => {
            map.invalidateSize();
            map.fitBounds(floridaFitBounds);
            if (predictionMap && isPredictionMode) {
                predictionMap.invalidateSize();
                predictionMap.fitBounds(floridaFitBounds);
            }
        }, 50);
    }
});

async function loadPredictionForCurrentFile() {
    const category = document.getElementById('dataCategory').value;
    const filename = document.getElementById('dataFile').value;
    if (!category || !filename) return;

    clearPredictionLayers();

    const predResult = await loadCSVData(category, getPredictionFilename(filename));
    if (predResult) {
        predictionData = predResult.data;
        const predGrid = initializeGridLayer(predictionData, predictionMap);
        predictionDataLayer = predGrid.layerGroup;
        predictionGridLayers = predGrid.gridLayers;
        document.getElementById('predictionStatus').textContent = '';

        if (isErrorMode && errorMap) {
            buildErrorGrid();
        }

        syncMapTooltips();

        const timeIndex = parseInt(document.getElementById('timeSlider').value);
        updateVisualization(timeIndex);
    } else {
        predictionData = null;
        clearErrorLayers();
        document.getElementById('predictionStatus').textContent = 'No prediction file found for this variable.';
    }
}

function clearSyncListeners() {
    syncListeners.forEach(({ layer, event, handler }) => {
        layer.off(event, handler);
    });
    syncListeners = [];
}

function syncMapTooltips() {
    clearSyncListeners();

    function addSync(sourceList, targetLists) {
        sourceList.forEach((layer, i) => {
            const onOver = () => {
                targetLists.forEach(tl => { if (tl[i]) tl[i].openTooltip(); });
            };
            const onOut = () => {
                targetLists.forEach(tl => { if (tl[i]) tl[i].closeTooltip(); });
            };
            layer.on('mouseover', onOver);
            layer.on('mouseout', onOut);
            syncListeners.push({ layer, event: 'mouseover', handler: onOver });
            syncListeners.push({ layer, event: 'mouseout', handler: onOut });
        });
    }

    const allLists = [gridLayers];
    if (isPredictionMode && predictionGridLayers.length > 0) allLists.push(predictionGridLayers);
    if (isErrorMode && errorGridLayers.length > 0) allLists.push(errorGridLayers);

    allLists.forEach(src => {
        const targets = allLists.filter(l => l !== src);
        addSync(src, targets);
    });
}

function clearPredictionLayers() {
    clearSyncListeners();
    if (predictionDataLayer && predictionMap) {
        predictionMap.removeLayer(predictionDataLayer);
    }
    predictionDataLayer = null;
    predictionGridLayers = [];
}

// --- Error Map helpers ---

function buildErrorGrid() {
    clearErrorLayers();
    if (!currentData || !predictionData || !errorMap) return;

    const numCells = Math.min(currentData.length, predictionData.length);
    const numTimes = currentData[0] ? currentData[0].values.length : 0;

    const errorData = [];
    for (let i = 0; i < numCells; i++) {
        const errValues = [];
        const aVals = currentData[i].values;
        const pVals = predictionData[i].values;
        for (let t = 0; t < numTimes; t++) {
            const a = aVals[t];
            const p = (pVals && t < pVals.length) ? pVals[t] : NaN;
            errValues.push((!isNaN(a) && !isNaN(p)) ? (a - p) : NaN);
        }
        errorData.push({ gridId: i, values: errValues });
    }

    const errGrid = initializeGridLayer(errorData, errorMap);
    errorDataLayer = errGrid.layerGroup;
    errorGridLayers = errGrid.gridLayers;
}

function clearErrorLayers() {
    if (errorDataLayer && errorMap) {
        errorMap.removeLayer(errorDataLayer);
    }
    errorDataLayer = null;
    errorGridLayers = [];
    document.getElementById('errorLegend').style.display = 'none';
}

// --- Clear ---

document.getElementById('clearData').addEventListener('click', function () {
    stopPlayback();

    if (currentDataLayer) {
        map.removeLayer(currentDataLayer);
        currentDataLayer = null;
    }
    gridLayers = [];

    clearPredictionLayers();
    predictionData = null;

    clearErrorLayers();
    document.getElementById('errorToggle').checked = false;
    isErrorMode = false;
    document.getElementById('errorToggleGroup').style.display = 'none';
    document.getElementById('error-map-container').style.display = 'none';

    document.getElementById('predictionToggle').checked = false;
    isPredictionMode = false;
    document.querySelector('.control-panel').classList.remove('compact');
    document.getElementById('prediction-map-container').style.display = 'none';
    document.getElementById('actualMapLabel').style.display = 'none';
    document.getElementById('predictionStatus').textContent = '';

    setTimeout(() => { map.invalidateSize(); }, 50);

    document.getElementById('legend').style.display = 'none';

    document.getElementById('dataCategory').value = '';
    document.getElementById('dataFile').innerHTML = '<option value="">Select data type...</option>';
    document.getElementById('dataFile').disabled = true;
    document.getElementById('timeSlider').disabled = true;
    document.getElementById('timeSlider').value = 0;
    document.getElementById('loadData').disabled = true;
    document.getElementById('timeLabel').textContent = 'Select data first';

    currentData = null;
    timeColumns = [];
});

// --- Visualization Update (shared scale) ---

function gatherValues(layers, timeIndex) {
    const values = [];
    layers.forEach(layer => {
        if (layer.gridMetadata && layer.gridMetadata.dataValues) {
            const val = layer.gridMetadata.dataValues[timeIndex];
            if (val !== null && val !== undefined && !isNaN(val)) {
                values.push(val);
            }
        }
    });
    return values;
}

function updateVisualization(timeIndex) {
    if (!currentData || gridLayers.length === 0) {
        console.warn("Update skipped: No data or grid layers found.");
        return;
    }

    const fileElement = document.getElementById('dataFile');
    const fileInfo = dataDescriptions[fileElement.value] || { unit: '', name: 'Unknown' };
    const fileId = fileElement.value;
    const category = document.getElementById('dataCategory').value;

    let minVal, maxVal;

    if (globalBounds[fileId]) {
        minVal = globalBounds[fileId].min;
        maxVal = globalBounds[fileId].max;
    } else {
        const actualValues = gatherValues(gridLayers, timeIndex);
        const predValues = (isPredictionMode && predictionGridLayers.length > 0)
            ? gatherValues(predictionGridLayers, timeIndex)
            : [];
        const allValues = actualValues.concat(predValues);

        if (allValues.length === 0) {
            console.warn("No valid data values found for time index:", timeIndex);
            return;
        }

        minVal = Math.min(...allValues);
        maxVal = Math.max(...allValues);
        if (minVal === maxVal) maxVal = minVal + 0.001;
    }

    const rawTime = timeColumns[timeIndex] || "Unknown Time";
    const timeString = rawTime.replace(/_/g, ' ').replace('.npy', '');

    updateGridLayers(gridLayers, timeIndex, minVal, maxVal, category, false, fileInfo, timeString);

    if (isPredictionMode && predictionGridLayers.length > 0) {
        updateGridLayers(predictionGridLayers, timeIndex, minVal, maxVal, category, false, fileInfo, timeString);
    }

    updateLegend(minVal, maxVal, category, false, fileInfo, actualLegendConfig);

    if (isErrorMode && errorGridLayers.length > 0) {
        const errValues = gatherValues(errorGridLayers, timeIndex);
        if (errValues.length > 0) {
            const maxAbs = Math.max(...errValues.map(v => Math.abs(v))) || 0.001;
            const errorUnit = fileInfo.unit === 'K' ? '°C' : fileInfo.unit;
            const errorInfo = { unit: errorUnit, name: fileInfo.name + ' Error' };
            updateGridLayers(errorGridLayers, timeIndex, -maxAbs, maxAbs, category, true, errorInfo, timeString);
            updateLegend(-maxAbs, maxAbs, category, true, errorInfo, errorLegendConfig);
        }
    }
}

function updateGridLayers(layers, timeIndex, minVal, maxVal, category, isError, fileInfo, timeString) {
    layers.forEach(layer => {
        const value = layer.gridMetadata.dataValues[timeIndex];

        if (value === null || value === undefined || isNaN(value)) {
            layer.setStyle({ fillOpacity: 0, opacity: 0 });
        } else {
            const color = getColor(value, minVal, maxVal, category, isError);
            const displayValue = formatValue(value, fileInfo.unit);

            layer.setStyle({
                fillColor: color,
                fillOpacity: 0.7,
                opacity: 0.0,
            });

            const tooltipContent = `
                <div style="text-align: center; min-width: 200px;">
                    <h4 style="margin: 0 0 8px 0; color: #2c3e50; border-bottom: 1px solid #bdc3c7; padding-bottom: 4px;">Grid Point ${layer.gridMetadata.gridId}</h4>
                    <div style="text-align: left;">
                        <p style="margin: 4px 0;"><strong>Value:</strong> ${displayValue}</p>
                        <p style="margin: 4px 0;"><strong>Lat/Lon:</strong> ${layer.gridMetadata.lat.toFixed(3)}, ${layer.gridMetadata.lon.toFixed(3)}</p>
                        <p style="margin: 4px 0;"><strong>Time:</strong> ${timeString}</p>
                    </div>
                </div>
            `;

            layer.setTooltipContent(tooltipContent);
        }
    });
}

function updateTimeLabel(timeIndex) {
    const timeLabel = document.getElementById('timeLabel');
    if (timeColumns.length > 0 && timeIndex >= 0 && timeIndex < timeColumns.length) {
        const timestamp = timeColumns[timeIndex];
        const match = timestamp.match(/(\d{8})_(\d{2})_/);
        if (match) {
            const date = match[1];
            const hour = match[2];
            const year = date.substring(0, 4);
            const month = date.substring(4, 6);
            const day = date.substring(6, 8);
            timeLabel.textContent = `${year}-${month}-${day} ${hour}:00`;
        } else {
            timeLabel.textContent = timestamp;
        }
    }
}

// Handle window resize for both maps
window.addEventListener('resize', function () {
    map.invalidateSize();
    if (predictionMap && isPredictionMode) {
        predictionMap.invalidateSize();
    }
    if (errorMap && isErrorMode) {
        errorMap.invalidateSize();
    }
});