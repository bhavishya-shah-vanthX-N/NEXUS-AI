/* =========================================================
   NEXUSAI — LIVE TELEMETRY CONTROLLER
   File: js/telemetry.js

   Dependencies:
   1. js/storage.js
   2. js/data-manager.js
   3. js/device-connectors.js (optional but recommended)

   Responsibilities:
   - Load registered monitoring sources & telemetry history
   - Filter readings by source, metric, time window & input mode
   - Probe real laptop/browser capabilities & wire live Device Connectors
   - Run controlled live telemetry simulations (persisted to IndexedDB)
   - Evaluate warning/critical thresholds & record anomaly events
   - Render DPI-scaled HTML5 Canvas time-series chart with hover inspection
   - Export filtered telemetry readings to CSV
========================================================= */

(function () {
    "use strict";

    window.NexusAI = window.NexusAI || {};

    const DataManager = window.NexusAI.DataManager;
    const DeviceConnectors = window.NexusAI.DeviceConnectors || null;

    if (!DataManager) {
        console.error(
            "Telemetry: DataManager not found. Check script loading order."
        );
        return;
    }

    const STORAGE_KEY_SOURCE = "nexusai_telemetry_source";
    const STORAGE_KEY_METRIC = "nexusai_telemetry_metric";
    const MAX_CHART_POINTS = 60;
    const MAX_TABLE_ROWS = 100;

    /* =====================================================
       STATE
    ===================================================== */

    let sources = [];
    let allReadings = [];
    let allAnomalies = [];
    let chartPoints = [];
    let hoveredIndex = -1;

    let simTimer = null;
    let isSimulating = false;
    let isTickBusy = false;
    let pendingSpike = false;
    let internalWriteInProgress = false;
    let refreshDebounce = null;

    /* =====================================================
       DOM HELPERS
    ===================================================== */

    const getElement = id => document.getElementById(id);

    const setText = (id, value) => {
        const el = getElement(id);
        if (el) el.textContent = value;
    };

    const escapeHTML = value => {
        return String(value ?? "").replace(/[&<>"']/g, ch => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[ch]);
    };

    function showMessage(message, type = "info") {
        let container = getElement("telemetry-notification");

        if (!container) {
            container = document.createElement("div");
            container.id = "telemetry-notification";
            container.className = "telemetry-notification";
            container.setAttribute("role", "status");
            container.setAttribute("aria-live", "polite");
            document.body.appendChild(container);
        }

        container.textContent = message;
        container.dataset.type = type;
        container.classList.add("visible");

        window.clearTimeout(container._hideTimer);
        container._hideTimer = window.setTimeout(() => {
            container.classList.remove("visible");
        }, 3800);
    }

    function formatTime(isoString) {
        if (!isoString) return "--";
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return "--";
        return date.toLocaleString();
    }

    function formatShortTime(isoString) {
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return "";
        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
    }

    function formatNumber(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) return "--";
        return Number.isInteger(num)
            ? num.toLocaleString()
            : num.toFixed(2);
    }

    function savePreference(key, value) {
        try {
            window.localStorage.setItem(key, value || "");
        } catch (error) {
            // Ignore storage restrictions
        }
    }

    function loadPreference(key) {
        try {
            return window.localStorage.getItem(key) || "";
        } catch (error) {
            return "";
        }
    }

    /* =====================================================
       THRESHOLD EVALUATION
    ===================================================== */

    function evaluateThreshold(metric, rawValue) {
        if (!metric) return "normal";

        const value = Number(rawValue);
        if (!Number.isFinite(value)) return "normal";

        const warn =
            metric.warningThreshold !== null &&
            metric.warningThreshold !== undefined
                ? Number(metric.warningThreshold)
                : null;
        const crit =
            metric.criticalThreshold !== null &&
            metric.criticalThreshold !== undefined
                ? Number(metric.criticalThreshold)
                : null;

        if (warn !== null && crit !== null) {
            if (crit < warn) {
                if (value <= crit) return "critical";
                if (value <= warn) return "warning";
                return "normal";
            }
            if (value >= crit) return "critical";
            if (value >= warn) return "warning";
            return "normal";
        }

        if (crit !== null && value >= crit) return "critical";
        if (warn !== null && value >= warn) return "warning";

        return "normal";
    }

    /* =====================================================
       INITIALIZATION
    ===================================================== */

    async function init() {
        try {
            await DataManager.init();
            bindEvents();
            bindConnectorEvents();
            await loadDataAndRender(true);
            await refreshLaptopProbe();
            setupChartResizeObserver();
            console.info("NexusAI Telemetry initialized.");
        } catch (error) {
            console.error("Telemetry initialization failed:", error);
            showMessage(
                "Telemetry module could not initialize. Check console.",
                "error"
            );
        }
    }

    function bindEvents() {
        const sourceSelect = getElement("telemetry-source-select");
        if (sourceSelect) {
            sourceSelect.addEventListener("change", () => {
                if (isSimulating) stopSimulation();
                if (DeviceConnectors?.isHostRunning()) {
                    DeviceConnectors.stopHostMonitor();
                    updateHostButtonState(false);
                }
                savePreference(STORAGE_KEY_SOURCE, sourceSelect.value);
                populateMetricDropdown();
                renderAll();
            });
        }

        const metricSelect = getElement("telemetry-metric-select");
        if (metricSelect) {
            metricSelect.addEventListener("change", () => {
                savePreference(STORAGE_KEY_METRIC, metricSelect.value);
                renderAll();
            });
        }

        const timeFilter = getElement("telemetry-time-filter");
        if (timeFilter) timeFilter.addEventListener("change", renderAll);

        const modeFilter = getElement("telemetry-mode-filter");
        if (modeFilter) modeFilter.addEventListener("change", renderAll);

        const simToggleBtn = getElement("sim-toggle-btn");
        if (simToggleBtn) simToggleBtn.addEventListener("click", toggleSimulation);

        const spikeBtn = getElement("sim-spike-btn");
        if (spikeBtn) {
            spikeBtn.addEventListener("click", () => {
                pendingSpike = true;
                showMessage(
                    "Injecting threshold spike immediately...",
                    "warning"
                );
                runSimulationTick();
            });
        }

        const singleTickBtn = getElement("sim-single-tick-btn");
        if (singleTickBtn) {
            singleTickBtn.addEventListener("click", runSimulationTick);
        }

        const exportBtn = getElement("telemetry-export-csv-btn");
        if (exportBtn) {
            exportBtn.addEventListener("click", exportFilteredCSV);
        }

        bindCanvasInteraction();

        if (DataManager.events) {
            DataManager.subscribe(DataManager.events.READING_ADDED, async event => {
                const reading = event?.detail?.reading;
                const src = event?.detail?.source;

                if (
                    reading &&
                    src &&
                    reading.inputMode === "device" &&
                    !internalWriteInProgress
                ) {
                    const metric = (src.metrics || []).find(
                        m => m.id === reading.metricId
                    );
                    const severity = evaluateThreshold(metric, reading.value);
                    if (severity !== "normal") {
                        internalWriteInProgress = true;
                        try {
                            await DataManager.saveAnomaly({
                                sourceId: src.id,
                                metricId: metric.id,
                                metric: metric.name,
                                value: reading.value,
                                severity,
                                message: `${metric.name} reached ${formatNumber(reading.value)} ${metric.unit || ""} (${severity} threshold breached on live device).`,
                                timestamp: reading.timestamp,
                                detectionMethod: "threshold"
                            });
                        } finally {
                            internalWriteInProgress = false;
                        }
                    }
                }

                if (internalWriteInProgress) return;
                window.clearTimeout(refreshDebounce);
                refreshDebounce = window.setTimeout(() => {
                    loadDataAndRender(false);
                }, 180);
            });

            [
                DataManager.events.SOURCE_CREATED,
                DataManager.events.SOURCE_UPDATED,
                DataManager.events.SOURCE_DELETED,
                "nexusai:anomaly-created"
            ].forEach(eventName => {
                if (eventName) {
                    DataManager.subscribe(eventName, () => {
                        if (internalWriteInProgress) return;
                        window.clearTimeout(refreshDebounce);
                        refreshDebounce = window.setTimeout(() => {
                            loadDataAndRender(false);
                        }, 180);
                    });
                }
            });
        }

        window.addEventListener("beforeunload", () => {
            if (simTimer) window.clearInterval(simTimer);
            if (DeviceConnectors) {
                DeviceConnectors.stopHostMonitor();
                DeviceConnectors.disconnectSerial();
                DeviceConnectors.disconnectBluetooth();
                DeviceConnectors.disconnectWebSocket();
            }
        });
    }

    /* =====================================================
       LAPTOP PROBE & DEVICE CONNECTORS WIRING
    ===================================================== */

    async function refreshLaptopProbe() {
        if (!DeviceConnectors) return;

        try {
            const caps = await DeviceConnectors.inspectCapabilities();

            setText(
                "probe-cores",
                caps.cores ? `${caps.cores} Logical Threads` : "Unavailable"
            );

            setText(
                "probe-gpu",
                caps.gpu?.renderer || "Unavailable"
            );

            const webGpuText = caps.hasWebGPU
                ? caps.webGpuAdapterName || "WebGPU Ready"
                : "No WebGPU";
            const webNnText = caps.hasWebNN
                ? "WebNN Ready"
                : "WebNN Unavailable";
            setText("probe-npu-gpu", `${webGpuText} / ${webNnText}`);

            if (caps.batteryInfo) {
                setText(
                    "probe-battery",
                    `${caps.batteryInfo.level}% (${caps.batteryInfo.charging ? "Charging" : "On Battery"})`
                );
            } else {
                setText("probe-battery", "Unavailable in browser");
            }

            if (caps.networkInfo) {
                const rtt =
                    caps.networkInfo.rttMs !== null
                        ? `${caps.networkInfo.rttMs} ms`
                        : "--";
                const dl =
                    caps.networkInfo.downlinkMbps !== null
                        ? `${caps.networkInfo.downlinkMbps} Mbps`
                        : "--";
                setText(
                    "probe-network",
                    `${rtt} / ${dl} (${caps.networkInfo.effectiveType})`
                );
            } else {
                setText("probe-network", "Network API unavailable");
            }

            const memText = caps.memoryPerf
                ? `${caps.memoryPerf.usedMB} / ${caps.memoryPerf.limitMB} MB`
                : caps.deviceMemoryGB
                    ? `~${caps.deviceMemoryGB} GB tier`
                    : "Heap API N/A";
            const ctxText = caps.isSecureContext ? "Secure" : "file:// (Limited)";
            setText("probe-memory", `${memText} · ${ctxText}`);

            // Disable hardware buttons cleanly if browser lacks API
            const serialBtn = getElement("serial-connect-btn");
            if (serialBtn && !caps.hasWebSerial) {
                setBadgeState("serial-badge", "UNSUPPORTED", "warning");
                setText(
                    "serial-status-text",
                    "Web Serial requires Chrome/Edge on localhost or HTTPS."
                );
            }

            const bleBtn = getElement("ble-connect-btn");
            if (bleBtn && !caps.hasWebBluetooth) {
                setBadgeState("ble-badge", "UNSUPPORTED", "warning");
                setText(
                    "ble-status-text",
                    "Web Bluetooth requires Chrome/Edge on localhost or HTTPS."
                );
            }
        } catch (error) {
            console.error("Laptop probe failed:", error);
        }
    }

    function setBadgeState(id, label, stateClass) {
        const badge = getElement(id);
        if (!badge) return;
        badge.textContent = label;
        badge.classList.remove("connected", "warning", "error");
        if (stateClass === "connected" || stateClass === "warning" || stateClass === "error") {
            badge.classList.add(stateClass);
        }
    }

    function updateHostButtonState(running) {
        const btn = getElement("host-stream-btn");
        if (!btn) return;
        if (running) {
            btn.textContent = "⏸ Stop Host Stream";
            btn.classList.add("btn-running");
            btn.classList.remove("btn-primary");
            setBadgeState("host-badge", "STREAMING", "connected");
        } else {
            btn.textContent = "▶ Stream Real Host";
            btn.classList.remove("btn-running");
            btn.classList.add("btn-primary");
            setBadgeState("host-badge", "IDLE", "");
        }
    }

    function bindConnectorEvents() {
        if (!DeviceConnectors) return;

        DeviceConnectors.onStatusChange(payload => {
            if (payload.channel === "host") {
                setText("host-status-text", payload.message);
                updateHostButtonState(payload.state === "connected");
                if (payload.state === "warning") {
                    setBadgeState("host-badge", "CHECK METRICS", "warning");
                }
            } else if (payload.channel === "serial") {
                setText("serial-status-text", payload.message);
                const connected = payload.state === "connected";
                setBadgeState(
                    "serial-badge",
                    connected ? "CONNECTED" : "IDLE",
                    connected ? "connected" : ""
                );
                const btn = getElement("serial-connect-btn");
                if (btn) btn.textContent = connected ? "Disconnect Serial" : "Connect Serial";
            } else if (payload.channel === "bluetooth") {
                setText("ble-status-text", payload.message);
                const connected = payload.state === "connected";
                setBadgeState(
                    "ble-badge",
                    connected ? "CONNECTED" : "IDLE",
                    connected ? "connected" : ""
                );
                const btn = getElement("ble-connect-btn");
                if (btn) btn.textContent = connected ? "Disconnect BLE" : "Pair BLE Device";
            } else if (payload.channel === "websocket") {
                setText("ws-status-text", payload.message);
                const connected = payload.state === "connected";
                setBadgeState(
                    "ws-badge",
                    connected ? "CONNECTED" : payload.state === "error" ? "ERROR" : "IDLE",
                    connected ? "connected" : payload.state === "error" ? "error" : ""
                );
                const btn = getElement("ws-connect-btn");
                if (btn) btn.textContent = connected ? "Disconnect WS" : "Connect WS";
            }
        });

        DeviceConnectors.onLog(entry => {
            showMessage(entry.message, entry.level);
        });

        const refreshProbeBtn = getElement("refresh-probe-btn");
        if (refreshProbeBtn) {
            refreshProbeBtn.addEventListener("click", async () => {
                await refreshLaptopProbe();
                showMessage("Laptop hardware capabilities refreshed.", "info");
            });
        }

        const registerHostBtn = getElement("register-host-source-btn");
        if (registerHostBtn) {
            registerHostBtn.addEventListener("click", async () => {
                try {
                    const hostSource = await DeviceConnectors.ensureLaptopHostSource();
                    await loadDataAndRender(false);
                    const select = getElement("telemetry-source-select");
                    if (select) {
                        select.value = hostSource.id;
                        savePreference(STORAGE_KEY_SOURCE, hostSource.id);
                        populateMetricDropdown(false);
                        renderAll();
                    }
                    showMessage(
                        `Selected "${hostSource.name}". Click ▶ Stream Real Host to collect live readings.`,
                        "success"
                    );
                } catch (error) {
                    showMessage(error.message, "error");
                }
            });
        }

        const hostStreamBtn = getElement("host-stream-btn");
        if (hostStreamBtn) {
            hostStreamBtn.addEventListener("click", async () => {
                try {
                    if (DeviceConnectors.isHostRunning()) {
                        DeviceConnectors.stopHostMonitor();
                        updateHostButtonState(false);
                        return;
                    }

                    if (isSimulating) stopSimulation();

                    let source = getSelectedSource();
                    if (!source) {
                        source = await DeviceConnectors.ensureLaptopHostSource();
                        await loadDataAndRender(false);
                        const select = getElement("telemetry-source-select");
                        if (select) {
                            select.value = source.id;
                            populateMetricDropdown(false);
                        }
                    }

                    await DeviceConnectors.startHostMonitor(source.id);
                    updateHostButtonState(true);
                    await refreshLaptopProbe();
                } catch (error) {
                    showMessage(error.message, "error");
                }
            });
        }

        const serialBtn = getElement("serial-connect-btn");
        if (serialBtn) {
            serialBtn.addEventListener("click", async () => {
                try {
                    if (DeviceConnectors.isSerialConnected()) {
                        await DeviceConnectors.disconnectSerial();
                        return;
                    }
                    const source = getSelectedSource();
                    if (!source) {
                        showMessage("Select or create a monitoring source first.", "warning");
                        return;
                    }
                    const metric = getSelectedMetric(source);
                    const baud = Number(getElement("serial-baud-select")?.value || 115200);
                    await DeviceConnectors.connectSerial(
                        source.id,
                        metric?.id || null,
                        baud
                    );
                } catch (error) {
                    showMessage(error.message, "error");
                }
            });
        }

        const bleBtn = getElement("ble-connect-btn");
        if (bleBtn) {
            bleBtn.addEventListener("click", async () => {
                try {
                    if (DeviceConnectors.isBluetoothConnected()) {
                        DeviceConnectors.disconnectBluetooth();
                        return;
                    }
                    const source = getSelectedSource();
                    if (!source) {
                        showMessage("Select or create a monitoring source first.", "warning");
                        return;
                    }
                    const metric = getSelectedMetric(source);
                    await DeviceConnectors.connectBluetooth(
                        source.id,
                        metric?.id || null
                    );
                } catch (error) {
                    showMessage(error.message, "error");
                }
            });
        }

        const wsBtn = getElement("ws-connect-btn");
        if (wsBtn) {
            wsBtn.addEventListener("click", () => {
                try {
                    if (DeviceConnectors.isWebSocketConnected()) {
                        DeviceConnectors.disconnectWebSocket();
                        return;
                    }
                    const source = getSelectedSource();
                    if (!source) {
                        showMessage("Select or create a monitoring source first.", "warning");
                        return;
                    }
                    const metric = getSelectedMetric(source);
                    const url = getElement("ws-url-input")?.value.trim();
                    DeviceConnectors.connectWebSocket(
                        url,
                        source.id,
                        metric?.id || null
                    );
                } catch (error) {
                    showMessage(error.message, "error");
                }
            });
        }
    }

    /* =====================================================
       DATA LOADING & FILTERING
    ===================================================== */

    async function loadDataAndRender(useSavedPreferences) {
        const [loadedSources, loadedReadings, loadedAnomalies] =
            await Promise.all([
                DataManager.getSources(),
                DataManager.getReadings(),
                DataManager.getAnomalies()
            ]);

        sources = loadedSources;
        allReadings = loadedReadings;
        allAnomalies = loadedAnomalies;

        populateSourceDropdown(useSavedPreferences);
        populateMetricDropdown(useSavedPreferences);
        renderAll();
    }

    function getSelectedSource() {
        const id = getElement("telemetry-source-select")?.value;
        return sources.find(item => item.id === id) || null;
    }

    function getSelectedMetric(source) {
        if (!source) return null;
        const metricId = getElement("telemetry-metric-select")?.value;
        return (
            (source.metrics || []).find(item => item.id === metricId) || null
        );
    }

    function populateSourceDropdown(useSaved) {
        const select = getElement("telemetry-source-select");
        if (!select) return;

        const current = useSaved
            ? loadPreference(STORAGE_KEY_SOURCE)
            : select.value;

        if (!sources.length) {
            select.innerHTML =
                '<option value="">No sources registered (use Register This Laptop or Workspace)</option>';
            select.value = "";
            return;
        }

        select.innerHTML = sources
            .map(
                src => `
                <option value="${escapeHTML(src.id)}">
                    ${escapeHTML(src.name)} (${escapeHTML(src.type)}) — ${escapeHTML(src.status)}
                </option>
            `
            )
            .join("");

        if (sources.some(src => src.id === current)) {
            select.value = current;
        } else {
            select.value = sources[0].id;
        }
    }

    function populateMetricDropdown(useSaved = false) {
        const select = getElement("telemetry-metric-select");
        if (!select) return;

        const source = getSelectedSource();
        const metrics = (source?.metrics || []).filter(
            m => m.enabled !== false
        );

        const current = useSaved
            ? loadPreference(STORAGE_KEY_METRIC)
            : select.value;

        if (!metrics.length) {
            select.innerHTML = '<option value="">No enabled metrics</option>';
            select.value = "";
            return;
        }

        select.innerHTML = metrics
            .map(
                m => `
                <option value="${escapeHTML(m.id)}">
                    ${escapeHTML(m.name)}${m.unit ? ` (${escapeHTML(m.unit)})` : ""}
                </option>
            `
            )
            .join("");

        if (metrics.some(m => m.id === current)) {
            select.value = current;
        } else {
            select.value = metrics[0].id;
        }
    }

    function getFilteredReadings(source, metric) {
        const timeWindow =
            getElement("telemetry-time-filter")?.value || "all";
        const modeFilter =
            getElement("telemetry-mode-filter")?.value || "all";

        const nowMs = Date.now();
        let cutoffMs = 0;

        if (timeWindow === "15m") cutoffMs = nowMs - 15 * 60 * 1000;
        else if (timeWindow === "1h") cutoffMs = nowMs - 60 * 60 * 1000;
        else if (timeWindow === "24h") cutoffMs = nowMs - 24 * 60 * 60 * 1000;

        return allReadings.filter(reading => {
            if (source && reading.sourceId !== source.id) return false;
            if (metric && reading.metricId !== metric.id) return false;
            if (
                modeFilter !== "all" &&
                (reading.inputMode || "manual") !== modeFilter
            ) {
                return false;
            }
            if (cutoffMs > 0) {
                const ts = new Date(reading.timestamp).getTime();
                if (!Number.isFinite(ts) || ts < cutoffMs) return false;
            }
            return true;
        });
    }

    /* =====================================================
       RENDER PIPELINE
    ===================================================== */

    function renderAll() {
        const source = getSelectedSource();
        const metric = getSelectedMetric(source);
        const filteredReadings = getFilteredReadings(source, metric);

        updateControlButtons(source);
        renderSummaryCards(source, metric, filteredReadings);
        renderSnapshots(source);
        renderAlerts(source);
        renderHistoryTable(filteredReadings);
        renderChart(source, metric, filteredReadings);
    }

    function updateControlButtons(source) {
        const toggleBtn = getElement("sim-toggle-btn");
        const spikeBtn = getElement("sim-spike-btn");
        const singleBtn = getElement("sim-single-tick-btn");
        const intervalLabel = getElement("sim-interval-label");
        const statusPill = getElement("sim-status-pill");
        const sidebarStatus = getElement("telemetry-sidebar-status");
        const sidebarDot = getElement("telemetry-sidebar-dot");

        const hasActiveMetrics =
            source &&
            (source.metrics || []).some(m => m.enabled !== false);

        if (toggleBtn) toggleBtn.disabled = !hasActiveMetrics;
        if (spikeBtn) spikeBtn.disabled = !hasActiveMetrics;
        if (singleBtn) singleBtn.disabled = !hasActiveMetrics;

        if (intervalLabel) {
            intervalLabel.textContent = source
                ? `Interval: ${(source.samplingInterval / 1000).toFixed(1)} s`
                : "Interval: --";
        }

        if (isSimulating) {
            if (toggleBtn) {
                toggleBtn.textContent = "⏸ Pause Simulation";
                toggleBtn.classList.add("btn-running");
                toggleBtn.classList.remove("btn-primary");
            }
            if (statusPill) {
                statusPill.classList.add("running");
                statusPill.innerHTML =
                    '<span class="status-dot"></span>LIVE SIMULATION ACTIVE';
            }
            if (sidebarStatus) sidebarStatus.textContent = "Streaming Simulated";
            if (sidebarDot) sidebarDot.style.background = "var(--status-nominal)";
        } else {
            if (toggleBtn) {
                toggleBtn.textContent = "▶ Start Live Simulation";
                toggleBtn.classList.remove("btn-running");
                toggleBtn.classList.add("btn-primary");
            }
            if (statusPill) {
                statusPill.classList.remove("running");
                statusPill.innerHTML =
                    '<span class="status-dot"></span>SIMULATION IDLE';
            }
            if (sidebarStatus) {
                sidebarStatus.textContent = DeviceConnectors?.isHostRunning()
                    ? "Streaming Real Host"
                    : "Telemetry Ready";
            }
        }
    }

    function renderSummaryCards(source, metric, filteredReadings) {
        const activeCount = sources.filter(
            item => item.status === "active"
        ).length;

        setText("tel-active-sources", activeCount.toLocaleString());
        setText("tel-total-readings", filteredReadings.length.toLocaleString());

        const latest = filteredReadings[0];
        if (latest) {
            const unitText = latest.unit ? ` ${latest.unit}` : "";
            setText(
                "tel-latest-value",
                `${formatNumber(latest.value)}${unitText}`
            );
            setText(
                "tel-latest-meta",
                `${latest.metric} · ${(latest.inputMode || "manual").toUpperCase()}`
            );
        } else {
            setText("tel-latest-value", "--");
            setText(
                "tel-latest-meta",
                metric
                    ? `No readings for ${metric.name}`
                    : "Select a source & metric"
            );
        }

        const sourceAnomalies = source
            ? allAnomalies.filter(item => item.sourceId === source.id)
            : allAnomalies;

        setText("tel-alert-count", sourceAnomalies.length.toLocaleString());
    }

    function renderSnapshots(source) {
        const grid = getElement("metric-snapshot-grid");
        if (!grid) return;

        if (!source) {
            setText(
                "snapshots-subtitle",
                "No monitoring sources found. Click '+ Register This Laptop' above or open Workspace."
            );
            grid.innerHTML = `
                <div class="empty-state">
                    No monitoring sources registered yet. Click <strong>+ Register This Laptop</strong> above
                    or open <a href="workspace.html" style="color: var(--accent-cyan); text-decoration: underline;">Monitoring Workspace</a>.
                </div>
            `;
            return;
        }

        setText(
            "snapshots-subtitle",
            `Latest recorded value for each enabled metric on ${source.name}.`
        );

        const metrics = (source.metrics || []).filter(
            m => m.enabled !== false
        );

        if (!metrics.length) {
            grid.innerHTML =
                '<div class="empty-state">No enabled metrics configured on this source.</div>';
            return;
        }

        const sourceReadings = allReadings.filter(
            r => r.sourceId === source.id
        );

        grid.innerHTML = metrics
            .map(metric => {
                const latest = sourceReadings.find(
                    r => r.metricId === metric.id
                );

                if (!latest) {
                    return `
                        <article class="snapshot-card">
                            <div class="snapshot-top">
                                <span class="snapshot-name">${escapeHTML(metric.name)}</span>
                                <span class="status-badge normal">IDLE</span>
                            </div>
                            <div class="snapshot-value">--</div>
                            <div class="snapshot-footer">
                                <span>No readings yet</span>
                                <span>${escapeHTML(metric.unit || "")}</span>
                            </div>
                        </article>
                    `;
                }

                const status = evaluateThreshold(metric, latest.value);
                const mode = (latest.inputMode || "manual").toLowerCase();

                return `
                    <article class="snapshot-card ${status}">
                        <div class="snapshot-top">
                            <span class="snapshot-name">${escapeHTML(metric.name)}</span>
                            <span class="status-badge ${status}">${escapeHTML(status)}</span>
                        </div>
                        <div class="snapshot-value">
                            ${escapeHTML(formatNumber(latest.value))}
                            <small style="font-size: 13px; color: var(--text-secondary);">
                                ${escapeHTML(latest.unit || "")}
                            </small>
                        </div>
                        <div class="snapshot-footer">
                            <span>${escapeHTML(formatShortTime(latest.timestamp))}</span>
                            <span class="mode-badge ${escapeHTML(mode)}">${escapeHTML(mode)}</span>
                        </div>
                    </article>
                `;
            })
            .join("");
    }

    function renderAlerts(source) {
        const list = getElement("telemetry-alerts-list");
        if (!list) return;

        const relevant = (
            source
                ? allAnomalies.filter(item => item.sourceId === source.id)
                : allAnomalies
        ).slice(0, 20);

        setText(
            "alert-feed-badge",
            `${relevant.length} Alert${relevant.length === 1 ? "" : "s"}`
        );

        if (!relevant.length) {
            list.innerHTML = `
                <li class="alerts-empty">
                    No warning or critical alerts recorded${source ? ` for ${escapeHTML(source.name)}` : ""}.
                </li>
            `;
            return;
        }

        list.innerHTML = relevant
            .map(item => {
                const severity =
                    item.severity === "critical" ? "critical" : "warning";
                return `
                    <li class="alert-item ${severity}">
                        <div class="alert-item-top">
                            <strong>${escapeHTML(item.metric)}</strong>
                            <span class="alert-item-value">
                                ${escapeHTML(formatNumber(item.value))}
                            </span>
                        </div>
                        <p class="alert-item-message">
                            ${escapeHTML(item.message || `${severity.toUpperCase()} threshold breach`)}
                        </p>
                        <div class="alert-item-meta">
                            <span>${escapeHTML(severity.toUpperCase())}</span>
                            <span>${escapeHTML(formatShortTime(item.timestamp))}</span>
                        </div>
                    </li>
                `;
            })
            .join("");
    }

    function renderHistoryTable(filteredReadings) {
        const tbody = getElement("telemetry-table-body");
        if (!tbody) return;

        setText(
            "history-count-badge",
            `${filteredReadings.length} Record${filteredReadings.length === 1 ? "" : "s"}`
        );

        if (!filteredReadings.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6">
                        <div class="empty-state">
                            No telemetry readings match the current filters.
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        const sourceMap = new Map(sources.map(src => [src.id, src]));
        const visibleRows = filteredReadings.slice(0, MAX_TABLE_ROWS);

        tbody.innerHTML = visibleRows
            .map(reading => {
                const src = sourceMap.get(reading.sourceId);
                const metric = src?.metrics?.find(
                    m => m.id === reading.metricId
                );
                const status = evaluateThreshold(metric, reading.value);
                const mode = (reading.inputMode || "manual").toLowerCase();

                return `
                    <tr>
                        <td>${escapeHTML(formatTime(reading.timestamp))}</td>
                        <td>${escapeHTML(src?.name || "Unknown Source")}</td>
                        <td>${escapeHTML(reading.metric)}</td>
                        <td>
                            <strong>${escapeHTML(formatNumber(reading.value))}</strong>
                            ${escapeHTML(reading.unit || "")}
                        </td>
                        <td>
                            <span class="status-badge ${status}">${escapeHTML(status)}</span>
                        </td>
                        <td>
                            <span class="mode-badge ${escapeHTML(mode)}">${escapeHTML(mode)}</span>
                        </td>
                    </tr>
                `;
            })
            .join("");
    }

    /* =====================================================
       LIVE SIMULATION ENGINE
    ===================================================== */

    function toggleSimulation() {
        if (isSimulating) {
            stopSimulation();
        } else {
            startSimulation();
        }
    }

    function startSimulation() {
        const source = getSelectedSource();
        if (!source) {
            showMessage("Create and select a monitoring source first.", "warning");
            return;
        }

        const enabledMetrics = (source.metrics || []).filter(
            m => m.enabled !== false
        );

        if (!enabledMetrics.length) {
            showMessage("This source has no enabled metrics.", "warning");
            return;
        }

        if (DeviceConnectors?.isHostRunning()) {
            DeviceConnectors.stopHostMonitor();
            updateHostButtonState(false);
        }

        isSimulating = true;
        const intervalMs = Math.max(
            1000,
            Number(source.samplingInterval) || 5000
        );

        runSimulationTick();
        simTimer = window.setInterval(runSimulationTick, intervalMs);

        updateControlButtons(source);
        showMessage(
            `Live simulation started for ${source.name} (${(intervalMs / 1000).toFixed(1)}s).`,
            "success"
        );
    }

    function stopSimulation() {
        isSimulating = false;
        if (simTimer) {
            window.clearInterval(simTimer);
            simTimer = null;
        }
        updateControlButtons(getSelectedSource());
        showMessage("Live simulation paused.", "info");
    }

    async function runSimulationTick() {
        if (isTickBusy) return;

        const source = getSelectedSource();
        if (!source) {
            if (isSimulating) stopSimulation();
            return;
        }

        const enabledMetrics = (source.metrics || []).filter(
            m => m.enabled !== false
        );
        if (!enabledMetrics.length) return;

        isTickBusy = true;
        internalWriteInProgress = true;

        const spikeActive = pendingSpike;
        pendingSpike = false;

        try {
            const selectedMetric = getSelectedMetric(source);

            for (const metric of enabledMetrics) {
                const latest = allReadings.find(
                    r => r.sourceId === source.id && r.metricId === metric.id
                );

                const shouldSpike =
                    spikeActive &&
                    (!selectedMetric || metric.id === selectedMetric.id);

                const value = generateSimulatedValue(
                    metric,
                    latest ? latest.value : null,
                    shouldSpike
                );

                const savedReading = await DataManager.addReading({
                    sourceId: source.id,
                    metricId: metric.id,
                    value,
                    inputMode: "simulated"
                });

                const severity = evaluateThreshold(metric, value);
                if (severity !== "normal") {
                    await DataManager.saveAnomaly({
                        sourceId: source.id,
                        metricId: metric.id,
                        metric: metric.name,
                        value,
                        severity,
                        message: `${metric.name} reached ${formatNumber(value)} ${metric.unit || ""} (${severity} threshold breached during simulated stream).`,
                        timestamp: savedReading.timestamp,
                        detectionMethod: "threshold"
                    });
                }
            }

            await loadDataAndRender(false);
        } catch (error) {
            console.error("Simulation tick failed:", error);
            showMessage("Simulation error: " + error.message, "error");
            if (isSimulating) stopSimulation();
        } finally {
            internalWriteInProgress = false;
            isTickBusy = false;
        }
    }

    function generateSimulatedValue(metric, previousValue, forceSpike) {
        const warn =
            metric.warningThreshold !== null &&
            metric.warningThreshold !== undefined
                ? Number(metric.warningThreshold)
                : null;
        const crit =
            metric.criticalThreshold !== null &&
            metric.criticalThreshold !== undefined
                ? Number(metric.criticalThreshold)
                : null;

        const lowerIsWorse =
            warn !== null && crit !== null && crit < warn;

        let baseMin = 15;
        let baseMax = 65;

        if (warn !== null && crit !== null) {
            if (lowerIsWorse) {
                baseMin = warn + 10;
                baseMax = warn * 2.1;
            } else {
                baseMin = Math.max(2, warn * 0.3);
                baseMax = warn * 0.92;
            }
        } else if (metric.unit === "%") {
            baseMin = 18;
            baseMax = 72;
        } else if (metric.unit === "°C") {
            baseMin = 36;
            baseMax = 68;
        }

        if (forceSpike) {
            if (lowerIsWorse && crit !== null) {
                return Number(
                    Math.max(1, crit * (0.55 + Math.random() * 0.35)).toFixed(2)
                );
            }
            const target = crit ?? warn ?? baseMax * 1.35;
            return Number((target * (1.03 + Math.random() * 0.16)).toFixed(2));
        }

        let nextValue;
        const span = Math.max(4, baseMax - baseMin);

        if (
            previousValue !== null &&
            Number.isFinite(Number(previousValue))
        ) {
            const prev = Number(previousValue);
            const drift = (Math.random() - 0.48) * (span * 0.28);
            const meanPull = ((baseMin + baseMax) / 2 - prev) * 0.25;
            nextValue = prev + drift + meanPull;
        } else {
            nextValue = baseMin + Math.random() * span;
        }

        if (metric.unit === "%") {
            nextValue = Math.min(100, Math.max(0, nextValue));
        } else {
            nextValue = Math.max(0, nextValue);
        }

        return Number(nextValue.toFixed(2));
    }

    /* =====================================================
       DPI-SCALED CANVAS TIME-SERIES CHART
    ===================================================== */

    function setupChartResizeObserver() {
        const canvas = getElement("telemetry-chart");
        if (!canvas || !canvas.parentElement) return;

        if (typeof ResizeObserver === "function") {
            const observer = new ResizeObserver(() => {
                drawChart();
            });
            observer.observe(canvas.parentElement);
        } else {
            window.addEventListener("resize", drawChart);
        }
    }

    function renderChart(source, metric, filteredReadings) {
        setText(
            "chart-title",
            metric
                ? `${metric.name}${metric.unit ? ` (${metric.unit})` : ""} — History`
                : "Metric History Chart"
        );
        setText(
            "chart-subtitle",
            source && metric
                ? `${source.name} · Latest ${Math.min(filteredReadings.length, MAX_CHART_POINTS)} recorded samples`
                : "Time-series telemetry with configured warning & critical thresholds."
        );

        chartPoints = filteredReadings
            .slice(0, MAX_CHART_POINTS)
            .reverse()
            .map(r => ({
                ...r,
                _metricRef: metric
            }));

        const emptyOverlay = getElement("telemetry-chart-empty");
        if (emptyOverlay) {
            emptyOverlay.classList.toggle("hidden", chartPoints.length > 0);
        }

        hoveredIndex = -1;
        hideTooltip();
        drawChart();
    }

    function drawChart() {
        const canvas = getElement("telemetry-chart");
        if (!canvas || !canvas.parentElement) return;

        const rect = canvas.parentElement.getBoundingClientRect();
        const width = Math.max(260, Math.floor(rect.width));
        const height = Math.max(200, Math.floor(rect.height));
        const dpr = window.devicePixelRatio || 1;

        canvas.width = width * dpr;
        canvas.height = height * dpr;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const pad = { top: 22, right: 20, bottom: 34, left: 54 };
        const plotW = Math.max(40, width - pad.left - pad.right);
        const plotH = Math.max(40, height - pad.top - pad.bottom);

        if (!chartPoints.length) {
            drawGrid(ctx, pad, plotW, plotH, 0, 100, "");
            return;
        }

        const metric = chartPoints[0]._metricRef;
        const values = chartPoints.map(p => Number(p.value));

        const warn =
            metric?.warningThreshold !== null &&
            metric?.warningThreshold !== undefined
                ? Number(metric.warningThreshold)
                : null;
        const crit =
            metric?.criticalThreshold !== null &&
            metric?.criticalThreshold !== undefined
                ? Number(metric.criticalThreshold)
                : null;

        let minVal = Math.min(...values);
        let maxVal = Math.max(...values);

        if (warn !== null) {
            minVal = Math.min(minVal, warn);
            maxVal = Math.max(maxVal, warn);
        }
        if (crit !== null) {
            minVal = Math.min(minVal, crit);
            maxVal = Math.max(maxVal, crit);
        }

        if (minVal === maxVal) {
            minVal = Math.max(0, minVal - 10);
            maxVal = maxVal + 10;
        } else {
            const margin = (maxVal - minVal) * 0.14;
            minVal = Math.max(0, minVal - margin);
            maxVal = maxVal + margin;
        }

        drawGrid(ctx, pad, plotW, plotH, minVal, maxVal, metric?.unit || "");

        const toX = index => {
            if (chartPoints.length === 1) return pad.left + plotW / 2;
            return pad.left + (index / (chartPoints.length - 1)) * plotW;
        };

        const toY = val => {
            const ratio = (val - minVal) / (maxVal - minVal);
            return pad.top + plotH - ratio * plotH;
        };

        if (warn !== null) {
            drawThresholdLine(
                ctx,
                pad.left,
                plotW,
                toY(warn),
                "#f59e0b",
                `Warn ${formatNumber(warn)}`
            );
        }
        if (crit !== null) {
            drawThresholdLine(
                ctx,
                pad.left,
                plotW,
                toY(crit),
                "#ef4444",
                `Crit ${formatNumber(crit)}`
            );
        }

        if (chartPoints.length > 1) {
            const grad = ctx.createLinearGradient(
                0,
                pad.top,
                0,
                pad.top + plotH
            );
            grad.addColorStop(0, "rgba(34, 211, 238, 0.28)");
            grad.addColorStop(1, "rgba(34, 211, 238, 0.01)");

            ctx.beginPath();
            chartPoints.forEach((point, i) => {
                const x = toX(i);
                const y = toY(Number(point.value));
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.lineTo(toX(chartPoints.length - 1), pad.top + plotH);
            ctx.lineTo(toX(0), pad.top + plotH);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
        }

        ctx.beginPath();
        chartPoints.forEach((point, i) => {
            const x = toX(i);
            const y = toY(Number(point.value));
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = "#22d3ee";
        ctx.lineWidth = 2.2;
        ctx.stroke();

        chartPoints.forEach((point, i) => {
            const x = toX(i);
            const y = toY(Number(point.value));
            const status = evaluateThreshold(metric, point.value);

            point._cx = x;
            point._cy = y;

            ctx.beginPath();
            ctx.arc(x, y, i === hoveredIndex ? 5.5 : 3.2, 0, Math.PI * 2);
            ctx.fillStyle =
                status === "critical"
                    ? "#ef4444"
                    : status === "warning"
                        ? "#f59e0b"
                        : "#22d3ee";
            ctx.fill();

            if (i === hoveredIndex) {
                ctx.beginPath();
                ctx.arc(x, y, 9, 0, Math.PI * 2);
                ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        });

        ctx.fillStyle = "#94a3b8";
        ctx.font = "10px Consolas, monospace";
        ctx.textAlign = "left";
        ctx.fillText(
            formatShortTime(chartPoints[0].timestamp),
            pad.left,
            height - 10
        );

        if (chartPoints.length > 2) {
            const mid = Math.floor(chartPoints.length / 2);
            ctx.textAlign = "center";
            ctx.fillText(
                formatShortTime(chartPoints[mid].timestamp),
                toX(mid),
                height - 10
            );
        }

        if (chartPoints.length > 1) {
            ctx.textAlign = "right";
            ctx.fillText(
                formatShortTime(chartPoints[chartPoints.length - 1].timestamp),
                pad.left + plotW,
                height - 10
            );
        }
    }

    function drawGrid(ctx, pad, plotW, plotH, minVal, maxVal, unit) {
        const steps = 4;
        ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
        ctx.lineWidth = 1;
        ctx.fillStyle = "#94a3b8";
        ctx.font = "10px Consolas, monospace";
        ctx.textAlign = "right";

        for (let i = 0; i <= steps; i++) {
            const y = pad.top + (i / steps) * plotH;
            const val = maxVal - (i / steps) * (maxVal - minVal);

            ctx.beginPath();
            ctx.moveTo(pad.left, y);
            ctx.lineTo(pad.left + plotW, y);
            ctx.stroke();

            ctx.fillText(
                `${formatNumber(val)}${unit ? ` ${unit}` : ""}`,
                pad.left - 8,
                y + 3
            );
        }
    }

    function drawThresholdLine(ctx, left, width, y, color, label) {
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(left + width, y);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = color;
        ctx.font = "10px Segoe UI, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(label, left + width - 4, y - 5);
    }

    function bindCanvasInteraction() {
        const canvas = getElement("telemetry-chart");
        if (!canvas) return;

        canvas.addEventListener("mousemove", event => {
            if (!chartPoints.length) return;

            const rect = canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;

            let bestIdx = -1;
            let bestDist = Infinity;

            chartPoints.forEach((point, idx) => {
                if (typeof point._cx !== "number") return;
                const dist = Math.abs(point._cx - mouseX);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestIdx = idx;
                }
            });

            if (bestIdx !== -1 && bestDist <= 32) {
                hoveredIndex = bestIdx;
                drawChart();
                showTooltip(chartPoints[bestIdx], rect.width);
            } else if (hoveredIndex !== -1) {
                hoveredIndex = -1;
                drawChart();
                hideTooltip();
            }
        });

        canvas.addEventListener("mouseleave", () => {
            if (hoveredIndex !== -1) {
                hoveredIndex = -1;
                drawChart();
            }
            hideTooltip();
        });
    }

    function showTooltip(point, canvasWidth) {
        const tooltip = getElement("telemetry-chart-tooltip");
        if (!tooltip) return;

        const status = evaluateThreshold(point._metricRef, point.value);
        const mode = (point.inputMode || "manual").toUpperCase();

        tooltip.innerHTML = `
            <div><strong>${escapeHTML(formatNumber(point.value))} ${escapeHTML(point.unit || "")}</strong></div>
            <div>Status: ${escapeHTML(status.toUpperCase())} · ${escapeHTML(mode)}</div>
            <div style="color: var(--text-muted);">${escapeHTML(formatTime(point.timestamp))}</div>
        `;

        tooltip.classList.remove("hidden");

        const left = Math.min(
            Math.max(10, (point._cx || 0) + 12),
            Math.max(10, canvasWidth - 190)
        );
        const top = Math.max(10, (point._cy || 30) - 48);

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }

    function hideTooltip() {
        const tooltip = getElement("telemetry-chart-tooltip");
        if (tooltip) tooltip.classList.add("hidden");
    }

    /* =====================================================
       EXPORT FILTERED CSV
    ===================================================== */

    function exportFilteredCSV() {
        const source = getSelectedSource();
        const metric = getSelectedMetric(source);
        const rows = getFilteredReadings(source, metric);

        if (!rows.length) {
            showMessage("No filtered readings available to export.", "warning");
            return;
        }

        const sourceMap = new Map(sources.map(s => [s.id, s.name]));
        const headers = [
            "sourceId",
            "sourceName",
            "metricId",
            "metric",
            "value",
            "unit",
            "timestamp",
            "inputMode"
        ];

        const escapeCSV = val => `"${String(val ?? "").replace(/"/g, '""')}"`;

        const csvLines = [
            headers.join(","),
            ...rows.map(r =>
                [
                    r.sourceId,
                    sourceMap.get(r.sourceId) || "Unknown",
                    r.metricId,
                    r.metric,
                    r.value,
                    r.unit,
                    r.timestamp,
                    r.inputMode || "manual"
                ]
                    .map(escapeCSV)
                    .join(",")
            )
        ].join("\r\n");

        const blob = new Blob(["\uFEFF" + csvLines], {
            type: "text/csv;charset=utf-8;"
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `nexusai-telemetry-${Date.now()}.csv`;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();

        window.setTimeout(() => {
            link.remove();
            URL.revokeObjectURL(url);
        }, 1500);

        showMessage(
            `Exported ${rows.length} filtered telemetry reading(s).`,
            "success"
        );
    }

    /* =====================================================
       PUBLIC API & BOOT
    ===================================================== */

    window.NexusAI.Telemetry = {
        init,
        refresh: () => loadDataAndRender(false),
        startSimulation,
        stopSimulation,
        evaluateThreshold
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();