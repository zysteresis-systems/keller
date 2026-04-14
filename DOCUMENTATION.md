# KELLER v0.1 — Documentation

**Browser-Native RTL Compiler**
Built by Yashvardhan Singh | Project Keller

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [How Each Piece Works](#2-how-each-piece-works)
3. [File Structure](#3-file-structure)
4. [Running Locally](#4-running-locally)
5. [Adding Simulation (iverilog)](#5-adding-simulation-iverilog)
6. [Technical Decisions & Tradeoffs](#6-technical-decisions--tradeoffs)

---

## 1. Architecture Overview

Keller v0.1 is a fully browser-based RTL compiler with a split-pane EDA Playground layout:

```
┌──────────────────────────────────────────────────────────────┐
│  KELLER                        [Run Synthesis] [Run Sim]     │
├────────────────────────┬─────────────────────────────────────┤
│                        │  ┌── Console ──────────────────┐    │
│  Monaco Editor         │  │  Yosys synthesis log         │    │
│  [design.v] [tb.v]     │  │  Cell counts, wire stats     │    │
│                        │  │  Error messages              │    │
│  Verilog code editing  │  └──────────────────────────────┘    │
│  with syntax highlight │  ┌── Waveform Viewer ──────────┐    │
│                        │  │  VCD signal rendering        │    │
│                        │  │  Zoom, pan, signal labels    │    │
│                        │  └──────────────────────────────┘    │
└────────────────────────┴─────────────────────────────────────┘
```

**Data flow:**

```
User writes Verilog → clicks "Run Synthesis" → 
  → Frontend sends POST to /api/compile (mode: "synthesis")
  → API route loads @yowasp/yosys (WASM in Node.js)
  → Yosys synthesizes the Verilog → produces stats log
  → Log returned to frontend → displayed in Console

User clicks "Run Simulation" →
  → Frontend sends POST to /api/compile (mode: "simulate")
  → API route calls system iverilog + vvp
  → Simulation produces $display output + VCD waveform
  → Log + VCD returned → Console shows log, WaveformViewer renders VCD
```

---

## 2. How Each Piece Works

### 2.1 Synthesis — `@yowasp/yosys` (WASM)

**What it is:** [YoWASP](https://github.com/YoWASP) provides WebAssembly builds of Yosys (the Yosys Open SYnthesis Suite). The npm package `@yowasp/yosys` bundles a ~50MB WASM binary that runs Yosys entirely inside Node.js — no native compilation, no system install.

**How we use it:**

```javascript
// In /api/compile/route.js
const { runYosys } = await import('@yowasp/yosys');

await runYosys(
  ['-p', 'read_verilog design.v; synth; stat'],
  { 'design.v': verilogCode }
);
```

- `runYosys(args, virtualFiles)` takes command-line arguments and a virtual filesystem
- Yosys reads `design.v` from the virtual FS, synthesizes it, and prints statistics
- We capture the output by monkey-patching `process.stdout.write` and `process.stderr.write`

**Why monkey-patching?** The `@yowasp/yosys` package writes directly to `process.stdout/stderr` rather than using the callback-based API that its documentation hints at. This is a quirk of how the WASI runtime interfaces with Node.js stdio. The monkey-patch approach intercepts these writes, captures them into a string, and then restores the original writers.

**First-run behavior:** On the very first synthesis, the WASM binary (~50MB) is downloaded from CDN and cached locally. Subsequent runs are instant (~200ms for simple designs).

### 2.2 Simulation — Icarus Verilog (System Install)

**What it is:** Icarus Verilog (`iverilog`) is an open-source Verilog simulator. Unlike Yosys, there is no `@yowasp/iverilog` npm package — we checked and confirmed it does not exist on npm.

**How we use it:**

```javascript
// In /api/compile/route.js
execSync('iverilog -o sim.vvp design.v tb.v', { cwd: tmpDir });
execSync('vvp sim.vvp', { cwd: tmpDir });
// Read the generated waveform.vcd
```

- `iverilog` compiles Verilog + testbench into a VVP simulation executable
- `vvp` runs the simulation, executing `$display`, `$dumpvars`, etc.
- The resulting `waveform.vcd` file is read and sent back to the frontend

**Why not WASM?** We verified that `@yowasp/iverilog` does not exist on npm. There is no maintained WASM build of Icarus Verilog. The alternatives (DigitalJS for gate-level sim, custom JS simulators) cannot handle standard Verilog testbenches with `$display`, timing, and VCD dump.

### 2.3 Monaco Editor — Code Editing

**What it is:** Monaco Editor is the code editor that powers VS Code. We use `@monaco-editor/react` to embed it.

**Key customizations:**

1. **Custom theme (`keller-dark`):** Background `#0d1117`, cursor `#58a6ff`, matching Keller's dark palette
2. **Verilog syntax highlighting:** Custom Monarch tokenizer covering:
   - Keywords (`module`, `wire`, `reg`, `assign`, `always`, etc.)
   - System tasks (`$display`, `$dumpvars`, `$finish`)
   - Compiler directives (`` `timescale``, `` `define``)
   - Number literals with bit-width (`4'b0011`, `8'hFF`)
   - Comments (single-line `//` and multi-line `/* */`)
3. **Two tabs:** `design.v` (RTL design) and `tb.v` (testbench)
4. **localStorage persistence:** Code survives browser refresh. Stored as `keller_code_design` and `keller_code_testbench`

### 2.4 Console — Log Display

**What it is:** A terminal-style output panel that displays synthesis and simulation logs.

**Color coding:**
- 🔴 Red (`text-keller-error`): Errors, compilation failures
- 🟡 Yellow (`text-keller-warning`): Warnings
- 🔵 Cyan (`text-keller-info`): Statistics, cell counts, wire counts
- 🟢 Green (`text-keller-success`): Success messages, module headers (`===`)
- ⬜ Gray (`text-keller-dim`): Verbose log lines, timestamps

**Features:** Auto-scroll to bottom, copy-to-clipboard, blinking cursor during processing.

### 2.5 Waveform Viewer — VCD Rendering

**What it is:** A custom canvas-based renderer for IEEE 1364 VCD (Value Change Dump) files.

**How VCD parsing works:**

```
Phase 1: Parse header
  - Extract $timescale, $scope, $var definitions
  - Build signal map: { id → { name, width, scope, changes[] } }

Phase 2: Parse value changes
  - Track current time via #<timestamp> lines
  - Record value changes for each signal ID
  - Handle single-bit (0/1/x/z) and multi-bit (b0011) formats

Phase 3: Render
  - Single-bit signals: digital waveform (high/low lines with transitions)
  - Multi-bit signals: bus notation (diamond-ended boxes with hex values)
  - Time axis with auto-scaled markers
  - Signal label column on the left
```

**Interaction:** Mouse wheel scrolls horizontally, Ctrl+wheel zooms in/out.

### 2.6 Next.js Configuration

**`serverExternalPackages`:** This is the most critical config line. Without it, Next.js/Turbopack tries to bundle the 50MB WASM binary into the server chunk, causing either OOM crashes or incompatible module format errors.

```javascript
// next.config.mjs
serverExternalPackages: ['@yowasp/yosys', '@yowasp/iverilog']
```

This tells Next.js: "Don't bundle these packages — let Node.js load them directly at runtime."

---

## 3. File Structure

```
d:\Keller\
├── package.json              # Dependencies + scripts
├── next.config.mjs           # WASM external packages config
├── tailwind.config.js        # Dark theme color system
├── postcss.config.js         # Tailwind + autoprefixer
├── jsconfig.json             # Path aliases (@/)
│
├── app/
│   ├── layout.js             # Root HTML, fonts, metadata
│   ├── page.js               # Main EDA playground UI
│   ├── globals.css           # Tailwind + custom styles
│   └── api/
│       └── compile/
│           └── route.js      # POST: synthesis/simulation API
│
├── components/
│   ├── CodeEditor.jsx        # Monaco + Verilog syntax + tabs
│   ├── Console.jsx           # Terminal log viewer
│   ├── WaveformViewer.jsx    # Canvas VCD renderer
│   └── Toolbar.jsx           # Header + action buttons
│
├── lib/
│   ├── defaults.js           # Default 4-bit adder + testbench
│   └── vcdParser.js          # IEEE 1364 VCD parser
│
├── scripts/
│   └── setup-iverilog.js     # iverilog install helper
│
└── DOCUMENTATION.md          # This file
```

---

## 4. Running Locally

### Prerequisites
- Node.js 18+ (tested on v24.11.0)
- npm 9+ (tested on v11.6.1)

### Quick Start

```bash
cd d:\Keller
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

### First Run
The first time you click "Run Synthesis," the Yosys WASM binary (~50MB) downloads from CDN. This takes 10-30 seconds depending on your connection. Subsequent runs are cached and take ~200ms.

---

## 5. Adding Simulation (iverilog)

Simulation requires Icarus Verilog installed on your system. Three options:

### Option A: OSS CAD Suite (Recommended)
Download from: https://github.com/YosysHQ/oss-cad-suite-build/releases

This bundles Yosys, Icarus Verilog, GTKWave, and 20+ other EDA tools in a single archive.

```bash
# Extract the archive, then add to PATH:
set PATH=C:\oss-cad-suite\bin;%PATH%
```

### Option B: Standalone Icarus Verilog
Download from: https://bleyer.org/icarus/

Run the installer, ensure it adds to PATH.

### Option C: MSYS2
```bash
pacman -S mingw-w64-x86_64-iverilog
```

### Verification
```bash
iverilog -V    # Should print "Icarus Verilog version 12.0"
npm run setup:iverilog   # Keller's built-in check script
```

After installing, restart the Keller dev server (`npm run dev`).

---

## 6. Technical Decisions & Tradeoffs

### Why server-side WASM instead of browser WASM?

The `@yowasp/yosys` package CAN run in the browser via Web Workers, but:
1. **Memory limits:** Browsers cap WASM memory at ~2-4GB. Yosys for complex designs can exceed this.
2. **First-load cost:** 50MB WASM download on every browser visit (unless cached via Service Worker).
3. **Thread blocking:** Without Web Workers, synthesis blocks the UI. Workers add complexity.
4. **Security:** Running server-side means user code is sandboxed in Node.js, not executing arbitrary WASM in the browser.

Running in Node.js API routes is simpler, more reliable, and the ~200ms server round-trip is imperceptible on localhost.

### Why Tailwind CSS 3 instead of 4?

Tailwind v4 uses CSS-based configuration (no `tailwind.config.js`), which is a fundamentally different model. For a project with a custom color system (`keller-bg`, `keller-panel`, etc.) and specific design tokens, v3's JS-based config is more explicit and debuggable.

### Why not DigitalJS for simulation?

DigitalJS is a gate-level simulator that works with Yosys JSON netlists. It CANNOT:
- Execute testbench `initial` blocks
- Handle `$display`, `$dumpfile`, `$dumpvars`
- Simulate timing delays (`#10`)
- Generate standard VCD waveforms

For testbench-driven simulation with waveform output, you need a proper Verilog simulator (iverilog, Verilator, etc.).

### Why monkey-patch stdout instead of using callbacks?

The `@yowasp/yosys` v0.64 `runYosys()` function accepts `print`/`printErr` in its options object, but these callbacks are never invoked. The WASI runtime inside the package writes directly to `process.stdout` and `process.stderr`. This was verified empirically:

```javascript
// This produces ZERO output in logOutput:
await runYosys(args, files, { print: (t) => logOutput += t });

// This captures everything:
process.stdout.write = (chunk) => logOutput += chunk.toString();
await runYosys(args, files);
```

---

## What's Next (v0.2 Roadmap)

1. **Resizable panes** — drag-to-resize the editor/console split
2. **Multiple file tabs** — support for include files and multi-module designs
3. **Schematic viewer** — render the Yosys JSON netlist as a visual gate schematic (via DigitalJS or custom SVG)
4. **Docker-based OpenLane** — full RTL-to-GDSII flow for physical design
5. **WebSocket progress** — real-time progress for long synthesis runs
6. **Data collection hook** — log synthesis metrics to SQLite for ML training
