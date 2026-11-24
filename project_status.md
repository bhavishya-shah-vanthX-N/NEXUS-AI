# NEXUSAI — MASTER PROJECT STATUS & ARCHITECTURE

**Project:** NexusAI — High-Throughput Edge AI & Telemetry Platform  
**Project Category:** Edge Computing / AI / Hardware Telemetry  
**Development Deadline:** 27 November 2026  
**Current Status:** Website Foundation and Architecture  
**Last Updated:** 24 November 2026

---

# 1. PROJECT OVERVIEW

NexusAI is a browser-based edge intelligence and telemetry
monitoring platform designed to manage multiple computing
devices and hardware systems.

The platform collects telemetry data, organizes measurements,
monitors system performance, detects abnormal behaviour,
analyzes trends, and presents diagnostic insights.

Its architecture is intended to support different device types
and processor architectures through a unified monitoring system.

The website must demonstrate a professional monitoring platform
rather than a collection of disconnected static pages.

---

# 2. NON-NEGOTIABLE TECHNOLOGY REQUIREMENTS

The entire project must use:

- HTML5
- CSS3
- Vanilla JavaScript

STRICTLY PROHIBITED:

- React
- Angular
- Vue
- Bootstrap
- Tailwind CSS
- External JavaScript libraries
- Node.js
- npm
- Backend services
- Server-side programming
- External APIs
- External databases

Browser-native technologies are permitted:

- IndexedDB
- LocalStorage
- File API
- Canvas API
- Web Serial API
- Web Bluetooth API
- WebUSB API
- Other supported native browser capabilities

These restrictions must never be relaxed unless explicitly
authorized by the project owner.

---

# 3. CORE PROJECT OBJECTIVES

1. Create a unified monitoring environment for different devices.
2. Support multiple independent monitoring sources.
3. Collect and organize hardware telemetry.
4. Display live and historical measurements.
5. Detect unusual readings using statistical analysis.
6. Forecast possible performance trends.
7. Generate health assessments and recommendations.
8. Support manual readings and dataset imports.
9. Provide local data persistence.
10. Demonstrate hardware compatibility across ARM64, x64 and x86.
11. Build a professional, responsive and accessible interface.

---

# 4. WEBSITE ARCHITECTURE

The website must be a MULTI-PAGE WEBSITE.

Navigation must open separate HTML documents.

Do not turn the website into a single long scrolling page,
horizontal slider, or slide-based navigation system.

Natural vertical scrolling is allowed within individual pages.

The intended design is a hybrid of:

- Professional enterprise monitoring dashboard
- Compact application-style navigation
- Desktop-first interface
- Fixed sidebar and compact topbar
- Page-specific layouts
- Balanced content density
- Responsive mobile fallback
- Subtle transitions and clear visual hierarchy

## Main Pages

### 4.1 Dashboard — index.html

Purpose:
- Overall platform overview
- System statistics
- Monitoring source count
- Reading count
- Alert count
- Quick navigation to modules
- Architecture overview

### 4.2 Monitoring Workspace — pages/workspace.html

Purpose:
- Create monitoring sources
- Edit and delete sources
- Activate and deactivate sources
- Configure device architecture
- Configure input methods
- Add custom measurement fields
- Set warning and critical thresholds
- Configure sampling intervals
- Configure history retention
- Enter manual readings
- Import CSV and JSON datasets
- Export workspace information

### 4.3 Live Telemetry — pages/telemetry.html

Purpose:
- Display live readings
- Show telemetry charts
- Monitor individual sources
- Display current measurements
- Show historical trends
- Provide source-specific monitoring views

### 4.4 AI Analytics — pages/ai-analytics.html

Purpose:
- Detect anomalies
- Calculate health scores
- Perform statistical analysis
- Apply rolling Z-score detection
- Forecast trends using linear regression
- Generate diagnostic recommendations
- Maintain a severity-based event log
- Demonstrate simulated optimization

AI claims must remain technically accurate.
Statistical algorithms must not be falsely presented as trained
machine-learning models.

### 4.5 Hardware Gallery — pages/hardware.html

Purpose:
- Display supported hardware categories
- Show hardware specifications
- Filter hardware information
- Open detailed hardware views
- Demonstrate simulated benchmarks
- Explain hardware compatibility

### 4.6 Development Roadmap — pages/roadmap.html

Purpose:
- Display the four development phases
- Show implementation progress
- Explain platform evolution
- Present future development milestones

### 4.7 User Guide — pages/user-guide.html

Purpose:
- Explain platform operation
- Explain source configuration
- Explain data imports and exports
- Explain device connections
- Document browser requirements
- Explain supported and unsupported hardware access

---

# 5. MONITORING SOURCE ARCHITECTURE

The platform must support multiple independent sources.

Examples:

- Laptop
- Desktop computer
- Server
- NPU node
- GPU node
- Robotic arm
- Cooling system
- Temperature sensor
- Custom monitoring device

Each source should have:

- Unique ID
- Source name
- Device type
- Architecture
- Description
- Input method
- Connection status
- Configured metrics
- Measurement units
- Warning thresholds
- Critical thresholds
- Sampling interval
- History retention settings
- Creation timestamp
- Last reading timestamp

Source configuration changes must not automatically erase
historical readings.

Deleting a source must have a clear and deliberate effect on
its associated historical records.

---

# 6. DATA INPUT METHODS

The platform should support:

1. Simulated live readings
2. Manual measurement entry
3. CSV imports
4. JSON imports
5. Compatible Web Serial connections
6. Compatible Web Bluetooth connections
7. Compatible WebUSB connections

Actual physical-device connections depend on:

- Browser support
- Operating system support
- Secure browser context
- User permissions
- Device protocols
- Hardware compatibility

Simulated data must always be distinguishable from actual
hardware readings.

Do not claim that the browser can universally access CPU
temperature, GPU temperature, SSD health or total system RAM.

---

# 7. DATA STORAGE ARCHITECTURE

The application must operate locally without a backend.

## IndexedDB

Use for:
- Monitoring sources
- Telemetry history
- Imported datasets
- Anomaly records
- Historical measurements

## LocalStorage

Use for:
- Small application settings
- User preferences
- Interface configuration
- Lightweight state

The storage architecture must support reading, writing,
updating and deleting records.

The application should handle missing data, invalid records,
storage errors and unavailable browser capabilities gracefully.

---

# 8. AI AND ANALYTICS ENGINE

The analytics system should include:

## Anomaly Detection
- Rolling statistical analysis
- Z-score calculation
- Configurable thresholds
- Severity classification
- Anomaly history

## Health Assessment
- Source health scores
- Metric-based health evaluation
- Warning and critical states

## Trend Forecasting
- Linear regression
- Historical trend analysis
- Short-term estimated forecasts

## Recommendations
- Identify unusual behaviour
- Explain possible causes
- Recommend monitoring actions
- Demonstrate simulated optimization

The platform must distinguish statistical diagnostics from
actual trained AI models.

---

# 9. UNIVERSAL DEVICE MONITORING ADAPTER

The long-term architecture includes a Universal Device
Monitoring Adapter.

Its purpose is to:

1. Detect available browser capabilities.
2. Identify supported input methods.
3. Receive device or dataset measurements.
4. Normalize incoming readings.
5. Convert measurements into a common data structure.
6. Make normalized data available to platform modules.

The monitoring interface should not need separate architecture-
specific implementations for every device.

ARM64, x64 and x86 compatibility should be approached through
browser capabilities and normalized data rather than assuming
that all hardware exposes identical measurements.

---

# 10. SAMPLE TEST ENVIRONMENT

The demonstration environment includes:

Device: ASUS Zenbook A14 UX3407QA

Processor: Snapdragon X1-26-100  
Architecture: ARM64  
Memory: 16GB LPDDR5  
Graphics: Adreno X1-45  
Storage: Approximately 477GB

This laptop is a sample test environment, not the exclusive
hardware target of NexusAI.

Any unavailable physical measurements must be simulated or
provided through an explicitly supported data source.

---

# 11. PROJECT FOLDER STRUCTURE

Intended architecture:

NexusAI/
|
|-- index.html
|
|-- css/
|   |-- variables.css
|   |-- base.css
|   |-- workspace.css
|   |-- telemetry.css
|   |-- analytics.css
|   |-- hardware.css
|   |-- roadmap.css
|   |-- guide.css
|
|-- js/
|   |-- storage.js
|   |-- data-manager.js
|   |-- main.js
|   |-- workspace.js
|   |-- telemetry.js
|   |-- ai-engine.js
|   |-- data-import.js
|   |-- device-connectors.js
|   |-- gallery.js
|
|-- pages/
|   |-- workspace.html
|   |-- telemetry.html
|   |-- ai-analytics.html
|   |-- hardware.html
|   |-- roadmap.html
|   |-- user-guide.html
|
|-- docs/
|   |-- PROJECT_STATUS.md

This is the target architecture. Files must be marked complete
only after their creation and appropriate testing.

---

# 12. SHARED APPLICATION ARCHITECTURE

All pages must use the same design system and shared data model.

JavaScript must use browser-native scripts without modules,
external dependencies or build tools.

A shared namespace may be used:

window.NexusAI = window.NexusAI || {};

The storage layer should be independent of page-specific
interface logic.

The data manager should provide consistent source and reading
operations.

The analytics engine should consume normalized readings.

The telemetry page should display data from the shared data
layer rather than generating unrelated independent datasets.

The dashboard should display statistics derived from the
same stored monitoring records.

---

# 13. IMPLEMENTATION TRACKER

Status definitions:

[ ] Not started
[~] Code delivered / implementation in progress
[+] Created and saved
[X] Tested and verified

## Project foundation

[~] Main project folder structure
[~] Dashboard index.html
[~] CSS variables
[~] Base stylesheet

## Monitoring Workspace

[~] workspace.html
[ ] workspace.css
[ ] workspace.js
[ ] Source creation and editing
[ ] Metric configuration
[ ] Source filtering and searching
[ ] Manual reading entry
[ ] Import and export functionality

## Remaining pages

[ ] telemetry.html
[ ] ai-analytics.html
[ ] hardware.html
[ ] roadmap.html
[ ] user-guide.html

## JavaScript systems

[ ] storage.js
[ ] data-manager.js
[ ] main.js
[ ] telemetry.js
[ ] ai-engine.js
[ ] data-import.js
[ ] device-connectors.js
[ ] gallery.js

## Final integration

[ ] Shared navigation
[ ] Shared data persistence
[ ] Cross-page data consistency
[ ] Responsive testing
[ ] Browser compatibility testing
[ ] Data import/export testing
[ ] Analytics testing
[ ] Final project demonstration

IMPORTANT:
The status tracker must be updated as files are actually
created, saved and tested. Code delivery alone does not mean
a feature is complete.

---

# 14. DEVELOPMENT PRIORITIES

The development order is:

PHASE 1 — WEBSITE FOUNDATION
- Global design system
- Dashboard
- Shared navigation
- Page layouts

PHASE 2 — MONITORING FUNCTIONALITY
- Source management
- Metric configuration
- Local storage
- Manual readings
- Dataset imports

PHASE 3 — TELEMETRY AND ANALYTICS
- Simulated live data
- Telemetry charts
- Anomaly detection
- Health scores
- Trend forecasting

PHASE 4 — HARDWARE AND FINAL INTEGRATION
- Hardware gallery
- Browser capability detection
- Device connection demonstrations
- User guide
- Roadmap
- Final testing and presentation

---

# 15. DEVELOPMENT RULES FOR FUTURE WORK

1. Preserve all previously agreed project requirements.
2. Never introduce prohibited technologies.
3. Maintain the multi-page website architecture.
4. Use consistent naming conventions.
5. Avoid duplicate or disconnected data systems.
6. Keep shared styling centralized.
7. Keep page-specific styling in separate stylesheets.
8. Use shared JavaScript services wherever possible.
9. Provide complete replacement code when replacing a file.
10. Clearly state the exact file path for every code delivery.
11. Explain each file's overall purpose briefly.
12. Do not mark files complete until confirmed.
13. Test integration between pages.
14. Label simulated data honestly.
15. Prioritize a working demonstration before unnecessary complexity.
16. Preserve the complete project vision while implementing it
    incrementally.

---

# 16. CURRENT DEVELOPMENT POSITION

We are currently building the website foundation.

The dashboard and shared CSS architecture have been drafted.
The Monitoring Workspace HTML structure has just been delivered.

The next immediate task is:

CREATE css/workspace.css

Then implement the shared storage and data-management
architecture before connecting the Workspace interface.

The priority is to build a complete, coherent and working
NexusAI platform within the project deadline.

---

END OF MASTER PROJECT STATUS
