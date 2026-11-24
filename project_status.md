
# NEXUSAI — MASTER PROJECT STATUS & ARCHITECTURE

**Project:** NexusAI — High-Throughput Edge AI & Telemetry Platform  
**Current Status Date:** 25 November 2026  
**Target Deadline:** 27 November 2026  
**Development Stage:** Core Foundation & Workspace Implementation  
**Status:** Active Development

---

# 1. PROJECT OVERVIEW

NexusAI is a browser-based Edge AI and telemetry monitoring platform designed to manage, monitor, analyze, and visualize performance data from different computing systems and hardware devices.

The platform aims to provide a unified interface for:

- Monitoring multiple hardware and computing sources.
- Collecting telemetry readings.
- Managing configurable monitoring metrics.
- Importing and exporting monitoring datasets.
- Visualizing live and historical telemetry.
- Detecting anomalies through statistical analysis.
- Forecasting performance trends.
- Providing optimization recommendations.
- Exploring hardware specifications and capabilities.
- Demonstrating browser-supported device connectivity.

The project is being developed as a multi-page desktop-first website.

The interface should resemble a professional enterprise monitoring platform rather than a single long scrolling page or a sliding presentation.

---

# 2. NON-NEGOTIABLE TECHNOLOGY REQUIREMENTS

The following technology restrictions must be maintained throughout development.

## Allowed Technologies

- HTML5
- CSS3
- Vanilla JavaScript
- IndexedDB
- LocalStorage
- Browser-native File API
- Canvas API
- Supported Web Serial API
- Supported Web Bluetooth API
- Supported WebUSB API

## Not Allowed

- React
- Angular
- Vue
- Bootstrap
- Tailwind
- jQuery
- Node.js
- npm
- Backend services
- Server-side programming
- External databases
- External APIs
- Framework-dependent libraries

All functionality must be implemented using HTML, CSS, and native JavaScript.

Browser-native capabilities may be used when supported by the browser and hardware.

---

# 3. WEBSITE STRUCTURE

The project follows a separate-page architecture.

## Planned Website Pages

| Page | File | Purpose |
|---|---|---|
| Dashboard | index.html | Overall platform overview |
| Workspace | pages/workspace.html | Monitoring source management |
| Telemetry | pages/telemetry.html | Live telemetry and history |
| AI Analytics | pages/ai-analytics.html | Anomaly detection and forecasting |
| Hardware | pages/hardware.html | Hardware gallery and specifications |
| Roadmap | pages/roadmap.html | Four-phase development roadmap |
| User Guide | pages/user-guide.html | Platform documentation |

Each page should have its own relevant stylesheet and JavaScript module while sharing common design variables and base styling.

---

# 4. TARGET PROJECT DIRECTORY

NexusAI/
│
├── index.html
│
├── css/
│   ├── variables.css
│   ├── base.css
│   ├── workspace.css
│   ├── telemetry.css
│   ├── analytics.css
│   ├── hardware.css
│   ├── roadmap.css
│   └── guide.css
│
├── js/
│   ├── storage.js
│   ├── data-manager.js
│   ├── main.js
│   ├── workspace.js
│   ├── telemetry.js
│   ├── ai-engine.js
│   ├── data-import.js
│   ├── device-connectors.js
│   └── gallery.js
│
├── pages/
│   ├── workspace.html
│   ├── telemetry.html
│   ├── ai-analytics.html
│   ├── hardware.html
│   ├── roadmap.html
│   └── user-guide.html
│
└── docs/
    └── PROJECT_STATUS.md

This represents the target architecture. Not every listed file has been created or verified yet.

---

# 5. CORE SYSTEM ARCHITECTURE

The project is organized into several interconnected layers.

## A. User Interface Layer

Responsible for:

- Dashboard presentation.
- Workspace controls.
- Telemetry visualization.
- Analytics presentation.
- Hardware gallery.
- Navigation between pages.

## B. Data Storage Layer

Responsible for:

- Persistent source storage.
- Telemetry reading storage.
- Anomaly records.
- Application settings.
- Imported datasets.

IndexedDB is the primary storage mechanism.

LocalStorage is intended for smaller settings and fallback functionality.

## C. Data Management Layer

Responsible for:

- Creating monitoring sources.
- Updating configurations.
- Deleting sources.
- Managing metric definitions.
- Adding telemetry readings.
- Retrieving historical data.
- Providing common data structures to other modules.

## D. Telemetry Layer

Responsible for:

- Reading collection.
- Live simulation.
- Historical records.
- Sampling intervals.
- Data visualization.
- Threshold monitoring.

## E. Analytics Layer

Responsible for:

- Statistical anomaly detection.
- Z-score analysis.
- Health scoring.
- Trend analysis.
- Linear forecasting.
- Optimization recommendations.

## F. Device Integration Layer

Responsible for:

- Browser capability detection.
- Supported hardware interfaces.
- Device connection demonstrations.
- Normalization of incoming device readings.

---

# 6. MONITORING SOURCE ARCHITECTURE

The Workspace module must support different monitoring source categories.

Planned source types:

1. Laptop
2. Server
3. NPU/GPU Node
4. Robotic Arm
5. Cooling Unit
6. Sensor
7. Custom Device

Each source should support:

- Source name.
- Source type.
- Architecture.
- Input mode.
- Description.
- Monitoring status.
- Sampling interval.
- History retention.
- Configurable metrics.

Each metric should support:

- Metric ID.
- Metric name.
- Unit.
- Warning threshold.
- Critical threshold.
- Enabled/disabled state.

Configuration updates must preserve previously collected telemetry history.

---

# 7. UNIVERSAL DEVICE MONITORING ADAPTER

A common monitoring-data structure is required so that all monitoring sources can communicate with the same system.

The Universal Device Monitoring Adapter should normalize readings regardless of their original source.

Planned normalized reading structure:

{
  id: "reading-id",
  sourceId: "source-id",
  metricId: "metric-id",
  metric: "CPU Usage",
  value: 65.5,
  unit: "%",
  timestamp: "ISO-date",
  inputMode: "manual"
}

Supported input modes should include:

- Manual
- Import
- Simulation
- Device connection

The same normalized data structure should be used by Workspace, Telemetry and AI Analytics.

---

# 8. STORAGE ARCHITECTURE

IndexedDB is the primary persistent storage system.

Planned object stores:

- sources
- readings
- anomalies
- settings
- datasets

LocalStorage may be used for smaller application settings and fallback behavior.

Storage requirements:

- Data should survive browser refreshes.
- Source configuration changes must not erase historical readings.
- Deleting a source should also remove its associated readings and anomalies.
- Reading records should remain available to the Telemetry and Analytics modules.
- Export functionality should allow users to retrieve their data.

Large telemetry histories should use IndexedDB rather than relying on LocalStorage.

---

# 9. AI ANALYTICS REQUIREMENTS

The AI Analytics module will initially use statistical methods implemented in JavaScript.

Planned functionality:

## Anomaly Detection

- Rolling Z-score analysis.
- Detection of unusual metric values.
- Warning and critical severity levels.
- Anomaly history.

## Health Scoring

- Source-level health score.
- Metric-level status.
- Overall monitoring health.

## Trend Forecasting

- Historical trend analysis.
- Linear regression.
- Short-term performance forecasting.

## Optimization Recommendations

- Identify unusual resource consumption.
- Highlight performance bottlenecks.
- Suggest possible improvements.
- Demonstrate simulated optimization scenarios.

Important technical distinction:

The initial analytics implementation is statistical and rule-based. It must not be presented as a trained machine-learning model.

---

# 10. HARDWARE AND DEVICE INTEGRATION

The Hardware module will provide a structured gallery of hardware categories and specifications.

Planned functionality:

- Hardware cards.
- Hardware specifications.
- Search and filtering.
- Detailed information dialogs.
- Simulated benchmark demonstrations.

Device connectivity will use supported browser-native interfaces where possible.

Important limitations:

A browser cannot universally access CPU temperature, GPU temperature, SSD health, total RAM utilization or all hardware telemetry.

Actual device readings must be distinguished from simulated values.

Web Serial, Web Bluetooth and WebUSB require browser support, suitable hardware, permissions and compatible device protocols.

---

# 11. FOUR-PHASE DEVELOPMENT ROADMAP

## Phase 1 — Foundation

- Project structure.
- Dashboard.
- Shared styles.
- IndexedDB storage.
- Data management.
- Workspace foundation.

## Phase 2 — Monitoring Functionality

- Monitoring source management.
- Metric configuration.
- Manual telemetry.
- CSV/JSON import.
- CSV/JSON export.
- Source-specific history.

## Phase 3 — Telemetry and Analytics

- Live telemetry simulation.
- Historical visualization.
- Alerts.
- Statistical anomaly detection.
- Health scoring.
- Trend forecasting.
- Recommendations.

## Phase 4 — Hardware and Integration

- Hardware gallery.
- Browser capability detection.
- Device connectivity demonstrations.
- Cross-page integration.
- Testing and final refinement.

The implementation order may be adjusted to prioritize a working MVP before the deadline.

---

# 12. CURRENT IMPLEMENTATION STATUS

Status key:

- [ ] Not started
- [~] Code delivered / implementation in progress
- [+] Created and saved
- [X] Tested and verified

## A. Project Foundation

| Task | Status |
|---|---|
| Project folder created | [X] |
| Target folder structure planned | [X] |
| Dashboard HTML | [X] |
| Shared variables CSS | [+] |
| Shared base CSS | [+] |
| Multi-page navigation foundation | [X] |
| Project status document | [X] |

Note: CSS files have been created/delivered, but their latest saved contents have not all been independently verified.

## B. Storage and Data Management

| Task | Status |
|---|---|
| storage.js | [+] |
| IndexedDB architecture | [~] |
| LocalStorage fallback | [~] |
| data-manager.js | [~] |
| Source CRUD operations | [X] |
| Persistent source storage | [X] |
| Metric configuration | [X] |
| Reading persistence | [~] |
| Historical reading preservation | [~] |
| Anomaly storage | [~] |

The storage and data-management code has been delivered. The source persistence workflow has been tested, but the complete storage architecture still requires broader verification.

## C. Dashboard

| Task | Status |
|---|---|
| index.html | [X] |
| Dashboard JavaScript | [X] |
| Application initialization | [X] |
| Data Manager connection | [X] |
| Dashboard statistics integration | [~] |
| Full cross-module integration | [ ] |

Dashboard initialization was confirmed after correcting a JavaScript file naming issue.

## D. Workspace

| Task | Status |
|---|---|
| pages/workspace.html | [X] |
| workspace.css | [+] |
| workspace.js | [X] |
| Source creation | [X] |
| Source persistence after refresh | [X] |
| Source listing | [X] |
| Metric presets | [X] |
| Custom metric builder | [X] |
| Manual reading submission | [X] |
| Manual form reset | [X] |
| Automatic timestamp reset | [X] |
| Source and metric dropdowns | [X] |
| Source editing | [~] |
| Source deletion | [~] |
| Source action dialog | [~] |
| CSV import | [~] |
| JSON import | [~] |
| CSV export | [~] |
| JSON export | [~] |
| Search and filtering | [~] |

The latest complete workspace.js replacement has been saved and confirmed working.

Manual reading submission, form resetting, automatic timestamp resetting, and source/metric dropdowns have been verified.

Other Workspace features are implemented in code but still need individual testing.

## E. Telemetry

| Task | Status |
|---|---|
| Telemetry HTML | [ ] |
| Telemetry CSS | [ ] |
| Telemetry JavaScript | [ ] |
| Live simulation | [ ] |
| Historical readings | [ ] |
| Charts | [ ] |
| Alerts | [ ] |
| CSV/JSON data integration | [ ] |

## F. AI Analytics

| Task | Status |
|---|---|
| Analytics HTML | [ ] |
| Analytics CSS | [ ] |
| ai-engine.js | [ ] |
| Z-score anomaly detection | [ ] |
| Health scoring | [ ] |
| Trend forecasting | [ ] |
| Optimization recommendations | [ ] |

## G. Hardware and Integration

| Task | Status |
|---|---|
| Hardware HTML | [ ] |
| Hardware CSS | [ ] |
| gallery.js | [ ] |
| Hardware gallery | [ ] |
| Hardware filtering | [ ] |
| Specifications | [ ] |
| Benchmark simulation | [ ] |
| device-connectors.js | [ ] |
| Browser capability detection | [ ] |
| Device connectivity demonstrations | [ ] |

## H. Documentation

| Task | Status |
|---|---|
| PROJECT_STATUS.md | [X] |
| Roadmap page | [ ] |
| User Guide page | [ ] |
| Final project documentation | [ ] |

---

# 13. CURRENT TEST DEVICE

The initial development and demonstration device is:

**ASUS Zenbook A14 UX3407QA**

Known specifications:

- Processor platform: Qualcomm Snapdragon X1-26-100
- Architecture: ARM64
- RAM: 16 GB LPDDR5
- Graphics: Qualcomm Adreno X1-45
- Storage: Approximately 477 GB

This device can be used as a reference for hardware specifications and monitoring demonstrations.

Actual live hardware metrics must only be reported when they are genuinely available.

---

# 14. DEVELOPMENT HISTORY AND CONFIRMED FIXES

The following issues have been encountered and resolved:

1. Dashboard file loading issue caused by an incorrect JavaScript filename.
2. Data Manager initialization failure caused by the same file-path mismatch.
3. Workspace page loading and initialization.
4. Test monitoring source creation and persistence after refresh.
5. Workspace JavaScript and HTML ID mismatches.
6. Manual telemetry form reset behavior.
7. Automatic timestamp restoration after manual reading submission.

The latest workspace.js replacement includes corrected element ID handling and a complete manual-reading workflow.

---

# 15. CURRENT DEVELOPMENT POSITION

As of 25 November 2026:

The project has moved from initial architecture planning into a functioning website foundation.

Confirmed working components:

- Dashboard page.
- Shared application initialization.
- Workspace page.
- Monitoring source creation.
- Persistent source storage.
- Metric configuration.
- Manual telemetry entry.
- Manual form reset.
- Source and metric selection.

The next immediate tasks are:

1. Test Workspace source editing and deletion.
2. Test CSV and JSON import/export.
3. Verify the storage and data-management workflows.
4. Build the Telemetry page.
5. Connect telemetry visualization to stored readings.
6. Build the AI Analytics module.
7. Build the Hardware module.
8. Complete the Roadmap and User Guide.
9. Perform cross-page integration testing.

The project deadline is close. Prioritize a functional, demonstrable MVP rather than attempting to implement every advanced feature before the deadline.

---

# 16. RULES FOR FUTURE DEVELOPMENT AND CONTINUITY

These rules must be maintained across future development sessions and ChatGPT conversations.

## Code Delivery

1. Always provide complete, replaceable source files.
2. Do not provide partial snippets when a file replacement is requested.
3. State the exact file path before providing code.
4. Preserve existing functionality when updating files.
5. Maintain consistency between HTML IDs, CSS selectors and JavaScript references.
6. Respect the HTML/CSS/Vanilla JavaScript-only requirement.
7. Avoid unnecessary changes to working modules.

## Development Workflow

1. Work on one file or tightly related module at a time.
2. Explain where the code belongs.
3. Let the user save the replacement locally.
4. Test the updated functionality in the browser.
5. Record the actual test result.
6. Update this document when project status changes.

## Status Tracking

- [ ] means not started.
- [~] means code delivered or implementation in progress.
- [+] means created and saved.
- [X] means tested and verified.

Never mark code as saved or tested without confirmation.

## Project Continuity

This document is the master project reference.

At the beginning of a new development conversation:

1. Review this document.
2. Identify the current development position.
3. Respect all established technical and design decisions.
4. Continue from the next unfinished task.
5. Do not unnecessarily recreate working modules.

When a new feature is completed, update the relevant section and status tracker.

---

# END OF MASTER PROJECT STATUS
