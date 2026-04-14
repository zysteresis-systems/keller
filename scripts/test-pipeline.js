// Test: Full adder synthesis + write_json with the exact same recipe we use in the API route
async function test() {
  const { runYosys } = await import('@yowasp/yosys');

  const designCode = `
module full_adder (
    input a, b, cin,
    output sum, cout
);
    assign sum  = a ^ b ^ cin;
    assign cout = (a & b) | (b & cin) | (a & cin);
endmodule

module adder_4bit (
    input  [3:0] a, b,
    input        cin,
    output [3:0] sum,
    output       cout
);
    wire c1, c2, c3;
    full_adder fa0 (.a(a[0]), .b(b[0]), .cin(cin),  .sum(sum[0]), .cout(c1));
    full_adder fa1 (.a(a[1]), .b(b[1]), .cin(c1),   .sum(sum[1]), .cout(c2));
    full_adder fa2 (.a(a[2]), .b(b[2]), .cin(c2),   .sum(sum[2]), .cout(c3));
    full_adder fa3 (.a(a[3]), .b(b[3]), .cin(c3),   .sum(sum[3]), .cout(cout));
endmodule`;

  const yosysScript = [
    'read_verilog design.v',
    'synth',
    'write_json netlist.json',
    'stat',
  ].join('; ');

  console.log('Running Yosys with script:', yosysScript);

  const outputFiles = await runYosys(['-p', yosysScript], { 'design.v': designCode });

  console.log('Output type:', typeof outputFiles);
  console.log('Output is null?', outputFiles === null);
  console.log('Output keys:', outputFiles ? Object.keys(outputFiles) : 'N/A');

  if (outputFiles && outputFiles['netlist.json']) {
    const raw = outputFiles['netlist.json'];
    console.log('netlist.json type:', typeof raw);
    console.log('netlist.json length:', raw.length);
    const json = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    console.log('Parsed JSON modules:', Object.keys(json.modules || {}));

    // Test netlistsvg rendering
    const netlistsvg = require('netlistsvg');
    const fs = require('fs');
    const path = require('path');
    const skinPath = path.join(require.resolve('netlistsvg').replace(/built[\/\\].*/, ''), 'lib', 'default.svg');
    const skin = fs.readFileSync(skinPath, 'utf-8');

    const svg = await netlistsvg.render(skin, json);
    console.log('SVG generated, length:', svg.length);
    console.log('SVG starts with:', svg.substring(0, 100));
  } else {
    console.log('NO netlist.json in output!');
    console.log('Available files:', outputFiles ? Object.keys(outputFiles) : 'none');
  }
}

test().catch(e => console.error('FAILED:', e.message, e.stack));
