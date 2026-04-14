'use client';

/**
 * SchematicViewer.jsx
 * ───────────────────
 * Renders Yosys netlist as an SVG schematic diagram.
 * - Pan (click + drag) and zoom (scroll)
 * - Fit-to-view button
 * - Dark theme matching Keller aesthetic
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { GitBranch, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

export default function SchematicViewer({ svgContent }) {
  const containerRef = useRef(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Auto-fit when new SVG arrives
  useEffect(() => {
    if (svgContent) {
      setTransform({ x: 0, y: 0, scale: 1 });
    }
  }, [svgContent]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(t => ({
      ...t,
      scale: Math.max(0.1, Math.min(10, t.scale * delta)),
    }));
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
  }, [transform.x, transform.y]);

  const handleMouseMove = useCallback((e) => {
    if (isPanning) {
      setTransform(t => ({
        ...t,
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      }));
    }
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const fitToView = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
  }, []);

  // Process SVG to apply dark theme
  const themedSvg = svgContent ? applyDarkTheme(svgContent) : null;

  if (!svgContent) {
    return (
      <div className="flex flex-col h-full bg-keller-bg">
        <div className="flex items-center px-3 py-1.5 bg-keller-surface border-b border-keller-border">
          <GitBranch className="w-3.5 h-3.5 text-keller-muted mr-2" />
          <span className="text-xs font-medium text-keller-muted uppercase tracking-wider">
            Schematic
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-keller-dim text-xs italic">
            No schematic data. Run synthesis to generate netlist.
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
          <GitBranch className="w-3.5 h-3.5 text-keller-accent" />
          <span className="text-xs font-medium text-keller-muted uppercase tracking-wider">
            Schematic
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setTransform(t => ({ ...t, scale: Math.min(10, t.scale * 1.3) }))}
            className="p-1 text-keller-dim hover:text-keller-muted transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setTransform(t => ({ ...t, scale: Math.max(0.1, t.scale / 1.3) }))}
            className="p-1 text-keller-dim hover:text-keller-muted transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={fitToView}
            className="p-1 text-keller-dim hover:text-keller-muted transition-colors"
            title="Fit to view"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <span className="text-2xs text-keller-dim ml-1 tabular-nums">
            {Math.round(transform.scale * 100)}%
          </span>
        </div>
      </div>

      {/* SVG Canvas */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: 'top left',
            transition: isPanning ? 'none' : 'transform 0.15s ease-out',
          }}
          className="inline-block p-4"
          dangerouslySetInnerHTML={{ __html: themedSvg }}
        />
      </div>
    </div>
  );
}

/**
 * Apply Keller dark theme to the netlistsvg SVG output.
 * The default SVG has a white background with black lines/text.
 */
function applyDarkTheme(svg) {
  // Inject global styles into the SVG
  const darkStyles = `
    <style>
      svg { background: #0d1117; }
      text { fill: #c9d1d9 !important; font-family: 'JetBrains Mono', monospace !important; font-size: 11px; }
      line, polyline, path { stroke: #58a6ff !important; }
      rect { stroke: #30363d !important; fill: #161b22 !important; }
      .nomark { marker: none; }
      .inputPortBody { fill: #1f6feb !important; stroke: #58a6ff !important; }
      .outputPortBody { fill: #238636 !important; stroke: #3fb950 !important; }
      .cellBody { fill: #161b22 !important; stroke: #58a6ff !important; }
      .wire { stroke: #484f58 !important; }
    </style>
  `;

  // Insert styles after the opening <svg> tag
  return svg.replace(/<svg([^>]*)>/, `<svg$1>${darkStyles}`);
}
