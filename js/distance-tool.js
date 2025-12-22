/**
 * Distance Measurement Tool
 * v3.0 Phase 2: Interactive distance measurement on map
 * Part of Analytics & Insights
 */

class DistanceTool {
    constructor(mapManager) {
        this.mapManager = mapManager;
        this.map = mapManager.map;
        this.isActive = false;
        this.markers = [];
        this.line = null;
        this.measurementListener = null;
        this.measurements = []; // Store all measurements
    }

    /**
     * Activate distance measurement mode
     */
    activate() {
        if (this.isActive) return;

        this.isActive = true;
        this.map.setOptions({ draggableCursor: 'crosshair' });

        // Disable layer clickability so measurements can be made over features
        if (this.mapManager && this.mapManager.updateLayerClickability) {
            this.mapManager.updateLayerClickability(false);
        }

        // Add click listener for placing markers
        this.measurementListener = this.map.addListener('click', (e) => {
            this.addMeasurementPoint(e.latLng);
        });

        // Show instructions
        this.showInstructions();

        console.log('Distance measurement tool activated');
    }

    /**
     * Deactivate distance measurement mode
     */
    deactivate() {
        if (!this.isActive) return;

        this.isActive = false;
        this.map.setOptions({ draggableCursor: null });

        // Re-enable layer clickability
        if (this.mapManager && this.mapManager.updateLayerClickability) {
            this.mapManager.updateLayerClickability(true);
        }

        // Remove click listener
        if (this.measurementListener) {
            google.maps.event.removeListener(this.measurementListener);
            this.measurementListener = null;
        }

        // Clear current measurement
        this.clearCurrent();

        // Hide instructions
        this.hideInstructions();

        console.log('Distance measurement tool deactivated');
    }

    /**
     * Toggle measurement mode
     */
    toggle() {
        if (this.isActive) {
            this.deactivate();
        } else {
            this.activate();
        }
    }

    /**
     * Add a measurement point
     */
    addMeasurementPoint(latLng) {
        // Create marker
        const marker = new google.maps.Marker({
            position: latLng,
            map: this.map,
            draggable: true,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#FF5722',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 2
            },
            title: 'Measurement Point'
        });

        // Add drag listener to update line
        marker.addListener('drag', () => {
            this.updateLine();
            this.updateDistance();
        });

        this.markers.push(marker);

        // If we have 2 points, draw line and calculate distance
        if (this.markers.length === 2) {
            this.drawLine();
            this.calculateDistance();
            this.saveMeasurement();

            // Auto-start new measurement
            setTimeout(() => {
                this.clearCurrent();
            }, 3000);
        }
    }

    /**
     * Draw line between markers
     */
    drawLine() {
        if (this.markers.length < 2) return;

        const path = this.markers.map(m => m.getPosition());

        this.line = new google.maps.Polyline({
            path: path,
            geodesic: true,
            strokeColor: '#FF5722',
            strokeOpacity: 0.8,
            strokeWeight: 3,
            map: this.map
        });
    }

    /**
     * Update line position
     */
    updateLine() {
        if (!this.line || this.markers.length < 2) return;

        const path = this.markers.map(m => m.getPosition());
        this.line.setPath(path);
    }

    /**
     * Calculate and display distance
     */
    calculateDistance() {
        if (this.markers.length < 2) return;

        const point1 = this.markers[0].getPosition();
        const point2 = this.markers[1].getPosition();

        // Calculate distance using Google Maps Geometry library
        const distanceMeters = google.maps.geometry.spherical.computeDistanceBetween(point1, point2);

        // Convert to miles and kilometers
        const distanceMiles = distanceMeters / 1609.34;
        const distanceKm = distanceMeters / 1000;

        // Format for display
        const distanceText = this.formatDistance(distanceMiles, distanceKm);

        // Show in info window
        this.showDistanceInfo(point2, distanceText, distanceMiles, distanceKm);

        return { meters: distanceMeters, miles: distanceMiles, km: distanceKm };
    }

    /**
     * Update distance (for dragging)
     */
    updateDistance() {
        if (this.markers.length === 2 && this.line) {
            const point2 = this.markers[1].getPosition();
            const distance = this.calculateDistance();
            if (distance) {
                const distanceText = this.formatDistance(distance.miles, distance.km);
                this.showDistanceInfo(point2, distanceText, distance.miles, distance.km);
            }
        }
    }

    /**
     * Format distance for display
     */
    formatDistance(miles, km) {
        let text = '';

        if (miles < 0.1) {
            // Show in feet for very short distances
            const feet = miles * 5280;
            text = `${feet.toFixed(0)} ft`;
        } else if (miles < 1) {
            text = `${miles.toFixed(2)} mi`;
        } else {
            text = `${miles.toFixed(2)} mi`;
        }

        // Add km
        if (km < 1) {
            text += ` (${(km * 1000).toFixed(0)} m)`;
        } else {
            text += ` (${km.toFixed(2)} km)`;
        }

        return text;
    }

    /**
     * Show distance in info window
     */
    showDistanceInfo(position, distanceText, miles, km) {
        // Close existing info window
        if (this.infoWindow) {
            this.infoWindow.close();
        }

        const content = `
            <div style="padding: 10px; min-width: 200px;">
                <div style="font-size: 18px; font-weight: bold; color: #FF5722; margin-bottom: 8px;">
                    📏 ${distanceText}
                </div>
                <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                    Click "Save" to keep this measurement
                </div>
                <button onclick="window.distanceTool.saveMeasurement()"
                        style="background: #0078d4; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; margin-right: 8px;">
                    Save
                </button>
                <button onclick="window.distanceTool.clearCurrent()"
                        style="background: #d13438; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">
                    Clear
                </button>
            </div>
        `;

        this.infoWindow = new google.maps.InfoWindow({
            content: content,
            position: position
        });

        this.infoWindow.open(this.map);

        // Store for access from buttons
        window.distanceTool = this;
    }

    /**
     * Save current measurement
     */
    saveMeasurement() {
        if (this.markers.length === 2) {
            const distance = this.calculateDistance();
            const measurement = {
                id: Utils.generateId('measurement'),
                point1: {
                    lat: this.markers[0].getPosition().lat(),
                    lng: this.markers[0].getPosition().lng()
                },
                point2: {
                    lat: this.markers[1].getPosition().lat(),
                    lng: this.markers[1].getPosition().lng()
                },
                distance: distance,
                timestamp: new Date().toISOString()
            };

            this.measurements.push(measurement);

            // Emit event
            if (window.eventBus) {
                eventBus.emit('measurement.saved', measurement);
            }

            // Show toast
            if (window.toastManager) {
                toastManager.success(`Measurement saved: ${this.formatDistance(distance.miles, distance.km)}`);
            }

            console.log('Measurement saved:', measurement);
        }
    }

    /**
     * Clear current measurement
     */
    clearCurrent() {
        // Remove markers
        this.markers.forEach(marker => {
            marker.setMap(null);
        });
        this.markers = [];

        // Remove line
        if (this.line) {
            this.line.setMap(null);
            this.line = null;
        }

        // Close info window
        if (this.infoWindow) {
            this.infoWindow.close();
            this.infoWindow = null;
        }
    }

    /**
     * Clear all measurements
     */
    clearAll() {
        this.clearCurrent();
        this.measurements = [];

        if (window.toastManager) {
            toastManager.success('All measurements cleared');
        }
    }

    /**
     * Get all saved measurements
     */
    getMeasurements() {
        return this.measurements;
    }

    /**
     * Delete a specific measurement
     */
    deleteMeasurement(measurementId) {
        const index = this.measurements.findIndex(m => m.id === measurementId);
        if (index !== -1) {
            this.measurements.splice(index, 1);

            if (window.eventBus) {
                eventBus.emit('measurement.deleted', { measurementId });
            }
        }
    }

    /**
     * Show measurement instructions
     */
    showInstructions() {
        const instructions = document.getElementById('measurementInstructions');
        if (instructions) {
            instructions.style.display = 'block';
        }
    }

    /**
     * Hide measurement instructions
     */
    hideInstructions() {
        const instructions = document.getElementById('measurementInstructions');
        if (instructions) {
            instructions.style.display = 'none';
        }
    }

    /**
     * Export measurements as CSV
     */
    exportMeasurements() {
        if (this.measurements.length === 0) {
            if (window.toastManager) {
                toastManager.warning('No measurements to export');
            }
            return;
        }

        const csv = this.measurementsToCSV();
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `measurements-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (window.toastManager) {
            toastManager.success('Measurements exported to CSV');
        }
    }

    /**
     * Convert measurements to CSV
     */
    measurementsToCSV() {
        const headers = ['ID', 'Point 1 Lat', 'Point 1 Lng', 'Point 2 Lat', 'Point 2 Lng', 'Distance (mi)', 'Distance (km)', 'Distance (m)', 'Timestamp'];
        const rows = this.measurements.map(m => [
            m.id,
            m.point1.lat,
            m.point1.lng,
            m.point2.lat,
            m.point2.lng,
            m.distance.miles.toFixed(4),
            m.distance.km.toFixed(4),
            m.distance.meters.toFixed(2),
            m.timestamp
        ]);

        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DistanceTool;
}
