/**
 * synthesisRecipes.js
 * ───────────────────
 * Predefined Yosys synthesis scripts (recipes).
 *
 * Each recipe is a named sequence of Yosys commands.
 * The `synth` command is itself a macro that runs ~20 passes.
 * These presets give users control over optimization depth.
 */

export const RECIPES = {
  quick: {
    id: 'quick',
    name: 'Quick',
    description: 'Fast iteration — minimal optimization, ~5 passes',
    commands: [
      'read_verilog design.v',
      'hierarchy -auto-top',
      'proc',
      'opt',
      'techmap',
      'abc',
      'opt_clean',
      'stat',
    ],
  },

  standard: {
    id: 'standard',
    name: 'Standard',
    description: 'Balanced area/speed — default Yosys flow, ~20 passes',
    commands: [
      'read_verilog design.v',
      'synth',
      'stat',
    ],
  },

  aggressive: {
    id: 'aggressive',
    name: 'Aggressive',
    description: 'Maximum optimization — full flatten + ABC resynthesis',
    commands: [
      'read_verilog design.v',
      'synth',
      'flatten',
      'opt -full',
      'share',
      'opt -full',
      'techmap',
      'abc -script +strash;ifraig;dc2;fraig;balance;rewrite;refactor;resub;balance',
      'opt_clean',
      'stat',
    ],
  },

  area: {
    id: 'area',
    name: 'Area Min',
    description: 'Minimize gate count — aggressive resource sharing',
    commands: [
      'read_verilog design.v',
      'synth',
      'flatten',
      'opt -full',
      'share -aggressive',
      'opt -full',
      'techmap',
      'abc -script +strash;map;refactor;rewrite;balance',
      'opt_clean',
      'stat',
    ],
  },
};

/**
 * Returns the Yosys command string for a given recipe, with optional overrides.
 */
export function buildSynthesisScript(recipeId, options = {}) {
  const recipe = RECIPES[recipeId] || RECIPES.standard;
  let commands = [...recipe.commands];

  // Insert flatten after synth if requested
  if (options.flatten && !commands.includes('flatten')) {
    const synthIdx = commands.findIndex(c => c.startsWith('synth'));
    if (synthIdx >= 0) {
      commands.splice(synthIdx + 1, 0, 'flatten');
    }
  }

  return commands;
}
