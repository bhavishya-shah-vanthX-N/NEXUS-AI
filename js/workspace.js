
/* =========================================================
   NEXUSAI — WORKSPACE CONTROLLER
   File: js/workspace.js

   Dependencies:
   1. storage.js
   2. data-manager.js

   Connects the Workspace HTML interface to NexusAI data.
========================================================= */

(function () {
    "use strict";

    window.NexusAI = window.NexusAI || {};

    const DataManager = window.NexusAI.DataManager;

    if (!DataManager) {
        console.error(
            "Workspace: Data Manager not found. Check script loading order."
        );
        return;
    }

    /* =====================================================
       DOM HELPERS
    ===================================================== */

    const $ = selector => document.querySelector(selector);

    const getElement = id => document.getElementById(id);

    const getValue = id => {
        const element = getElement(id);
        return element ? element.value.trim() : "";
    };

    const setText = (id, value) => {
        const element = getElement(id);
        if (element) element.textContent = value;
    };

    const escapeHTML = value => {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    };

    function showMessage(message, type = "info") {
        let container = getElement("workspace-notification");

        if (!container) {
            container = document.createElement("div");
            container.id = "workspace-notification";
            container.className = "workspace-notification";
            container.setAttribute("role", "status");
            document.body.appendChild(container);
        }

        container.textContent = message;
        container.dataset.type = type;
        container.classList.add("visible");

        window.clearTimeout(container._hideTimer);

        container._hideTimer = window.setTimeout(() => {
            container.classList.remove("visible");
        }, 3500);
    }

    function formatDate(dateValue) {
        if (!dateValue) return "No readings yet";

        const date = new Date(dateValue);

        if (Number.isNaN(date.getTime())) return "Unknown";

        return date.toLocaleString();
    }

    function formatNumber(value) {
        return Number(value).toLocaleString(undefined, {
            maximumFractionDigits: 2
        });
    }

    /* =====================================================
       APPLICATION STATE
    ===================================================== */

    let sources = [];
    let editingSourceId = null;
    let selectedSourceId = null;
    let metricDraft = [];

    /* =====================================================
       INITIALIZATION
    ===================================================== */

    async function init() {
        try {
            await DataManager.init();

            bindEvents();

            await refreshWorkspace();

            populateSourceOptions();

            console.info("NexusAI Workspace initialized.");

        } catch (error) {
            console.error("Workspace initialization failed:", error);

            showMessage(
                "Workspace could not initialize. Check the browser console.",
                "error"
            );
        }
    }

    /* =====================================================
       EVENT LISTENERS
    ===================================================== */

    function bindEvents() {
        const sourceForm = getElement("source-configuration-form");

        if (sourceForm) {
            sourceForm.addEventListener("submit", handleSourceSave);
        }

        const readingForm = getElement("manual-reading-form");

        if (readingForm) {
            readingForm.addEventListener("submit", handleManualReading);
        }

        const searchInput = getElement("source-search");

        if (searchInput) {
            searchInput.addEventListener("input", renderSourceTable);
        }

        const filterSelect = getElement("source-filter");

        if (filterSelect) {
            filterSelect.addEventListener("change", renderSourceTable);
        }

        const sourceType = getElement("source-type");

        if (sourceType) {
            sourceType.addEventListener("change", () => {
                if (!editingSourceId) {
                    loadMetricPresets(sourceType.value);
                }
            });
        }

        const resetButton = getElement("reset-source-form");

        if (resetButton) {
            resetButton.addEventListener("click", resetSourceForm);
        }

        const metricAddButton = getElement("add-metric");

        if (metricAddButton) {
            metricAddButton.addEventListener("click", addMetricRow);
        }

        const importButton = getElement("import-data");

        if (importButton) {
            importButton.addEventListener("click", () => {
                getElement("import-file")?.click();
            });
        }

        const importFile = getElement("import-file");

        if (importFile) {
            importFile.addEventListener("change", handleImport);
        }

        const exportCSV = getElement("export-csv");

        if (exportCSV) {
            exportCSV.addEventListener("click", () => exportReadings("csv"));
        }

        const exportJSON = getElement("export-json");

        if (exportJSON) {
            exportJSON.addEventListener("click", () => exportReadings("json"));
        }

        const sourceTable = getElement("source-table-body");

        if (sourceTable) {
            sourceTable.addEventListener("click", handleSourceTableAction);
        }

        document.addEventListener("click", handleGeneralActions);

        DataManager.subscribe(
            DataManager.events.SOURCE_CREATED,
            refreshWorkspace
        );

        DataManager.subscribe(
            DataManager.events.SOURCE_UPDATED,
            refreshWorkspace
        );

        DataManager.subscribe(
            DataManager.events.SOURCE_DELETED,
            refreshWorkspace
        );

        DataManager.subscribe(
            DataManager.events.READING_ADDED,
            refreshWorkspace
        );
    }

    /* =====================================================
       WORKSPACE REFRESH
    ===================================================== */

    async function refreshWorkspace() {
        sources = await DataManager.getSources();

        await renderSummary();
        renderSourceTable();
        populateSourceOptions();
    }

    /* =====================================================
       SUMMARY CARDS
    ===================================================== */

    async function renderSummary() {
        const summary = await DataManager.getSummary();

        setText("total-sources", summary.totalSources);
        setText("active-sources", summary.activeSources);
        setText("configured-metrics", summary.configuredMetrics);
        setText("source-alerts", summary.alertCount);
    }

    /* =====================================================
       SOURCE TABLE
    ===================================================== */

    function renderSourceTable() {
        const tableBody = getElement("source-table-body");

        if (!tableBody) return;

        const search = (
            getValue("source-search")
        ).toLowerCase();

        const filter = getValue("source-filter");

        const filteredSources = sources.filter(source => {
            const matchesSearch = [
                source.name,
                source.type,
                source.architecture,
                source.description
            ].join(" ").toLowerCase().includes(search);

            const matchesFilter =
                !filter ||
                filter === "all" ||
                source.status === filter;

            return matchesSearch && matchesFilter;
        });

        if (!filteredSources.length) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6">
                        <div class="empty-state">
                            <h3>No monitoring sources found</h3>
                            <p>
                                Add a new source or change your search filters.
                            </p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = filteredSources.map(source => {
            const metricCount = (source.metrics || []).filter(
                metric => metric.enabled !== false
            ).length;

            const statusClass =
                source.status === "active"
                    ? "success"
                    : source.status === "offline"
                        ? "danger"
                        : "warning";

            return `
                <tr>
                    <td>
                        <strong>${escapeHTML(source.name)}</strong>
                        <small>${escapeHTML(source.description || "")}</small>
                    </td>

                    <td>${escapeHTML(source.type)}</td>

                    <td>${escapeHTML(source.architecture)}</td>

                    <td>${metricCount}</td>

                    <td>
                        <span class="status-badge ${statusClass}">
                            ${escapeHTML(source.status)}
                        </span>
                    </td>

                    <td>
                        <div class="table-actions">
                            <button
                                type="button"
                                class="btn btn-small"
                                data-action="edit"
                                data-id="${escapeHTML(source.id)}">
                                Edit
                            </button>

                            <button
                                type="button"
                                class="btn btn-small"
                                data-action="delete"
                                data-id="${escapeHTML(source.id)}">
                                Delete
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }

    /* =====================================================
       SOURCE FORM — METRIC BUILDER
    ===================================================== */

    function loadMetricPresets(sourceType) {
        metricDraft = DataManager.getMetricPresets(sourceType);

        renderMetricBuilder();
    }

    function addMetricRow() {
        metricDraft.push({
            id: DataManager.createId("metric"),
            name: "",
            unit: "",
            warningThreshold: null,
            criticalThreshold: null,
            enabled: true
        });

        renderMetricBuilder();
    }

    function renderMetricBuilder() {
        const container = getElement("metric-list");

        if (!container) return;

        if (!metricDraft.length) {
            container.innerHTML = `
                <p class="empty-state">
                    No metrics configured. Add a metric to begin.
                </p>
            `;
            return;
        }

        container.innerHTML = metricDraft.map((metric, index) => `
            <div class="metric-row" data-index="${index}">

                <input
                    type="text"
                    data-field="name"
                    value="${escapeHTML(metric.name)}"
                    placeholder="Metric name"
                    aria-label="Metric name">

                <input
                    type="text"
                    data-field="unit"
                    value="${escapeHTML(metric.unit)}"
                    placeholder="Unit"
                    aria-label="Metric unit">

                <input
                    type="number"
                    data-field="warningThreshold"
                    value="${metric.warningThreshold ?? ""}"
                    placeholder="Warning"
                    aria-label="Warning threshold">

                <input
                    type="number"
                    data-field="criticalThreshold"
                    value="${metric.criticalThreshold ?? ""}"
                    placeholder="Critical"
                    aria-label="Critical threshold">

                <label>
                    <input
                        type="checkbox"
                        data-field="enabled"
                        ${metric.enabled !== false ? "checked" : ""}>
                    Enabled
                </label>

                <button
                    type="button"
                    class="btn btn-small"
                    data-action="remove-metric"
                    data-index="${index}">
                    Remove
                </button>

            </div>
        `).join("");
    }

    function readMetricBuilder() {
        const container = getElement("metric-list");

        if (!container) return metricDraft;

        const rows = container.querySelectorAll(".metric-row");

        return Array.from(rows).map(row => {
            const read = field => row.querySelector(
                `[data-field="${field}"]`
            );

            const name = read("name")?.value.trim() || "";
            const unit = read("unit")?.value.trim() || "";

            const warningInput = read("warningThreshold");
            const criticalInput = read("criticalThreshold");

            const existing = metricDraft.find(
                metric => metric.name === name
            );

            return {
                id: existing?.id || DataManager.createId("metric"),

                name,

                unit,

                warningThreshold:
                    warningInput?.value === ""
                        ? null
                        : Number(warningInput.value),

                criticalThreshold:
                    criticalInput?.value === ""
                        ? null
                        : Number(criticalInput.value),

                enabled: read("enabled")?.checked ?? true
            };
        });
    }

    /* =====================================================
       SAVE SOURCE
    ===================================================== */

    async function handleSourceSave(event) {
        event.preventDefault();

        try {
            const sourceData = {
                id: editingSourceId || undefined,

                name: getValue("source-name"),

                type: getValue("source-type"),

                architecture: getValue("source-architecture"),

                inputMode: getValue("source-input-mode"),

                description: getValue("source-description"),

                samplingInterval: Number(
                    getValue("sampling-interval") || 5000
                ),

                historyRetention: Number(
                    getValue("history-retention") || 7
                ),

                status: getValue("source-status") || "active",

                metrics: readMetricBuilder()
            };

            await DataManager.saveSource(sourceData);

            showMessage(
                editingSourceId
                    ? "Monitoring source updated."
                    : "Monitoring source created.",
                "success"
            );

            resetSourceForm();

            await refreshWorkspace();

        } catch (error) {
            console.error(error);
            showMessage(error.message || "Could not save source.", "error");
        }
    }

    /* =====================================================
       EDIT SOURCE
    ===================================================== */

    async function editSource(sourceId) {
        const source = await DataManager.getSource(sourceId);

        if (!source) {
            showMessage("Source not found.", "error");
            return;
        }

        editingSourceId = source.id;

        setFormValue("source-name", source.name);
        setFormValue("source-type", source.type);
        setFormValue("source-architecture", source.architecture);
        setFormValue("source-input-mode", source.inputMode);
        setFormValue("source-description", source.description);
        setFormValue("sampling-interval", source.samplingInterval);
        setFormValue("history-retention", source.historyRetention);
        setFormValue("source-status", source.status);

        metricDraft = (source.metrics || []).map(metric => ({
            ...metric
        }));

        renderMetricBuilder();

        const submitButton = getElement("save-source");

        if (submitButton) {
            submitButton.textContent = "Update Source";
        }

        const heading = getElement("source-form-heading");

        if (heading) {
            heading.textContent = "Edit Monitoring Source";
        }

        getElement("source-configuration-form")?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    function setFormValue(id, value) {
        const element = getElement(id);

        if (element) element.value = value ?? "";
    }

    /* =====================================================
       RESET SOURCE FORM
    ===================================================== */

    function resetSourceForm() {
        const form = getElement("source-configuration-form");

        if (form) form.reset();

        editingSourceId = null;

        metricDraft = DataManager.getMetricPresets(
            getValue("source-type") || "Laptop"
        );

        renderMetricBuilder();

        const submitButton = getElement("save-source");

        if (submitButton) {
            submitButton.textContent = "Save Source";
        }

        const heading = getElement("source-form-heading");

        if (heading) {
            heading.textContent = "Configure Monitoring Source";
        }
    }

    /* =====================================================
       SOURCE TABLE ACTIONS
    ===================================================== */

    async function handleSourceTableAction(event) {
        const button = event.target.closest("[data-action]");

        if (!button) return;

        const action = button.dataset.action;
        const sourceId = button.dataset.id;

        if (action === "edit") {
            await editSource(sourceId);
        }

        if (action === "delete") {
            await confirmDeleteSource(sourceId);
        }
    }

    async function confirmDeleteSource(sourceId) {
        const source = await DataManager.getSource(sourceId);

        if (!source) return;

        const confirmed = window.confirm(
            `Delete "${source.name}" and all its associated readings and anomalies? This cannot be undone.`
        );

        if (!confirmed) return;

        try {
            await DataManager.deleteSource(sourceId);

            showMessage("Source and associated history deleted.", "success");

            await refreshWorkspace();

        } catch (error) {
            console.error(error);
            showMessage(error.message || "Could not delete source.", "error");
        }
    }

    /* =====================================================
       MANUAL READING
    ===================================================== */

    async function handleManualReading(event) {
        event.preventDefault();

        try {
            const sourceId = getValue("reading-source");
            const metricId = getValue("reading-metric");
            const value = getValue("reading-value");
            const timestamp = getValue("reading-timestamp");

            if (!sourceId || !metricId || value === "") {
                throw new Error("Complete all reading fields.");
            }

            await DataManager.addReading({
                sourceId,
                metricId,
                value: Number(value),
                timestamp: timestamp || undefined,
                inputMode: "manual"
            });

            event.target.reset();

            populateSourceOptions();

            showMessage("Telemetry reading saved.", "success");

            await refreshWorkspace();

        } catch (error) {
            console.error(error);
            showMessage(error.message || "Could not save reading.", "error");
        }
    }

    /* =====================================================
       SOURCE AND METRIC DROPDOWNS
    ===================================================== */

    function populateSourceOptions() {
        const sourceSelect = getElement("reading-source");

        if (!sourceSelect) return;

        const previousValue = sourceSelect.value;

        sourceSelect.innerHTML = `
            <option value="">Select a source</option>
            ${sources.map(source => `
                <option value="${escapeHTML(source.id)}">
                    ${escapeHTML(source.name)}
                </option>
            `).join("")}
        `;

        if (sources.some(source => source.id === previousValue)) {
            sourceSelect.value = previousValue;
        }

        populateMetricOptions(sourceSelect.value);

        sourceSelect.onchange = () => {
            populateMetricOptions(sourceSelect.value);
        };
    }

    function populateMetricOptions(sourceId) {
        const metricSelect = getElement("reading-metric");

        if (!metricSelect) return;

        const source = sources.find(item => item.id === sourceId);

        const metrics = (source?.metrics || []).filter(
            metric => metric.enabled !== false
        );

        metricSelect.innerHTML = `
            <option value="">Select a metric</option>
            ${metrics.map(metric => `
                <option value="${escapeHTML(metric.id)}">
                    ${escapeHTML(metric.name)}
                    ${metric.unit ? `(${escapeHTML(metric.unit)})` : ""}
                </option>
            `).join("")}
        `;
    }

    /* =====================================================
       GENERAL ACTION BUTTONS
    ===================================================== */

    function handleGeneralActions(event) {
        const button = event.target.closest("[data-action]");

        if (!button) return;

        if (button.dataset.action === "remove-metric") {
            const index = Number(button.dataset.index);

            if (Number.isInteger(index)) {
                metricDraft.splice(index, 1);
                renderMetricBuilder();
            }
        }

        if (button.dataset.action === "close-dialog") {
            const dialog = button.closest("dialog");

            if (dialog) dialog.close();
        }
    }

    /* =====================================================
       CSV PARSER
    ===================================================== */

    function parseCSV(text) {
        const rows = [];

        let row = [];
        let value = "";
        let insideQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const character = text[i];
            const nextCharacter = text[i + 1];

            if (character === '"' && insideQuotes && nextCharacter === '"') {
                value += '"';
                i++;
            } else if (character === '"') {
                insideQuotes = !insideQuotes;
            } else if (character === "," && !insideQuotes) {
                row.push(value.trim());
                value = "";
            } else if (
                (character === "\n" || character === "\r") &&
                !insideQuotes
            ) {
                if (character === "\r" && nextCharacter === "\n") i++;

                row.push(value.trim());

                if (row.some(cell => cell !== "")) {
                    rows.push(row);
                }

                row = [];
                value = "";
            } else {
                value += character;
            }
        }

        row.push(value.trim());

        if (row.some(cell => cell !== "")) {
            rows.push(row);
        }

        if (rows.length < 2) {
            throw new Error("CSV must contain a header and at least one row.");
        }

        const headers = rows.shift().map(header =>
            header.trim().toLowerCase()
        );

        return rows.map(row => {
            const record = {};

            headers.forEach((header, index) => {
                record[header] = row[index] ?? "";
            });

            return record;
        });
    }

    /* =====================================================
       IMPORT CSV AND JSON
    ===================================================== */

    async function handleImport(event) {
        const file = event.target.files?.[0];

        if (!file) return;

        try {
            const content = await file.text();

            const extension = file.name.split(".").pop().toLowerCase();

            let records;

            if (extension === "json") {
                const parsed = JSON.parse(content);

                records = Array.isArray(parsed)
                    ? parsed
                    : parsed.readings;

                if (!Array.isArray(records)) {
                    throw new Error(
                        "JSON must contain an array of reading records."
                    );
                }

            } else if (extension === "csv") {
                records = parseCSV(content);

            } else {
                throw new Error("Only CSV and JSON files are supported.");
            }

            const result = await importRecords(records);

            showMessage(
                `Import complete: ${result.imported} readings imported, ${result.skipped} skipped.`,
                "success"
            );

            await refreshWorkspace();

        } catch (error) {
            console.error(error);

            showMessage(
                error.message || "Could not import this file.",
                "error"
            );

        } finally {
            event.target.value = "";
        }
    }

    async function importRecords(records) {
        let imported = 0;
        let skipped = 0;

        const currentSources = await DataManager.getSources();

        for (const record of records) {
            try {
                const sourceId = record.sourceid || record.sourceId;
                const sourceName = record.sourcename || record.sourceName;

                const source = currentSources.find(item => {
                    return item.id === sourceId ||
                        (
                            sourceName &&
                            item.name.toLowerCase() ===
                                String(sourceName).toLowerCase()
                        );
                });

                if (!source) {
                    skipped++;
                    continue;
                }

                const metricId = record.metricid || record.metricId;
                const metricName = record.metric;

                const metric = (source.metrics || []).find(item => {
                    return item.id === metricId ||
                        (
                            metricName &&
                            item.name.toLowerCase() ===
                                String(metricName).toLowerCase()
                        );
                });

                if (!metric) {
                    skipped++;
                    continue;
                }

                await DataManager.addReading({
                    sourceId: source.id,
                    metricId: metric.id,
                    value: record.value,
                    timestamp: record.timestamp || record.date,
                    inputMode: "import"
                });

                imported++;

            } catch (error) {
                console.warn("Skipped imported record:", error);
                skipped++;
            }
        }

        return { imported, skipped };
    }

    /* =====================================================
       EXPORT CSV AND JSON
    ===================================================== */

    async function exportReadings(format) {
        try {
            const readings = await DataManager.getReadings();
            const currentSources = await DataManager.getSources();

            if (!readings.length) {
                showMessage("There are no readings to export.", "warning");
                return;
            }

            const sourceMap = new Map(
                currentSources.map(source => [source.id, source.name])
            );

            const records = readings.map(reading => ({
                sourceId: reading.sourceId,
                sourceName: sourceMap.get(reading.sourceId) || "Unknown",
                metricId: reading.metricId,
                metric: reading.metric,
                value: reading.value,
                unit: reading.unit,
                timestamp: reading.timestamp,
                inputMode: reading.inputMode
            }));

            let content;
            let mimeType;
            let extension;

            if (format === "json") {
                content = JSON.stringify(records, null, 2);
                mimeType = "application/json";
                extension = "json";

            } else {
                const headers = Object.keys(records[0]);

                const escapeCSV = value => {
                    const text = String(value ?? "");

                    return `"${text.replace(/"/g, '""')}"`;
                };

                content = [
                    headers.join(","),
                    ...records.map(record =>
                        headers.map(header =>
                            escapeCSV(record[header])
                        ).join(",")
                    )
                ].join("\n");

                mimeType = "text/csv;charset=utf-8;";
                extension = "csv";
            }

            downloadFile(
                content,
                `nexusai-readings-${Date.now()}.${extension}`,
                mimeType
            );

            showMessage("Reading data exported successfully.", "success");

        } catch (error) {
            console.error(error);
            showMessage("Export failed.", "error");
        }
    }

    function downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");

        link.href = url;
        link.download = filename;

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);
    }

    /* =====================================================
       PUBLIC WORKSPACE API
    ===================================================== */

    window.NexusAI.Workspace = {
        init,
        refresh: refreshWorkspace,
        editSource,
        resetSourceForm,
        exportReadings
    };

    /* =====================================================
       START
    ===================================================== */

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
