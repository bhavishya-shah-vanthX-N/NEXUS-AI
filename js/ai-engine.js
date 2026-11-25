/**
 * NexusAI — Statistical AI Analytics & Anomaly Engine
 * Computes rolling Z-score outliers, least-squares linear regression forecasts,
 * normalized health scores, and rule-based optimization recommendations
 * directly from local IndexedDB telemetry (no external APIs or trained ML).
 */
(function (window, document) {
  "use strict";

  const NexusAI = (window.NexusAI = window.NexusAI || {});

  const MIN_SAMPLES_FOR_STATS = 5;
  const MAX_CHART_POINTS = 80;

  const state = {
    sources: [],
    readings: [],
    storedAnomalies: [],
    selectedSourceId: "",
    selectedMetricId: "",
    originFilter: "ALL",
    zThreshold: 2.0,
    forecastSteps: 10,
    simHeadroomPct: 100,
    simWindowSize: 40,
    chartPoints: [],
    lastReport: null,
    toastTimer: null
  };

  const els = {};

  function cacheElements() {
    const ids = [
      "run-ai-scan-btn",
      "export-analytics-btn",
      "kpi-health-badge",
      "kpi-health-score",
      "kpi-health-sub",
      "kpi-zscore-anomalies",
      "kpi-anomalies-sub",
      "kpi-trend-badge",
      "kpi-trend-direction",
      "kpi-trend-sub",
      "kpi-sample-coverage",
      "kpi-sample-sub",
      "analytics-source-select",
      "analytics-metric-select",
      "origin-filter-select",
      "zscore-threshold-select",
      "forecast-steps-select",
      "sync-anomalies-btn",
      "refresh-analytics-btn",
      "analytics-empty-state",
      "analytics-main-grid",
      "analytics-secondary-grid",
      "chart-title",
      "chart-subtitle",
      "analytics-chart-canvas",
      "analytics-chart-tooltip",
      "stat-mean",
      "stat-stddev",
      "stat-r2",
      "stat-forecast-next",
      "stat-eta-breach",
      "health-breakdown-list",
      "outlier-count-pill",
      "anomalies-table-body",
      "recommendations-list",
      "sim-headroom-label",
      "sim-threshold-slider",
      "sim-window-label",
      "sim-window-slider",
      "scenario-impact-output",
      "analytics-toast"
    ];

    ids.forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function showToast(message, type) {
    const toast = els["analytics-toast"];
    if (!toast) return;

    toast.textContent = message;
    toast.className = "analytics-toast";
    if (type === "success") toast.classList.add("toast-success");
    else if (type === "warn") toast.classList.add("toast-warn");
    else if (type === "error") toast.classList.add("toast-error");

    toast.hidden = false;
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 3400);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toFiniteNumber(val) {
    if (val === null || val === undefined || val === "") return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }

  function formatNumber(val, decimals) {
    if (!Number.isFinite(val)) return "--";
    const d = typeof decimals === "number" ? decimals : Math.abs(val) >= 100 ? 1 : 2;
    return val.toFixed(d);
  }

  function formatTime(ts) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "--";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function normalizeOrigin(reading) {
    const raw = String(
      reading.origin || reading.sourceType || reading.mode || "SIMULATED"
    ).toUpperCase();
    if (raw.includes("DEVICE") || raw.includes("HOST") || raw.includes("SERIAL") || raw.includes("BLE") || raw.includes("WS")) {
      return "DEVICE";
    }
    if (raw.includes("MANUAL")) return "MANUAL";
    if (raw.includes("IMPORT") || raw.includes("CSV") || raw.includes("JSON")) return "IMPORT";
    return "SIMULATED";
  }

  function getMetricThresholds(metric) {
    if (!metric) return { warn: null, crit: null, lowerIsWorse: false };
    const warn = toFiniteNumber(metric.warningThreshold);
    const crit = toFiniteNumber(metric.criticalThreshold);
    const lowerIsWorse = warn !== null && crit !== null && crit < warn;
    return { warn, crit, lowerIsWorse };
  }

  function evaluateThresholdBreach(value, metric, warnOverride) {
    if (!Number.isFinite(value) || !metric) return "normal";
    const { warn: baseWarn, crit, lowerIsWorse } = getMetricThresholds(metric);
    const warn = warnOverride !== undefined ? warnOverride : baseWarn;

    if (lowerIsWorse) {
      if (crit !== null && value <= crit) return "critical";
      if (warn !== null && value <= warn) return "warning";
      return "normal";
    }

    if (crit !== null && value >= crit) return "critical";
    if (warn !== null && value >= warn) return "warning";
    return "normal";
  }

  /* ========================================================================
     Core Statistical Algorithms (Pure Deterministic Math)
     ======================================================================== */

  function computeDescriptiveStats(values) {
    const n = values.length;
    if (n === 0) {
      return { count: 0, mean: NaN, stdDev: NaN, min: NaN, max: NaN, cv: 0 };
    }

    let sum = 0;
    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < n; i++) {
      const v = values[i];
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }

    const mean = sum / n;
    let sqDiffSum = 0;
    for (let i = 0; i < n; i++) {
      const diff = values[i] - mean;
      sqDiffSum += diff * diff;
    }

    const variance = n > 1 ? sqDiffSum / (n - 1) : 0;
    const stdDev = Math.sqrt(variance);
    const cv = Math.abs(mean) > 1e-6 ? stdDev / Math.abs(mean) : 0;

    return { count: n, mean, stdDev, min, max, cv };
  }

  function detectZScoreAnomalies(readings, metric, zThreshold) {
    const sorted = readings
      .filter((r) => Number.isFinite(Number(r.value)))
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const n = sorted.length;
    if (n < MIN_SAMPLES_FOR_STATS) {
      return {
        points: sorted.map((r) => ({
          reading: r,
          value: Number(r.value),
          origin: normalizeOrigin(r),
          mean: NaN,
          stdDev: NaN,
          zScore: 0,
          isOutlier: false,
          severity: "normal"
        })),
        outliers: [],
        stats: computeDescriptiveStats(sorted.map((r) => Number(r.value)))
      };
    }

    const values = sorted.map((r) => Number(r.value));
    const overallStats = computeDescriptiveStats(values);
    const windowSize = 20;
    const points = [];
    const outliers = [];

    for (let i = 0; i < n; i++) {
      const val = values[i];
      // Use trailing baseline when enough history exists; otherwise overall window
      let baseSlice;
      if (i >= MIN_SAMPLES_FOR_STATS) {
        const start = Math.max(0, i - windowSize);
        baseSlice = values.slice(start, i);
      } else {
        baseSlice = values;
      }

      const base = computeDescriptiveStats(baseSlice);
      let zScore = 0;
      if (base.stdDev >= 1e-6) {
        zScore = (val - base.mean) / base.stdDev;
      }

      const absZ = Math.abs(zScore);
      const isOutlier = absZ >= zThreshold;
      const thresholdStatus = evaluateThresholdBreach(val, metric);

      let severity = "normal";
      if (isOutlier) {
        if (absZ >= zThreshold + 1.0 || thresholdStatus === "critical") {
          severity = "critical";
        } else {
          severity = "warning";
        }
      } else if (thresholdStatus !== "normal") {
        severity = thresholdStatus;
      }

      const point = {
        index: i,
        reading: sorted[i],
        value: val,
        origin: normalizeOrigin(sorted[i]),
        mean: base.mean,
        stdDev: base.stdDev,
        zScore,
        isOutlier,
        severity
      };

      points.push(point);
      if (isOutlier) {
        outliers.push(point);
      }
    }

    return { points, outliers, stats: overallStats };
  }

  function computeLinearRegression(values, forecastSteps) {
    const n = values.length;
    if (n < MIN_SAMPLES_FOR_STATS) {
      return {
        valid: false,
        slope: 0,
        intercept: NaN,
        rSquared: 0,
        fitted: [],
        forecast: []
      };
    }

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumXX += i * i;
    }

    const denom = n * sumXX - sumX * sumX;
    const slope = Math.abs(denom) > 1e-9 ? (n * sumXY - sumX * sumY) / denom : 0;
    const intercept = (sumY - slope * sumX) / n;
    const meanY = sumY / n;

    let ssRes = 0;
    let ssTot = 0;
    const fitted = [];

    for (let i = 0; i < n; i++) {
      const yHat = slope * i + intercept;
      fitted.push(yHat);
      ssRes += (values[i] - yHat) * (values[i] - yHat);
      ssTot += (values[i] - meanY) * (values[i] - meanY);
    }

    const rSquared = ssTot > 1e-9 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 1;

    const forecast = [];
    for (let step = 1; step <= forecastSteps; step++) {
      const idx = n - 1 + step;
      forecast.push({
        step,
        index: idx,
        value: slope * idx + intercept
      });
    }

    return {
      valid: true,
      slope,
      intercept,
      rSquared,
      fitted,
      forecast
    };
  }

  function estimateThresholdEta(regression, lastValue, metric) {
    if (!regression.valid || !metric) return "Insufficient data";
    const { warn, crit, lowerIsWorse } = getMetricThresholds(metric);
    const target = crit !== null ? crit : warn;
    if (target === null) return "No threshold set";

    if (evaluateThresholdBreach(lastValue, metric) === "critical") {
      return "Breached now";
    }

    const slope = regression.slope;
    if (Math.abs(slope) < 1e-4) return "Stable (flat slope)";

    const movingTowardTarget = lowerIsWorse
      ? slope < 0 && lastValue > target
      : slope > 0 && lastValue < target;

    if (!movingTowardTarget) return "Moving away from limit";

    const intervals = (target - lastValue) / slope;
    if (!Number.isFinite(intervals) || intervals <= 0) return "Imminent (<1 step)";
    if (intervals > 500) return "> 500 intervals";
    return `~${Math.ceil(intervals)} intervals`;
  }

  function computeMetricHealth(readings, metric, zThreshold) {
    const analysis = detectZScoreAnomalies(readings, metric, zThreshold);
    const n = analysis.points.length;

    if (n === 0) {
      return {
        metric,
        score: null,
        status: "neutral",
        label: "NO DATA",
        sampleCount: 0,
        outlierCount: 0,
        breachCount: 0,
        stats: analysis.stats
      };
    }

    let warnBreaches = 0;
    let critBreaches = 0;
    for (let i = 0; i < n; i++) {
      const sev = evaluateThresholdBreach(analysis.points[i].value, metric);
      if (sev === "critical") critBreaches++;
      else if (sev === "warning") warnBreaches++;
    }

    const breachRate = (warnBreaches * 0.5 + critBreaches * 1.0) / n;
    const outlierRate = n >= MIN_SAMPLES_FOR_STATS ? analysis.outliers.length / n : 0;
    const volatilityPenalty = Math.min(20, analysis.stats.cv * 35);

    const rawScore = 100 - breachRate * 55 - outlierRate * 35 - volatilityPenalty;
    const score = Math.round(Math.max(0, Math.min(100, rawScore)));

    let status = "good";
    let label = "HEALTHY";
    if (score < 60 || critBreaches > 0) {
      status = "crit";
      label = "CRITICAL";
    } else if (score < 82 || warnBreaches > 0) {
      status = "warn";
      label = "DEGRADED";
    }

    return {
      metric,
      score,
      status,
      label,
      sampleCount: n,
      outlierCount: analysis.outliers.length,
      breachCount: warnBreaches + critBreaches,
      stats: analysis.stats
    };
  }

  function buildRecommendations(source, metric, analysis, regression, healthItem) {
    const recs = [];
    const n = analysis.points.length;

    if (!source || !metric) {
      return [
        {
          level: "info",
          tag: "SETUP",
          title: "Select a telemetry source and metric",
          body: "Create or enable a source in Workspace or connect your laptop in Live Telemetry to run statistical diagnostics."
        }
      ];
    }

    if (n < MIN_SAMPLES_FOR_STATS) {
      recs.push({
        level: "warning",
        tag: "LOW SAMPLE",
        title: `Need at least ${MIN_SAMPLES_FOR_STATS} readings for ${metric.name}`,
        body: `Currently only ${n} sample(s) match your origin filter. Stream Live Telemetry or import CSV history before relying on Z-score or slope forecasts.`
      });
      return recs;
    }

    const latest = analysis.points[n - 1];
    const { warn, crit, lowerIsWorse } = getMetricThresholds(metric);

    if (latest.severity === "critical" || (healthItem && healthItem.breachCount > 0)) {
      recs.push({
        level: "critical",
        tag: "THRESHOLD",
        title: `Active threshold pressure on ${metric.name}`,
        body: `${healthItem.breachCount} of ${n} samples crossed configured limits (${lowerIsWorse ? "low-bound" : "upper-bound"} warning ${warn ?? "--"} / critical ${crit ?? "--"}). Reduce workload or inspect hardware headroom.`
      });
    }

    if (analysis.outliers.length > 0) {
      const pct = ((analysis.outliers.length / n) * 100).toFixed(1);
      recs.push({
        level: analysis.outliers.length >= 3 ? "warning" : "info",
        tag: "SPIKE RATE",
        title: `${analysis.outliers.length} Z-score outlier(s) detected (${pct}% of window)`,
        body: `Outliers exceeded ±${state.zThreshold.toFixed(1)}σ from the trailing rolling baseline (μ=${formatNumber(analysis.stats.mean)}, σ=${formatNumber(analysis.stats.stdDev)}). Review Alert Feed or save outliers to IndexedDB.`
      });
    }

    if (regression.valid && Math.abs(regression.slope) > 0.02) {
      const adverse = lowerIsWorse ? regression.slope < 0 : regression.slope > 0;
      if (adverse) {
        recs.push({
          level: "warning",
          tag: "DRIFT",
          title: `Adverse linear trend (${regression.slope > 0 ? "+" : ""}${formatNumber(regression.slope, 3)} ${metric.unit || ""}/step)`,
          body: `Linear regression (R²=${regression.rSquared.toFixed(2)}) projects drift toward operational limits. Estimated time to breach: ${estimateThresholdEta(regression, latest.value, metric)}.`
        });
      }
    }

    const originSet = new Set(analysis.points.map((p) => p.origin));
    if (originSet.has("SIMULATED") && !originSet.has("DEVICE")) {
      recs.push({
        level: "info",
        tag: "ORIGIN",
        title: "Analyzing synthetic telemetry stream",
        body: "Current samples come from SIMULATED generation. Connect your laptop host monitor or Web Serial/WebSocket device in Live Telemetry for real hardware measurements."
      });
    }

    if (recs.length === 0 || (healthItem && healthItem.score >= 85 && analysis.outliers.length === 0)) {
      recs.unshift({
        level: "optimal",
        tag: "OPTIMAL",
        title: `${metric.name} operating within stable statistical bounds`,
        body: `Health score is ${healthItem ? healthItem.score : 100}/100 with low variance (σ=${formatNumber(analysis.stats.stdDev)} ${metric.unit || ""}) and zero outliers above ±${state.zThreshold.toFixed(1)}σ.`
      });
    }

    return recs;
  }

  /* ========================================================================
     Canvas Rendering (Regression + Z-Score Band + Hover Tooltip)
     ======================================================================== */

  function drawAnalyticsChart(analysis, regression, metric) {
    const canvas = els["analytics-chart-canvas"];
    if (!canvas) return;

    const wrap = canvas.parentElement;
    const width = wrap ? wrap.clientWidth : 700;
    const height = wrap ? wrap.clientHeight : 310;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(300, Math.floor(width * dpr));
    canvas.height = Math.max(200, Math.floor(height * dpr));

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const visibleHistory = analysis.points.slice(-MAX_CHART_POINTS);
    const forecast = regression.valid ? regression.forecast : [];

    if (visibleHistory.length === 0) {
      state.chartPoints = [];
      ctx.fillStyle = "#94a3b8";
      ctx.font = "13px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No readings available for the selected metric & origin filter.", width / 2, height / 2);
      return;
    }

    const pad = { top: 22, right: 22, bottom: 32, left: 56 };
    const plotW = Math.max(80, width - pad.left - pad.right);
    const plotH = Math.max(80, height - pad.top - pad.bottom);

    const allVals = [];
    visibleHistory.forEach((p) => {
      allVals.push(p.value);
      if (Number.isFinite(p.mean) && Number.isFinite(p.stdDev)) {
        allVals.push(p.mean + state.zThreshold * p.stdDev);
        allVals.push(p.mean - state.zThreshold * p.stdDev);
      }
    });
    forecast.forEach((f) => allVals.push(f.value));

    let minY = Math.min(...allVals);
    let maxY = Math.max(...allVals);
    if (Math.abs(maxY - minY) < 1e-4) {
      minY -= 1;
      maxY += 1;
    } else {
      const margin = (maxY - minY) * 0.12;
      minY -= margin;
      maxY += margin;
    }

    const totalXCount = Math.max(1, visibleHistory.length + forecast.length - 1);
    const xForIndex = (idx) => pad.left + (idx / totalXCount) * plotW;
    const yForVal = (v) => pad.top + ((maxY - v) / (maxY - minY)) * plotH;

    // Grid lines & Y-axis labels
    ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (let i = 0; i <= 4; i++) {
      const ratio = i / 4;
      const y = pad.top + ratio * plotH;
      const val = maxY - ratio * (maxY - minY);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      ctx.fillText(formatNumber(val, 1), pad.left - 8, y);
    }

    // Forecast Zone Shade
    if (forecast.length > 0 && visibleHistory.length > 0) {
      const splitX = xForIndex(visibleHistory.length - 1);
      ctx.fillStyle = "rgba(167, 139, 250, 0.06)";
      ctx.fillRect(splitX, pad.top, width - pad.right - splitX, plotH);

      ctx.save();
      ctx.strokeStyle = "rgba(167, 139, 250, 0.35)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(splitX, pad.top);
      ctx.lineTo(splitX, pad.top + plotH);
      ctx.stroke();
      ctx.restore();
    }

    // Z-score control band (shaded)
    if (visibleHistory.length >= MIN_SAMPLES_FOR_STATS) {
      ctx.save();
      ctx.beginPath();
      visibleHistory.forEach((p, i) => {
        const upper = Number.isFinite(p.mean) ? p.mean + state.zThreshold * p.stdDev : p.value;
        const x = xForIndex(i);
        const y = yForVal(upper);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      for (let i = visibleHistory.length - 1; i >= 0; i--) {
        const p = visibleHistory[i];
        const lower = Number.isFinite(p.mean) ? p.mean - state.zThreshold * p.stdDev : p.value;
        ctx.lineTo(xForIndex(i), yForVal(lower));
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(56, 189, 248, 0.08)";
      ctx.fill();
      ctx.restore();

      // Overall mean horizontal dashed line
      if (Number.isFinite(analysis.stats.mean)) {
        const meanY = yForVal(analysis.stats.mean);
        ctx.save();
        ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(pad.left, meanY);
        ctx.lineTo(xForIndex(visibleHistory.length - 1), meanY);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Linear regression fit + forecast line
    if (regression.valid && visibleHistory.length >= MIN_SAMPLES_FOR_STATS) {
      const offset = analysis.points.length - visibleHistory.length;
      ctx.save();
      ctx.strokeStyle = "#a78bfa";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();

      visibleHistory.forEach((_, i) => {
        const fittedVal = regression.fitted[offset + i];
        const x = xForIndex(i);
        const y = yForVal(fittedVal);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      forecast.forEach((f, idx) => {
        const x = xForIndex(visibleHistory.length + idx);
        const y = yForVal(f.value);
        ctx.lineTo(x, y);
      });

      ctx.stroke();
      ctx.restore();
    }

    // Actual values line
    ctx.save();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    visibleHistory.forEach((p, i) => {
      const x = xForIndex(i);
      const y = yForVal(p.value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    // Interactive Point Cache & Markers
    const interactive = [];

    visibleHistory.forEach((p, i) => {
      const x = xForIndex(i);
      const y = yForVal(p.value);
      interactive.push({
        x,
        y,
        kind: "actual",
        label: formatTime(p.reading.timestamp),
        value: p.value,
        zScore: p.zScore,
        origin: p.origin,
        isOutlier: p.isOutlier,
        unit: metric ? metric.unit || "" : ""
      });

      if (p.isOutlier) {
        ctx.beginPath();
        ctx.arc(x, y, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(239, 68, 68, 0.28)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#ef4444";
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = "#38bdf8";
        ctx.fill();
      }
    });

    forecast.forEach((f, idx) => {
      const x = xForIndex(visibleHistory.length + idx);
      const y = yForVal(f.value);
      interactive.push({
        x,
        y,
        kind: "forecast",
        label: `+${f.step} step forecast`,
        value: f.value,
        zScore: null,
        origin: "LINEAR FIT",
        isOutlier: false,
        unit: metric ? metric.unit || "" : ""
      });

      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = "#a78bfa";
      ctx.fill();
    });

    state.chartPoints = interactive;

    // X-axis caption
    ctx.fillStyle = "#64748b";
    ctx.font = "11px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(
      `Showing last ${visibleHistory.length} samples (${analysis.points.length} total)`,
      pad.left,
      height - 10
    );

    if (forecast.length > 0) {
      ctx.textAlign = "right";
      ctx.fillStyle = "#a78bfa";
      ctx.fillText(`+${forecast.length} step linear projection`, width - pad.right, height - 10);
    }
  }

  function bindChartTooltip() {
    const canvas = els["analytics-chart-canvas"];
    const tooltip = els["analytics-chart-tooltip"];
    if (!canvas || !tooltip) return;

    canvas.addEventListener("mousemove", (e) => {
      if (!state.chartPoints.length) {
        tooltip.hidden = true;
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let closest = null;
      let minDist = 28;
      for (let i = 0; i < state.chartPoints.length; i++) {
        const pt = state.chartPoints[i];
        const dist = Math.hypot(pt.x - mx, pt.y - my);
        if (dist < minDist) {
          minDist = dist;
          closest = pt;
        }
      }

      if (!closest) {
        tooltip.hidden = true;
        return;
      }

      const zPart =
        closest.kind === "actual" && Number.isFinite(closest.zScore)
          ? `<br>Z-Score: <strong>${closest.zScore >= 0 ? "+" : ""}${closest.zScore.toFixed(2)}σ</strong>`
          : "";

      tooltip.innerHTML = `
        <strong>${escapeHtml(closest.label)}</strong> (${escapeHtml(closest.origin)})<br>
        Value: <strong>${formatNumber(closest.value)} ${escapeHtml(closest.unit)}</strong>
        ${zPart}
        ${closest.isOutlier ? '<br><span style="color:#f87171;">Z-Score Outlier</span>' : ""}
      `;

      tooltip.hidden = false;
      const leftPos = Math.min(rect.width - 175, Math.max(8, closest.x + 12));
      const topPos = Math.max(8, closest.y - 54);
      tooltip.style.left = `${leftPos}px`;
      tooltip.style.top = `${topPos}px`;
    });

    canvas.addEventListener("mouseleave", () => {
      tooltip.hidden = true;
    });
  }

  /* ========================================================================
     UI Rendering & Data Loading
     ======================================================================== */

  async function loadAllData() {
    const DataManager = NexusAI.DataManager;
    const Storage = NexusAI.Storage;

    if (DataManager && typeof DataManager.init === "function") {
      await DataManager.init();
    } else if (Storage && typeof Storage.init === "function") {
      await Storage.init();
    }

    const sources = DataManager && DataManager.getSources
      ? await Promise.resolve(DataManager.getSources())
      : Storage
      ? await Storage.getAll("sources")
      : [];

    const readings = DataManager && DataManager.getReadings
      ? await Promise.resolve(DataManager.getReadings())
      : Storage
      ? await Storage.getAll("readings")
      : [];

    const storedAnomalies = DataManager && DataManager.getAnomalies
      ? await Promise.resolve(DataManager.getAnomalies())
      : Storage
      ? await Storage.getAll("anomalies")
      : [];

    state.sources = Array.isArray(sources) ? sources : [];
    state.readings = Array.isArray(readings) ? readings : [];
    state.storedAnomalies = Array.isArray(storedAnomalies) ? storedAnomalies : [];
  }

  function populateSelectors() {
    const sourceSelect = els["analytics-source-select"];
    const metricSelect = els["analytics-metric-select"];
    if (!sourceSelect || !metricSelect) return;

    if (state.sources.length === 0) {
      sourceSelect.innerHTML = `<option value="">No sources configured</option>`;
      metricSelect.innerHTML = `<option value="">No metrics available</option>`;
      state.selectedSourceId = "";
      state.selectedMetricId = "";
      return;
    }

    // Prefer source with most readings if none selected
    if (!state.sources.some((s) => s.id === state.selectedSourceId)) {
      const counts = {};
      state.readings.forEach((r) => {
        counts[r.sourceId] = (counts[r.sourceId] || 0) + 1;
      });
      const sortedSources = state.sources
        .slice()
        .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
      state.selectedSourceId = sortedSources[0].id;
    }

    sourceSelect.innerHTML = state.sources
      .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)} (${escapeHtml(s.type || "Node")})</option>`)
      .join("");
    sourceSelect.value = state.selectedSourceId;

    const activeSource = state.sources.find((s) => s.id === state.selectedSourceId);
    const metrics = activeSource && Array.isArray(activeSource.metrics) ? activeSource.metrics : [];

    if (metrics.length === 0) {
      metricSelect.innerHTML = `<option value="">No metrics on this source</option>`;
      state.selectedMetricId = "";
      return;
    }

    if (!metrics.some((m) => m.id === state.selectedMetricId)) {
      const metricCounts = {};
      state.readings
        .filter((r) => r.sourceId === state.selectedSourceId)
        .forEach((r) => {
          metricCounts[r.metricId] = (metricCounts[r.metricId] || 0) + 1;
        });
      const bestMetric = metrics
        .slice()
        .sort((a, b) => (metricCounts[b.id] || 0) - (metricCounts[a.id] || 0))[0];
      state.selectedMetricId = bestMetric.id;
    }

    metricSelect.innerHTML = metrics
      .map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)} (${escapeHtml(m.unit || "-")})</option>`)
      .join("");
    metricSelect.value = state.selectedMetricId;
  }

  function getFilteredReadings(sourceId, metricId) {
    return state.readings.filter((r) => {
      if (sourceId && r.sourceId !== sourceId) return false;
      if (metricId && r.metricId !== metricId) return false;
      if (state.originFilter !== "ALL" && normalizeOrigin(r) !== state.originFilter) return false;
      return Number.isFinite(Number(r.value));
    });
  }

  function updateSimulatorPreview(metric, filteredReadings) {
    const out = els["scenario-impact-output"];
    const headroomLabel = els["sim-headroom-label"];
    const windowLabel = els["sim-window-label"];
    if (!out) return;

    if (headroomLabel) headroomLabel.textContent = `${state.simHeadroomPct}%`;
    if (windowLabel) windowLabel.textContent = `Last ${state.simWindowSize} samples`;

    if (!metric || filteredReadings.length === 0) {
      out.textContent = "No readings available for what-if simulation.";
      return;
    }

    const sorted = filteredReadings
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-state.simWindowSize);

    const { warn, lowerIsWorse } = getMetricThresholds(metric);
    if (warn === null) {
      out.innerHTML = `Metric <strong>${escapeHtml(metric.name)}</strong> has no warning threshold configured. Add one in Workspace to simulate alert sensitivity.`;
      return;
    }

    const factor = state.simHeadroomPct / 100;
    const simulatedWarn = lowerIsWorse ? warn / factor : warn * factor;

    let actualWarns = 0;
    let simWarns = 0;
    sorted.forEach((r) => {
      const val = Number(r.value);
      if (evaluateThresholdBreach(val, metric) !== "normal") actualWarns++;
      if (evaluateThresholdBreach(val, metric, simulatedWarn) !== "normal") simWarns++;
    });

    const delta = simWarns - actualWarns;
    const deltaText =
      delta === 0
        ? "No change in alert volume"
        : delta > 0
        ? `+${delta} more alert(s) triggered`
        : `${Math.abs(delta)} fewer alert(s) triggered`;

    out.innerHTML = `
      Simulated Warning Limit: <strong>${formatNumber(simulatedWarn)} ${escapeHtml(metric.unit || "")}</strong>
      (baseline: ${formatNumber(warn)}) ·
      Projected breaches in last ${sorted.length} samples: <strong>${simWarns}</strong> (${deltaText}).
    `;
  }

  function renderAnalytics() {
    const hasSources = state.sources.length > 0;
    const hasAnyReadings = state.readings.length > 0;

    if (els["analytics-empty-state"]) {
      els["analytics-empty-state"].hidden = hasSources && hasAnyReadings;
    }
    if (els["analytics-main-grid"]) {
      els["analytics-main-grid"].hidden = !(hasSources && hasAnyReadings);
    }
    if (els["analytics-secondary-grid"]) {
      els["analytics-secondary-grid"].hidden = !(hasSources && hasAnyReadings);
    }

    const source = state.sources.find((s) => s.id === state.selectedSourceId) || null;
    const metrics = source && Array.isArray(source.metrics) ? source.metrics : [];
    const metric = metrics.find((m) => m.id === state.selectedMetricId) || null;

    // Sample coverage KPI
    if (els["kpi-sample-coverage"]) {
      els["kpi-sample-coverage"].textContent = String(state.readings.length);
    }
    if (els["kpi-sample-sub"]) {
      els["kpi-sample-sub"].textContent = `Across ${state.sources.length} configured source(s)`;
    }

    if (!source || !metric || !hasAnyReadings) {
      if (els["kpi-health-score"]) els["kpi-health-score"].textContent = "--";
      if (els["kpi-health-badge"]) {
        els["kpi-health-badge"].textContent = "NO DATA";
        els["kpi-health-badge"].className = "health-pill health-neutral";
      }
      if (els["kpi-zscore-anomalies"]) els["kpi-zscore-anomalies"].textContent = "0";
      if (els["kpi-anomalies-sub"]) {
        els["kpi-anomalies-sub"].textContent = `${state.storedAnomalies.length} logged in IndexedDB alerts`;
      }
      if (els["kpi-trend-direction"]) els["kpi-trend-direction"].textContent = "--";
      return;
    }

    // Health breakdown across all metrics of the active source
    const healthItems = metrics.map((m) => {
      const mReadings = getFilteredReadings(source.id, m.id);
      return computeMetricHealth(mReadings, m, state.zThreshold);
    });

    const scoredItems = healthItems.filter((h) => h.score !== null);
    const overallHealth =
      scoredItems.length > 0
        ? Math.round(scoredItems.reduce((acc, h) => acc + h.score, 0) / scoredItems.length)
        : null;

    if (els["kpi-health-score"]) {
      els["kpi-health-score"].textContent = overallHealth !== null ? `${overallHealth} / 100` : "--";
    }
    if (els["kpi-health-badge"]) {
      const badge = els["kpi-health-badge"];
      if (overallHealth === null) {
        badge.textContent = "NO DATA";
        badge.className = "health-pill health-neutral";
      } else if (overallHealth >= 82) {
        badge.textContent = "HEALTHY";
        badge.className = "health-pill health-good";
      } else if (overallHealth >= 60) {
        badge.textContent = "DEGRADED";
        badge.className = "health-pill health-warn";
      } else {
        badge.textContent = "CRITICAL";
        badge.className = "health-pill health-crit";
      }
    }
    if (els["kpi-health-sub"]) {
      els["kpi-health-sub"].textContent = `Source: ${source.name} (${scoredItems.length}/${metrics.length} active metrics)`;
    }

    // Selected metric deep analysis
    const filtered = getFilteredReadings(source.id, metric.id);
    const analysis = detectZScoreAnomalies(filtered, metric, state.zThreshold);
    const values = analysis.points.map((p) => p.value);
    const regression = computeLinearRegression(values, state.forecastSteps);
    const activeHealth = healthItems.find((h) => h.metric.id === metric.id);

    // Anomaly KPI
    if (els["kpi-zscore-anomalies"]) {
      els["kpi-zscore-anomalies"].textContent = String(analysis.outliers.length);
    }
    if (els["kpi-anomalies-sub"]) {
      els["kpi-anomalies-sub"].textContent = `${state.storedAnomalies.length} saved in IndexedDB alerts`;
    }

    // Trend KPI
    const slopeEl = els["kpi-trend-direction"];
    const trendBadge = els["kpi-trend-badge"];
    const trendSub = els["kpi-trend-sub"];
    if (regression.valid) {
      const sign = regression.slope > 0 ? "+" : "";
      if (slopeEl) slopeEl.textContent = `${sign}${formatNumber(regression.slope, 3)}`;
      if (trendBadge) {
        if (Math.abs(regression.slope) < 0.01) {
          trendBadge.textContent = "FLAT";
          trendBadge.className = "trend-pill trend-flat";
        } else if (regression.slope > 0) {
          trendBadge.textContent = "RISING";
          trendBadge.className = "trend-pill trend-up";
        } else {
          trendBadge.textContent = "FALLING";
          trendBadge.className = "trend-pill trend-down";
        }
      }
      if (trendSub) {
        trendSub.textContent = `${metric.unit || "units"}/interval · R² = ${regression.rSquared.toFixed(2)}`;
      }
    } else {
      if (slopeEl) slopeEl.textContent = "--";
      if (trendBadge) {
        trendBadge.textContent = "LOW N";
        trendBadge.className = "trend-pill trend-flat";
      }
      if (trendSub) {
        trendSub.textContent = `Need ≥ ${MIN_SAMPLES_FOR_STATS} readings (${values.length} found)`;
      }
    }

    // Chart headers & stats bar
    if (els["chart-title"]) {
      els["chart-title"].textContent = `${metric.name} — Regression & ±${state.zThreshold.toFixed(1)}σ Band`;
    }
    if (els["stat-mean"]) {
      els["stat-mean"].textContent = Number.isFinite(analysis.stats.mean)
        ? `${formatNumber(analysis.stats.mean)} ${metric.unit || ""}`
        : "--";
    }
    if (els["stat-stddev"]) {
      els["stat-stddev"].textContent = Number.isFinite(analysis.stats.stdDev)
        ? `${formatNumber(analysis.stats.stdDev)} ${metric.unit || ""}`
        : "--";
    }
    if (els["stat-r2"]) {
      els["stat-r2"].textContent = regression.valid ? regression.rSquared.toFixed(3) : "--";
    }
    if (els["stat-forecast-next"]) {
      els["stat-forecast-next"].textContent =
        regression.valid && regression.forecast.length > 0
          ? `${formatNumber(regression.forecast[0].value)} ${metric.unit || ""}`
          : "--";
    }
    if (els["stat-eta-breach"]) {
      const latestVal = values.length > 0 ? values[values.length - 1] : NaN;
      els["stat-eta-breach"].textContent = estimateThresholdEta(regression, latestVal, metric);
    }

    drawAnalyticsChart(analysis, regression, metric);

    // Health Breakdown List
    const healthList = els["health-breakdown-list"];
    if (healthList) {
      healthList.innerHTML = healthItems
        .map((item) => {
          const scoreVal = item.score !== null ? item.score : 0;
          const color =
            item.status === "crit"
              ? "#ef4444"
              : item.status === "warn"
              ? "#f59e0b"
              : item.status === "good"
              ? "#10b981"
              : "#64748b";
          return `
            <div class="health-item">
              <div class="health-item-top">
                <span class="health-item-title">${escapeHtml(item.metric.name)}</span>
                <span class="health-item-score" style="color:${color}">
                  ${item.score !== null ? `${item.score}/100` : "--"}
                </span>
              </div>
              <div class="health-bar-track">
                <div class="health-bar-fill" style="width:${scoreVal}%;background:${color};"></div>
              </div>
              <div class="health-meta">
                <span>${item.sampleCount} samples · ${item.outlierCount} outliers</span>
                <span>${item.breachCount} threshold breach(es)</span>
              </div>
            </div>
          `;
        })
        .join("");
    }

    // Anomalies Table
    if (els["outlier-count-pill"]) {
      els["outlier-count-pill"].textContent = `${analysis.outliers.length} outlier(s)`;
    }

    const tbody = els["anomalies-table-body"];
    if (tbody) {
      if (analysis.outliers.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="table-empty">
              ${
                values.length < MIN_SAMPLES_FOR_STATS
                  ? `Collect at least ${MIN_SAMPLES_FOR_STATS} readings for ${escapeHtml(metric.name)} to compute Z-scores.`
                  : `No readings exceeded ±${state.zThreshold.toFixed(1)}σ for ${escapeHtml(metric.name)}.`
              }
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = analysis.outliers
          .slice()
          .reverse()
          .slice(0, 50)
          .map((o) => {
            const originCls = `origin-${o.origin.toLowerCase()}`;
            const sevCls = o.severity === "critical" ? "sev-critical" : "sev-warning";
            return `
              <tr>
                <td>${escapeHtml(formatTime(o.reading.timestamp))}</td>
                <td>${escapeHtml(metric.name)}</td>
                <td><span class="origin-badge ${originCls}">${escapeHtml(o.origin)}</span></td>
                <td><strong>${formatNumber(o.value)} ${escapeHtml(metric.unit || "")}</strong></td>
                <td>${formatNumber(o.mean)} ± ${formatNumber(o.stdDev)}</td>
                <td><strong>${o.zScore >= 0 ? "+" : ""}${o.zScore.toFixed(2)}σ</strong></td>
                <td><span class="severity-badge ${sevCls}">${escapeHtml(o.severity)}</span></td>
              </tr>
            `;
          })
          .join("");
      }
    }

    // Recommendations
    const recs = buildRecommendations(source, metric, analysis, regression, activeHealth);
    if (els["recommendations-list"]) {
      els["recommendations-list"].innerHTML = recs
        .map(
          (r) => `
          <div class="rec-item rec-${escapeHtml(r.level)}">
            <div class="rec-item-header">
              <strong>${escapeHtml(r.title)}</strong>
              <span class="kpi-tag">${escapeHtml(r.tag)}</span>
            </div>
            <p>${escapeHtml(r.body)}</p>
          </div>
        `
        )
        .join("");
    }

    // What-If Simulator
    updateSimulatorPreview(metric, filtered);

    state.lastReport = {
      generatedAt: new Date().toISOString(),
      methodology: "Statistical (Rolling Z-Score, Least-Squares Linear Regression, Rule-Based Health Scoring)",
      source: { id: source.id, name: source.name, type: source.type },
      metric: { id: metric.id, name: metric.name, unit: metric.unit },
      parameters: {
        originFilter: state.originFilter,
        zThreshold: state.zThreshold,
        forecastSteps: state.forecastSteps
      },
      overallSourceHealth: overallHealth,
      descriptiveStats: analysis.stats,
      linearRegression: {
        valid: regression.valid,
        slope: regression.slope,
        intercept: regression.intercept,
        rSquared: regression.rSquared,
        forecast: regression.forecast
      },
      outliers: analysis.outliers.map((o) => ({
        timestamp: o.reading.timestamp,
        origin: o.origin,
        value: o.value,
        baselineMean: o.mean,
        baselineStdDev: o.stdDev,
        zScore: o.zScore,
        severity: o.severity
      })),
      recommendations: recs
    };
  }

  async function syncOutliersToAlertLog() {
    const DataManager = NexusAI.DataManager;
    const source = state.sources.find((s) => s.id === state.selectedSourceId);
    const metric = source && source.metrics
      ? source.metrics.find((m) => m.id === state.selectedMetricId)
      : null;

    if (!source || !metric) {
      showToast("Select a source and metric first.", "warn");
      return;
    }

    const filtered = getFilteredReadings(source.id, metric.id);
    const analysis = detectZScoreAnomalies(filtered, metric, state.zThreshold);

    if (analysis.outliers.length === 0) {
      showToast("No Z-score outliers found to save.", "warn");
      return;
    }

    const existingKeys = new Set(
      state.storedAnomalies.map(
        (a) => a.readingId || `${a.sourceId}::${a.metricId}::${a.timestamp}::${a.detectionMethod || ""}`
      )
    );

    let added = 0;
    for (const o of analysis.outliers) {
      const key = o.reading.id || `${source.id}::${metric.id}::${o.reading.timestamp}::z-score`;
      if (existingKeys.has(key)) continue;

      const payload = {
        id: `anom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        sourceId: source.id,
        sourceName: source.name,
        metricId: metric.id,
        metricName: metric.name,
        readingId: o.reading.id || null,
        value: o.value,
        unit: metric.unit || "",
        zScore: Number(o.zScore.toFixed(3)),
        severity: o.severity === "critical" ? "critical" : "warning",
        detectionMethod: "z-score",
        origin: o.origin,
        message: `${metric.name} Z-score anomaly (${o.zScore >= 0 ? "+" : ""}${o.zScore.toFixed(2)}σ, value ${formatNumber(o.value)} ${metric.unit || ""})`,
        timestamp: o.reading.timestamp || new Date().toISOString()
      };

      if (DataManager && typeof DataManager.saveAnomaly === "function") {
        await DataManager.saveAnomaly(payload);
        added++;
      } else if (NexusAI.Storage && typeof NexusAI.Storage.put === "function") {
        await NexusAI.Storage.put("anomalies", payload);
        added++;
      }
      existingKeys.add(key);
    }

    await loadAllData();
    renderAnalytics();
    showToast(
      added > 0
        ? `Saved ${added} new Z-score outlier(s) to IndexedDB Alert Log.`
        : "All detected outliers are already logged in IndexedDB.",
      "success"
    );
  }

  function exportAnalyticsReport() {
    if (!state.lastReport) {
      showToast("No analytics report available to export yet.", "warn");
      return;
    }

    const blob = new Blob([JSON.stringify(state.lastReport, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexusai-analytics-report-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Exported statistical analytics report JSON.", "success");
  }

  function bindEvents() {
    if (els["analytics-source-select"]) {
      els["analytics-source-select"].addEventListener("change", (e) => {
        state.selectedSourceId = e.target.value;
        state.selectedMetricId = "";
        populateSelectors();
        renderAnalytics();
      });
    }

    if (els["analytics-metric-select"]) {
      els["analytics-metric-select"].addEventListener("change", (e) => {
        state.selectedMetricId = e.target.value;
        renderAnalytics();
      });
    }

    if (els["origin-filter-select"]) {
      els["origin-filter-select"].addEventListener("change", (e) => {
        state.originFilter = e.target.value;
        renderAnalytics();
      });
    }

    if (els["zscore-threshold-select"]) {
      els["zscore-threshold-select"].addEventListener("change", (e) => {
        state.zThreshold = parseFloat(e.target.value) || 2.0;
        renderAnalytics();
      });
    }

    if (els["forecast-steps-select"]) {
      els["forecast-steps-select"].addEventListener("change", (e) => {
        state.forecastSteps = parseInt(e.target.value, 10) || 10;
        renderAnalytics();
      });
    }

    if (els["sim-threshold-slider"]) {
      els["sim-threshold-slider"].addEventListener("input", (e) => {
        state.simHeadroomPct = parseInt(e.target.value, 10) || 100;
        const source = state.sources.find((s) => s.id === state.selectedSourceId);
        const metric = source && source.metrics
          ? source.metrics.find((m) => m.id === state.selectedMetricId)
          : null;
        updateSimulatorPreview(metric, getFilteredReadings(state.selectedSourceId, state.selectedMetricId));
      });
    }

    if (els["sim-window-slider"]) {
      els["sim-window-slider"].addEventListener("input", (e) => {
        state.simWindowSize = parseInt(e.target.value, 10) || 40;
        const source = state.sources.find((s) => s.id === state.selectedSourceId);
        const metric = source && source.metrics
          ? source.metrics.find((m) => m.id === state.selectedMetricId)
          : null;
        updateSimulatorPreview(metric, getFilteredReadings(state.selectedSourceId, state.selectedMetricId));
      });
    }

    if (els["run-ai-scan-btn"]) {
      els["run-ai-scan-btn"].addEventListener("click", async () => {
        await loadAllData();
        populateSelectors();
        renderAnalytics();
        showToast("Statistical Z-score & regression scan completed.", "success");
      });
    }

    if (els["refresh-analytics-btn"]) {
      els["refresh-analytics-btn"].addEventListener("click", async () => {
        await loadAllData();
        populateSelectors();
        renderAnalytics();
        showToast("Refreshed analytics from IndexedDB.", "success");
      });
    }

    if (els["sync-anomalies-btn"]) {
      els["sync-anomalies-btn"].addEventListener("click", syncOutliersToAlertLog);
    }

    if (els["export-analytics-btn"]) {
      els["export-analytics-btn"].addEventListener("click", exportAnalyticsReport);
    }

    window.addEventListener("resize", () => renderAnalytics());

    [
      "nexusai:source-created",
      "nexusai:source-updated",
      "nexusai:source-deleted",
      "nexusai:reading-added",
      "nexusai:anomaly-created",
      "nexusai:data-changed"
    ].forEach((evt) => {
      window.addEventListener(evt, async () => {
        await loadAllData();
        populateSelectors();
        renderAnalytics();
      });
    });

    bindChartTooltip();
  }

  async function init() {
    cacheElements();
    bindEvents();
    await loadAllData();
    populateSelectors();
    renderAnalytics();
    console.info("NexusAI.AIEngine initialized.");
  }

  NexusAI.AIEngine = {
    init,
    computeDescriptiveStats,
    detectZScoreAnomalies,
    computeLinearRegression,
    computeMetricHealth,
    refresh: async () => {
      await loadAllData();
      populateSelectors();
      renderAnalytics();
    }
  };

  document.addEventListener("DOMContentLoaded", init);
})(window, document);