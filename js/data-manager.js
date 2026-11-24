/* =========================================================
   NEXUSAI — DATA MANAGER
   File: js/data-manager.js

   Purpose:
   Central data management layer for all NexusAI pages.

   Dependencies:
   - js/storage.js must load before this file.

   Responsibilities:
   - Manage monitoring sources
   - Manage configurable metrics
   - Save and retrieve telemetry readings
   - Preserve reading history when sources are edited
   - Manage anomalies and settings
   - Generate dashboard summaries
   - Notify other pages when data changes
========================================================= */

(function () {
    "use strict";

    window.NexusAI = window.NexusAI || {};

    const Storage = window.NexusAI.Storage;

    if (!Storage) {
        console.error(
            "NexusAI Data Manager: Storage engine not found. Load storage.js first."
        );
        return;
    }

    const DATA_MANAGER = "NexusAI.DataManager";

    const EVENTS = {
        SOURCE_CREATED: "nexusai:source-created",
        SOURCE_UPDATED: "nexusai:source-updated",
        SOURCE_DELETED: "nexusai:source-deleted",
        READING_ADDED: "nexusai:reading-added",
        DATA_CHANGED: "nexusai:data-changed"
    };

    /* =====================================================
       ID GENERATION
    ===================================================== */

    function createId(prefix) {
        let uniqueId;

        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            uniqueId = window.crypto.randomUUID();
        } else {
            uniqueId =
                Date.now().toString(36) +
                Math.random().toString(36).substring(2, 10);
        }

        return `${prefix}_${uniqueId}`;
    }

    /* =====================================================
       EVENT SYSTEM
    ===================================================== */

    function emit(eventName, detail = {}) {
        const event = new CustomEvent(eventName, {
            detail: {
                ...detail,
                timestamp: new Date().toISOString()
            }
        });

        window.dispatchEvent(event);

        window.dispatchEvent(
            new CustomEvent(EVENTS.DATA_CHANGED, {
                detail: {
                    eventName,
                    ...detail
                }
            })
        );
    }

    function subscribe(eventName, callback) {
        if (typeof callback !== "function") {
            throw new Error("A valid callback function is required.");
        }

        window.addEventListener(eventName, callback);

        return function unsubscribe() {
            window.removeEventListener(eventName, callback);
        };
    }

    /* =====================================================
       DEFAULT METRIC PRESETS

       These are suggested metrics only.
       Actual hardware readings depend on supported
       device connections and permissions.
    ===================================================== */

    const METRIC_PRESETS = {
        Laptop: [
            {
                name: "CPU Utilization",
                unit: "%",
                warningThreshold: 75,
                criticalThreshold: 90
            },
            {
                name: "Memory Utilization",
                unit: "%",
                warningThreshold: 80,
                criticalThreshold: 95
            },
            {
                name: "CPU Temperature",
                unit: "°C",
                warningThreshold: 75,
                criticalThreshold: 90
            },
            {
                name: "GPU Utilization",
                unit: "%",
                warningThreshold: 75,
                criticalThreshold: 90
            },
            {
                name: "Power Consumption",
                unit: "W",
                warningThreshold: 40,
                criticalThreshold: 60
            }
        ],

        Server: [
            {
                name: "CPU Utilization",
                unit: "%",
                warningThreshold: 75,
                criticalThreshold: 90
            },
            {
                name: "Memory Utilization",
                unit: "%",
                warningThreshold: 80,
                criticalThreshold: 95
            },
            {
                name: "Network Throughput",
                unit: "Mbps",
                warningThreshold: 800,
                criticalThreshold: 950
            },
            {
                name: "Power Consumption",
                unit: "W",
                warningThreshold: 300,
                criticalThreshold: 450
            }
        ],

        "NPU Node": [
            {
                name: "NPU Utilization",
                unit: "%",
                warningThreshold: 75,
                criticalThreshold: 90
            },
            {
                name: "Inference Latency",
                unit: "ms",
                warningThreshold: 100,
                criticalThreshold: 200
            },
            {
                name: "Inference Throughput",
                unit: "FPS",
                warningThreshold: 30,
                criticalThreshold: 15
            },
            {
                name: "Memory Utilization",
                unit: "%",
                warningThreshold: 80,
                criticalThreshold: 95
            }
        ],

        "GPU Node": [
            {
                name: "GPU Utilization",
                unit: "%",
                warningThreshold: 80,
                criticalThreshold: 95
            },
            {
                name: "VRAM Utilization",
                unit: "%",
                warningThreshold: 80,
                criticalThreshold: 95
            },
            {
                name: "GPU Temperature",
                unit: "°C",
                warningThreshold: 78,
                criticalThreshold: 88
            },
            {
                name: "Power Draw",
                unit: "W",
                warningThreshold: 220,
                criticalThreshold: 280
            }
        ],

        "Robotic Arm": [
            {
                name: "Motor Temperature",
                unit: "°C",
                warningThreshold: 65,
                criticalThreshold: 80
            },
            {
                name: "Joint Velocity",
                unit: "RPM",
                warningThreshold: 150,
                criticalThreshold: 200
            },
            {
                name: "Vibration",
                unit: "mm/s",
                warningThreshold: 5,
                criticalThreshold: 8
            },
            {
                name: "Power Consumption",
                unit: "W",
                warningThreshold: 100,
                criticalThreshold: 150
            }
        ],

        "Cooling Unit": [
            {
                name: "Inlet Temperature",
                unit: "°C",
                warningThreshold: 30,
                criticalThreshold: 40
            },
            {
                name: "Outlet Temperature",
                unit: "°C",
                warningThreshold: 25,
                criticalThreshold: 35
            },
            {
                name: "Fan Speed",
                unit: "RPM",
                warningThreshold: 1800,
                criticalThreshold: 2200
            },
            {
                name: "Power Consumption",
                unit: "W",
                warningThreshold: 200,
                criticalThreshold: 300
            }
        ],

        Sensor: [
            {
                name: "Temperature",
                unit: "°C",
                warningThreshold: 35,
                criticalThreshold: 45
            },
            {
                name: "Humidity",
                unit: "%",
                warningThreshold: 70,
                criticalThreshold: 85
            },
            {
                name: "Pressure",
                unit: "hPa",
                warningThreshold: 1050,
                criticalThreshold: 1100
            }
        ],

        Custom: []
    };

    /* =====================================================
       INITIALIZATION
    ===================================================== */

    async function init() {
        await Storage.init();

        console.info("NexusAI Data Manager initialized.");

        return true;
    }

    /* =====================================================
       METRIC MANAGEMENT
    ===================================================== */

    function parseOptionalNumber(rawValue, label) {
        if (
            rawValue === "" ||
            rawValue === undefined ||
            rawValue === null
        ) {
            return null;
        }

        const numericValue = Number(rawValue);

        if (!Number.isFinite(numericValue)) {
            throw new Error(`${label} must be a valid number.`);
        }

        return numericValue;
    }

    function createMetric(metric = {}) {
        const name = String(metric.name || "").trim();
        const unit = String(metric.unit || "").trim();

        if (!name) {
            throw new Error("Metric name is required.");
        }

        const warning = parseOptionalNumber(
            metric.warningThreshold,
            "Warning threshold"
        );
        const critical = parseOptionalNumber(
            metric.criticalThreshold,
            "Critical threshold"
        );

        if (
            warning !== null &&
            critical !== null &&
            warning === critical
        ) {
            throw new Error(
                "Warning and critical thresholds must be different."
            );
        }

        return {
            id: metric.id || createId("metric"),
            name,
            unit,
            warningThreshold: warning,
            criticalThreshold: critical,
            enabled: metric.enabled !== false
        };
    }

    function getMetricPresets(sourceType) {
        const presets = METRIC_PRESETS[sourceType] || [];

        return presets.map(metric => createMetric(metric));
    }

    function getMetricsForSource(sourceId) {
        return getSource(sourceId).then(source => {
            return source ? source.metrics || [] : [];
        });
    }

    /* =====================================================
       SOURCE MANAGEMENT
    ===================================================== */

    async function getSources() {
        const sources = await Storage.getAll("sources");

        return sources.sort((a, b) => {
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
    }

    async function getSource(sourceId) {
        if (!sourceId) return null;

        return Storage.get("sources", sourceId);
    }

    async function saveSource(sourceData) {
        if (!sourceData || typeof sourceData !== "object") {
            throw new Error("Valid source information is required.");
        }

        const name = String(sourceData.name || "").trim();

        if (!name) {
            throw new Error("Source name is required.");
        }

        const existingSource = sourceData.id
            ? await getSource(sourceData.id)
            : null;

        const metrics = Array.isArray(sourceData.metrics)
            ? sourceData.metrics.map(createMetric)
            : existingSource
                ? existingSource.metrics || []
                : getMetricPresets(sourceData.type || "Custom");

        const metricNames = metrics.map(metric =>
            metric.name.toLowerCase()
        );

        if (new Set(metricNames).size !== metricNames.length) {
            throw new Error("Metric names must be unique within a source.");
        }

        const samplingInterval = Number(
            sourceData.samplingInterval ??
            existingSource?.samplingInterval ??
            5000
        );

        const historyRetention = Number(
            sourceData.historyRetention ??
            existingSource?.historyRetention ??
            7
        );

        if (!Number.isFinite(samplingInterval) || samplingInterval < 1000) {
            throw new Error(
                "Sampling interval must be at least 1000 milliseconds."
            );
        }

        if (
            !Number.isInteger(historyRetention) ||
            historyRetention < 1
        ) {
            throw new Error(
                "History retention must be at least one day."
            );
        }

        const now = new Date().toISOString();

        const source = {
            id: existingSource?.id || sourceData.id || createId("source"),

            name,

            type: String(
                sourceData.type || existingSource?.type || "Custom"
            ),

            architecture: String(
                sourceData.architecture ||
                existingSource?.architecture ||
                "Unknown"
            ),

            inputMode: String(
                sourceData.inputMode ||
                existingSource?.inputMode ||
                "simulated"
            ),

            description: String(
                sourceData.description ??
                existingSource?.description ??
                ""
            ),

            status: sourceData.status || existingSource?.status || "active",

            metrics,

            samplingInterval,

            historyRetention,

            createdAt: existingSource?.createdAt || now,

            updatedAt: now,

            lastReadingAt: existingSource?.lastReadingAt || null
        };

        await Storage.put("sources", source);

        emit(
            existingSource
                ? EVENTS.SOURCE_UPDATED
                : EVENTS.SOURCE_CREATED,
            { source }
        );

        return source;
    }

    async function deleteSource(sourceId) {
        if (!sourceId) {
            throw new Error("Source ID is required.");
        }

        const source = await getSource(sourceId);

        if (!source) {
            throw new Error("Source could not be found.");
        }

        if (typeof Storage.deleteSourceWithHistory === "function") {
            await Storage.deleteSourceWithHistory(sourceId);
        } else {
            await Storage.remove("sources", sourceId);
        }

        emit(EVENTS.SOURCE_DELETED, {
            sourceId,
            sourceName: source.name
        });

        return true;
    }

    async function setSourceStatus(sourceId, status) {
        const allowedStatuses = ["active", "offline", "paused"];

        if (!allowedStatuses.includes(status)) {
            throw new Error("Invalid source status.");
        }

        const source = await getSource(sourceId);

        if (!source) {
            throw new Error("Source could not be found.");
        }

        source.status = status;
        source.updatedAt = new Date().toISOString();

        await Storage.put("sources", source);

        emit(EVENTS.SOURCE_UPDATED, { source });

        return source;
    }

    /* =====================================================
       TELEMETRY READING MANAGEMENT
    ===================================================== */

    async function addReading(readingData) {
        if (!readingData || typeof readingData !== "object") {
            throw new Error("Reading information is required.");
        }

        const source = await getSource(readingData.sourceId);

        if (!source) {
            throw new Error("The selected monitoring source does not exist.");
        }

        const metric = (source.metrics || []).find(item => {
            return item.id === readingData.metricId;
        });

        if (!metric) {
            throw new Error("The selected metric does not exist.");
        }

        if (metric.enabled === false) {
            throw new Error("This metric is currently disabled.");
        }

        const value = Number(readingData.value);

        if (!Number.isFinite(value)) {
            throw new Error("Reading value must be a valid number.");
        }

        const timestamp = readingData.timestamp
            ? new Date(readingData.timestamp)
            : new Date();

        if (Number.isNaN(timestamp.getTime())) {
            throw new Error("Invalid reading timestamp.");
        }

        const reading = {
            id: createId("reading"),

            sourceId: source.id,

            metricId: metric.id,

            metric: metric.name,

            value,

            unit: metric.unit,

            timestamp: timestamp.toISOString(),

            inputMode: readingData.inputMode || source.inputMode || "manual"
        };

        await Storage.add("readings", reading);

        const existingLast = source.lastReadingAt
            ? new Date(source.lastReadingAt).getTime()
            : 0;

        if (!source.lastReadingAt || timestamp.getTime() >= existingLast) {
            source.lastReadingAt = reading.timestamp;
        }

        await Storage.put("sources", source);

        emit(EVENTS.READING_ADDED, {
            reading,
            source
        });

        return reading;
    }

    async function getReadings(sourceId = null) {
        const readings = await Storage.getAll("readings");

        const filtered = sourceId
            ? readings.filter(reading => reading.sourceId === sourceId)
            : readings;

        return filtered.sort((a, b) => {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
    }

    async function getLatestReadings(sourceId = null) {
        const readings = await getReadings(sourceId);

        const latestByMetric = new Map();

        readings.forEach(reading => {
            const key = `${reading.sourceId}_${reading.metricId}`;

            if (!latestByMetric.has(key)) {
                latestByMetric.set(key, reading);
            }
        });

        return Array.from(latestByMetric.values());
    }

    async function getReadingHistory(sourceId, metricId = null) {
        let readings = await getReadings(sourceId);

        if (metricId) {
            readings = readings.filter(
                reading => reading.metricId === metricId
            );
        }

        return readings;
    }

    /* =====================================================
       ANOMALY MANAGEMENT
    ===================================================== */

    async function saveAnomaly(anomalyData) {
        if (!anomalyData || !anomalyData.sourceId) {
            throw new Error("Anomaly source information is required.");
        }

        const anomaly = {
            id: anomalyData.id || createId("anomaly"),

            sourceId: anomalyData.sourceId,

            metricId: anomalyData.metricId || null,

            metric: anomalyData.metric || "Unknown Metric",

            value: Number(anomalyData.value),

            severity: anomalyData.severity || "warning",

            message: String(anomalyData.message || ""),

            timestamp: anomalyData.timestamp ||
                new Date().toISOString(),

            detectionMethod: anomalyData.detectionMethod || "unknown"
        };

        await Storage.put("anomalies", anomaly);

        emit("nexusai:anomaly-created", { anomaly });

        return anomaly;
    }

    async function getAnomalies(sourceId = null) {
        const anomalies = await Storage.getAll("anomalies");

        const filtered = sourceId
            ? anomalies.filter(item => item.sourceId === sourceId)
            : anomalies;

        return filtered.sort((a, b) => {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
    }

    /* =====================================================
       SETTINGS MANAGEMENT
    ===================================================== */

    async function getSetting(key, defaultValue = null) {
        const setting = await Storage.get("settings", key);

        return setting ? setting.value : defaultValue;
    }

    async function saveSetting(key, value) {
        if (!key) {
            throw new Error("Setting key is required.");
        }

        await Storage.put("settings", {
            id: key,
            value,
            updatedAt: new Date().toISOString()
        });

        emit("nexusai:setting-updated", { key, value });

        return value;
    }

    /* =====================================================
       DASHBOARD SUMMARY
    ===================================================== */

    async function getSummary() {
        const [
            sources,
            readings,
            anomalies
        ] = await Promise.all([
            Storage.getAll("sources"),
            Storage.getAll("readings"),
            Storage.getAll("anomalies")
        ]);

        const activeSources = sources.filter(
            source => source.status === "active"
        );

        const configuredMetrics = sources.reduce((total, source) => {
            return total + (source.metrics || []).filter(
                metric => metric.enabled !== false
            ).length;
        }, 0);

        const unresolvedAlerts = anomalies.filter(anomaly => {
            return anomaly.severity === "warning" ||
                anomaly.severity === "critical";
        });

        return {
            totalSources: sources.length,

            activeSources: activeSources.length,

            offlineSources: sources.filter(
                source => source.status === "offline"
            ).length,

            configuredMetrics,

            totalReadings: readings.length,

            totalAnomalies: anomalies.length,

            alertCount: unresolvedAlerts.length,

            criticalAlerts: unresolvedAlerts.filter(
                anomaly => anomaly.severity === "critical"
            ).length,

            latestReadingAt: readings.length
                ? readings.reduce((latest, reading) => {
                    return reading.timestamp > latest
                        ? reading.timestamp
                        : latest;
                }, readings[0].timestamp)
                : null
        };
    }

    /* =====================================================
       PUBLIC API
    ===================================================== */

    window.NexusAI.DataManager = {

        init,

        events: EVENTS,
        subscribe,

        createId,

        getMetricPresets,
        createMetric,
        getMetricsForSource,

        getSources,
        getSource,
        saveSource,
        deleteSource,
        setSourceStatus,

        addReading,
        getReadings,
        getLatestReadings,
        getReadingHistory,

        saveAnomaly,
        getAnomalies,

        getSetting,
        saveSetting,

        getSummary
    };

    console.info(`${DATA_MANAGER} loaded successfully.`);

})();