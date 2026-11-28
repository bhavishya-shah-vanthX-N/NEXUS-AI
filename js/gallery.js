/* ============================================================
   NEXUSAI — HARDWARE GALLERY & PROFILES
   File: js/gallery.js

   Dependencies:
   - js/storage.js
   - js/data-manager.js
   - js/device-connectors.js

   Responsibilities:
   - Inspect real browser/host capabilities via DeviceConnectors
   - Render catalog of edge AI & telemetry hardware reference specs
   - Filter/search/sort profiles & compare Peak TOPS vs Efficiency (TOPS/W)
   - Inspect profile specs & metrics in detail dialog
   - Register a hardware profile directly into Monitoring Workspace
   ============================================================ */

(function (window, document) {
    "use strict";

    window.NexusAI = window.NexusAI || {};

    const HARDWARE_PROFILES = [
        {
            id: "hw_zenbook_x1",
            name: "ASUS Zenbook A14 (Snapdragon X1-26-100)",
            sourceType: "Laptop",
            category: "Laptop",
            architecture: "ARM64",
            vendor: "ASUS / Qualcomm",
            tops: 45,
            tdpWatts: 18,
            accelerator: "Hexagon NPU + Adreno X1-45 GPU",
            memory: "16 GB LPDDR5x Unified",
            summary:
                "Ultra-thin Copilot+ ARM64 laptop featuring an 8-core Oryon CPU, integrated Adreno X1-45 GPU, and 45 TOPS Hexagon NPU for low-power edge inference.",
            interfaces: ["WebGL2", "WebGPU", "WebNN", "Web Serial", "Web Bluetooth"],
            defaultMetrics: [
                { name: "UI Render Frame Rate", unit: "FPS", warningThreshold: 40, criticalThreshold: 24 },
                { name: "Event Loop Lag", unit: "ms", warningThreshold: 35, criticalThreshold: 90 },
                { name: "JS Heap Usage", unit: "MB", warningThreshold: 350, criticalThreshold: 600 },
                { name: "Battery Level", unit: "%", warningThreshold: 25, criticalThreshold: 12 },
                { name: "Network Downlink", unit: "Mbps", warningThreshold: 8, criticalThreshold: 2 }
            ]
        },
        {
            id: "hw_jetson_orin_nano",
            name: "NVIDIA Jetson Orin Nano Super",
            sourceType: "NPU Node",
            category: "NPU Node",
            architecture: "ARM64",
            vendor: "NVIDIA",
            tops: 67,
            tdpWatts: 25,
            accelerator: "1024-core Ampere GPU + 32 Tensor Cores",
            memory: "8 GB 128-bit LPDDR5",
            summary:
                "Compact edge AI developer module delivering up to 67 INT8 TOPS at 25W for multi-stream vision, robotics, and local transformer inference.",
            interfaces: ["WebSocket", "Web Serial", "REST / JSON", "PCIe Gen3"],
            defaultMetrics: [
                { name: "NPU Utilization", unit: "%", warningThreshold: 80, criticalThreshold: 95 },
                { name: "Inference Latency", unit: "ms", warningThreshold: 45, criticalThreshold: 90 },
                { name: "Thermal Temperature", unit: "°C", warningThreshold: 72, criticalThreshold: 85 },
                { name: "Power Draw", unit: "W", warningThreshold: 22, criticalThreshold: 25 },
                { name: "Inference Throughput", unit: "FPS", warningThreshold: 25, criticalThreshold: 12 }
            ]
        },
        {
            id: "hw_rpi5_hailo8l",
            name: "Raspberry Pi 5 + AI Kit (Hailo-8L)",
            sourceType: "NPU Node",
            category: "NPU Node",
            architecture: "ARM64",
            vendor: "Raspberry Pi / Hailo",
            tops: 13,
            tdpWatts: 12,
            accelerator: "Hailo-8L M.2 NPU Module",
            memory: "8 GB LPDDR4X",
            summary:
                "Accessible ARM64 edge compute kit pairing a quad-core Cortex-A76 host with a 13 TOPS Hailo-8L neural accelerator over PCIe.",
            interfaces: ["WebSocket", "Web Serial", "Web Bluetooth", "GPIO / I2C"],
            defaultMetrics: [
                { name: "NPU Utilization", unit: "%", warningThreshold: 80, criticalThreshold: 95 },
                { name: "Inference Latency", unit: "ms", warningThreshold: 35, criticalThreshold: 75 },
                { name: "SoC Temperature", unit: "°C", warningThreshold: 70, criticalThreshold: 82 },
                { name: "Memory Utilization", unit: "%", warningThreshold: 80, criticalThreshold: 94 }
            ]
        },
        {
            id: "hw_coral_tpu",
            name: "Google Coral Edge TPU",
            sourceType: "NPU Node",
            category: "NPU Node",
            architecture: "ASIC",
            vendor: "Google Coral",
            tops: 4,
            tdpWatts: 2,
            accelerator: "Edge TPU Coprocessor (INT8)",
            memory: "8 MB On-Chip SRAM",
            summary:
                "Ultra-efficient 2W quantized INT8 Tensor Processing Unit designed for deterministic, fanless vision and audio classification at 2 TOPS/W.",
            interfaces: ["USB 3.0", "WebSocket", "M.2 E-Key"],
            defaultMetrics: [
                { name: "TPU Inference Latency", unit: "ms", warningThreshold: 18, criticalThreshold: 40 },
                { name: "Inference Throughput", unit: "FPS", warningThreshold: 30, criticalThreshold: 15 },
                { name: "ASIC Temperature", unit: "°C", warningThreshold: 65, criticalThreshold: 80 },
                { name: "Power Draw", unit: "W", warningThreshold: 1.8, criticalThreshold: 2.2 }
            ]
        },
        {
            id: "hw_esp32_s3",
            name: "ESP32-S3 Edge AI Sensor Node",
            sourceType: "Sensor",
            category: "Sensor",
            architecture: "RISC-V / Xtensa",
            vendor: "Espressif Systems",
            tops: 0.2,
            tdpWatts: 0.5,
            accelerator: "Xtensa LX7 Dual-Core + SIMD Vector Ext.",
            memory: "512 KB SRAM + 8 MB PSRAM",
            summary:
                "Low-power wireless microcontroller streaming real JSON or metric:value frames directly into NexusAI Live Telemetry via USB Web Serial or BLE.",
            interfaces: ["Web Serial (115200)", "Web Bluetooth (BLE)", "WebSocket"],
            defaultMetrics: [
                { name: "Ambient Temperature", unit: "°C", warningThreshold: 42, criticalThreshold: 55 },
                { name: "Humidity", unit: "%", warningThreshold: 75, criticalThreshold: 90 },
                { name: "Signal Strength", unit: "dBm", warningThreshold: -78, criticalThreshold: -88 },
                { name: "Battery Voltage", unit: "V", warningThreshold: 3.4, criticalThreshold: 3.1 }
            ]
        },
        {
            id: "hw_rtx_workstation",
            name: "NVIDIA RTX 4070 Workstation Node",
            sourceType: "GPU Node",
            category: "GPU Node",
            architecture: "x86_64",
            vendor: "NVIDIA",
            tops: 466,
            tdpWatts: 200,
            accelerator: "AD104 (5888 CUDA + 184 Tensor Cores)",
            memory: "12 GB GDDR6X",
            summary:
                "High-throughput desktop workstation GPU node for local LLM serving, batched vision analytics, and heavy WebGPU/CUDA simulation workloads.",
            interfaces: ["WebGPU", "WebGL2", "WebSocket", "CUDA Bridge"],
            defaultMetrics: [
                { name: "GPU Utilization", unit: "%", warningThreshold: 85, criticalThreshold: 96 },
                { name: "VRAM Utilization", unit: "%", warningThreshold: 82, criticalThreshold: 95 },
                { name: "GPU Temperature", unit: "°C", warningThreshold: 76, criticalThreshold: 86 },
                { name: "Power Consumption", unit: "W", warningThreshold: 185, criticalThreshold: 210 }
            ]
        },
        {
            id: "hw_robotic_arm_6dof",
            name: "6-DOF Collaborative Robotic Arm",
            sourceType: "Robotic Arm",
            category: "Robotic Arm",
            architecture: "ARM64",
            vendor: "Industrial Edge Control",
            tops: 1.5,
            tdpWatts: 65,
            accelerator: "Real-Time Servo DSP + Safety MCU",
            memory: "4 GB ECC RAM",
            summary:
                "Six-axis industrial cobot profile tracking joint torque, servo actuator thermals, cycle latency, and positional drift in real time.",
            interfaces: ["Web Serial", "WebSocket", "CAN / RS-485"],
            defaultMetrics: [
                { name: "Joint Torque Load", unit: "Nm", warningThreshold: 32, criticalThreshold: 45 },
                { name: "Actuator Temperature", unit: "°C", warningThreshold: 62, criticalThreshold: 78 },
                { name: "Control Loop Jitter", unit: "ms", warningThreshold: 6, criticalThreshold: 14 },
                { name: "Power Draw", unit: "W", warningThreshold: 55, criticalThreshold: 68 }
            ]
        },
        {
            id: "hw_rack_cooling",
            name: "Smart Precision Rack Cooling Unit",
            sourceType: "Cooling Unit",
            category: "Cooling Unit",
            architecture: "RISC-V / Xtensa",
            vendor: "DataCenter Thermal",
            tops: 0,
            tdpWatts: 120,
            accelerator: "Closed-Loop PID Fan Controller",
            memory: "256 KB Industrial Flash",
            summary:
                "Rack-level liquid/air thermal management telemetry profile tracking intake temperatures, coolant flow, PWM fan RPM, and compressor draw.",
            interfaces: ["WebSocket", "Web Serial", "Modbus / SNMP"],
            defaultMetrics: [
                { name: "Intake Temperature", unit: "°C", warningThreshold: 30, criticalThreshold: 38 },
                { name: "Fan Speed", unit: "RPM", warningThreshold: 3800, criticalThreshold: 4600 },
                { name: "Coolant Flow", unit: "L/min", warningThreshold: 5.0, criticalThreshold: 3.0 },
                { name: "Power Draw", unit: "W", warningThreshold: 105, criticalThreshold: 125 }
            ]
        }
    ];

    const state = {
        hostCaps: null,
        hostMatchedProfileId: null,
        registeredSources: [],
        searchQuery: "",
        categoryFilter: "all",
        archFilter: "all",
        sortBy: "tops-desc",
        chartMode: "tops",
        activeModalProfileId: null,
        toastTimer: null
    };

    const els = {};

    function cacheElements() {
        const ids = [
            "hw-detect-btn",
            "hw-search-input",
            "hw-category-filter",
            "hw-arch-filter",
            "hw-sort-select",
            "hw-total-profiles",
            "hw-npu-count",
            "hw-host-threads",
            "hw-host-gpu-short",
            "hw-registered-count",
            "hw-context-badge",
            "hw-probe-platform",
            "hw-probe-cores",
            "hw-probe-gpu",
            "hw-probe-ai",
            "hw-probe-io",
            "hardware-catalog-grid",
            "hw-comparison-canvas",
            "hardware-detail-dialog",
            "hw-modal-category",
            "hw-modal-title",
            "hw-modal-close",
            "hw-modal-summary",
            "hw-modal-specs",
            "hw-modal-metrics",
            "hw-modal-interfaces",
            "hw-modal-cancel-btn",
            "hw-modal-deploy-btn",
            "hardware-toast"
        ];

        ids.forEach((id) => {
            els[id] = document.getElementById(id);
        });
    }

    function escapeHtml(str) {
        return String(str ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function showToast(message) {
        const toast = els["hardware-toast"];
        if (!toast) return;

        toast.textContent = message;
        toast.hidden = false;

        if (state.toastTimer) clearTimeout(state.toastTimer);
        state.toastTimer = setTimeout(() => {
            toast.hidden = true;
        }, 3200);
    }

    function computeEfficiency(profile) {
        if (!profile.tdpWatts || profile.tdpWatts <= 0 || profile.tops <= 0) return 0;
        return profile.tops / profile.tdpWatts;
    }

    /* ============================================================
       HOST CAPABILITY PROBING
       ============================================================ */

    async function fallbackInspectCapabilities() {
        let gpuRenderer = "Unavailable";
        try {
            const c = document.createElement("canvas");
            const gl = c.getContext("webgl2") || c.getContext("webgl");
            if (gl) {
                const dbg = gl.getExtension("WEBGL_debug_renderer_info");
                gpuRenderer = dbg
                    ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "WebGL Ready"
                    : gl.getParameter(gl.RENDERER) || "WebGL Ready";
            }
        } catch (err) {
            gpuRenderer = "Unavailable";
        }

        return {
            isSecureContext: Boolean(window.isSecureContext),
            protocol: window.location.protocol,
            platform: navigator.userAgentData?.platform || navigator.platform || "Unknown",
            cores: navigator.hardwareConcurrency || null,
            deviceMemoryGB: navigator.deviceMemory || null,
            gpu: { supported: gpuRenderer !== "Unavailable", renderer: gpuRenderer },
            hasWebGPU: Boolean("gpu" in navigator && navigator.gpu),
            webGpuAdapterName: null,
            hasWebNN: Boolean("ml" in navigator),
            hasWebSerial: "serial" in navigator,
            hasWebBluetooth: "bluetooth" in navigator
        };
    }

    function shortenGpuName(raw) {
        if (!raw) return "Unavailable";
        const cleaned = String(raw)
            .replace(/^ANGLE\s*\([^,]+,\s*/i, "")
            .replace(/Direct3D.*$/i, "")
            .replace(/vs_\d+_\d+.*$/i, "")
            .replace(/\)$/g, "")
            .trim();
        if (cleaned.length > 26) {
            return cleaned.slice(0, 24).trim() + "…";
        }
        return cleaned || raw;
    }

    function detectMatchingProfileId(caps) {
        if (!caps) return null;
        const gpuText = `${caps.gpu?.renderer || ""} ${caps.webGpuAdapterName || ""}`.toLowerCase();
        const plat = String(caps.platform || "").toLowerCase();
        const ua = String(navigator.userAgent || "").toLowerCase();

        if (
            gpuText.includes("adreno") ||
            gpuText.includes("qualcomm") ||
            ua.includes("arm64") ||
            plat.includes("arm")
        ) {
            return "hw_zenbook_x1";
        }
        if (gpuText.includes("nvidia") || gpuText.includes("rtx") || gpuText.includes("geforce")) {
            return "hw_rtx_workstation";
        }
        if (plat.includes("win") || plat.includes("mac") || plat.includes("linux")) {
            return "hw_zenbook_x1";
        }
        return null;
    }

    async function inspectHostHardware(notifyUser) {
        const Connectors = window.NexusAI.DeviceConnectors;
        let caps;

        if (Connectors && typeof Connectors.inspectCapabilities === "function") {
            caps = await Connectors.inspectCapabilities();
        } else {
            caps = await fallbackInspectCapabilities();
        }

        state.hostCaps = caps;
        state.hostMatchedProfileId = detectMatchingProfileId(caps);

        const gpuFull = caps.webGpuAdapterName || caps.gpu?.renderer || "Unavailable";
        const gpuShort = shortenGpuName(gpuFull);
        const threadsLabel = caps.cores ? `${caps.cores} Threads` : "Unknown";
        const memLabel = caps.deviceMemoryGB ? `${caps.deviceMemoryGB} GB RAM hint` : "Browser masked";

        if (els["hw-host-threads"]) els["hw-host-threads"].textContent = threadsLabel;
        if (els["hw-host-gpu-short"]) els["hw-host-gpu-short"].textContent = gpuShort;

        if (els["hw-probe-platform"]) {
            els["hw-probe-platform"].textContent = `${caps.platform} · ${caps.protocol.replace(":", "")}`;
        }
        if (els["hw-probe-cores"]) {
            els["hw-probe-cores"].textContent = `${threadsLabel} · ${memLabel}`;
        }
        if (els["hw-probe-gpu"]) {
            els["hw-probe-gpu"].textContent = gpuFull;
        }
        if (els["hw-probe-ai"]) {
            const apis = [];
            if (caps.hasWebGPU) apis.push("WebGPU");
            if (caps.gpu?.supported) apis.push("WebGL2");
            if (caps.hasWebNN) apis.push("WebNN");
            els["hw-probe-ai"].textContent = apis.length ? apis.join(" / ") : "CPU Fallback";
        }
        if (els["hw-probe-io"]) {
            const io = [];
            if (caps.hasWebSerial) io.push("Serial");
            if (caps.hasWebBluetooth) io.push("BLE");
            io.push("WebSocket");
            els["hw-probe-io"].textContent = io.join(" · ");
        }

        if (els["hw-context-badge"]) {
            if (caps.isSecureContext) {
                els["hw-context-badge"].textContent = "SECURE CONTEXT READY";
                els["hw-context-badge"].className = "badge connected";
            } else {
                els["hw-context-badge"].textContent = "LOCAL FILE MODE";
                els["hw-context-badge"].className = "badge warning";
            }
        }

        renderCatalog();
        drawComparisonChart();

        if (notifyUser) {
            showToast(`Detected host: ${caps.platform} (${threadsLabel}, ${gpuShort}).`);
        }
    }

    /* ============================================================
       WORKSPACE REGISTRATION & COUNTERS
       ============================================================ */

    async function refreshWorkspaceSources() {
        const DataManager = window.NexusAI.DataManager;
        const Storage = window.NexusAI.Storage;

        try {
            if (DataManager && typeof DataManager.init === "function") {
                await DataManager.init();
                state.registeredSources = await Promise.resolve(DataManager.getSources());
            } else if (Storage && typeof Storage.getAll === "function") {
                await Storage.init();
                state.registeredSources = await Storage.getAll("sources");
            } else {
                state.registeredSources = [];
            }
        } catch (err) {
            console.error("Gallery: Failed to read workspace sources:", err);
            state.registeredSources = [];
        }

        updateSummaryCards();
    }

    function updateSummaryCards() {
        const npuCapableCount = HARDWARE_PROFILES.filter((p) => p.tops >= 1).length;

        if (els["hw-total-profiles"]) {
            els["hw-total-profiles"].textContent = String(HARDWARE_PROFILES.length);
        }
        if (els["hw-npu-count"]) {
            els["hw-npu-count"].textContent = String(npuCapableCount);
        }
        if (els["hw-registered-count"]) {
            els["hw-registered-count"].textContent = String(state.registeredSources.length);
        }
    }

    async function addProfileToWorkspace(profileId) {
        const profile = HARDWARE_PROFILES.find((p) => p.id === profileId);
        if (!profile) return;

        const DataManager = window.NexusAI.DataManager;
        if (!DataManager || typeof DataManager.saveSource !== "function") {
            showToast("DataManager is unavailable on this page.");
            return;
        }

        const alreadyExists = state.registeredSources.some(
            (s) => String(s.name || "").trim().toLowerCase() === profile.name.toLowerCase()
        );
        if (alreadyExists) {
            showToast(`${profile.name} is already registered in Monitoring Workspace.`);
            return;
        }

        const isHostMatch = profile.id === state.hostMatchedProfileId;

        try {
            await DataManager.saveSource({
                name: profile.name,
                type: profile.sourceType,
                architecture: profile.architecture,
                inputMode: isHostMatch ? "device" : "simulated",
                description: `${profile.summary} (Accelerator: ${profile.accelerator}, Reference TDP: ${profile.tdpWatts}W)`,
                status: "active",
                samplingInterval: 5000,
                historyRetention: 7,
                metrics: profile.defaultMetrics.map((m) => ({
                    name: m.name,
                    unit: m.unit,
                    warningThreshold: m.warningThreshold,
                    criticalThreshold: m.criticalThreshold,
                    enabled: true
                }))
            });

            await refreshWorkspaceSources();
            renderCatalog();
            showToast(`Added "${profile.name}" to Monitoring Workspace.`);
        } catch (err) {
            showToast(`Could not register source: ${err.message || err}`);
        }
    }

    /* ============================================================
       FILTERING, SORTING & CATALOG RENDERING
       ============================================================ */

    function getFilteredProfiles() {
        const q = state.searchQuery.trim().toLowerCase();
        const cat = state.categoryFilter.toLowerCase();
        const arch = state.archFilter.toLowerCase();

        const filtered = HARDWARE_PROFILES.filter((p) => {
            if (cat && cat !== "all" && p.category.toLowerCase() !== cat) {
                return false;
            }
            if (arch && arch !== "all") {
                const pArch = p.architecture.toLowerCase();
                if (!pArch.includes(arch) && arch !== pArch) return false;
            }
            if (q) {
                const haystack = [
                    p.name,
                    p.category,
                    p.architecture,
                    p.vendor,
                    p.accelerator,
                    p.summary,
                    p.interfaces.join(" ")
                ]
                    .join(" ")
                    .toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            return true;
        });

        filtered.sort((a, b) => {
            switch (state.sortBy) {
                case "tops-asc":
                    return a.tops - b.tops;
                case "efficiency-desc":
                    return computeEfficiency(b) - computeEfficiency(a);
                case "tdp-asc":
                    return a.tdpWatts - b.tdpWatts;
                case "name-asc":
                    return a.name.localeCompare(b.name);
                case "tops-desc":
                default:
                    return b.tops - a.tops;
            }
        });

        return filtered;
    }

    function renderCatalog() {
        const grid = els["hardware-catalog-grid"];
        if (!grid) return;

        const list = getFilteredProfiles();
        if (list.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    No hardware profiles match your current search or filters.
                </div>
            `;
            return;
        }

        const registeredNames = new Set(
            state.registeredSources.map((s) => String(s.name || "").trim().toLowerCase())
        );

        grid.innerHTML = list
            .map((p) => {
                const isHost = p.id === state.hostMatchedProfileId;
                const isRegistered = registeredNames.has(p.name.toLowerCase());
                const eff = computeEfficiency(p);

                return `
                    <article class="hw-profile-card ${isHost ? "is-host-match" : ""}" data-profile-id="${escapeHtml(p.id)}">
                        <div class="hw-card-header">
                            <div class="hw-card-title-group">
                                <span class="hw-card-category">${escapeHtml(p.category)} · ${escapeHtml(p.architecture)}</span>
                                <h3>${escapeHtml(p.name)}</h3>
                            </div>
                            <div class="hw-badges-row">
                                <span class="hw-spec-badge">REFERENCE SPEC</span>
                                ${isHost ? `<span class="hw-host-badge">DETECTED HOST</span>` : ""}
                            </div>
                        </div>

                        <p class="hw-card-summary">${escapeHtml(p.summary)}</p>

                        <div class="hw-specs-mini-grid">
                            <div class="hw-spec-cell">
                                <span>Peak AI Compute</span>
                                <strong>${p.tops > 0 ? `${p.tops} TOPS` : "Control MCU"}</strong>
                            </div>
                            <div class="hw-spec-cell">
                                <span>Efficiency / TDP</span>
                                <strong>${eff > 0 ? `${eff.toFixed(2)} TOPS/W` : `${p.tdpWatts} W`}</strong>
                            </div>
                            <div class="hw-spec-cell">
                                <span>Accelerator</span>
                                <strong title="${escapeHtml(p.accelerator)}">${escapeHtml(p.accelerator)}</strong>
                            </div>
                            <div class="hw-spec-cell">
                                <span>Default Metrics</span>
                                <strong>${p.defaultMetrics.length} Preset(s)</strong>
                            </div>
                        </div>

                        <div class="hw-interfaces-list">
                            ${p.interfaces
                                .map((iface) => `<span class="hw-interface-chip">${escapeHtml(iface)}</span>`)
                                .join("")}
                        </div>

                        <div class="hw-card-actions">
                            <button type="button" class="btn btn-secondary btn-small" data-action="inspect" data-id="${escapeHtml(p.id)}">
                                Inspect Specs
                            </button>
                            <button type="button" class="btn btn-primary btn-small" data-action="deploy" data-id="${escapeHtml(p.id)}" ${isRegistered ? "disabled" : ""}>
                                ${isRegistered ? "✓ In Workspace" : "+ Add to Workspace"}
                            </button>
                        </div>
                    </article>
                `;
            })
            .join("");
    }

    /* ============================================================
       CANVAS COMPARISON CHART (PEAK TOPS VS EFFICIENCY)
       ============================================================ */

    function drawComparisonChart() {
        const canvas = els["hw-comparison-canvas"];
        if (!canvas) return;

        const wrap = canvas.parentElement;
        const width = wrap ? wrap.clientWidth : 760;
        const height = wrap ? wrap.clientHeight : 320;
        const dpr = window.devicePixelRatio || 1;

        canvas.width = Math.max(300, Math.floor(width * dpr));
        canvas.height = Math.max(200, Math.floor(height * dpr));

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const isEff = state.chartMode === "efficiency";
        const items = getFilteredProfiles()
            .filter((p) => (isEff ? computeEfficiency(p) > 0 : p.tops > 0))
            .map((p) => ({
                id: p.id,
                label: p.name.replace(/\s*\([^)]*\)/g, ""),
                value: isEff ? computeEfficiency(p) : p.tops,
                isHost: p.id === state.hostMatchedProfileId
            }));

        if (items.length === 0) {
            ctx.fillStyle = "#b8b8b8";
            ctx.font = "13px 'Segoe UI', Arial, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("No AI-accelerated profiles in the current filter.", width / 2, height / 2);
            return;
        }

        items.sort((a, b) => b.value - a.value);

        const pad = { top: 24, right: 86, bottom: 26, left: Math.min(230, Math.max(145, width * 0.28)) };
        const plotW = Math.max(80, width - pad.left - pad.right);
        const plotH = Math.max(80, height - pad.top - pad.bottom);
        const maxVal = Math.max(...items.map((i) => i.value), 1);

        // Vertical grid lines
        ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
        ctx.lineWidth = 1;
        ctx.fillStyle = "#b8b8b8";
        ctx.font = "10px Consolas, monospace";
        ctx.textAlign = "center";

        for (let t = 0; t <= 4; t++) {
            const x = pad.left + (t / 4) * plotW;
            const gridVal = (t / 4) * maxVal;
            ctx.beginPath();
            ctx.moveTo(x, pad.top);
            ctx.lineTo(x, pad.top + plotH);
            ctx.stroke();
            ctx.fillText(isEff ? gridVal.toFixed(1) : String(Math.round(gridVal)), x, height - 8);
        }

        const rowH = plotH / items.length;
        const barH = Math.min(24, Math.max(12, rowH * 0.56));

        items.forEach((item, idx) => {
            const centerY = pad.top + idx * rowH + rowH / 2;
            const barY = centerY - barH / 2;
            const barW = Math.max(4, (item.value / maxVal) * plotW);

            // Profile name
            ctx.fillStyle = item.isHost ? "#ffffff" : "#d4d4d4";
            ctx.font = item.isHost ? "bold 11px 'Segoe UI', Arial, sans-serif" : "11px 'Segoe UI', Arial, sans-serif";
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            const shortName = item.label.length > 26 ? item.label.slice(0, 24) + "…" : item.label;
            ctx.fillText(shortName, pad.left - 12, centerY);

            // Bar
            ctx.fillStyle = item.isHost ? "#ffffff" : "#a3a3a3";
            ctx.fillRect(pad.left, barY, barW, barH);

            if (item.isHost) {
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1;
                ctx.strokeRect(pad.left - 1, barY - 1, barW + 2, barH + 2);
            }

            // Value text
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 11px Consolas, monospace";
            ctx.textAlign = "left";
            const unitText = isEff ? `${item.value.toFixed(2)} T/W` : `${item.value} TOPS`;
            ctx.fillText(unitText, pad.left + barW + 8, centerY);
        });
    }

    /* ============================================================
       DETAIL DIALOG
       ============================================================ */

    function openProfileModal(profileId) {
        const dialog = els["hardware-detail-dialog"];
        const profile = HARDWARE_PROFILES.find((p) => p.id === profileId);
        if (!dialog || !profile) return;

        state.activeModalProfileId = profile.id;
        const eff = computeEfficiency(profile);
        const isRegistered = state.registeredSources.some(
            (s) => String(s.name || "").trim().toLowerCase() === profile.name.toLowerCase()
        );

        if (els["hw-modal-category"]) {
            els["hw-modal-category"].textContent = `${profile.category} · ${profile.architecture} · REFERENCE SPEC`;
        }
        if (els["hw-modal-title"]) els["hw-modal-title"].textContent = profile.name;
        if (els["hw-modal-summary"]) els["hw-modal-summary"].textContent = profile.summary;

        if (els["hw-modal-specs"]) {
            els["hw-modal-specs"].innerHTML = `
                <div class="hw-spec-cell">
                    <span>Vendor / Family</span>
                    <strong>${escapeHtml(profile.vendor)}</strong>
                </div>
                <div class="hw-spec-cell">
                    <span>Accelerator</span>
                    <strong>${escapeHtml(profile.accelerator)}</strong>
                </div>
                <div class="hw-spec-cell">
                    <span>Memory Spec</span>
                    <strong>${escapeHtml(profile.memory)}</strong>
                </div>
                <div class="hw-spec-cell">
                    <span>Compute / TDP</span>
                    <strong>${profile.tops} TOPS · ${profile.tdpWatts} W (${eff > 0 ? `${eff.toFixed(2)} TOPS/W` : "Control"})</strong>
                </div>
            `;
        }

        if (els["hw-modal-metrics"]) {
            els["hw-modal-metrics"].innerHTML = profile.defaultMetrics
                .map(
                    (m) => `
                        <div class="hw-modal-metric-row">
                            <strong>${escapeHtml(m.name)} (${escapeHtml(m.unit)})</strong>
                            <span>Warn: ${m.warningThreshold} · Crit: ${m.criticalThreshold}</span>
                        </div>
                    `
                )
                .join("");
        }

        if (els["hw-modal-interfaces"]) {
            els["hw-modal-interfaces"].innerHTML = profile.interfaces
                .map((iface) => `<span class="hw-interface-chip">${escapeHtml(iface)}</span>`)
                .join("");
        }

        if (els["hw-modal-deploy-btn"]) {
            els["hw-modal-deploy-btn"].disabled = isRegistered;
            els["hw-modal-deploy-btn"].textContent = isRegistered
                ? "✓ Already in Workspace"
                : "+ Add to Monitoring Workspace";
        }

        if (typeof dialog.showModal === "function") {
            dialog.showModal();
        } else {
            dialog.setAttribute("open", "open");
        }
    }

    function closeProfileModal() {
        const dialog = els["hardware-detail-dialog"];
        if (!dialog) return;
        if (typeof dialog.close === "function" && dialog.open) {
            dialog.close();
        } else {
            dialog.removeAttribute("open");
        }
        state.activeModalProfileId = null;
    }

    /* ============================================================
       EVENT BINDING & INITIALIZATION
       ============================================================ */

    function bindEvents() {
        if (els["hw-detect-btn"]) {
            els["hw-detect-btn"].addEventListener("click", () => inspectHostHardware(true));
        }

        if (els["hw-search-input"]) {
            els["hw-search-input"].addEventListener("input", (e) => {
                state.searchQuery = e.target.value || "";
                renderCatalog();
                drawComparisonChart();
            });
        }

        if (els["hw-category-filter"]) {
            els["hw-category-filter"].addEventListener("change", (e) => {
                state.categoryFilter = e.target.value || "all";
                renderCatalog();
                drawComparisonChart();
            });
        }

        if (els["hw-arch-filter"]) {
            els["hw-arch-filter"].addEventListener("change", (e) => {
                state.archFilter = e.target.value || "all";
                renderCatalog();
                drawComparisonChart();
            });
        }

        if (els["hw-sort-select"]) {
            els["hw-sort-select"].addEventListener("change", (e) => {
                state.sortBy = e.target.value || "tops-desc";
                renderCatalog();
                drawComparisonChart();
            });
        }

        document.querySelectorAll(".hw-chart-mode button[data-chart-mode]").forEach((btn) => {
            btn.addEventListener("click", () => {
                state.chartMode = btn.getAttribute("data-chart-mode") || "tops";
                document.querySelectorAll(".hw-chart-mode button[data-chart-mode]").forEach((b) => {
                    b.classList.toggle("active", b === btn);
                });
                drawComparisonChart();
            });
        });

        if (els["hardware-catalog-grid"]) {
            els["hardware-catalog-grid"].addEventListener("click", (e) => {
                const btn = e.target.closest("button[data-action]");
                if (!btn) return;
                const action = btn.getAttribute("data-action");
                const id = btn.getAttribute("data-id");
                if (action === "inspect") openProfileModal(id);
                else if (action === "deploy") addProfileToWorkspace(id);
            });
        }

        if (els["hw-modal-close"]) {
            els["hw-modal-close"].addEventListener("click", closeProfileModal);
        }
        if (els["hw-modal-cancel-btn"]) {
            els["hw-modal-cancel-btn"].addEventListener("click", closeProfileModal);
        }
        if (els["hw-modal-deploy-btn"]) {
            els["hw-modal-deploy-btn"].addEventListener("click", async () => {
                if (!state.activeModalProfileId) return;
                await addProfileToWorkspace(state.activeModalProfileId);
                closeProfileModal();
            });
        }

        if (els["hardware-detail-dialog"]) {
            els["hardware-detail-dialog"].addEventListener("click", (e) => {
                if (e.target === els["hardware-detail-dialog"]) {
                    closeProfileModal();
                }
            });
        }

        window.addEventListener("resize", drawComparisonChart);
        window.addEventListener("nexusai:data-changed", refreshWorkspaceSources);
    }

    async function init() {
        cacheElements();
        bindEvents();
        await refreshWorkspaceSources();
        await inspectHostHardware(false);
        console.info("NexusAI.Gallery initialized.");
    }

    window.NexusAI.Gallery = {
        init,
        profiles: HARDWARE_PROFILES,
        inspectHostHardware,
        refreshWorkspaceSources
    };

    document.addEventListener("DOMContentLoaded", init);
})(window, document);