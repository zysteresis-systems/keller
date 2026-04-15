'use client';

/**
 * Toolbar.jsx
 * ───────────
 * Top header bar with project branding and action buttons.
 * - Recipe selector dropdown
 * - Flatten toggle
 * - "Run Synthesis" / "Run Simulation" buttons
 * - "Reset Code" button
 */

import { Cpu, Play, FlaskConical, Loader2, Clock, RotateCcw, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

const RECIPE_OPTIONS = [
  { id: 'quick', label: 'Quick', desc: '~5 passes, fast iteration' },
  { id: 'standard', label: 'Standard', desc: 'Balanced, ~20 passes' },
  { id: 'aggressive', label: 'Aggressive', desc: 'Full flatten + resynthesis' },
  { id: 'area', label: 'Area Min', desc: 'Minimize gate count' },
];

const PDK_OPTIONS = [
  { id: 'generic', label: 'Generic', desc: 'ABC built-in gates' },
  { id: 'sky130_hd', label: 'SKY130 HD', desc: '130nm High Density' },
];

const SIMULATOR_OPTIONS = [
  { id: 'iverilog', label: 'Icarus', desc: 'iverilog + vvp (with -g2012)' },
  { id: 'verilator', label: 'Verilator', desc: 'Fast C++ simulator (--sv enabled)' },
];

export default function Toolbar({
  onSynthesize,
  onSimulate,
  onReset,
  recipe,
  onRecipeChange,
  customSequence,
  onCustomSequenceChange,
  pdk,
  onPdkChange,
  simulator,
  onSimulatorChange,
  flatten,
  onFlattenChange,
  isSynthesizing,
  isSimulating,
  lastElapsed,
}) {
  const isLoading = isSynthesizing || isSimulating;
  const [showRecipeDropdown, setShowRecipeDropdown] = useState(false);
  const [showPdkDropdown, setShowPdkDropdown] = useState(false);
  const [showSimulatorDropdown, setShowSimulatorDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const pdkDropdownRef = useRef(null);
  const simulatorDropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowRecipeDropdown(false);
      }
      if (pdkDropdownRef.current && !pdkDropdownRef.current.contains(e.target)) {
        setShowPdkDropdown(false);
      }
      if (simulatorDropdownRef.current && !simulatorDropdownRef.current.contains(e.target)) {
        setShowSimulatorDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const currentRecipe = RECIPE_OPTIONS.find(r => r.id === recipe) || RECIPE_OPTIONS[1];
  const currentPdk = PDK_OPTIONS.find(p => p.id === pdk) || PDK_OPTIONS[0];
  const currentSimulator = SIMULATOR_OPTIONS.find(s => s.id === simulator) || SIMULATOR_OPTIONS[0];

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-keller-surface border-b border-keller-border">
      {/* Left: Branding */}
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded border border-keller-accent/30 bg-keller-accent/10 flex items-center justify-center">
          <Cpu className="w-4 h-4 text-keller-accent" />
        </div>
        <div>
          <h1
            className="text-sm font-bold tracking-tight text-keller-text leading-none"
            style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}
          >
            KELLER
          </h1>
          <p
            className="text-2xs text-keller-dim leading-none mt-0.5"
            style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}
          >
            by <a href="https://www.linkedin.com/in/yvs373/" target="_blank" rel="noopener noreferrer" className="hover:text-keller-accent transition-colors">Yashvardhan Singh</a>
          </p>
        </div>
      </div>

      {/* Center: Recipe selector + flatten + status */}
      <div className="hidden sm:flex items-center gap-3">
        {/* Recipe dropdown */}
        <div className="flex items-center gap-2">
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setShowRecipeDropdown(!showRecipeDropdown)}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs
                         text-keller-muted border border-keller-border
                         hover:text-keller-text hover:border-keller-dim
                         transition-colors disabled:opacity-40"
            >
              <span className="text-keller-dim">Recipe:</span>
              <span className="font-medium">{currentRecipe?.label || 'Custom'}</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {showRecipeDropdown && (
              <div className="absolute top-full mt-1 left-0 z-50 w-56 py-1
                              bg-keller-surface border border-keller-border rounded-md shadow-xl">
                {RECIPE_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => { onRecipeChange(opt.id); setShowRecipeDropdown(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors
                      ${opt.id === recipe
                        ? 'text-keller-accent bg-keller-accent/10'
                        : 'text-keller-muted hover:text-keller-text hover:bg-keller-hover'
                      }`}
                  >
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-2xs text-keller-dim mt-0.5">{opt.desc}</div>
                  </button>
                ))}
                <button
                  onClick={() => { onRecipeChange('custom'); setShowRecipeDropdown(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors border-t border-keller-border
                    ${recipe === 'custom'
                      ? 'text-keller-accent bg-keller-accent/10'
                      : 'text-keller-muted hover:text-keller-text hover:bg-keller-hover'
                    }`}
                >
                  <div className="font-medium">Custom (OpenABC-D)</div>
                  <div className="text-2xs text-keller-dim mt-0.5">Use a 20-number sequence</div>
                </button>
              </div>
            )}
          </div>

          {/* Custom Sequence Input */}
          {recipe === 'custom' && (
            <input
              type="text"
              value={customSequence}
              onChange={(e) => onCustomSequenceChange(e.target.value)}
              placeholder="e.g. 5, 3, 0, ..."
              disabled={isLoading}
              className="px-2 py-1 bg-keller-bg border border-keller-border rounded text-xs text-keller-text w-32 focus:outline-none focus:border-keller-accent transition-colors"
            />
          )}
        </div>

        {/* PDK dropdown */}
        <div ref={pdkDropdownRef} className="relative">
          <button
            onClick={() => setShowPdkDropdown(!showPdkDropdown)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs
                       text-keller-muted border border-keller-border
                       hover:text-keller-text hover:border-keller-dim
                       transition-colors disabled:opacity-40"
          >
            <span className="text-keller-dim">PDK:</span>
            <span className={`font-medium ${currentPdk.id !== 'generic' ? 'text-keller-success' : ''}`}>
              {currentPdk.label}
            </span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {showPdkDropdown && (
            <div className="absolute top-full mt-1 left-0 z-50 w-52 py-1
                            bg-keller-surface border border-keller-border rounded-md shadow-xl">
              {PDK_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => { onPdkChange(opt.id); setShowPdkDropdown(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors
                    ${opt.id === pdk
                      ? 'text-keller-accent bg-keller-accent/10'
                      : 'text-keller-muted hover:text-keller-text hover:bg-keller-hover'
                    }`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-2xs text-keller-dim mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Simulator dropdown */}
        <div ref={simulatorDropdownRef} className="relative">
          <button
            onClick={() => setShowSimulatorDropdown(!showSimulatorDropdown)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs
                       text-keller-muted border border-keller-border
                       hover:text-keller-text hover:border-keller-dim
                       transition-colors disabled:opacity-40"
          >
            <span className="text-keller-dim">Sim:</span>
            <span className="font-medium">{currentSimulator.label}</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {showSimulatorDropdown && (
            <div className="absolute top-full mt-1 left-0 z-50 w-64 py-1
                            bg-keller-surface border border-keller-border rounded-md shadow-xl">
              {SIMULATOR_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => { onSimulatorChange(opt.id); setShowSimulatorDropdown(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors
                    ${opt.id === simulator
                      ? 'text-keller-accent bg-keller-accent/10'
                      : 'text-keller-muted hover:text-keller-text hover:bg-keller-hover'
                    }`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-2xs text-keller-dim mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Flatten toggle */}
        <label className="flex items-center gap-1.5 text-xs text-keller-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={flatten}
            onChange={(e) => onFlattenChange(e.target.checked)}
            disabled={isLoading}
            className="w-3 h-3 rounded border-keller-border bg-keller-bg
                       accent-keller-accent cursor-pointer"
          />
          <span>Flatten</span>
        </label>

        {/* Elapsed time */}
        {lastElapsed != null && (
          <div className="flex items-center gap-1.5 text-2xs text-keller-dim">
            <Clock className="w-3 h-3" />
            <span>{lastElapsed}ms</span>
          </div>
        )}
      </div>

      {/* Right: Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={onReset}
          disabled={isLoading}
          className="px-2.5 py-1.5 rounded text-xs font-medium transition-all duration-150
                     text-keller-dim border border-keller-border
                     hover:text-keller-muted hover:border-keller-dim
                     active:scale-[0.97] disabled:opacity-40"
          id="btn-reset"
          title="Reset code to defaults"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onSynthesize}
          disabled={isLoading}
          className="btn-primary flex items-center gap-1.5"
          id="btn-synthesize"
        >
          {isSynthesizing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FlaskConical className="w-3.5 h-3.5" />
          )}
          <span>{isSynthesizing ? 'Synthesizing...' : 'Run Synthesis'}</span>
        </button>

        <button
          onClick={onSimulate}
          disabled={isLoading}
          className="btn-success flex items-center gap-1.5"
          id="btn-simulate"
        >
          {isSimulating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          <span>{isSimulating ? 'Simulating...' : 'Run Simulation'}</span>
        </button>
      </div>
    </header>
  );
}
