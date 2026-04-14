/**
 * PDK Registry
 * ────────────
 * Maps PDK names to their liberty file paths and metadata.
 */

import path from 'path';

export const PDKS = {
  generic: {
    id: 'generic',
    name: 'Generic (ABC)',
    description: 'ABC built-in gate library — no technology mapping',
    libFile: null,
    node: null,
  },
  sky130_hd: {
    id: 'sky130_hd',
    name: 'SKY130 HD',
    description: 'SkyWater 130nm High Density — tt/25°C/1.8V (stripped)',
    libFile: path.join(process.cwd(), 'lib', 'pdks', 'sky130_fd_sc_hd.lib'),
    node: '130nm',
  },
};

/**
 * Build the Yosys synthesis commands for a given PDK.
 * If a PDK is selected, uses dfflibmap + abc -liberty for technology mapping.
 */
export function buildPdkCommands(pdkId) {
  const pdk = PDKS[pdkId];
  if (!pdk || !pdk.libFile) {
    // Generic flow — no liberty file
    return [];
  }

  // Technology mapping commands using the PDK liberty file
  // These replace the generic 'abc' step in the synthesis flow
  return [
    `dfflibmap -liberty ${pdk.libFile}`,
    `abc -liberty ${pdk.libFile}`,
  ];
}

/**
 * Get the stat command for a PDK (uses -liberty for real area reports).
 */
export function getStatCommand(pdkId) {
  const pdk = PDKS[pdkId];
  if (!pdk || !pdk.libFile) return 'stat';
  return `stat -liberty ${pdk.libFile}`;
}
