/**
 * setup-iverilog.js
 * ─────────────────
 * Downloads and extracts Icarus Verilog for Windows into ./tools/iverilog/
 * so that the Keller simulation API route can call iverilog and vvp
 * without requiring a global system install.
 *
 * Usage: npm run setup:iverilog
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Icarus Verilog v12 Windows binaries (pre-compiled, official)
const IVERILOG_URL = 'https://bleyer.org/icarus/iverilog-v12-20220611-x64_setup.exe';
const TOOLS_DIR = path.join(__dirname, '..', 'tools');
const IVERILOG_DIR = path.join(TOOLS_DIR, 'iverilog');
const MARKER = path.join(IVERILOG_DIR, '.installed');

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  KELLER — Icarus Verilog Setup                  ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  // Check if already set up
  if (fs.existsSync(MARKER)) {
    console.log('✓ Icarus Verilog already installed in ./tools/iverilog/');
    console.log('  To reinstall, delete the tools/iverilog directory and re-run.');
    return;
  }

  // Check if iverilog is already on system PATH
  try {
    const version = execSync('iverilog -V 2>&1', { encoding: 'utf-8' });
    const firstLine = version.split('\n')[0];
    console.log(`✓ Found system iverilog: ${firstLine}`);
    console.log('  No local installation needed.');

    // Create marker so we know system iverilog is available
    fs.mkdirSync(IVERILOG_DIR, { recursive: true });
    fs.writeFileSync(MARKER, 'system');
    return;
  } catch {
    console.log('ℹ iverilog not found on system PATH.');
  }

  console.log('');
  console.log('Icarus Verilog is required for simulation (not synthesis).');
  console.log('');
  console.log('To install on Windows, choose one of:');
  console.log('');
  console.log('  Option A (recommended): Download installer from');
  console.log('    https://bleyer.org/icarus/');
  console.log('    → Run the installer, restart your terminal');
  console.log('');
  console.log('  Option B: Use OSS CAD Suite (includes yosys + iverilog + gtkwave)');
  console.log('    https://github.com/YosysHQ/oss-cad-suite-build/releases');
  console.log('    → Extract, add bin/ to your PATH');
  console.log('');
  console.log('  Option C: Use MSYS2');
  console.log('    pacman -S mingw-w64-x86_64-iverilog');
  console.log('');
  console.log('After installing, run this script again to verify:');
  console.log('  npm run setup:iverilog');
  console.log('');
}

main().catch(console.error);
