'use client';

/**
 * Console.jsx
 * ───────────
 * Terminal-style log viewer for synthesis and simulation output.
 * - Color-coded lines: errors (red), warnings (yellow), info (cyan), success (green)
 * - Auto-scroll to bottom on new output
 * - Copy-to-clipboard
 * - Clear button
 */

import { useEffect, useRef, useState } from 'react';
import { Terminal, Copy, Trash2, Check, Sparkles, X } from 'lucide-react';

export default function Console({ logs, isLoading }) {
  const containerRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightData, setInsightData] = useState(null);

  // Auto-scroll to bottom when logs change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCopy = async () => {
    const text = logs.map(l => l.text).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInsight = async () => {
    if (logs.length === 0) return;
    const text = logs.map(l => l.text).join('\n');
    
    setInsightLoading(true);
    setInsightData(null);
    try {
      const res = await fetch('/api/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log: text })
      });
      const data = await res.json();
      if (data.success) {
        setInsightData(data.insight);
      } else {
        setInsightData(`❌ Error: ${data.error}`);
      }
    } catch (err) {
      setInsightData(`❌ Network error: ${err.message}`);
    } finally {
      setInsightLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-keller-bg relative">
      {/* Console header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-keller-surface border-b border-keller-border">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-keller-muted" />
          <span className="text-xs font-medium text-keller-muted uppercase tracking-wider">
            Console
          </span>
          {isLoading && (
            <span className="ml-2 text-2xs text-keller-accent animate-pulse">
              ● Processing...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {logs.length > 0 && (
            <button
              onClick={handleInsight}
              disabled={insightLoading}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium text-keller-accent border border-keller-accent/30 hover:bg-keller-accent/10 transition-colors disabled:opacity-50"
              title="Explain log with AI"
            >
              {insightLoading ? (
                <span className="animate-pulse">Thinking...</span>
              ) : (
                <>
                  <Sparkles className="w-3 h-3" />
                  AI Insights
                </>
              )}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="p-1 text-keller-dim hover:text-keller-muted transition-colors rounded"
            title="Copy output"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-keller-success" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* AI Insight Overlay */}
      {insightData && (
        <div className="absolute top-10 left-3 right-3 z-10 bg-keller-surface border border-keller-accent/30 rounded-md shadow-2xl p-4 max-h-[60%] overflow-y-auto">
          <div className="flex items-center justify-between mb-3 border-b border-keller-border pb-2">
            <div className="flex items-center gap-2 text-keller-accent font-medium text-sm">
              <Sparkles className="w-4 h-4" />
              AI Log Explanation
            </div>
            <button onClick={() => setInsightData(null)} className="text-keller-dim hover:text-keller-text">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="text-sm text-keller-text leading-relaxed font-sans whitespace-pre-wrap">
            {insightData}
          </div>
        </div>
      )}

      {/* Console body */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-3 font-mono text-xs leading-5"
      >
        {logs.length === 0 ? (
          <div className="text-keller-dim italic">
            {isLoading
              ? 'Waiting for output...'
              : 'Click "Run Synthesis" or "Run Simulation" to begin.'}
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className={`whitespace-pre-wrap break-all ${getLogColor(log.type)}`}>
              {log.text}
            </div>
          ))
        )}

        {/* Blinking cursor at the end */}
        {isLoading && (
          <span className="inline-block w-2 h-4 bg-keller-accent/70 animate-pulse ml-0.5" />
        )}
      </div>
    </div>
  );
}

function getLogColor(type) {
  switch (type) {
    case 'error':   return 'text-keller-error';
    case 'warning': return 'text-keller-warning';
    case 'success': return 'text-keller-success';
    case 'info':    return 'text-keller-info';
    case 'system':  return 'text-keller-accent';
    case 'dim':     return 'text-keller-dim';
    default:        return 'text-keller-text';
  }
}
