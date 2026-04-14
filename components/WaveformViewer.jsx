'use client';

/**
 * WaveformViewer.jsx
 * ──────────────────
 * Canvas-based VCD waveform renderer.
 * - Renders parsed VCD signals as digital waveforms and bus traces
 * - Vertical scrolling for many signals
 * - Horizontal zoom and scroll
 * - Signal labels with scope hierarchy
 * - Crisp rendering via device pixel ratio
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { Activity, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

const SIGNAL_HEIGHT = 28;
const LABEL_WIDTH = 150;
const TIME_AXIS_HEIGHT = 24;
const COLORS = {
  bg: '#0d1117',
  gridLine: '#30363d30',
  label: '#8b949e',
  labelBg: '#161b22',
  signal0: '#484f58',
  signal1: '#3fb950',
  signalBus: '#58a6ff',
  signalX: '#f85149',
  timeText: '#6e7681',
  divider: '#21262d',
  scopeLabel: '#ffa657',
};

export default function WaveformViewer({ vcdData }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !vcdData || !vcdData.signals.length) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const waveWidth = width - LABEL_WIDTH;
    const endTime = vcdData.endTime || 100;
    const timeScale = (waveWidth * zoom) / endTime;
    const totalSignalHeight = vcdData.signals.length * SIGNAL_HEIGHT;

    // ── Clear ──
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    // ── Draw signals (clipped to below time axis) ──
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, TIME_AXIS_HEIGHT, width, height - TIME_AXIS_HEIGHT);
    ctx.clip();

    // Label column background
    ctx.fillStyle = COLORS.labelBg;
    ctx.fillRect(0, TIME_AXIS_HEIGHT, LABEL_WIDTH, height);

    // Each signal row
    vcdData.signals.forEach((signal, idx) => {
      const y = TIME_AXIS_HEIGHT + idx * SIGNAL_HEIGHT - scrollY;

      // Skip signals outside viewport
      if (y + SIGNAL_HEIGHT < TIME_AXIS_HEIGHT || y > height) return;

      const baseY = y + SIGNAL_HEIGHT * 0.75;
      const topY = y + SIGNAL_HEIGHT * 0.2;

      // Row divider
      ctx.strokeStyle = COLORS.divider;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y + SIGNAL_HEIGHT);
      ctx.lineTo(width, y + SIGNAL_HEIGHT);
      ctx.stroke();

      // Signal label
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.label;
      const displayName = signal.width > 1
        ? `${signal.name}[${signal.width - 1}:0]`
        : signal.name;
      ctx.fillText(displayName, 6, baseY - 3, LABEL_WIDTH - 12);

      // Draw waveform in the wave area
      ctx.save();
      ctx.beginPath();
      ctx.rect(LABEL_WIDTH, y, waveWidth + 10, SIGNAL_HEIGHT);
      ctx.clip();

      ctx.lineWidth = 1.5;
      if (signal.width === 1) {
        drawDigitalSignal(ctx, signal, LABEL_WIDTH, topY, baseY, timeScale, scrollX, width);
      } else {
        drawBusSignal(ctx, signal, LABEL_WIDTH, topY, baseY, timeScale, scrollX, width);
      }
      ctx.restore();
    });

    ctx.restore();

    // ── Draw label/wave divider (always on top) ──
    ctx.strokeStyle = COLORS.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LABEL_WIDTH, 0);
    ctx.lineTo(LABEL_WIDTH, height);
    ctx.stroke();

    // ── Draw time axis (always on top, not scrolled vertically) ──
    ctx.fillStyle = COLORS.labelBg;
    ctx.fillRect(0, 0, width, TIME_AXIS_HEIGHT);
    ctx.strokeStyle = COLORS.divider;
    ctx.beginPath();
    ctx.moveTo(0, TIME_AXIS_HEIGHT);
    ctx.lineTo(width, TIME_AXIS_HEIGHT);
    ctx.stroke();

    // Time markers
    const timeStep = calculateTimeStep(endTime, waveWidth * zoom);
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.timeText;
    ctx.textAlign = 'center';

    for (let t = 0; t <= endTime; t += timeStep) {
      const x = LABEL_WIDTH + (t * timeScale) - scrollX;
      if (x >= LABEL_WIDTH - 10 && x <= width + 10) {
        // Format time nicely
        const label = formatTime(t, vcdData.timescale);
        ctx.fillText(label, x, 15);

        // Grid line through the signal area
        ctx.strokeStyle = COLORS.gridLine;
        ctx.beginPath();
        ctx.moveTo(x, TIME_AXIS_HEIGHT);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }

    // Timescale in top-left corner
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.timeText;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText(vcdData.timescale || '', 4, 10);

    // ── Vertical scrollbar indicator ──
    if (totalSignalHeight > height - TIME_AXIS_HEIGHT) {
      const viewportRatio = (height - TIME_AXIS_HEIGHT) / totalSignalHeight;
      const scrollRatio = scrollY / (totalSignalHeight - (height - TIME_AXIS_HEIGHT));
      const barHeight = Math.max(20, viewportRatio * (height - TIME_AXIS_HEIGHT));
      const barY = TIME_AXIS_HEIGHT + scrollRatio * (height - TIME_AXIS_HEIGHT - barHeight);

      ctx.fillStyle = '#30363d60';
      ctx.fillRect(width - 4, barY, 3, barHeight);
    }
  }, [vcdData, zoom, scrollX, scrollY]);

  // Redraw on resize, data change, zoom, or scroll
  useEffect(() => {
    draw();
    const observer = new ResizeObserver(() => draw());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [draw]);

  // Handle mouse wheel
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    if (!vcdData) return;

    const containerHeight = containerRef.current?.getBoundingClientRect().height || 400;
    const totalHeight = vcdData.signals.length * SIGNAL_HEIGHT;
    const maxScrollY = Math.max(0, totalHeight - (containerHeight - TIME_AXIS_HEIGHT));

    if (e.ctrlKey || e.metaKey) {
      // Zoom horizontally
      const delta = e.deltaY > 0 ? 0.85 : 1.18;
      setZoom(z => Math.max(0.1, Math.min(50, z * delta)));
    } else if (e.shiftKey) {
      // Horizontal scroll
      setScrollX(x => Math.max(0, x + e.deltaY * 2));
    } else {
      // Vertical scroll
      setScrollY(y => Math.max(0, Math.min(maxScrollY, y + e.deltaY)));
    }
  }, [vcdData]);

  if (!vcdData || !vcdData.signals || vcdData.signals.length === 0) {
    return (
      <div className="flex flex-col h-full bg-keller-bg">
        <div className="flex items-center px-3 py-1.5 bg-keller-surface border-b border-keller-border">
          <Activity className="w-3.5 h-3.5 text-keller-muted mr-2" />
          <span className="text-xs font-medium text-keller-muted uppercase tracking-wider">
            Waveform
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-keller-dim text-xs italic">
            No waveform data. Run simulation to generate VCD.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-keller-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1 bg-keller-surface border-b border-keller-border">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-keller-muted" />
          <span className="text-xs font-medium text-keller-muted uppercase tracking-wider">
            Waveform
          </span>
          <span className="text-2xs text-keller-dim ml-1">
            {vcdData.signals.length} sig · {formatTime(vcdData.endTime, vcdData.timescale)}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setZoom(z => Math.min(50, z * 1.4))}
            className="p-1 text-keller-dim hover:text-keller-muted transition-colors"
            title="Zoom in (Ctrl+Scroll)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom(z => Math.max(0.1, z / 1.4))}
            className="p-1 text-keller-dim hover:text-keller-muted transition-colors"
            title="Zoom out (Ctrl+Scroll)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { setZoom(1); setScrollX(0); setScrollY(0); }}
            className="p-1 text-keller-dim hover:text-keller-muted transition-colors"
            title="Reset view"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 cursor-crosshair"
        onWheel={handleWheel}
      >
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>
    </div>
  );
}

// ── Drawing helpers ──

function drawDigitalSignal(ctx, signal, offsetX, topY, baseY, timeScale, scrollX, viewWidth) {
  const changes = signal.changes;
  if (!changes.length) return;

  // Draw each segment separately with correct color
  let lastVal = changes[0].value;

  for (let i = 0; i < changes.length; i++) {
    const x = offsetX + (changes[i].time * timeScale) - scrollX;
    const nextI = i + 1;
    const nextX = nextI < changes.length
      ? offsetX + (changes[nextI].time * timeScale) - scrollX
      : viewWidth;
    const val = changes[i].value;

    if (nextX < offsetX - 20) { lastVal = val; continue; }
    if (x > viewWidth + 20) break;

    const yVal = val === '1' ? topY : baseY;
    const prevY = lastVal === '1' ? topY : baseY;

    ctx.strokeStyle = val === '1' ? COLORS.signal1
      : (val === 'x' || val === 'X') ? COLORS.signalX
      : COLORS.signal0;

    ctx.beginPath();

    // Vertical transition from previous value
    if (i > 0 && prevY !== yVal) {
      ctx.moveTo(x, prevY);
      ctx.lineTo(x, yVal);
    } else {
      ctx.moveTo(Math.max(offsetX, x), yVal);
    }

    // Horizontal line to next transition
    ctx.lineTo(Math.min(nextX, viewWidth), yVal);
    ctx.stroke();

    lastVal = val;
  }
}

function drawBusSignal(ctx, signal, offsetX, topY, baseY, timeScale, scrollX, viewWidth) {
  const changes = signal.changes;
  if (!changes.length) return;

  const midY = (topY + baseY) / 2;

  for (let i = 0; i < changes.length; i++) {
    const x = offsetX + (changes[i].time * timeScale) - scrollX;
    const nextTime = i + 1 < changes.length
      ? changes[i + 1].time
      : (changes[changes.length - 1]?.time || 0) * 1.2 + 10;
    const nextX = offsetX + (nextTime * timeScale) - scrollX;
    const val = changes[i].value;

    if (nextX < offsetX) continue;
    if (x > viewWidth + 50) break;

    const drawX = Math.max(offsetX, x);
    const drawNextX = Math.min(viewWidth, nextX);
    const segWidth = drawNextX - drawX;
    if (segWidth < 2) continue;

    const isX = val.includes('x') || val.includes('X');
    ctx.fillStyle = isX ? COLORS.signalX + '18' : COLORS.signalBus + '12';
    ctx.strokeStyle = isX ? COLORS.signalX : COLORS.signalBus;
    ctx.lineWidth = 1;

    // Diamond-ended bus box
    const diam = Math.min(3, segWidth / 4);
    ctx.beginPath();
    ctx.moveTo(drawX + diam, topY);
    ctx.lineTo(drawNextX - diam, topY);
    ctx.lineTo(drawNextX, midY);
    ctx.lineTo(drawNextX - diam, baseY);
    ctx.lineTo(drawX + diam, baseY);
    ctx.lineTo(drawX, midY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Value label
    if (segWidth > 18) {
      const hexVal = busValueToHex(val, signal.width);
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillStyle = isX ? COLORS.signalX : COLORS.signalBus;
      ctx.textAlign = 'center';
      ctx.fillText(hexVal, (drawX + drawNextX) / 2, midY + 3, segWidth - 8);
    }
  }
}

function busValueToHex(binStr, width) {
  const padded = binStr.padStart(width, '0');
  if (padded.includes('x') || padded.includes('X')) return 'x';
  if (padded.includes('z') || padded.includes('Z')) return 'z';
  const decimal = parseInt(padded, 2);
  return isNaN(decimal) ? binStr : `0x${decimal.toString(16).toUpperCase()}`;
}

function calculateTimeStep(endTime, viewWidth) {
  const idealSteps = viewWidth / 70;
  const rawStep = endTime / Math.max(1, idealSteps);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  let step;
  if (normalized <= 1) step = 1;
  else if (normalized <= 2) step = 2;
  else if (normalized <= 5) step = 5;
  else step = 10;
  return Math.max(1, step * magnitude);
}

function formatTime(time, timescale) {
  if (!timescale) return `${time}`;
  // Extract unit from timescale like "1ps", "1ns"
  const unitMatch = timescale.match(/\d+\s*([a-z]+)/i);
  const unit = unitMatch ? unitMatch[1] : '';

  if (time >= 1e6) return `${(time / 1e6).toFixed(1)}M${unit}`;
  if (time >= 1e3) return `${(time / 1e3).toFixed(1)}k${unit}`;
  return `${time}${unit}`;
}
