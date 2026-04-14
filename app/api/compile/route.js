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

// ABC command mapping for OpenABC-D style recipes
const ABC_CMD_MAP = {
  0: 'balance',
  1: 'rewrite',
  2: 'refactor',
  3: 'resub',
  4: 'rewrite -z',
  5: 'refactor -z',
  6: 'resub -z',
};

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
    let recipeConfig;
    let customAbcScript = null;

    if (recipe === 'custom' && options.customSequence) {
      // Parse the 20-number OpenABC-D sequence into an ABC script
      const nums = options.customSequence
        .split(/[,\s]+/)
        .map(Number)
        .filter(n => !isNaN(n) && n >= 0 && n <= 6);
      if (nums.length > 0) {
        const abcCmds = nums.map(n => ABC_CMD_MAP[n] || 'balance');
        customAbcScript = '+strash;' + abcCmds.join(';');
      }
      recipeConfig = RECIPES.quick; // Use Quick as the base for custom
    } else {
      recipeConfig = RECIPES[recipe] || RECIPES.standard;
    }
    let commands = [...recipeConfig.commands];

    // CRITICAL: If a PDK is selected, we must expand the `synth` macro
    // into its discrete steps. The `synth` macro contains an implicit `abc`
    // step that ignores our liberty file. By expanding it, we gain full control.
    if (pdkLibPath) {
      const hasSynthMacro = commands.some(c => c === 'synth' || c.startsWith('synth '));
      if (hasSynthMacro) {
        // Replace 'synth' with equivalent discrete Yosys passes
        commands = commands.flatMap(c => {
          if (c === 'synth' || c.startsWith('synth ')) {
            return [
              'hierarchy -auto-top',
              'proc',
              'opt',
              'memory',
              'opt',
              'techmap',
              'opt',
            ];
          }
          return [c];
        });
      }
    }

    // If flatten requested and not already in recipe
    if (flatten && !commands.includes('flatten')) {
      // Insert after hierarchy or synth-expansion
      const hierIdx = commands.findIndex(c => c.startsWith('hierarchy') || c.startsWith('synth'));
      if (hierIdx >= 0) {
        commands.splice(hierIdx + 1, 0, 'flatten');
      }
    }

    // If PDK selected, replace generic abc with liberty-mapped flow
    if (pdkLibPath) {
      // Remove any existing generic abc commands
      commands = commands.filter(c => !c.startsWith('abc'));

      // Find insertion point: after the last techmap or opt
      let insertIdx = -1;
      for (let i = commands.length - 1; i >= 0; i--) {
        if (commands[i].startsWith('techmap') || commands[i].startsWith('opt')) {
          insertIdx = i + 1;
          break;
        }
      }
      if (insertIdx < 0) insertIdx = commands.length;

      // Insert dfflibmap + abc -liberty for proper technology mapping
      commands.splice(insertIdx, 0,
        `dfflibmap -liberty ${pdkLibPath}`,
        `abc -liberty ${pdkLibPath}`,
        'opt_clean'
      );

      // Replace generic stat with stat -liberty for real area/cell reports
      commands = commands.map(c =>
        c === 'stat' ? `stat -liberty ${pdkLibPath}` : c
      );
    }

    // If custom ABC sequence is specified (and no PDK overriding abc)
    if (customAbcScript && !pdkLibPath) {
      commands = commands.map(c => {
        if (c === 'abc') return `abc -script "${customAbcScript}"`;
        if (c.startsWith('abc -script')) return `abc -script "${customAbcScript}"`;
        return c;
      });
    } else if (customAbcScript && pdkLibPath) {
      // With PDK + custom sequence: use abc -liberty with custom script
      commands = commands.map(c => {
        if (c === `abc -liberty ${pdkLibPath}`) {
          return `abc -liberty ${pdkLibPath} -script "${customAbcScript}"`;
        }
        return c;
      });
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
    console.log('[KELLER] Yosys script:', yosysScript);

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

// ── Normalize netlist JSON for SVG rendering ──
// Maps PDK-specific cell names to generic types that netlistsvg can render.
function normalizeNetlistForSvg(netlistJson) {
  const CELL_MAP = {
    'inv': '$_NOT_', 'buf': '$_BUF_',
    'nand2': '$_NAND_', 'nand3': '$_NAND_', 'nand4': '$_NAND_',
    'nor2': '$_NOR_', 'nor3': '$_NOR_', 'nor4': '$_NOR_',
    'and2': '$_AND_', 'and3': '$_AND_', 'and4': '$_AND_',
    'or2': '$_OR_', 'or3': '$_OR_', 'or4': '$_OR_',
    'xor2': '$_XOR_', 'xnor2': '$_XNOR_',
    'mux2': '$_MUX_',
    'dfxtp': '$_DFF_P_', 'dfrtp': '$_DFFSR_PPP_',
    'a21oi': '$_AOI3_', 'o21ai': '$_OAI3_',
    'a211oi': '$_AOI4_', 'o211ai': '$_OAI4_'
  };

  try {
    const copy = JSON.parse(JSON.stringify(netlistJson));
    for (const modName of Object.keys(copy.modules || {})) {
      const mod = copy.modules[modName];
      const newCells = {};
      for (const [cellName, cellData] of Object.entries(mod.cells || {})) {
        let cellType = cellData.type || '';
        // Try to match sky130/PDK cell name patterns
        let matched = false;
        for (const [pattern, generic] of Object.entries(CELL_MAP)) {
          if (cellType.includes(`__${pattern}_`) || cellType.endsWith(`__${pattern}`)) {
            cellData.type = generic;
            matched = true;
            break;
          }
        }
        // Add original type as an attribute for tooltip
        if (matched) {
          cellData.attributes = cellData.attributes || {};
          cellData.attributes['original_type'] = cellType;
        }
        newCells[cellName] = cellData;
      }
      mod.cells = newCells;
    }
    return copy;
  } catch {
    return netlistJson; // Return original on any error
  }
}

// ── Render schematic SVG from Yosys JSON ──
async function renderSchematic(netlistJson) {
  const netlistsvg = require('netlistsvg');
  const fs = require('fs');
  const path = require('path');

  // Normalize PDK cell names to generic types for rendering
  const normalizedNetlist = normalizeNetlistForSvg(netlistJson);

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
  const svg = await netlistsvg.render(skin, normalizedNetlist);
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

    // Step 3: Read VCD file — scan for ANY .vcd file (not just waveform.vcd)
    // This handles testbenches using $dumpfile("dump.vcd"), $dumpfile("tb.vcd"), etc.
    let vcd = null;
    try {
      const allFiles = fs.readdirSync(tmpDir);
      const vcdFile = allFiles.find(f => f.endsWith('.vcd'));
      if (vcdFile) {
        const vcdPath = path.join(tmpDir, vcdFile);
        vcd = fs.readFileSync(vcdPath, 'utf-8');
        log += `[VCD] Waveform data captured from ${vcdFile} (${vcd.length} bytes)\n`;
      } else {
        log += '[VCD] No .vcd file generated. Ensure your testbench contains $dumpfile("<name>.vcd") and $dumpvars.\n';
      }
    } catch (scanErr) {
      log += `[VCD] Error scanning for VCD files: ${scanErr.message}\n`;
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
