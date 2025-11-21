/**
 * CSV Parser
 * Handles CSV file upload and parsing with support for various data formats
 */

class CSVParser {
    constructor() {
        this.supportedColumns = {
            // Geometry columns
            wkt: ['wkt', 'geometry', 'shape', 'geom', 'polygon', 'the_geom'],
            latitude: ['latitude', 'lat', 'y', 'latitude_decimal'],
            longitude: ['longitude', 'lon', 'lng', 'long', 'x', 'longitude_decimal'],

            // Common attribute columns
            name: ['name', 'title', 'label', 'account_name', 'business_name'],
            description: ['description', 'desc', 'notes', 'comments'],

            // Sales-specific columns
            zipCode: ['zip', 'zipcode', 'zip_code', 'postal_code'],
            county: ['county', 'county_name'],
            state: ['state', 'state_name'],
            territory: ['territory', 'sales_territory', 'region'],
            bdm: ['bdm', 'manager', 'sales_rep', 'account_manager'],
            tier: ['tier', 'sales_tier', 'potential_tier', 'priority'],
            revenue: ['revenue', 'sales', 'annual_revenue']
        };
    }

    /**
     * Parse CSV file
     * @param {File} file - CSV file
     * @returns {Promise<Object>} Parsed data with features and metadata
     */
    async parseFile(file) {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: true,
                complete: (results) => {
                    try {
                        const parsed = this.processData(results.data, results.meta.fields);
                        resolve(parsed);
                    } catch (error) {
                        reject(error);
                    }
                },
                error: (error) => {
                    reject(error);
                }
            });
        });
    }

    /**
     * Process parsed CSV data
     * @param {Array} data - Parsed CSV rows
     * @param {Array} columns - Column names
     * @returns {Object} Processed data with features and metadata
     */
    processData(data, columns) {
        // Detect column mappings
        const columnMap = this.detectColumnMappings(columns);

        // Detect data type (polygon vs point vs address)
        const dataType = this.detectDataType(columnMap, columns);

        // If address type, return raw data for geocoding
        if (dataType === 'address') {
            return {
                features: null,
                type: dataType,
                columnMap: columnMap,
                originalColumns: columns,
                rowCount: data.length,
                rawData: data,
                needsGeocoding: true
            };
        }

        // Process features
        const features = this.extractFeatures(data, columnMap, dataType);

        return {
            features: features,
            type: dataType,
            columnMap: columnMap,
            originalColumns: columns,
            rowCount: data.length,
            needsGeocoding: false
        };
    }

    /**
     * Detect column mappings from CSV headers
     * @param {Array} columns - Column names
     * @returns {Object} Column mappings
     */
    detectColumnMappings(columns) {
        const mappings = {};

        // Normalize column names for comparison
        const normalizedColumns = columns.map(col =>
            col.toLowerCase().trim().replace(/[^a-z0-9]/g, '_')
        );

        // Map each supported column type
        for (let [type, possibleNames] of Object.entries(this.supportedColumns)) {
            const match = normalizedColumns.findIndex(col =>
                possibleNames.some(name => col.includes(name.replace(/[^a-z0-9]/g, '_')))
            );

            if (match !== -1) {
                mappings[type] = columns[match];
            }
        }

        return mappings;
    }

    /**
     * Detect data type (polygon, point, or address) based on available columns
     * @param {Object} columnMap - Column mappings
     * @param {Array} columns - Original column names
     * @returns {string} Data type ('polygon', 'point', or 'address')
     */
    detectDataType(columnMap, columns) {
        if (columnMap.wkt) {
            return 'polygon';
        } else if (columnMap.latitude && columnMap.longitude) {
            return 'point';
        } else {
            // Check for address columns
            const normalizedColumns = columns.map(col =>
                col.toLowerCase().trim().replace(/[^a-z0-9]/g, '')
            );

            // Address column patterns
            const addressPatterns = ['street', 'address', 'addr', 'city', 'zip', 'zipcode', 'postal'];
            const hasAddressColumns = normalizedColumns.some(col =>
                addressPatterns.some(pattern => col.includes(pattern))
            );

            if (hasAddressColumns) {
                return 'address';
            }

            throw new Error('No valid geometry columns found. CSV must contain either WKT, Latitude/Longitude, or address columns.');
        }
    }

    /**
     * Extract features from CSV data
     * @param {Array} data - CSV rows
     * @param {Object} columnMap - Column mappings
     * @param {string} dataType - Data type
     * @returns {Array} Features array
     */
    extractFeatures(data, columnMap, dataType) {
        return data.map((row, index) => {
            const feature = {
                id: this.generateFeatureId(row, index)
            };

            // Add geometry data
            if (dataType === 'polygon' && columnMap.wkt) {
                feature.wkt = row[columnMap.wkt];
            } else if (dataType === 'point') {
                feature.latitude = row[columnMap.latitude];
                feature.longitude = row[columnMap.longitude];
            }

            // Add all other columns as properties
            for (let [key, value] of Object.entries(row)) {
                // Skip if it's already added or empty
                if (value !== null && value !== undefined && value !== '') {
                    // Convert key to camelCase
                    const camelKey = this.toCamelCase(key);
                    feature[camelKey] = value;
                }
            }

            return feature;
        }).filter(feature => {
            // Filter out features without valid geometry
            if (dataType === 'polygon') {
                return feature.wkt;
            } else {
                return feature.latitude && feature.longitude;
            }
        });
    }

    /**
     * Generate unique feature ID
     * @param {Object} row - CSV row
     * @param {number} index - Row index
     * @returns {string} Feature ID
     */
    generateFeatureId(row, index) {
        // Try to use a meaningful ID from the row
        const possibleIdColumns = ['id', 'account_id', 'location_id', 'zip', 'zipcode'];

        for (let col of possibleIdColumns) {
            const value = row[col] || row[col.toUpperCase()];
            if (value) {
                return `${col}_${value}`;
            }
        }

        // Fall back to index-based ID
        return `feature_${index}_${Date.now()}`;
    }

    /**
     * Convert string to camelCase
     * @param {string} str - String to convert
     * @returns {string} camelCase string
     */
    toCamelCase(str) {
        return str
            .toLowerCase()
            .replace(/[^a-zA-Z0-9]+(.)/g, (match, chr) => chr.toUpperCase());
    }

    /**
     * Validate WKT string
     * @param {string} wkt - WKT string
     * @returns {boolean} Is valid
     */
    validateWKT(wkt) {
        if (!wkt || typeof wkt !== 'string') return false;

        const wktTypes = [
            'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT',
            'MULTILINESTRING', 'MULTIPOLYGON', 'GEOMETRYCOLLECTION'
        ];

        return wktTypes.some(type => wkt.trim().toUpperCase().startsWith(type));
    }

    /**
     * Validate coordinates
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @returns {boolean} Are valid
     */
    validateCoordinates(lat, lon) {
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lon);

        return !isNaN(latitude) && !isNaN(longitude) &&
               latitude >= -90 && latitude <= 90 &&
               longitude >= -180 && longitude <= 180;
    }

    /**
     * Get sample data preview
     * @param {File} file - CSV file
     * @param {number} rows - Number of rows to preview
     * @returns {Promise<Object>} Sample data
     */
    async getPreview(file, rows = 5) {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                preview: rows,
                skipEmptyLines: true,
                complete: (results) => {
                    resolve({
                        columns: results.meta.fields,
                        sample: results.data
                    });
                },
                error: (error) => {
                    reject(error);
                }
            });
        });
    }

    /**
     * Export features to CSV
     * @param {Array} features - Features to export
     * @param {string} filename - Output filename
     */
    exportToCSV(features, filename = 'export.csv') {
        if (features.length === 0) {
            console.warn('No features to export');
            return;
        }

        // Convert features to CSV format
        const csv = Papa.unparse(features);

        // Create download link
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * Detect delimiter in CSV content
     * @param {string} content - CSV content
     * @returns {string} Detected delimiter
     */
    detectDelimiter(content) {
        const delimiters = [',', ';', '\t', '|'];
        const sample = content.split('\n').slice(0, 5).join('\n');

        let maxCount = 0;
        let detectedDelimiter = ',';

        for (let delimiter of delimiters) {
            const count = (sample.match(new RegExp('\\' + delimiter, 'g')) || []).length;
            if (count > maxCount) {
                maxCount = count;
                detectedDelimiter = delimiter;
            }
        }

        return detectedDelimiter;
    }

    /**
     * Get summary statistics for features
     * @param {Array} features - Features array
     * @returns {Object} Statistics
     */
    getStatistics(features) {
        if (features.length === 0) {
            return { count: 0 };
        }

        const stats = {
            count: features.length,
            columns: {}
        };

        // Get all unique keys
        const keys = new Set();
        features.forEach(f => Object.keys(f).forEach(k => keys.add(k)));

        // Calculate statistics for each column
        keys.forEach(key => {
            const values = features.map(f => f[key]).filter(v => v !== null && v !== undefined);

            stats.columns[key] = {
                populated: values.length,
                unique: new Set(values).size,
                type: typeof values[0]
            };
        });

        return stats;
    }
}
