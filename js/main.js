
/*
 * NEXUSAI — MAIN APPLICATION CONTROLLER
 * File: js/main.js
 *
 * Connects the dashboard with:
 * Storage.js
 * DataManager.js
 */

(function () {
    "use strict";

    window.NexusAI = window.NexusAI || {};

    const App = {};

    let initialized = false;
    let refreshTimer = null;

    // -----------------------------------------
    // DOM HELPERS
    // -----------------------------------------

    function setText(id, value) {
        const element = document.getElementById(id);

        if (element) {
            element.textContent = value;
        }
    }

    function formatNumber(value) {
        const number = Number(value);

        return Number.isFinite(number)
            ? number.toLocaleString()
            : "0";
    }

    // -----------------------------------------
    // GET DASHBOARD DATA
    // -----------------------------------------

    async function getDashboardData() {
        const manager = window.NexusAI.DataManager;
        const storage = window.NexusAI.Storage;

        if (!manager) {
            throw new Error("DataManager is not available.");
        }

        const sources = await manager.getSources();

        let readingCount = 0;

        if (storage) {
            readingCount = await storage.count("readings");
        }

        let summary = {};

        if (typeof manager.getSummary === "function") {
            summary = await manager.getSummary() || {};
        }

        const activeSources = sources.filter(
            source => source.status === "active"
        ).length;

        const metricCount = sources.reduce(
            (total, source) => {
                return total + (
                    Array.isArray(source.metrics)
                        ? source.metrics.length
                        : 0
                );
            },
            0
        );

        return {
            sources,
            summary,
            totalSources: sources.length,
            activeSources,
            metricCount,
            readingCount
        };
    }

    // -----------------------------------------
    // UPDATE DASHBOARD
    // -----------------------------------------

    async function refreshDashboard() {
        try {
            const data = await getDashboardData();

            const alertCount =
                data.summary.alertCount ??
                data.summary.totalAlerts ??
                0;

            // Monitoring sources
            setText(
                "overview-source-count",
                formatNumber(data.totalSources)
            );

            // Telemetry readings
            setText(
                "overview-reading-count",
                formatNumber(data.readingCount)
            );

            // Active alerts
            setText(
                "overview-alert-count",
                formatNumber(alertCount)
            );

            // Platform status
            setText(
                "overview-platform-status",
                "READY"
            );

            setText(
                "overview-platform-description",
                data.totalSources > 0
                    ? `${data.activeSources} of ${data.totalSources} sources active`
                    : "Awaiting monitoring activity"
            );

            console.log(
                "NexusAI dashboard refreshed.",
                data
            );

            return data;

        } catch (error) {
            console.error(
                "Dashboard refresh failed:",
                error
            );

            setText(
                "overview-platform-status",
                "ERROR"
            );

            setText(
                "overview-platform-description",
                "Unable to load dashboard data"
            );

            return null;
        }
    }

    // -----------------------------------------
    // LISTEN FOR DATA CHANGES
    // -----------------------------------------

    function scheduleRefresh() {
        clearTimeout(refreshTimer);

        refreshTimer = setTimeout(() => {
            refreshDashboard();
        }, 200);
    }

    function initializeDataListeners() {
        const events = [
            "nexusai:source-created",
            "nexusai:source-updated",
            "nexusai:source-deleted",
            "nexusai:reading-added",
            "nexusai:data-changed"
        ];

        events.forEach(eventName => {
            window.addEventListener(
                eventName,
                scheduleRefresh
            );
        });
    }

    // -----------------------------------------
    // NAVIGATION
    // -----------------------------------------

    function initializeNavigation() {
        const currentPath = window.location.pathname
            .replace(/\\/g, "/")
            .toLowerCase();

        document.querySelectorAll(".sidebar-nav a[href]").forEach(link => {
            const targetPath = new URL(
                link.getAttribute("href"),
                window.location.href
            ).pathname.toLowerCase();

            if (targetPath === currentPath) {
                link.classList.add("active");
                link.setAttribute("aria-current", "page");
            } else {
                link.classList.remove("active");
                link.removeAttribute("aria-current");
            }
        });
    }

    // -----------------------------------------
    // APPLICATION INITIALIZATION
    // -----------------------------------------

    async function init() {
        if (initialized) return;

        initialized = true;

        console.log("NexusAI initializing...");

        try {
            const manager = window.NexusAI.DataManager;

            if (!manager) {
                throw new Error(
                    "DataManager missing. Check script order."
                );
            }

            // Initialize storage and shared data
            await manager.init();

            // Set up common application features
            initializeNavigation();
            initializeDataListeners();

            // Load dashboard information
            await refreshDashboard();

            console.log(
                "NexusAI initialized successfully."
            );

        } catch (error) {
            initialized = false;

            console.error(
                "NexusAI initialization failed:",
                error
            );

            setText(
                "overview-platform-status",
                "ERROR"
            );

            setText(
                "overview-platform-description",
                "Application initialization failed"
            );
        }
    }

    // -----------------------------------------
    // PUBLIC API
    // -----------------------------------------

    App.init = init;
    App.refreshDashboard = refreshDashboard;
    App.getDashboardData = getDashboardData;

    window.NexusAI.App = App;

    // -----------------------------------------
    // START APPLICATION
    // -----------------------------------------

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            init,
            { once: true }
        );
    } else {
        init();
    }

})();
