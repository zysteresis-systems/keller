'use client';

/**
 * page.js — Keller Main Application v0.2
 * ───────────────────────────────────────
 * EDA Playground-style layout with:
 * - Monaco Editor (left)
 * - Console + tabbed Waveform/Schematic viewers (right)
 * - Recipe selection and synthesis configuration
 */

import { useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Toolbar from '@/components/Toolbar';
import Console from '@/components/Console';
import { DEFAULT_DESIGN, DEFAULT_TESTBENCH } from '@/lib/defaults';
import { parseVCD } from '@/lib/vcdParser';

const CodeEditor = dynamic(() => import('@/components/CodeEditor'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-keller-bg">
      <span className="text-keller-muted text-sm animate-pulse">Loading editor...</span>
    </div>
  ),
});

const WaveformViewer = dynamic(() => import('@/components/WaveformViewer'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-keller-bg">
      <span className="text-keller-muted text-sm animate-pulse">Loading viewer...</span>
    </div>
  ),
});

const SchematicViewer = dynamic(() => import('@/components/SchematicViewer'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-keller-bg">
      <span className="text-keller-muted text-sm animate-pulse">Loading viewer...</span>
    </div>
  ),
});

export default function KellerApp() {
  // ── State ──
  const [logs, setLogs] = useState([]);
  const [vcdData, setVcdData] = useState(null);
  const [schematicSvg, setSchematicSvg] = useState(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastElapsed, setLastElapsed] = useState(null);
  const [recipe, setRecipe] = useState('standard');
  const [flatten, setFlatten] = useState(false);
  const [pdk, setPdk] = useState('generic');
  const [bottomTab, setBottomTab] = useState('waveform'); // 'waveform' | 'schematic'
  const codeRef = useRef({ design: DEFAULT_DESIGN, testbench: DEFAULT_TESTBENCH });
  const editorRef = useRef(null);

  // ── Log helpers ──
  const addLog = useCallback((text, type = 'default') => {
    setLogs(prev => [...prev, { text, type, timestamp: Date.now() }]);
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  const handleCodeChange = useCallback((files) => {
    codeRef.current = files;
  }, []);

  // ── Reset Code ──
  const handleReset = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.resetToDefaults();
      clearLogs();
      setVcdData(null);
      setSchematicSvg(null);
      setLastElapsed(null);
      addLog('[RESET] Code restored to defaults.', 'system');
    }
  }, [addLog, clearLogs]);

  // ── Run Synthesis ──
  const handleSynthesize = useCallback(async () => {
    setIsSynthesizing(true);
    clearLogs();
    setSchematicSvg(null);

    addLog('╔══════════════════════════════════════════════════╗', 'system');
    addLog('║  KELLER — Yosys WASM Synthesis                  ║', 'system');
    addLog('╚══════════════════════════════════════════════════╝', 'system');
    addLog('', 'default');
    addLog(`[CONFIG] Recipe: ${recipe} | PDK: ${pdk} | Flatten: ${flatten}`, 'info');
    addLog('[INFO] Loading Yosys WASM runtime...', 'dim');
    addLog('', 'default');

    try {
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          design: codeRef.current.design,
          mode: 'synthesis',
          recipe,
          flatten,
          pdk,
        }),
      });

      const result = await response.json();
      setLastElapsed(result.elapsedMs);

      if (result.success) {
        addLog(`[SYNTHESIS] Completed in ${result.elapsedMs}ms (${result.recipe || recipe})`, 'success');
        addLog('', 'default');

        // Parse and display synthesis log
        if (result.log) {
          const lines = result.log.split('\n');
          let inStatBlock = false;

          for (const line of lines) {
            if (line.includes('Printing statistics') || line.startsWith('=== ')) {
              inStatBlock = true;
            }
            if (inStatBlock) {
              if (line.includes('cells') || line.includes('wires') ||
                  line.includes('ports') || line.includes('submodules')) {
                addLog(line, 'info');
              } else if (line.startsWith('===')) {
                addLog(line, 'success');
              } else if (line.includes('Yosys ') || line.includes('Time spent')) {
                addLog(line, 'dim');
              } else {
                addLog(line, 'default');
              }
            }
          }
        }

        // Handle schematic
        if (result.schematicSvg) {
          setSchematicSvg(result.schematicSvg);
          setBottomTab('schematic');
          addLog('', 'default');
          addLog('[SCHEMATIC] Netlist SVG generated successfully', 'success');
        } else if (result.netlistJson) {
          addLog('[SCHEMATIC] Netlist JSON available, SVG render pending', 'dim');
        }
      } else {
        addLog('[SYNTHESIS FAILED]', 'error');
        if (result.log) {
          result.log.split('\n').forEach(line => addLog(line, 'error'));
        }
      }
    } catch (error) {
      addLog(`[NETWORK ERROR] ${error.message}`, 'error');
    } finally {
      setIsSynthesizing(false);
    }
  }, [addLog, clearLogs, recipe, flatten, pdk]);

  // ── Run Simulation ──
  const handleSimulate = useCallback(async () => {
    setIsSimulating(true);
    clearLogs();
    setVcdData(null);

    addLog('╔══════════════════════════════════════════════════╗', 'system');
    addLog('║  KELLER — Icarus Verilog Simulation             ║', 'system');
    addLog('╚══════════════════════════════════════════════════╝', 'system');
    addLog('', 'default');
    addLog('[INFO] Compiling design + testbench with iverilog...', 'info');
    addLog('', 'default');

    try {
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          design: codeRef.current.design,
          testbench: codeRef.current.testbench,
          mode: 'simulate',
        }),
      });

      const result = await response.json();
      setLastElapsed(result.elapsedMs);

      if (result.success) {
        addLog(`[SIMULATION] Completed successfully in ${result.elapsedMs}ms`, 'success');
        addLog('', 'default');

        if (result.log) {
          result.log.split('\n').forEach(line => {
            if (line.includes('ERROR') || line.includes('Error')) {
              addLog(line, 'error');
            } else if (line.startsWith('[COMPILE]') || line.startsWith('[SIMULATE]') || line.startsWith('[VCD]')) {
              addLog(line, 'info');
            } else if (line.includes('$finish') || line.includes('Complete') || line.includes('Done')) {
              addLog(line, 'success');
            } else if (line.trim()) {
              addLog(line, 'default');
            }
          });
        }

        if (result.vcd) {
          try {
            const parsed = parseVCD(result.vcd);
            setVcdData(parsed);
            setBottomTab('waveform');
            addLog('', 'default');
            addLog(`[WAVEFORM] Parsed ${parsed.signals.length} signals, end time: ${parsed.endTime}`, 'success');
          } catch (e) {
            addLog(`[WAVEFORM] VCD parse error: ${e.message}`, 'warning');
          }
        }
      } else {
        addLog('[SIMULATION FAILED]', 'error');
        if (result.log) {
          result.log.split('\n').forEach(line => {
            if (line.trim()) addLog(line, line.includes('Install') || line.includes('Option') ? 'info' : 'error');
          });
        }
      }
    } catch (error) {
      addLog(`[NETWORK ERROR] ${error.message}`, 'error');
    } finally {
      setIsSimulating(false);
    }
  }, [addLog, clearLogs]);

  // ── Render ──
  return (
    <div className="h-screen flex flex-col bg-keller-bg">
      <Toolbar
        onSynthesize={handleSynthesize}
        onSimulate={handleSimulate}
        onReset={handleReset}
        recipe={recipe}
        onRecipeChange={setRecipe}
        pdk={pdk}
        onPdkChange={setPdk}
        flatten={flatten}
        onFlattenChange={setFlatten}
        isSynthesizing={isSynthesizing}
        isSimulating={isSimulating}
        lastElapsed={lastElapsed}
      />

      <div className="flex-1 flex min-h-0">
        {/* Left pane: Code Editor */}
        <div className="w-1/2 min-w-0 pane-border-right">
          <CodeEditor
            ref={editorRef}
            defaultDesign={DEFAULT_DESIGN}
            defaultTestbench={DEFAULT_TESTBENCH}
            onCodeChange={handleCodeChange}
          />
        </div>

        {/* Right pane: Console + Viewer tabs */}
        <div className="w-1/2 min-w-0 flex flex-col">
          {/* Console (top half) */}
          <div className="flex-1 min-h-0 pane-border-bottom">
            <Console
              logs={logs}
              isLoading={isSynthesizing || isSimulating}
            />
          </div>

          {/* Bottom tab bar + viewer */}
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Tab headers */}
            <div className="flex items-center bg-keller-surface border-b border-keller-border px-1">
              <button
                onClick={() => setBottomTab('waveform')}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-[1px] transition-colors
                  ${bottomTab === 'waveform'
                    ? 'text-keller-text border-keller-accent'
                    : 'text-keller-muted border-transparent hover:text-keller-text'
                  }`}
              >
                Waveform
                {vcdData && (
                  <span className="ml-1.5 text-2xs text-keller-dim">
                    ({vcdData.signals.length})
                  </span>
                )}
              </button>
              <button
                onClick={() => setBottomTab('schematic')}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-[1px] transition-colors
                  ${bottomTab === 'schematic'
                    ? 'text-keller-text border-keller-accent'
                    : 'text-keller-muted border-transparent hover:text-keller-text'
                  }`}
              >
                Schematic
                {schematicSvg && (
                  <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-keller-success inline-block" />
                )}
              </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0">
              {bottomTab === 'waveform' ? (
                <WaveformViewer vcdData={vcdData} />
              ) : (
                <SchematicViewer svgContent={schematicSvg} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-between px-4 py-1 bg-keller-surface border-t border-keller-border">
        <span className="text-2xs text-keller-dim font-sans" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
          Keller v0.2 — Browser-Native RTL Compiler
        </span>
        <span className="text-2xs text-keller-dim font-sans" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
          Built by <span className="text-keller-muted">Yashvardhan Singh</span>
        </span>
      </footer>
    </div>
  );
}
