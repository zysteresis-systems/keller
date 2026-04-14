const netlistsvg = require('netlistsvg');
const fs = require('fs');
const path = require('path');

// Simple test netlist - a 2-input AND gate
const testNetlist = {
  modules: {
    test: {
      ports: {
        a: { direction: 'input', bits: [2] },
        b: { direction: 'input', bits: [3] },
        y: { direction: 'output', bits: [4] }
      },
      cells: {
        and_gate: {
          type: '$_AND_',
          port_directions: { A: 'input', B: 'input', Y: 'output' },
          connections: { A: [2], B: [3], Y: [4] }
        }
      }
    }
  }
};

async function main() {
  // Get the built-in digital skin
  const skinPath = path.join(require.resolve('netlistsvg').replace(/built[\/\\].*/,''), 'lib', 'default.svg');
  console.log('Skin path:', skinPath);
  const skin = fs.readFileSync(skinPath, 'utf-8');
  console.log('Skin loaded, length:', skin.length);

  try {
    const svg = await netlistsvg.render(skin, testNetlist);
    console.log('SVG generated successfully!');
    console.log('SVG length:', svg.length);
    console.log('Contains <svg>:', svg.includes('<svg'));
    // Write to file for inspection
    fs.writeFileSync(path.join(__dirname, '..', 'test-output.svg'), svg);
    console.log('Written to test-output.svg');
  } catch (err) {
    console.error('Render error:', err.message);
    console.error(err.stack);
  }
}

main();
