/* =========================================================
   NEXUSAI — UNIVERSAL DEVICE MONITORING ADAPTER
   File: js/device-connectors.js

   Dependencies:
   1. js/storage.js
   2. js/data-manager.js

   Responsibilities:
   - Inspect real browser & host hardware capabilities
     (CPU cores, WebGL GPU renderer, WebGPU, WebNN/NPU,
      Battery, Network Info, JS Memory, Web Serial, Web Bluetooth)
   - Stream genuinely available live host metrics (inputMode: "device")
   - Ignore browser background-tab throttling for FPS / Jitter
   - Connect to real hardware via Web Serial, Web Bluetooth, or WebSocket
   - Normalize incoming device payloads into NexusAI readings
========================================================= */

(function () {
    "use strict";

    window.NexusAI = window.NexusAI || {};

    const DataManager = window.NexusAI.DataManager;

    if (!DataManager) {
        console.error(
            "DeviceConnectors: DataManager not found. Check script loading order."
        );
        return;
    }

    /* =====================================================
       INTERNAL STATE
    ===================================================== */

    let hostTimer = null;
    let hostRunning = false;
    let hostTargetSourceId = null;
    let fpsSamplerActive = false;
    let latestFps = 60;
    let latestLoopLagMs = 0;
    let visibilityHandler = null;

    let serialPort = null;
    let serialReader = null;
    let serialKeepReading = false;

    let bleDevice = null;
    let bleServer = null;
    let blePollTimer = null;

    let wsClient = null;

    const statusListeners = [];
    const logListeners = [];

    /* =====================================================
       EVENT / CALLBACK DISPATCH
    ===================================================== */

    function notifyStatus(channel, state, message) {
        const payload = {
            channel,
            state,
            message,
            timestamp: new Date().toISOString()
        };

        statusListeners.forEach(fn => {
            try {
                fn(payload);
            } catch (err) {
                console.error("DeviceConnectors status listener error:", err);
            }
        });
    }

    function notifyLog(message, level = "info") {
        const entry = {
            message,
            level,
            timestamp: new Date().toISOString()
        };

        logListeners.forEach(fn => {
            try {
                fn(entry);
            } catch (err) {
                console.error("DeviceConnectors log listener error:", err);
            }
        });
    }

    function onStatusChange(callback) {
        if (typeof callback === "function") {
            statusListeners.push(callback);
        }
    }

    function onLog(callback) {
        if (typeof callback === "function") {
            logListeners.push(callback);
        }
    }

    /* =====================================================
       LAPTOP & BROWSER CAPABILITY INSPECTION
    ===================================================== */

    function getWebGLGpuInfo() {
        try {
            const canvas = document.createElement("canvas");
            const gl =
                canvas.getContext("webgl2") ||
                canvas.getContext("webgl") ||
                canvas.getContext("experimental-webgl");

            if (!gl) {
                return { supported: false, vendor: "Unavailable", renderer: "Unavailable" };
            }

            const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
            if (debugInfo) {
                return {
                    supported: true,
                    vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "Unknown",
                    renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "Unknown"
                };
            }

            return {
                supported: true,
                vendor: gl.getParameter(gl.VENDOR) || "Masked by browser",
                renderer: gl.getParameter(gl.RENDERER) || "Masked by browser"
            };
        } catch (error) {
            return { supported: false, vendor: "Blocked", renderer: "Blocked" };
        }
    }

    async function inspectCapabilities() {
        const gpu = getWebGLGpuInfo();
        let webGpuAdapterName = null;

        if ("gpu" in navigator && navigator.gpu) {
            try {
                const adapter = await navigator.gpu.requestAdapter();
                if (adapter) {
                    const info = adapter.info || {};
                    webGpuAdapterName =
                        info.description ||
                        info.device ||
                        info.architecture ||
                        info.vendor ||
                        "WebGPU Adapter Ready";
                }
            } catch (err) {
                webGpuAdapterName = null;
            }
        }

        let batteryInfo = null;
        if (typeof navigator.getBattery === "function") {
            try {
                const battery = await navigator.getBattery();
                batteryInfo = {
                    level: Math.round(battery.level * 100),
                    charging: Boolean(battery.charging)
                };
            } catch (err) {
                batteryInfo = null;
            }
        }

        const connection =
            navigator.connection ||
            navigator.mozConnection ||
            navigator.webkitConnection ||
            null;

        const memPerf =
            window.performance && window.performance.memory
                ? window.performance.memory
                : null;

        return {
            isSecureContext: Boolean(window.isSecureContext),
            protocol: window.location.protocol,
            platform: navigator.userAgentData?.platform || navigator.platform || "Unknown",
            cores: navigator.hardwareConcurrency || null,
            deviceMemoryGB: navigator.deviceMemory || null,
            gpu,
            hasWebGPU: Boolean("gpu" in navigator && navigator.gpu),
            webGpuAdapterName,
            hasWebNN: Boolean("ml" in navigator),
            hasBattery: typeof navigator.getBattery === "function",
            batteryInfo,
            hasNetworkInfo: Boolean(connection),
            networkInfo: connection
                ? {
                    effectiveType: connection.effectiveType || "unknown",
                    downlinkMbps: connection.downlink ?? null,
                    rttMs: connection.rtt ?? null
                }
                : null,
            hasMemoryPerf: Boolean(memPerf),
            memoryPerf: memPerf
                ? {
                    usedMB: Number((memPerf.usedJSHeapSize / 1048576).toFixed(1)),
                    limitMB: Number((memPerf.jsHeapSizeLimit / 1048576).toFixed(1))
                }
                : null,
            hasWebSerial: "serial" in navigator,
            hasWebBluetooth: "bluetooth" in navigator,
            hasWebUSB: "usb" in navigator,
            hasWebSocket: typeof WebSocket !== "undefined"
        };
    }

    /* =====================================================
       LIVE RENDER FPS & EVENT-LOOP LATENCY PROBE
       (Skips background-tab throttling automatically)
    ===================================================== */

    function startRuntimeProbes() {
        if (fpsSamplerActive) return;
        fpsSamplerActive = true;

        let frames = 0;
        let lastFrameWindow = performance.now();
        let expected = performance.now() + 250;

        if (visibilityHandler) {
            document.removeEventListener("visibilitychange", visibilityHandler);
        }

        visibilityHandler = () => {
            if (!document.hidden) {
                frames = 0;
                lastFrameWindow = performance.now();
                expected = performance.now() + 250;
            }
        };
        document.addEventListener("visibilitychange", visibilityHandler);

        function step(now) {
            if (!fpsSamplerActive) return;

            if (document.hidden) {
                frames = 0;
                lastFrameWindow = now;
            } else {
                frames++;
                const elapsed = now - lastFrameWindow;
                if (elapsed >= 1000) {
                    latestFps = Math.round((frames * 1000) / elapsed);
                    frames = 0;
                    lastFrameWindow = now;
                }
            }

            window.requestAnimationFrame(step);
        }

        window.requestAnimationFrame(step);

        function measureDrift() {
            if (!fpsSamplerActive) return;
            const now = performance.now();
            if (!document.hidden) {
                latestLoopLagMs = Number(Math.max(0, now - expected).toFixed(2));
            }
            expected = now + 250;
            window.setTimeout(measureDrift, 250);
        }
        window.setTimeout(measureDrift, 250);
    }

    function stopRuntimeProbes() {
        fpsSamplerActive = false;
        if (visibilityHandler) {
            document.removeEventListener("visibilitychange", visibilityHandler);
            visibilityHandler = null;
        }
    }

    /* =====================================================
       REGISTER REAL LAPTOP HOST SOURCE
    ===================================================== */

    async function ensureLaptopHostSource() {
        const caps = await inspectCapabilities();
        const existingSources = await DataManager.getSources();
        const existing =
            existingSources.find(
                s => s.name === "Local Laptop (Real Browser Telemetry)"
            ) ||
            existingSources.find(
                s => s.inputMode === "device" && s.architecture === (caps.platform || "Host")
            );

        if (existing) {
            return existing;
        }

        const metrics = [];

        if (caps.hasBattery) {
            metrics.push({
                name: "Battery Level",
                unit: "%",
                warningThreshold: 25,
                criticalThreshold: 12
            });
        }

        if (caps.hasMemoryPerf) {
            metrics.push({
                name: "JS Heap Utilization",
                unit: "%",
                warningThreshold: 75,
                criticalThreshold: 90
            });
        }

        if (caps.hasNetworkInfo) {
            metrics.push({
                name: "Network RTT Latency",
                unit: "ms",
                warningThreshold: 150,
                criticalThreshold: 350
            });
            metrics.push({
                name: "Network Downlink",
                unit: "Mbps",
                warningThreshold: 5,
                criticalThreshold: 1
            });
        }

        metrics.push({
            name: "UI Render Frame Rate",
            unit: "FPS",
            warningThreshold: 40,
            criticalThreshold: 20
        });

        metrics.push({
            name: "Main Thread Jitter",
            unit: "ms",
            warningThreshold: 25,
            criticalThreshold: 60
        });

        const archGuess =
            navigator.userAgent.includes("ARM") ||
            navigator.userAgent.includes("aarch64") ||
            String(caps.gpu?.renderer || "").includes("Adreno")
                ? "ARM64"
                : "x64";

        const description = [
            `Real browser-exposed telemetry on ${caps.platform}`,
            caps.cores ? `${caps.cores} logical cores` : null,
            caps.gpu?.renderer ? `GPU: ${caps.gpu.renderer}` : null
        ]
            .filter(Boolean)
            .join(" · ");

        const created = await DataManager.saveSource({
            name: "Local Laptop (Real Browser Telemetry)",
            type: "Laptop",
            architecture: archGuess,
            inputMode: "device",
            description,
            samplingInterval: 2000,
            historyRetention: 7,
            status: "active",
            metrics
        });

        notifyLog(`Registered real host source: ${created.name}`, "success");
        return created;
    }

    /* =====================================================
       LIVE HOST TELEMETRY STREAM (REAL BROWSER APIS)
    ===================================================== */

    async function collectAndStoreHostSample(source) {
        if (!source) return 0;

        const enabledMetrics = (source.metrics || []).filter(
            m => m.enabled !== false
        );
        if (!enabledMetrics.length) return 0;

        let battery = null;
        if (typeof navigator.getBattery === "function") {
            try {
                battery = await navigator.getBattery();
            } catch (err) {
                battery = null;
            }
        }

        const connection =
            navigator.connection ||
            navigator.mozConnection ||
            navigator.webkitConnection ||
            null;

        const memPerf =
            window.performance && window.performance.memory
                ? window.performance.memory
                : null;

        let savedCount = 0;

        for (const metric of enabledMetrics) {
            const lowerName = metric.name.toLowerCase();
            let value = null;

            if (lowerName.includes("battery") && battery) {
                value = Number((battery.level * 100).toFixed(1));
            } else if (
                (lowerName.includes("heap") || lowerName.includes("js memory")) &&
                memPerf &&
                memPerf.jsHeapSizeLimit > 0
            ) {
                if (metric.unit === "MB") {
                    value = Number((memPerf.usedJSHeapSize / 1048576).toFixed(2));
                } else {
                    value = Number(
                        ((memPerf.usedJSHeapSize / memPerf.jsHeapSizeLimit) * 100).toFixed(2)
                    );
                }
            } else if (
                lowerName.includes("rtt") &&
                connection &&
                Number.isFinite(connection.rtt)
            ) {
                value = Number(connection.rtt);
            } else if (
                (lowerName.includes("downlink") ||
                    lowerName.includes("network throughput")) &&
                connection &&
                Number.isFinite(connection.downlink)
            ) {
                value = Number(connection.downlink);
            } else if (
                (lowerName.includes("frame rate") || lowerName.includes("fps")) &&
                !document.hidden
            ) {
                value = Number(latestFps);
            } else if (
                (lowerName.includes("jitter") || lowerName.includes("thread")) &&
                !document.hidden
            ) {
                value = Number(latestLoopLagMs);
            }

            if (value !== null && Number.isFinite(value)) {
                await DataManager.addReading({
                    sourceId: source.id,
                    metricId: metric.id,
                    value,
                    inputMode: "device"
                });
                savedCount++;
            }
        }

        return savedCount;
    }

    async function startHostMonitor(sourceId) {
        if (hostRunning) {
            stopHostMonitor();
        }

        const source = await DataManager.getSource(sourceId);
        if (!source) {
            throw new Error("Select a valid monitoring source first.");
        }

        hostTargetSourceId = source.id;
        hostRunning = true;
        startRuntimeProbes();

        const intervalMs = Math.max(1500, Number(source.samplingInterval) || 2000);

        const runTick = async () => {
            if (!hostRunning) return;
            try {
                const freshSource = await DataManager.getSource(hostTargetSourceId);
                const count = await collectAndStoreHostSample(freshSource);

                if (count === 0) {
                    notifyStatus(
                        "host",
                        "warning",
                        document.hidden
                            ? "Tab hidden — frame/jitter probes paused"
                            : "No browser-exposed metrics matched this source. Click 'Register This Laptop' for real metrics."
                    );
                } else {
                    notifyStatus(
                        "host",
                        "connected",
                        `Streaming ${count} real host metric(s) every ${(intervalMs / 1000).toFixed(1)}s`
                    );
                }
            } catch (error) {
                notifyLog(`Host monitor error: ${error.message}`, "error");
            }
        };

        await runTick();
        hostTimer = window.setInterval(runTick, intervalMs);
        notifyLog(`Started real-time laptop host stream on "${source.name}".`, "success");
    }

    function stopHostMonitor() {
        hostRunning = false;
        if (hostTimer) {
            window.clearInterval(hostTimer);
            hostTimer = null;
        }
        stopRuntimeProbes();
        notifyStatus("host", "idle", "Host monitor idle");
    }

    /* =====================================================
       INCOMING DEVICE PAYLOAD NORMALIZER (ADAPTER)
    ===================================================== */

    async function ingestDevicePayload(rawLine, sourceId, fallbackMetricId) {
        const text = String(rawLine || "").trim();
        if (!text) return false;

        const source = await DataManager.getSource(sourceId);
        if (!source) return false;

        const enabledMetrics = (source.metrics || []).filter(
            m => m.enabled !== false
        );
        if (!enabledMetrics.length) return false;

        let metricName = null;
        let numericValue = null;

        if (text.startsWith("{") && text.endsWith("}")) {
            try {
                const parsed = JSON.parse(text);
                if (Number.isFinite(Number(parsed.value))) {
                    metricName = parsed.metric || parsed.metricName || null;
                    numericValue = Number(parsed.value);
                } else {
                    const firstNumericKey = Object.keys(parsed).find(k =>
                        Number.isFinite(Number(parsed[k]))
                    );
                    if (firstNumericKey) {
                        metricName = firstNumericKey;
                        numericValue = Number(parsed[firstNumericKey]);
                    }
                }
            } catch (err) {
                // Fall through
            }
        }

        if (numericValue === null && (text.includes(":") || text.includes("="))) {
            const parts = text.split(/[:=]/);
            if (parts.length >= 2) {
                const maybeNum = Number(parts[1].replace(/[^\d.-]/g, ""));
                if (Number.isFinite(maybeNum)) {
                    metricName = parts[0].trim();
                    numericValue = maybeNum;
                }
            }
        }

        if (numericValue === null) {
            const plain = Number(text);
            if (Number.isFinite(plain)) {
                numericValue = plain;
            }
        }

        if (numericValue === null || !Number.isFinite(numericValue)) {
            return false;
        }

        let targetMetric = null;

        if (metricName) {
            const query = metricName.toLowerCase();
            targetMetric = enabledMetrics.find(
                m =>
                    m.name.toLowerCase() === query ||
                    m.name.toLowerCase().includes(query) ||
                    query.includes(m.name.toLowerCase())
            );
        }

        if (!targetMetric && fallbackMetricId) {
            targetMetric = enabledMetrics.find(m => m.id === fallbackMetricId);
        }

        if (!targetMetric) {
            targetMetric = enabledMetrics[0];
        }

        await DataManager.addReading({
            sourceId: source.id,
            metricId: targetMetric.id,
            value: numericValue,
            inputMode: "device"
        });

        return true;
    }

    /* =====================================================
       WEB SERIAL CONNECTOR (ARDUINO / ESP32 / CONTROLLERS)
    ===================================================== */

    async function connectSerial(sourceId, metricId, baudRate = 115200) {
        if (!window.isSecureContext) {
            throw new Error(
                "Web Serial requires https:// or http://localhost (VS Code Live Server). It cannot run on file://."
            );
        }
        if (!("serial" in navigator)) {
            throw new Error(
                "Web Serial API is not supported in this browser. Use Chrome or Edge."
            );
        }

        if (serialPort) {
            await disconnectSerial();
        }

        serialPort = await navigator.serial.requestPort();
        await serialPort.open({ baudRate: Number(baudRate) || 115200 });

        serialKeepReading = true;
        notifyStatus("serial", "connected", `Serial connected @ ${baudRate} baud`);
        notifyLog(`Web Serial port opened (${baudRate} baud).`, "success");

        const decoder = new TextDecoderStream();
        serialPort.readable.pipeTo(decoder.writable).catch(() => {});
        serialReader = decoder.readable.getReader();

        let buffer = "";

        (async () => {
            try {
                while (serialKeepReading) {
                    const { value, done } = await serialReader.read();
                    if (done) break;
                    if (!value) continue;

                    buffer += value;
                    const lines = buffer.split(/\r?\n/);
                    buffer = lines.pop() || "";

                    for (const line of lines) {
                        await ingestDevicePayload(line, sourceId, metricId);
                    }
                }
            } catch (error) {
                if (serialKeepReading) {
                    notifyLog(`Serial stream interrupted: ${error.message}`, "error");
                }
            } finally {
                await disconnectSerial();
            }
        })();
    }

    async function disconnectSerial() {
        serialKeepReading = false;
        try {
            if (serialReader) {
                await serialReader.cancel();
                serialReader.releaseLock();
                serialReader = null;
            }
        } catch (err) {
            // Ignore cleanup errors
        }
        try {
            if (serialPort) {
                await serialPort.close();
                serialPort = null;
            }
        } catch (err) {
            // Ignore cleanup errors
        }
        notifyStatus("serial", "idle", "Serial disconnected");
    }

    /* =====================================================
       WEB BLUETOOTH CONNECTOR (BLE SENSORS / DEVICES)
    ===================================================== */

    async function connectBluetooth(sourceId, metricId) {
        if (!window.isSecureContext) {
            throw new Error(
                "Web Bluetooth requires https:// or http://localhost (VS Code Live Server)."
            );
        }
        if (!("bluetooth" in navigator)) {
            throw new Error(
                "Web Bluetooth API is not supported in this browser. Use Chrome or Edge."
            );
        }

        if (bleDevice && bleDevice.gatt?.connected) {
            disconnectBluetooth();
        }

        bleDevice = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: ["battery_service", "environmental_sensing", "heart_rate"]
        });

        bleDevice.addEventListener("gattserverdisconnected", () => {
            notifyStatus("bluetooth", "idle", "Bluetooth device disconnected");
            notifyLog(`BLE device "${bleDevice?.name || "Device"}" disconnected.`, "warning");
        });

        bleServer = await bleDevice.gatt.connect();
        notifyStatus(
            "bluetooth",
            "connected",
            `Connected: ${bleDevice.name || "BLE Device"}`
        );
        notifyLog(`Connected to BLE device "${bleDevice.name || "Unnamed"}".`, "success");

        try {
            const batteryService = await bleServer.getPrimaryService("battery_service");
            const batteryChar = await batteryService.getCharacteristic("battery_level");

            const readBattery = async () => {
                const dataView = await batteryChar.readValue();
                const level = dataView.getUint8(0);
                await ingestDevicePayload(
                    JSON.stringify({ metric: "Battery Level", value: level }),
                    sourceId,
                    metricId
                );
            };

            await readBattery();
            blePollTimer = window.setInterval(() => {
                if (bleDevice?.gatt?.connected) {
                    readBattery().catch(() => {});
                }
            }, 5000);
        } catch (err) {
            notifyLog(
                "Connected to BLE GATT, but standard Battery Service (0x180F) was not exposed by this device.",
                "warning"
            );
        }
    }

    function disconnectBluetooth() {
        if (blePollTimer) {
            window.clearInterval(blePollTimer);
            blePollTimer = null;
        }
        if (bleDevice && bleDevice.gatt?.connected) {
            bleDevice.gatt.disconnect();
        }
        bleServer = null;
        bleDevice = null;
        notifyStatus("bluetooth", "idle", "Bluetooth disconnected");
    }

    /* =====================================================
       WEBSOCKET STREAM ADAPTER (OPTIONAL LOCAL BRIDGE)
    ===================================================== */

    function connectWebSocket(url, sourceId, metricId) {
        if (!url || (!url.startsWith("ws://") && !url.startsWith("wss://"))) {
            throw new Error("Enter a valid ws:// or wss:// WebSocket URL.");
        }

        disconnectWebSocket();

        wsClient = new WebSocket(url);

        wsClient.onopen = () => {
            notifyStatus("websocket", "connected", `Stream open: ${url}`);
            notifyLog(`WebSocket telemetry connected to ${url}.`, "success");
        };

        wsClient.onmessage = async event => {
            await ingestDevicePayload(event.data, sourceId, metricId);
        };

        wsClient.onerror = () => {
            notifyStatus("websocket", "error", "WebSocket connection failed");
            notifyLog(`WebSocket error on ${url}. Ensure local stream server is running.`, "error");
        };

        wsClient.onclose = () => {
            notifyStatus("websocket", "idle", "WebSocket disconnected");
        };
    }

    function disconnectWebSocket() {
        if (wsClient) {
            wsClient.close();
            wsClient = null;
        }
        notifyStatus("websocket", "idle", "WebSocket disconnected");
    }

    /* =====================================================
       PUBLIC API
    ===================================================== */

    window.NexusAI.DeviceConnectors = {
        inspectCapabilities,
        ensureLaptopHostSource,
        startHostMonitor,
        stopHostMonitor,
        isHostRunning: () => hostRunning,

        connectSerial,
        disconnectSerial,
        isSerialConnected: () => Boolean(serialPort),

        connectBluetooth,
        disconnectBluetooth,
        isBluetoothConnected: () => Boolean(bleDevice && bleDevice.gatt?.connected),

        connectWebSocket,
        disconnectWebSocket,
        isWebSocketConnected: () =>
            Boolean(wsClient && wsClient.readyState === WebSocket.OPEN),

        ingestDevicePayload,
        onStatusChange,
        onLog
    };

    console.info("NexusAI Device Connectors loaded.");

})();