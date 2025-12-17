/**
 * Analytics Panel Module
 * v3.0: Comprehensive territory intelligence and metrics
 * Part of SalesMapper Phase 2: Analytics & Insights
 */

class AnalyticsPanel {
    constructor(layerManager, stateManager) {
        this.layerManager = layerManager;
        this.stateManager = stateManager;
        this.refreshInterval = null;
        this.activeView = 'overview'; // overview, layers, performance
    }

    /**
     * Initialize analytics panel
     */
    initialize() {
        this.setupEventListeners();
        this.startAutoRefresh();
        console.log('Analytics Panel initialized (v3.0)');
    }

    /**
     * Calculate all metrics
     * @returns {Object} Comprehensive metrics object
     */
    calculateMetrics() {
        const layers = this.layerManager.getAllLayers();
        const metrics = {
            overview: this.calculateOverviewMetrics(layers),
            layers: this.calculateLayerMetrics(layers),
            performance: this.calculatePerformanceMetrics(layers),
            coverage: this.calculateCoverageMetrics(layers)
        };

        return metrics;
    }

    /**
     * Calculate overview metrics
     */
    calculateOverviewMetrics(layers) {
        const pointLayers = layers.filter(l => l.type === 'point');
        const polygonLayers = layers.filter(l => l.type === 'polygon');

        const totalFeatures = layers.reduce((sum, l) => sum + l.features.length, 0);
        const totalPoints = pointLayers.reduce((sum, l) => sum + l.features.length, 0);
        const totalPolygons = polygonLayers.reduce((sum, l) => sum + l.features.length, 0);

        // Calculate total area for all polygon layers
        let totalArea = 0;
        polygonLayers.forEach(layer => {
            totalArea += Utils.calculateTotalArea(layer.features);
        });

        // Calculate density (points per square mile)
        const density = totalArea > 0 ? (totalPoints / (totalArea / 2589988.11)) : 0;

        // Get all unique properties across all features
        const allProperties = new Set();
        layers.forEach(layer => {
            layer.features.forEach(feature => {
                if (feature.properties) {
                    Object.keys(feature.properties).forEach(key => allProperties.add(key));
                }
            });
        });

        return {
            totalLayers: layers.length,
            totalFeatures: totalFeatures,
            totalPoints: totalPoints,
            totalPolygons: totalPolygons,
            totalArea: totalArea,
            totalAreaFormatted: Utils.formatArea(totalArea),
            density: density,
            densityFormatted: density.toFixed(2),
            uniqueProperties: allProperties.size,
            propertyList: Array.from(allProperties)
        };
    }

    /**
     * Calculate per-layer metrics
     */
    calculateLayerMetrics(layers) {
        return layers.map(layer => {
            const featureCount = layer.features.length;
            let area = 0;
            let avgArea = 0;

            if (layer.type === 'polygon') {
                area = Utils.calculateTotalArea(layer.features);
                avgArea = featureCount > 0 ? area / featureCount : 0;
            }

            // Calculate property statistics
            const propertyStats = this.calculatePropertyStats(layer.features);

            return {
                id: layer.id,
                name: layer.name,
                type: layer.type,
                featureCount: featureCount,
                area: area,
                areaFormatted: Utils.formatArea(area),
                avgArea: avgArea,
                avgAreaFormatted: Utils.formatArea(avgArea),
                visible: layer.visible,
                propertyStats: propertyStats
            };
        });
    }

    /**
     * Calculate performance metrics (if revenue/sales data exists)
     */
    calculatePerformanceMetrics(layers) {
        const metrics = {
            hasRevenueData: false,
            totalRevenue: 0,
            avgRevenue: 0,
            revenueByTerritory: [],
            revenueByProperty: {}
        };

        // Common revenue property names to look for
        const revenueKeys = ['revenue', 'sales', 'amount', 'value', 'total'];
        let revenueKey = null;

        // Find if any features have revenue data
        for (const layer of layers) {
            for (const feature of layer.features) {
                if (feature.properties) {
                    const foundKey = Object.keys(feature.properties).find(key =>
                        revenueKeys.some(rk => key.toLowerCase().includes(rk))
                    );
                    if (foundKey) {
                        revenueKey = foundKey;
                        metrics.hasRevenueData = true;
                        break;
                    }
                }
            }
            if (revenueKey) break;
        }

        if (metrics.hasRevenueData && revenueKey) {
            // Calculate revenue metrics
            let totalRevenue = 0;
            let count = 0;
            const revenueByTerritory = {};

            layers.forEach(layer => {
                let layerRevenue = 0;
                layer.features.forEach(feature => {
                    if (feature.properties && feature.properties[revenueKey]) {
                        const value = parseFloat(feature.properties[revenueKey]);
                        if (!isNaN(value)) {
                            totalRevenue += value;
                            layerRevenue += value;
                            count++;
                        }
                    }
                });

                if (layerRevenue > 0) {
                    revenueByTerritory[layer.name] = {
                        revenue: layerRevenue,
                        formatted: this.formatCurrency(layerRevenue)
                    };
                }
            });

            metrics.totalRevenue = totalRevenue;
            metrics.avgRevenue = count > 0 ? totalRevenue / count : 0;
            metrics.totalRevenueFormatted = this.formatCurrency(totalRevenue);
            metrics.avgRevenueFormatted = this.formatCurrency(metrics.avgRevenue);
            metrics.revenueByTerritory = Object.entries(revenueByTerritory)
                .map(([name, data]) => ({ name, ...data }))
                .sort((a, b) => b.revenue - a.revenue);
            metrics.revenueKey = revenueKey;
        }

        return metrics;
    }

    /**
     * Calculate coverage metrics
     */
    calculateCoverageMetrics(layers) {
        const polygonLayers = layers.filter(l => l.type === 'polygon');

        // Calculate coverage efficiency
        const metrics = {
            territoryCount: polygonLayers.reduce((sum, l) => sum + l.features.length, 0),
            avgTerritorySize: 0,
            smallestTerritory: null,
            largestTerritory: null,
            sizeVariance: 0
        };

        if (polygonLayers.length > 0) {
            const areas = [];
            let smallestArea = Infinity;
            let largestArea = 0;
            let smallestInfo = null;
            let largestInfo = null;

            polygonLayers.forEach(layer => {
                layer.features.forEach(feature => {
                    const area = Utils.calculatePolygonArea(feature);
                    if (area > 0) {
                        areas.push(area);

                        if (area < smallestArea) {
                            smallestArea = area;
                            smallestInfo = {
                                layerName: layer.name,
                                featureName: feature.properties?.name || 'Unnamed',
                                area: area,
                                areaFormatted: Utils.formatArea(area)
                            };
                        }

                        if (area > largestArea) {
                            largestArea = area;
                            largestInfo = {
                                layerName: layer.name,
                                featureName: feature.properties?.name || 'Unnamed',
                                area: area,
                                areaFormatted: Utils.formatArea(area)
                            };
                        }
                    }
                });
            });

            if (areas.length > 0) {
                metrics.avgTerritorySize = areas.reduce((sum, a) => sum + a, 0) / areas.length;
                metrics.avgTerritorySizeFormatted = Utils.formatArea(metrics.avgTerritorySize);
                metrics.smallestTerritory = smallestInfo;
                metrics.largestTerritory = largestInfo;

                // Calculate variance (measure of territory size consistency)
                const mean = metrics.avgTerritorySize;
                const squaredDiffs = areas.map(a => Math.pow(a - mean, 2));
                metrics.sizeVariance = Math.sqrt(squaredDiffs.reduce((sum, d) => sum + d, 0) / areas.length);
            }
        }

        return metrics;
    }

    /**
     * Calculate statistics for feature properties
     */
    calculatePropertyStats(features) {
        const stats = {};

        if (features.length === 0) return stats;

        // Get all property keys
        const propertyKeys = new Set();
        features.forEach(f => {
            if (f.properties) {
                Object.keys(f.properties).forEach(key => propertyKeys.add(key));
            }
        });

        // Calculate stats for each numeric property
        propertyKeys.forEach(key => {
            const values = features
                .map(f => f.properties?.[key])
                .filter(v => v !== null && v !== undefined && v !== '');

            if (values.length === 0) return;

            // Check if numeric
            const numericValues = values.filter(v => !isNaN(parseFloat(v))).map(v => parseFloat(v));

            if (numericValues.length > 0) {
                const sum = numericValues.reduce((a, b) => a + b, 0);
                const avg = sum / numericValues.length;
                const sorted = [...numericValues].sort((a, b) => a - b);
                const min = sorted[0];
                const max = sorted[sorted.length - 1];
                const median = sorted[Math.floor(sorted.length / 2)];

                stats[key] = {
                    type: 'numeric',
                    count: numericValues.length,
                    sum: sum,
                    avg: avg,
                    min: min,
                    max: max,
                    median: median
                };
            } else {
                // Categorical data
                const uniqueValues = new Set(values);
                const valueCounts = {};
                values.forEach(v => {
                    valueCounts[v] = (valueCounts[v] || 0) + 1;
                });

                stats[key] = {
                    type: 'categorical',
                    count: values.length,
                    unique: uniqueValues.size,
                    values: Object.entries(valueCounts)
                        .map(([value, count]) => ({ value, count }))
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 10) // Top 10
                };
            }
        });

        return stats;
    }

    /**
     * Format currency
     */
    formatCurrency(value) {
        if (value === 0) return '$0';

        if (value >= 1000000) {
            return `$${(value / 1000000).toFixed(2)}M`;
        } else if (value >= 1000) {
            return `$${(value / 1000).toFixed(2)}K`;
        } else {
            return `$${value.toFixed(2)}`;
        }
    }

    /**
     * Render analytics dashboard
     */
    render() {
        const metrics = this.calculateMetrics();
        const container = document.getElementById('analyticsContent');

        if (!container) {
            console.error('Analytics content container not found');
            return;
        }

        container.innerHTML = this.renderOverview(metrics.overview) +
                              this.renderPerformance(metrics.performance) +
                              this.renderLayerMetrics(metrics.layers) +
                              this.renderCoverageAnalysis(metrics.coverage);
    }

    /**
     * Render overview section
     */
    renderOverview(metrics) {
        return `
            <div class="analytics-section">
                <h3>📊 Overview</h3>
                <div class="metrics-grid">
                    <div class="metric-card">
                        <div class="metric-value">${metrics.totalLayers}</div>
                        <div class="metric-label">Total Layers</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${metrics.totalFeatures}</div>
                        <div class="metric-label">Total Features</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${metrics.totalPoints}</div>
                        <div class="metric-label">Points</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${metrics.totalPolygons}</div>
                        <div class="metric-label">Territories</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${metrics.totalAreaFormatted}</div>
                        <div class="metric-label">Total Coverage</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${metrics.densityFormatted}</div>
                        <div class="metric-label">Points per Sq Mi</div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render performance section
     */
    renderPerformance(metrics) {
        if (!metrics.hasRevenueData) {
            return `
                <div class="analytics-section">
                    <h3>💰 Performance</h3>
                    <div class="analytics-empty-state">
                        <p>No revenue data found in features.</p>
                        <p class="text-muted">Add properties like "revenue", "sales", or "amount" to see performance metrics.</p>
                    </div>
                </div>
            `;
        }

        const topTerritories = metrics.revenueByTerritory.slice(0, 5);

        return `
            <div class="analytics-section">
                <h3>💰 Performance</h3>
                <div class="metrics-grid">
                    <div class="metric-card highlight">
                        <div class="metric-value">${metrics.totalRevenueFormatted}</div>
                        <div class="metric-label">Total Revenue</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${metrics.avgRevenueFormatted}</div>
                        <div class="metric-label">Average per Feature</div>
                    </div>
                </div>

                ${topTerritories.length > 0 ? `
                    <div class="territory-rankings">
                        <h4>Top Territories by Revenue</h4>
                        ${topTerritories.map((t, i) => `
                            <div class="ranking-item">
                                <span class="rank">#${i + 1}</span>
                                <span class="territory-name">${t.name}</span>
                                <span class="territory-value">${t.formatted}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Render layer metrics section
     */
    renderLayerMetrics(layers) {
        if (layers.length === 0) {
            return `
                <div class="analytics-section">
                    <h3>📁 Layer Analysis</h3>
                    <div class="analytics-empty-state">
                        <p>No layers to analyze.</p>
                    </div>
                </div>
            `;
        }

        return `
            <div class="analytics-section">
                <h3>📁 Layer Analysis</h3>
                <div class="layer-metrics-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Layer</th>
                                <th>Type</th>
                                <th>Features</th>
                                <th>Area</th>
                                <th>Avg Size</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${layers.map(layer => `
                                <tr>
                                    <td class="layer-name-cell">${layer.name}</td>
                                    <td>${layer.type === 'point' ? '📍 Point' : '🗺️ Polygon'}</td>
                                    <td>${layer.featureCount}</td>
                                    <td>${layer.type === 'polygon' ? layer.areaFormatted : '-'}</td>
                                    <td>${layer.type === 'polygon' && layer.avgArea > 0 ? layer.avgAreaFormatted : '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    /**
     * Render coverage analysis section
     */
    renderCoverageAnalysis(metrics) {
        if (metrics.territoryCount === 0) {
            return '';
        }

        return `
            <div class="analytics-section">
                <h3>🎯 Coverage Analysis</h3>
                <div class="metrics-grid">
                    <div class="metric-card">
                        <div class="metric-value">${metrics.territoryCount}</div>
                        <div class="metric-label">Total Territories</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${metrics.avgTerritorySizeFormatted || 'N/A'}</div>
                        <div class="metric-label">Avg Territory Size</div>
                    </div>
                </div>

                ${metrics.smallestTerritory ? `
                    <div class="coverage-details">
                        <div class="coverage-item">
                            <strong>Smallest Territory:</strong>
                            ${metrics.smallestTerritory.featureName} (${metrics.smallestTerritory.layerName})
                            <span class="coverage-value">${metrics.smallestTerritory.areaFormatted}</span>
                        </div>
                        <div class="coverage-item">
                            <strong>Largest Territory:</strong>
                            ${metrics.largestTerritory.featureName} (${metrics.largestTerritory.layerName})
                            <span class="coverage-value">${metrics.largestTerritory.areaFormatted}</span>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for layer changes to refresh analytics
        if (window.eventBus) {
            eventBus.on('layer.created', () => this.render());
            eventBus.on('layer.deleted', () => this.render());
            eventBus.on('features.added', () => this.render());
            eventBus.on('feature.deleted', () => this.render());
        }
    }

    /**
     * Start auto-refresh
     */
    startAutoRefresh(intervalMs = 30000) {
        // Refresh every 30 seconds
        this.refreshInterval = setInterval(() => {
            if (this.stateManager.get('activeTab') === 'analytics') {
                this.render();
            }
        }, intervalMs);
    }

    /**
     * Stop auto-refresh
     */
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    /**
     * Export metrics as JSON
     */
    exportMetrics() {
        const metrics = this.calculateMetrics();
        const json = JSON.stringify(metrics, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnalyticsPanel;
}
