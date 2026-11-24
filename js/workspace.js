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

    const getElement = id => document.getElementById(id);

    const getFirstElement = ids => {
        for (const id of ids) {
            const element = getElement(id);
            if (element) return element;
        }
        return null;
    };

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

    function setCurrentTimestamp() {
        const timestampField = getElement("reading-timestamp");

        if (!timestampField) return;

        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        timestampField.value = now.toISOString().slice(0, 16);
    }

    function formatDate(dateValue) {
        if (!dateValue) return "No readings yet";

        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime())) return "Unknown";

        return date.toLocaleString();
    }

    /* =====================================================
       APPLICATION STATE
    ===================================================== */

    let sources = [];
    let alertSourceIds = new Set();
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
            setCurrentTimestamp();

            await refreshWorkspace();

            loadMetricPresets(getValue("source-type"));

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

        const addSourceBtn = getElement("add-source-button");
        if (addSourceBtn) {
            addSourceBtn.addEventListener("click", openNewSourceConfiguration);
        }

        const closeConfigBtn = getElement("close-configuration-button");
        if (closeConfigBtn) {
            closeConfigBtn.addEventListener("click", resetSourceForm);
        }

        const resetButton = getElement("reset-source-form");
        if (resetButton) {
            resetButton.addEventListener("click", resetSourceForm);
        }

        const metricAddButton = getFirstElement([
            "add-metric-button",
            "add-metric"
        ]);
        if (metricAddButton) {
            metricAddButton.addEventListener("click", addMetricRow);
        }

        const headerImportBtn = getElement("import-source-data");
        const importButton = getFirstElement([
            "open-import-button",
            "import-data"
        ]);
        const importFile = getFirstElement([
            "dataset-file-input",
            "import-file"
        ]);

        if (headerImportBtn && importFile) {
            headerImportBtn.addEventListener("click", () => {
                importFile.click();
            });
        }

        if (importButton && importFile) {
            importButton.addEventListener("click", () => {
                importFile.click();
            });
        }

        if (importFile) {
            importFile.addEventListener("change", handleImport);
        }

        const exportCSV = getFirstElement([
            "export-csv-button",
            "export-csv"
        ]);
        if (exportCSV) {
            exportCSV.addEventListener("click", () => {
                exportReadings("csv");
            });
        }

        const exportJSON = getFirstElement([
            "export-json-button",
            "export-json"
        ]);
        if (exportJSON) {
            exportJSON.addEventListener("click", () => {
                exportReadings("json");
            });
        }

        const sourceTable = getElement("source-table-body");
        if (sourceTable) {
            sourceTable.addEventListener("click", handleSourceTableAction);
        }

        document.addEventListener("click", handleGeneralActions);

        bindSourceDialogEvents();

        if (DataManager.events) {
            const eventMap = [
                DataManager.events.SOURCE_CREATED,
                DataManager.events.SOURCE_UPDATED,
                DataManager.events.SOURCE_DELETED,
                DataManager.events.READING_ADDED
            ];

            eventMap.forEach(eventName => {
                if (eventName) {
                    DataManager.subscribe(eventName, refreshWorkspace);
                }
            });
        }
    }

    function openNewSourceConfiguration() {
        resetSourceForm();

        const configSection = getElement("source-configuration");
        if (configSection) {
            configSection.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }

        const nameInput = getElement("source-name");
        if (nameInput) {
            window.setTimeout(() => nameInput.focus(), 200);
        }
    }

    /* =====================================================
       WORKSPACE REFRESH
    ===================================================== */

    async function refreshWorkspace() {
        const [loadedSources, anomalies] = await Promise.all([
            DataManager.getSources(),
            DataManager.getAnomalies()
        ]);

        sources = loadedSources;
        alertSourceIds = new Set(
            anomalies
                .filter(
                    item =>
                        item.severity === "warning" ||
                        item.severity === "critical"
                )
                .map(item => item.sourceId)
        );

        await renderSummary();
        renderSourceTable();
        populateSourceOptions();
    }

    /* =====================================================
       SUMMARY CARDS
    ===================================================== */

    async function renderSummary() {
        const summary = await DataManager.getSummary();

        setText("total-sources", summary.totalSources ?? 0);
        setText("active-sources", summary.activeSources ?? 0);
        setText("configured-metrics", summary.configuredMetrics ?? 0);
        setText("source-alerts", summary.alertCount ?? 0);
    }

    /* =====================================================
       SOURCE TABLE (7 COLUMNS)
    ===================================================== */

    function renderSourceTable() {
        const tableBody = getElement("source-table-body");
        if (!tableBody) return;

        const search = getValue("source-search").toLowerCase();
        const filter = getValue("source-filter");

        const filteredSources = sources.filter(source => {
            const matchesSearch = [
                source.name,
                source.type,
                source.architecture,
                source.description
            ]
                .join(" ")
                .toLowerCase()
                .includes(search);

            let matchesFilter = true;
            if (filter && filter !== "all") {
                if (filter === "warning") {
                    matchesFilter =
                        source.status === "warning" ||
                        alertSourceIds.has(source.id);
                } else {
                    matchesFilter = source.status === filter;
                }
            }

            return matchesSearch && matchesFilter;
        });

        updateTableCount(filteredSources.length, sources.length);

        if (!sources.length) {
            tableBody.innerHTML = `
                <tr class="initial-empty-row">
                    <td colspan="7">
                        <div class="empty-state">
                            <div class="empty-state-icon">▦</div>
                            <h3>No monitoring sources yet</h3>
                            <p>
                                Add a source to begin building your
                                monitoring environment.
                            </p>
                            <button
                                type="button"
                                class="btn btn-primary"
                                id="empty-add-source-button">
                                ＋ Add Your First Source
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        if (!filteredSources.length) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="empty-state">
                            <div class="empty-state-icon">⌕</div>
                            <h3>No matching monitoring sources</h3>
                            <p>
                                No sources match your current search or status filter.
                            </p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = filteredSources
            .map(source => {
                const metricCount = (source.metrics || []).filter(
                    metric => metric.enabled !== false
                ).length;

                const hasAlert = alertSourceIds.has(source.id);
                const statusClass =
                    source.status === "offline"
                        ? "offline"
                        : hasAlert || source.status === "warning"
                            ? "warning"
                            : "active";

                const statusLabel =
                    hasAlert && source.status === "active"
                        ? "Warning"
                        : source.status;

                const initial = (source.name || "N").charAt(0).toUpperCase();

                return `
                    <tr>
                        <td>
                            <div class="source-name-cell">
                                <span class="source-avatar" aria-hidden="true">${escapeHTML(initial)}</span>
                                <div class="source-name-details">
                                    <strong>${escapeHTML(source.name)}</strong>
                                    <span>${escapeHTML(source.description || "No description")}</span>
                                </div>
                            </div>
                        </td>

                        <td>
                            <span class="source-type-text">${escapeHTML(source.type)}</span>
                        </td>

                        <td>
                            <span class="source-architecture-text">${escapeHTML(source.architecture || "—")}</span>
                        </td>

                        <td>
                            <span class="source-metric-count">${metricCount}</span>
                        </td>

                        <td>
                            <span class="source-status ${statusClass}">
                                ${escapeHTML(statusLabel)}
                            </span>
                        </td>

                        <td>
                            <span class="source-last-reading">${escapeHTML(formatDate(source.lastReadingAt))}</span>
                        </td>

                        <td>
                            <div class="table-actions">
                                <button
                                    type="button"
                                    class="btn btn-secondary btn-small"
                                    data-action="edit"
                                    data-id="${escapeHTML(source.id)}">
                                    Edit
                                </button>

                                <button
                                    type="button"
                                    class="source-action-button"
                                    data-action="open-source-actions"
                                    data-id="${escapeHTML(source.id)}"
                                    aria-label="More actions for ${escapeHTML(source.name)}"
                                    title="More actions">
                                    ⋯
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            })
            .join("");
    }

    function updateTableCount(visibleCount, totalCount) {
        const label =
            visibleCount === totalCount
                ? `Showing ${totalCount} monitoring source${totalCount === 1 ? "" : "s"}`
                : `Showing ${visibleCount} of ${totalCount} monitoring sources`;

        setText("source-table-count", label);
    }

    /* =====================================================
       SOURCE FORM — METRIC BUILDER (6 COLUMNS)
    ===================================================== */

    function loadMetricPresets(sourceType) {
        if (!sourceType) {
            metricDraft = [];
        } else {
            metricDraft = DataManager.getMetricPresets(sourceType) || [];
        }

        renderMetricBuilder();
    }

    function addMetricRow() {
        syncMetricDraftFromDOM();

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

    function syncMetricDraftFromDOM() {
        const container = getElement("metric-list");
        if (!container) return;

        const rows = container.querySelectorAll(".metric-row");
        if (!rows.length) return;

        metricDraft = readMetricBuilder();
    }

    function renderMetricBuilder() {
        const container = getElement("metric-list");
        if (!container) return;

        if (!metricDraft.length) {
            container.innerHTML = `
                <div class="metric-empty-state">
                    Select a device type or click &ldquo;Add Custom Metric&rdquo; to configure measurements.
                </div>
            `;
            return;
        }

        container.innerHTML = metricDraft
            .map(
                (metric, index) => `
            <div class="metric-row" data-index="${index}">

                <input
                    type="text"
                    class="metric-name-input"
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
                    step="any"
                    data-field="warningThreshold"
                    value="${metric.warningThreshold ?? ""}"
                    placeholder="Warning"
                    aria-label="Warning threshold">

                <input
                    type="number"
                    step="any"
                    data-field="criticalThreshold"
                    value="${metric.criticalThreshold ?? ""}"
                    placeholder="Critical"
                    aria-label="Critical threshold">

                <label class="metric-enable-toggle">
                    <input
                        type="checkbox"
                        data-field="enabled"
                        ${metric.enabled !== false ? "checked" : ""}>
                    <span>On</span>
                </label>

                <button
                    type="button"
                    class="metric-remove-button"
                    data-action="remove-metric"
                    data-index="${index}"
                    aria-label="Remove metric">
                    ×
                </button>

            </div>
        `
            )
            .join("");
    }

    function readMetricBuilder() {
        const container = getElement("metric-list");
        if (!container) return metricDraft;

        const rows = container.querySelectorAll(".metric-row");
        if (!rows.length) return [];

        return Array.from(rows).map((row, index) => {
            const read = field => row.querySelector(`[data-field="${field}"]`);

            const name = read("name")?.value.trim() || "";
            const unit = read("unit")?.value.trim() || "";

            const warningInput = read("warningThreshold");
            const criticalInput = read("criticalThreshold");

            const existing = metricDraft[index];

            return {
                id: existing?.id || DataManager.createId("metric"),
                name,
                unit,
                warningThreshold:
                    warningInput && warningInput.value !== ""
                        ? Number(warningInput.value)
                        : null,
                criticalThreshold:
                    criticalInput && criticalInput.value !== ""
                        ? Number(criticalInput.value)
                        : null,
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

            const wasEditing = Boolean(editingSourceId);

            await DataManager.saveSource(sourceData);

            showMessage(
                wasEditing
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

        setFormValue("source-id", source.id);
        setFormValue("source-name", source.name);
        setFormValue("source-type", source.type);
        setFormValue("source-architecture", source.architecture);
        setFormValue("source-input-mode", source.inputMode);
        setFormValue("source-description", source.description);
        setFormValue("sampling-interval", source.samplingInterval);
        setFormValue("history-retention", source.historyRetention);
        setFormValue("source-status", source.status);

        metricDraft = (source.metrics || []).map(metric => ({ ...metric }));
        renderMetricBuilder();

        const submitButton = getFirstElement([
            "save-source-button",
            "save-source"
        ]);
        if (submitButton) {
            submitButton.textContent = "Update Monitoring Source";
        }

        const heading = getFirstElement([
            "configuration-heading",
            "source-form-heading"
        ]);
        if (heading) {
            heading.textContent = "Edit Monitoring Source";
        }

        const configCard = getElement("source-configuration");
        (configCard || getElement("source-configuration-form"))?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    function setFormValue(id, value) {
        const element = getElement(id);
        if (element) {
            element.value = value ?? "";
        }
    }

    /* =====================================================
       RESET SOURCE FORM
    ===================================================== */

    function resetSourceForm() {
        const form = getElement("source-configuration-form");
        if (form) form.reset();

        setFormValue("source-id", "");
        editingSourceId = null;

        loadMetricPresets(getValue("source-type"));

        const submitButton = getFirstElement([
            "save-source-button",
            "save-source"
        ]);
        if (submitButton) {
            submitButton.textContent = "Save Monitoring Source";
        }

        const heading = getFirstElement([
            "configuration-heading",
            "source-form-heading"
        ]);
        if (heading) {
            heading.textContent = "Add Monitoring Source";
        }
    }

    /* =====================================================
       SOURCE TABLE ACTIONS
    ===================================================== */

    async function handleSourceTableAction(event) {
        const emptyAddBtn = event.target.closest("#empty-add-source-button");
        if (emptyAddBtn) {
            openNewSourceConfiguration();
            return;
        }

        const button = event.target.closest("[data-action]");
        if (!button) return;

        const action = button.dataset.action;
        const sourceId = button.dataset.id;

        if (action === "edit") {
            await editSource(sourceId);
        } else if (action === "delete") {
            await confirmDeleteSource(sourceId);
        } else if (action === "open-source-actions") {
            await openSourceDialog(sourceId);
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

            if (editingSourceId === sourceId) {
                resetSourceForm();
            }

            showMessage(
                "Source and associated history deleted.",
                "success"
            );

            await refreshWorkspace();
        } catch (error) {
            console.error(error);
            showMessage(error.message || "Could not delete source.", "error");
        }
    }

    /* =====================================================
       SOURCE ACTION DIALOG
    ===================================================== */

    function bindSourceDialogEvents() {
        const dialog = getElement("source-action-dialog");
        const closeButton = getElement("close-source-dialog");

        if (closeButton) {
            closeButton.addEventListener("click", closeSourceDialog);
        }

        if (dialog) {
            dialog.addEventListener("click", event => {
                if (event.target === dialog) {
                    closeSourceDialog();
                }
            });
        }

        const editButton = getElement("edit-source-action");
        if (editButton) {
            editButton.addEventListener("click", async () => {
                if (!selectedSourceId) return;
                const sourceId = selectedSourceId;
                closeSourceDialog();
                await editSource(sourceId);
            });
        }

        const toggleButton = getElement("toggle-source-action");
        if (toggleButton) {
            toggleButton.addEventListener("click", async () => {
                if (!selectedSourceId) return;
                await toggleSelectedSource();
            });
        }

        const deleteButton = getElement("delete-source-action");
        if (deleteButton) {
            deleteButton.addEventListener("click", async () => {
                if (!selectedSourceId) return;
                const sourceId = selectedSourceId;
                closeSourceDialog();
                await confirmDeleteSource(sourceId);
            });
        }
    }

    async function openSourceDialog(sourceId) {
        const source = await DataManager.getSource(sourceId);
        if (!source) return;

        selectedSourceId = source.id;

        setText("dialog-source-name", source.name);

        const isActive = source.status === "active";
        setText(
            "toggle-source-title",
            isActive ? "Set Source Offline" : "Set Source Active"
        );
        setText(
            "toggle-source-subtitle",
            isActive
                ? "Pause monitoring for this source without deleting data"
                : "Resume monitoring activity for this source"
        );

        const dialog = getElement("source-action-dialog");
        if (dialog && typeof dialog.showModal === "function") {
            if (!dialog.open) dialog.showModal();
        }
    }

    function closeSourceDialog() {
        const dialog = getElement("source-action-dialog");
        if (dialog && dialog.open) {
            dialog.close();
        }
    }

    async function toggleSelectedSource() {
        const source = await DataManager.getSource(selectedSourceId);
        if (!source) return;

        const newStatus = source.status === "active" ? "offline" : "active";

        try {
            await DataManager.setSourceStatus(source.id, newStatus);
            showMessage(`Source status changed to ${newStatus}.`, "success");
            closeSourceDialog();
            await refreshWorkspace();
        } catch (error) {
            console.error(error);
            showMessage(
                error.message || "Could not change source status.",
                "error"
            );
        }
    }

    /* =====================================================
       MANUAL READING
    ===================================================== */

    async function handleManualReading(event) {
        event.preventDefault();

        const form = event.currentTarget;

        try {
            const sourceId = getValue("reading-source");
            const metricId = getValue("reading-metric");
            const value = getValue("reading-value");
            const timestamp = getValue("reading-timestamp");

            if (!sourceId || !metricId || value === "") {
                throw new Error("Complete all reading fields.");
            }

            if (!Number.isFinite(Number(value))) {
                throw new Error("Enter a valid numeric reading.");
            }

            await DataManager.addReading({
                sourceId,
                metricId,
                value: Number(value),
                timestamp: timestamp || undefined,
                inputMode: "manual"
            });

            form.reset();
            setCurrentTimestamp();

            await refreshWorkspace();

            showMessage(
                "Telemetry reading saved and form refreshed.",
                "success"
            );
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
            ${sources
                .map(
                    source => `
                <option value="${escapeHTML(source.id)}">
                    ${escapeHTML(source.name)}
                </option>
            `
                )
                .join("")}
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

        const previousValue = metricSelect.value;
        const source = sources.find(item => item.id === sourceId);

        const metrics = (source?.metrics || []).filter(
            metric => metric.enabled !== false
        );

        metricSelect.innerHTML = `
            <option value="">Select a metric</option>
            ${metrics
                .map(
                    metric => `
                <option value="${escapeHTML(metric.id)}">
                    ${escapeHTML(metric.name)}
                    ${metric.unit ? `(${escapeHTML(metric.unit)})` : ""}
                </option>
            `
                )
                .join("")}
        `;

        if (metrics.some(metric => metric.id === previousValue)) {
            metricSelect.value = previousValue;
        }
    }

    /* =====================================================
       GENERAL ACTION BUTTONS
    ===================================================== */

    function handleGeneralActions(event) {
        const button = event.target.closest("[data-action]");
        if (!button) return;

        if (button.dataset.action === "remove-metric") {
            syncMetricDraftFromDOM();

            const index = Number(button.dataset.index);

            if (
                Number.isInteger(index) &&
                index >= 0 &&
                index < metricDraft.length
            ) {
                metricDraft.splice(index, 1);
                renderMetricBuilder();
            }
        }

        if (button.dataset.action === "close-dialog") {
            const dialog = button.closest("dialog");
            if (dialog && dialog.open) dialog.close();
        }
    }

    /* =====================================================
       CSV PARSER
    ===================================================== */

    function parseCSV(rawText) {
        const text = String(rawText || "").replace(/^\uFEFF/, "");
        const rows = [];

        let row = [];
        let value = "";
        let insideQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const character = text[i];
            const nextCharacter = text[i + 1];

            if (
                character === '"' &&
                insideQuotes &&
                nextCharacter === '"'
            ) {
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
                if (character === "\r" && nextCharacter === "\n") {
                    i++;
                }

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

        if (insideQuotes) {
            throw new Error("CSV contains an unclosed quotation mark.");
        }

        if (rows.length < 2) {
            throw new Error(
                "CSV must contain a header and at least one row."
            );
        }

        const headers = rows.shift().map(header =>
            header.trim().toLowerCase()
        );

        return rows.map(cells => {
            const record = {};

            headers.forEach((header, index) => {
                record[header] = cells[index] ?? "";
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

            let records = [];
            let restoredSources = 0;

            if (extension === "json") {
                const parsed = JSON.parse(content);

                if (
                    !Array.isArray(parsed) &&
                    Array.isArray(parsed.sources)
                ) {
                    restoredSources = await restoreMissingSources(
                        parsed.sources
                    );
                }

                records = Array.isArray(parsed)
                    ? parsed
                    : parsed.readings || [];

                if (!Array.isArray(records)) {
                    throw new Error(
                        "JSON must contain an array of reading records or a NexusAI backup object."
                    );
                }
            } else if (extension === "csv") {
                records = parseCSV(content);
            } else {
                throw new Error("Only CSV and JSON files are supported.");
            }

            const result = await importRecords(records);

            showMessage(
                `Import complete: ${restoredSources ? `${restoredSources} sources restored, ` : ""}${result.imported} readings imported, ${result.skipped} skipped.`,
                result.imported > 0 || restoredSources > 0
                    ? "success"
                    : "warning"
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

    async function restoreMissingSources(sourceList) {
        const existing = await DataManager.getSources();
        const existingIds = new Set(existing.map(item => item.id));
        let restored = 0;

        for (const src of sourceList) {
            if (!src || !src.name || existingIds.has(src.id)) {
                continue;
            }

            try {
                await DataManager.saveSource(src);
                existingIds.add(src.id);
                restored++;
            } catch (error) {
                console.warn("Skipped restoring source:", error);
            }
        }

        return restored;
    }

    async function importRecords(records) {
        let imported = 0;
        let skipped = 0;

        const currentSources = await DataManager.getSources();

        for (const record of records) {
            try {
                const rawValue = record.value;

                if (
                    rawValue === "" ||
                    rawValue === null ||
                    rawValue === undefined ||
                    !Number.isFinite(Number(rawValue))
                ) {
                    skipped++;
                    continue;
                }

                const sourceId = record.sourceid || record.sourceId;
                const sourceName = record.sourcename || record.sourceName;

                const source = currentSources.find(item => {
                    return (
                        item.id === sourceId ||
                        (sourceName &&
                            item.name.toLowerCase() ===
                                String(sourceName).trim().toLowerCase())
                    );
                });

                if (!source) {
                    skipped++;
                    continue;
                }

                const metricId = record.metricid || record.metricId;
                const metricName = record.metric;

                const metric = (source.metrics || []).find(item => {
                    return (
                        item.id === metricId ||
                        (metricName &&
                            item.name.toLowerCase() ===
                                String(metricName).trim().toLowerCase())
                    );
                });

                if (!metric || metric.enabled === false) {
                    skipped++;
                    continue;
                }

                await DataManager.addReading({
                    sourceId: source.id,
                    metricId: metric.id,
                    value: Number(rawValue),
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
            const [readings, currentSources] = await Promise.all([
                DataManager.getReadings(),
                DataManager.getSources()
            ]);

            if (format === "csv" && !readings.length) {
                showMessage(
                    "No telemetry readings to export as CSV. Add readings first or use Export JSON to back up sources.",
                    "warning"
                );
                return;
            }

            if (
                format === "json" &&
                !readings.length &&
                !currentSources.length
            ) {
                showMessage(
                    "There are no sources or readings to export.",
                    "warning"
                );
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
            let filenamePrefix;

            if (format === "json") {
                const backupPayload = {
                    platform: "NexusAI",
                    exportedAt: new Date().toISOString(),
                    sourceCount: currentSources.length,
                    readingCount: records.length,
                    sources: currentSources,
                    readings: records
                };

                content = JSON.stringify(backupPayload, null, 2);
                mimeType = "application/json;charset=utf-8;";
                extension = "json";
                filenamePrefix = "nexusai-workspace-backup";
            } else {
                const headers = Object.keys(records[0]);

                const escapeCSV = value => {
                    const text = String(value ?? "");
                    return `"${text.replace(/"/g, '""')}"`;
                };

                const csvBody = [
                    headers.join(","),
                    ...records.map(record =>
                        headers
                            .map(header => escapeCSV(record[header]))
                            .join(",")
                    )
                ].join("\r\n");

                content = "\uFEFF" + csvBody;
                mimeType = "text/csv;charset=utf-8;";
                extension = "csv";
                filenamePrefix = "nexusai-readings";
            }

            downloadFile(
                content,
                `${filenamePrefix}-${Date.now()}.${extension}`,
                mimeType
            );

            showMessage(
                `${format.toUpperCase()} export downloaded successfully.`,
                "success"
            );
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
        link.style.display = "none";

        document.body.appendChild(link);
        link.click();

        window.setTimeout(() => {
            link.remove();
            URL.revokeObjectURL(url);
        }, 1500);
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