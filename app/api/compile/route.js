/**
 * /api/compile/route.js
 * ─────────────────────
 * The core API route for Keller. Handles two modes:
 *
 * 1. "synthesis"  → Runs @yowasp/yosys (WASM) to synthesize Verilog
 *                    Returns: synthesis log, netlist JSON, schematic SVG
 *
 * 2. "simulate"   → Runs system iverilog + vvp to simulate with testbench
 *                    Returns: simulation log + VCD waveform data
 *
 * Both modes run server-side in the Node.js runtime (not in the browser).
 */

import { NextResponse } from 'next/server';
import { RECIPES } from '@/lib/synthesisRecipes';

// ── Synthesis via @yowasp/yosys (WASM) ──
async function runSynthesis(designCode, options = {}) {
  const startTime = Date.now();
  const { recipe = 'standard', flatten = false, pdk = null } = options;

  try {
    const { runYosys } = await import('@yowasp/yosys');
    const fs = require('fs');

    // Build virtual filesystem
    const inputFiles = {
      'design.v': designCode,
    };

    // Load PDK liberty file into VFS if selected
    let pdkLibPath = null;
    if (pdk && pdk !== 'generic') {
      const path = require('path');
      const pdkFiles = {
        'sky130_hd': path.join(process.cwd(), 'lib', 'pdks', 'sky130_fd_sc_hd.lib'),
      };
      const libFile = pdkFiles[pdk];
      if (libFile && fs.existsSync(libFile)) {
        const libContent = fs.readFileSync(libFile, 'utf-8');
        inputFiles['pdk.lib'] = libContent;
        pdkLibPath = 'pdk.lib';
      }
    }

    // Build Yosys script based on recipe and options
    const recipeConfig = RECIPES[recipe] || RECIPES.standard;
    let commands = [...recipeConfig.commands];

    // If flatten requested and not already in recipe
    if (flatten && !commands.includes('flatten')) {
      const synthIdx = commands.findIndex(c => c.startsWith('synth'));
      if (synthIdx >= 0) {
        commands.splice(synthIdx + 1, 0, 'flatten');
      }
    }

    // If PDK selected, replace generic abc with liberty-mapped flow
    if (pdkLibPath) {
      // Remove any existing abc commands
      commands = commands.filter(c => !c.startsWith('abc'));

      // Find where to insert PDK mapping (after techmap or synth)
      const insertIdx = commands.findIndex(c =>
        c.startsWith('techmap') || c.startsWith('opt_clean') || c.startsWith('stat')
      );
      const idx = insertIdx >= 0 ? insertIdx : commands.length;

      // Insert dfflibmap + abc -liberty
      commands.splice(idx, 0,
        `dfflibmap -liberty ${pdkLibPath}`,
        `abc -liberty ${pdkLibPath}`,
        'opt_clean'
      );

      // Replace stat with stat -liberty
      commands = commands.map(c =>
        c === 'stat' ? `stat -liberty ${pdkLibPath}` : c
      );
    }

    // Always add write_json for schematic generation (before stat)
    const statIdx = commands.findIndex(c => c.startsWith('stat'));
    if (statIdx >= 0) {
      commands.splice(statIdx, 0, 'write_json netlist.json');
    } else {
      commands.push('write_json netlist.json');
    }

    // Ensure stat is at the end
    if (!commands.some(c => c.startsWith('stat'))) {
      commands.push(pdkLibPath ? `stat -liberty ${pdkLibPath}` : 'stat');
    }

    const yosysScript = commands.join('; ');

    // CRITICAL: @yowasp/yosys writes directly to process.stdout/stderr,
    // ignoring the print/printErr callbacks. We must monkey-patch to capture.
    let capturedLog = '';
    const origStdoutWrite = process.stdout.write.bind(process.stdout);
    const origStderrWrite = process.stderr.write.bind(process.stderr);

    process.stdout.write = (chunk, encoding, callback) => {
      capturedLog += chunk.toString();
      return origStdoutWrite(chunk, encoding, callback);
    };
    process.stderr.write = (chunk, encoding, callback) => {
      capturedLog += chunk.toString();
      return origStderrWrite(chunk, encoding, callback);
    };

    let outputFiles = {};
    try {
      outputFiles = await runYosys(['-p', yosysScript], inputFiles) || {};
    } finally {
      process.stdout.write = origStdoutWrite;
      process.stderr.write = origStderrWrite;
    }

    const elapsed = Date.now() - startTime;
    const fullLog = capturedLog.trim();

    // Extract netlist JSON from output files
    let netlistJson = null;
    if (outputFiles && outputFiles['netlist.json']) {
      try {
        const raw = outputFiles['netlist.json'];
        // YoWASP returns files as strings (not Uint8Array)
        const jsonStr = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
        netlistJson = JSON.parse(jsonStr);
      } catch (e) {
        // JSON parse failed — log for debugging
        console.error('[KELLER] Netlist JSON parse error:', e.message);
      }
    }

    // Generate schematic SVG from netlist JSON
    let schematicSvg = null;
    if (netlistJson) {
      try {
        schematicSvg = await renderSchematic(netlistJson);
      } catch (e) {
        console.error('[KELLER] Schematic render error:', e.message, e.stack);
      }
    }

    return {
      success: true,
      mode: 'synthesis',
      log: fullLog || 'Synthesis completed (no output captured)',
      netlistJson,
      schematicSvg,
      recipe: recipeConfig.name,
      elapsedMs: elapsed,
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    return {
      success: false,
      mode: 'synthesis',
      log: `Synthesis failed: ${error.message}\n\n${error.stack || ''}`,
      netlistJson: null,
      schematicSvg: null,
      elapsedMs: elapsed,
    };
  }
}

// ── Render schematic SVG from Yosys JSON ──
async function renderSchematic(netlistJson) {
  const netlistsvg = require('netlistsvg');
  const fs = require('fs');
  const path = require('path');

  // Load the digital skin file — try multiple resolution strategies
  let skinPath;
  const candidates = [
    path.join(process.cwd(), 'node_modules', 'netlistsvg', 'lib', 'default.svg'),
    path.join(path.dirname(require.resolve('netlistsvg/package.json')), 'lib', 'default.svg'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      skinPath = candidate;
      break;
    }
  }

  if (!skinPath) {
    throw new Error(`Could not find netlistsvg skin file. Tried: ${candidates.join(', ')}`);
  }

  const skin = fs.readFileSync(skinPath, 'utf-8');
  const svg = await netlistsvg.render(skin, netlistJson);
  return svg;
}

// ── Simulation via system iverilog + vvp ──
async function runSimulation(designCode, testbenchCode) {
  const startTime = Date.now();
  const { execSync } = await import('child_process');
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');

  const tmpDir = path.join(os.tmpdir(), `keller-sim-${Date.now()}`);

  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    fs.writeFileSync(path.join(tmpDir, 'design.v'), designCode);
    fs.writeFileSync(path.join(tmpDir, 'tb.v'), testbenchCode);

    let log = '';

    // Step 1: Compile with iverilog
    try {
      const compileResult = execSync(
        'iverilog -o sim.vvp design.v tb.v',
        { cwd: tmpDir, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }
      );
      log += '[COMPILE] iverilog compilation successful\n';
      if (compileResult) log += compileResult;
    } catch (compileError) {
      const stderr = compileError.stderr || compileError.message;
      return {
        success: false,
        mode: 'simulate',
        log: `[COMPILE ERROR] iverilog compilation failed:\n${stderr}`,
        vcd: null,
        elapsedMs: Date.now() - startTime,
      };
    }

    // Step 2: Run simulation with vvp
    try {
      const simResult = execSync(
        'vvp sim.vvp',
        { cwd: tmpDir, encoding: 'utf-8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] }
      );
      log += '[SIMULATE] vvp simulation completed\n';
      if (simResult) log += simResult;
    } catch (simError) {
      const stderr = simError.stderr || simError.message;
      log += `[SIMULATE WARNING] vvp output:\n${stderr}\n`;
      if (simError.stdout) log += simError.stdout;
    }

    // Step 3: Read VCD file if it was generated
    let vcd = null;
    const vcdPath = path.join(tmpDir, 'waveform.vcd');
    if (fs.existsSync(vcdPath)) {
      vcd = fs.readFileSync(vcdPath, 'utf-8');
      log += `[VCD] Waveform data captured (${vcd.length} bytes)\n`;
    } else {
      log += '[VCD] No waveform.vcd generated. Ensure $dumpfile("waveform.vcd") is in your testbench.\n';
    }

    const elapsed = Date.now() - startTime;

    return {
      success: true,
      mode: 'simulate',
      log: log.trim(),
      vcd,
      elapsedMs: elapsed,
    };
  } catch (error) {
    return {
      success: false,
      mode: 'simulate',
      log: `Simulation failed: ${error.message}`,
      vcd: null,
      elapsedMs: Date.now() - startTime,
    };
  } finally {
    try {
      const fs = await import('fs');
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Cleanup failure is non-critical
    }
  }
}

// ── Route Handler ──
export async function POST(request) {
  try {
    const body = await request.json();
    const { design, testbench, mode, recipe, flatten, pdk } = body;

    if (!design) {
      return NextResponse.json(
        { success: false, log: 'Error: No design code provided.' },
        { status: 400 }
      );
    }

    if (mode === 'synthesis') {
      const result = await runSynthesis(design, { recipe, flatten, pdk });
      return NextResponse.json(result);
    }

    if (mode === 'simulate') {
      if (!testbench) {
        return NextResponse.json(
          { success: false, log: 'Error: No testbench code provided for simulation.' },
          { status: 400 }
        );
      }

      // Check if iverilog is available
      try {
        const { execSync } = await import('child_process');
        execSync('iverilog -V', { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch {
        return NextResponse.json({
          success: false,
          mode: 'simulate',
          log: [
            '[ERROR] iverilog not found on system PATH.',
            '',
            'Simulation requires Icarus Verilog to be installed locally.',
            'Synthesis (Yosys WASM) works without any installation.',
            '',
            '── Install Instructions ──',
            '',
            'Option A: Download from https://bleyer.org/icarus/',
            '  → Run the installer, add to PATH, restart terminal',
            '',
            'Option B: OSS CAD Suite (includes yosys + iverilog + gtkwave)',
            '  → https://github.com/YosysHQ/oss-cad-suite-build/releases',
            '  → Extract, add bin/ to PATH',
            '',
            'After installing, restart the Keller dev server.',
          ].join('\n'),
          vcd: null,
          elapsedMs: 0,
        });
      }

      const result = await runSimulation(design, testbench);
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { success: false, log: `Error: Unknown mode "${mode}". Use "synthesis" or "simulate".` },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, log: `Server error: ${error.message}` },
      { status: 500 }
    );
  }
}

// ── Health check ──
export async function GET() {
  let yosysAvailable = false;
  let iverilogAvailable = false;

  try {
    await import('@yowasp/yosys');
    yosysAvailable = true;
  } catch {}

  try {
    const { execSync } = await import('child_process');
    execSync('iverilog -V', { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    iverilogAvailable = true;
  } catch {}

  return NextResponse.json({
    status: 'ok',
    tools: {
      yosys: { available: yosysAvailable, type: 'wasm' },
      iverilog: { available: iverilogAvailable, type: 'system' },
    },
  });
}
