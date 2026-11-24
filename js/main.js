
/*
 * NEXUSAI — MAIN APPLICATION CONTROLLER
 * File: js/main.js
 *
 * Responsibilities:
 * 1. Initialize the application.
 * 2. Connect the dashboard to DataManager.
 * 3. Display live dashboard statistics.
 * 4. Refresh dashboard data when records change.
 * 5. Handle shared navigation interactions.
 */

(function () {
    "use strict";

    window.NexusAI = window.NexusAI || {};

    const App = {};

    let initialized = false;
    let refreshTimeout = null;

    // -----------------------------------------
    // DOM HELPERS
    // -----------------------------------------

    function getElement(...selectors) {
        for (const selector of selectors) {
            const element = document.querySelector(selector);

            if (element) return element;
        }

        return null;
    }

    function setText(selectors, value) {
        const element = getElement(...selectors);

        if (element) {
            element.textContent = value ?? "0";
        }
    }

    function formatNumber(value) {
        const number = Number(value);

        return Number.isFinite(number)
            ? number.toLocaleString()
            : "0";
    }

    // -----------------------------------------
    // DASHBOARD STATISTICS
    // -----------------------------------------

    async function getDashboardData() {
        const manager = window.NexusAI.DataManager;

        if (!manager) {
            throw new Error("DataManager is not loaded.");
        }

        const summary = await manager.getSummary();
        const sources = await manager.getSources();

        let readingCount = 0;

        if (window.NexusAI.Storage) {
            try {
                readingCount = await window.NexusAI.Storage.count(
                    "readings"
                );
            } catch (error) {
                console.warn(
                    "Could not retrieve reading count:",
                    error
                );
            }
        }

        const activeSources = sources.filter(
            source => source.status === "active"
        ).length;

        const configuredMetrics = sources.reduce(
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
            summary: summary || {},
            sources,
            totalSources: sources.length,
            activeSources,
            configuredMetrics,
            readingCount
        };
    }

    // -----------------------------------------
    // UPDATE DASHBOARD
    // -----------------------------------------

    async function refreshDashboard() {
        try {
            const data = await getDashboardData();
            const summary = data.summary;

            const alertCount =
                summary.alertCount ??
                summary.totalAlerts ??
                summary.activeAlerts ??
                0;

            // Main dashboard statistics
            setText(
                ["#total-sources", "#totalSources", "[data-stat='sources']"],
                formatNumber(data.totalSources)
            );

            setText(
                ["#active-sources", "#activeSources", "[data-stat='active-sources']"],
                formatNumber(data.activeSources)
            );

            setText(
                ["#configured-metrics", "#configuredMetrics", "[data-stat='metrics']"],
                formatNumber(data.configuredMetrics)
            );

            setText(
                ["#total-readings", "#totalReadings", "[data-stat='readings']"],
                formatNumber(data.readingCount)
            );

            setText(
                ["#source-alerts", "#total-alerts", "#alertCount", "[data-stat='alerts']"],
                formatNumber(alertCount)
            );

            // Optional dashboard source table
            renderSourceOverview(data.sources);

            // Optional dashboard connection status
            renderConnectionStatus(data.activeSources, data.totalSources);

            return data;

        } catch (error) {
            console.error(
                "NexusAI dashboard refresh failed:",
                error
            );

            return null;
        }
    }

    // -----------------------------------------
    // SOURCE OVERVIEW
    // -----------------------------------------

    function renderSourceOverview(sources) {
        const container = getElement(
            "#dashboard-source-list",
            "#recent-sources",
            "[data-dashboard='sources']"
        );

        if (!container) return;

        if (!sources.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No monitoring sources have been added yet.</p>
                    <a href="pages/workspace.html">
                        Configure your first source
                    </a>
                </div>
            `;

            return;
        }

        container.innerHTML = sources
            .slice(0, 5)
            .map(source => {
                const name = escapeHTML(source.name || "Unnamed Source");
                const type = escapeHTML(source.type || "Custom");
                const status = source.status || "inactive";

                return `
                    <div class="dashboard-source-item">
                        <div class="source-info">
                            <strong>${name}</strong>
                            <span>${type}</span>
                        </div>

                        <span class="status-badge status-${escapeHTML(status)}">
                            ${escapeHTML(status)}
                        </span>
                    </div>
                `;
            })
            .join("");
    }

    // -----------------------------------------
    // CONNECTION STATUS
    // -----------------------------------------

    function renderConnectionStatus(active, total) {
        const statusElement = getElement(
            "#connection-status",
            "[data-dashboard='connection-status']"
        );

        if (!statusElement) return;

        if (total === 0) {
            statusElement.textContent = "No sources configured";
        } else if (active === total) {
            statusElement.textContent = "All sources active";
        } else {
            statusElement.textContent =
                `${active} of ${total} sources active`;
        }
    }

    // -----------------------------------------
    // HTML ESCAPING
    // -----------------------------------------

    function escapeHTML(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // -----------------------------------------
    // NAVIGATION
    // -----------------------------------------

    function initializeNavigation() {
        const currentPath = window.location.pathname
            .replace(/\\/g, "/")
            .toLowerCase();

        document.querySelectorAll(
            "a[href], [data-page]"
        ).forEach(link => {
            const href = link.getAttribute("href");

            if (!href || href.startsWith("#")) return;

            const targetPath = new URL(
                href,
                window.location.href
            ).pathname.toLowerCase();

            if (targetPath === currentPath) {
                link.classList.add("active");
                link.setAttribute("aria-current", "page");
            }
        });

        // Mobile sidebar toggle
        const menuButton = getElement(
            "#menu-toggle",
            "[data-menu-toggle]"
        );

        const sidebar = getElement(
            "#sidebar",
            ".sidebar",
            "[data-sidebar]"
        );

        if (menuButton && sidebar) {
            menuButton.addEventListener("click", () => {
                const isOpen = sidebar.classList.toggle("open");

                menuButton.setAttribute(
                    "aria-expanded",
                    String(isOpen)
                );
            });
        }
    }

    // -----------------------------------------
    // DATA CHANGE LISTENERS
    // -----------------------------------------

    function scheduleDashboardRefresh() {
        clearTimeout(refreshTimeout);

        refreshTimeout = setTimeout(() => {
            refreshDashboard();
        }, 150);
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
                scheduleDashboardRefresh
            );

            document.addEventListener(
                eventName,
                scheduleDashboardRefresh
            );
        });
    }

    // -----------------------------------------
    // APPLICATION INITIALIZATION
    // -----------------------------------------

    async function init() {
        if (initialized) return;

        initialized = true;

        console.log("NexusAI: Initializing application...");

        try {
            const manager = window.NexusAI.DataManager;

            if (!manager) {
                throw new Error(
                    "DataManager is missing. Check script loading order."
                );
            }

            // Initialize shared data and storage
            await manager.init();

            // Initialize shared interface
            initializeNavigation();
            initializeDataListeners();

            // Load initial dashboard information
            await refreshDashboard();

            console.log(
                "NexusAI: Application initialized successfully."
            );

        } catch (error) {
            initialized = false;

            console.error(
                "NexusAI initialization failed:",
                error
            );
        }
    }

    // -----------------------------------------
    // PUBLIC APPLICATION API
    // -----------------------------------------

    App.init = init;
    App.refreshDashboard = refreshDashboard;
    App.getDashboardData = getDashboardData;
    App.escapeHTML = escapeHTML;

    window.NexusAI.App = App;

    // Start when the document is ready
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
