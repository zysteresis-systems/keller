// ============================================
// KELLER — Default Verilog Code
// ============================================
// Pre-loaded examples so the editor isn't empty on first visit.
// Uses a 4-bit ripple carry adder — the "Hello World" of RTL.

export const DEFAULT_DESIGN = `// ─────────────────────────────────────────────
// Keller — 4-Bit Ripple Carry Adder
// ─────────────────────────────────────────────

module full_adder (
    input  a,
    input  b,
    input  cin,
    output sum,
    output cout
);
    assign sum  = a ^ b ^ cin;
    assign cout = (a & b) | (b & cin) | (a & cin);
endmodule

module adder_4bit (
    input  [3:0] a,
    input  [3:0] b,
    input        cin,
    output [3:0] sum,
    output       cout
);
    wire c1, c2, c3;

    full_adder fa0 (.a(a[0]), .b(b[0]), .cin(cin),  .sum(sum[0]), .cout(c1));
    full_adder fa1 (.a(a[1]), .b(b[1]), .cin(c1),   .sum(sum[1]), .cout(c2));
    full_adder fa2 (.a(a[2]), .b(b[2]), .cin(c2),   .sum(sum[2]), .cout(c3));
    full_adder fa3 (.a(a[3]), .b(b[3]), .cin(c3),   .sum(sum[3]), .cout(cout));
endmodule
`;

export const DEFAULT_TESTBENCH = `// ─────────────────────────────────────────────
// Keller — Testbench for 4-Bit Adder
// ─────────────────────────────────────────────
\`timescale 1ns/1ps

module tb_adder_4bit;
    reg  [3:0] a, b;
    reg        cin;
    wire [3:0] sum;
    wire       cout;

    // Instantiate the DUT
    adder_4bit dut (
        .a(a), .b(b), .cin(cin),
        .sum(sum), .cout(cout)
    );

    // Waveform dump
    initial begin
        $dumpfile("waveform.vcd");
        $dumpvars(0, tb_adder_4bit);
    end

    // Stimulus
    initial begin
        $display("─── Keller Simulation Start ───");
        $display("  A   +   B   + Cin =  Sum  Cout");
        $display("──────────────────────────────────");

        // Test vector 1: 0 + 0 + 0
        a = 4'b0000; b = 4'b0000; cin = 0;
        #10;
        $display("  %b + %b +  %b  = %b   %b", a, b, cin, sum, cout);

        // Test vector 2: 3 + 5 + 0
        a = 4'b0011; b = 4'b0101; cin = 0;
        #10;
        $display("  %b + %b +  %b  = %b   %b", a, b, cin, sum, cout);

        // Test vector 3: 7 + 8 + 0
        a = 4'b0111; b = 4'b1000; cin = 0;
        #10;
        $display("  %b + %b +  %b  = %b   %b", a, b, cin, sum, cout);

        // Test vector 4: 15 + 15 + 1 (overflow)
        a = 4'b1111; b = 4'b1111; cin = 1;
        #10;
        $display("  %b + %b +  %b  = %b   %b", a, b, cin, sum, cout);

        // Test vector 5: 9 + 6 + 1
        a = 4'b1001; b = 4'b0110; cin = 1;
        #10;
        $display("  %b + %b +  %b  = %b   %b", a, b, cin, sum, cout);

        $display("──────────────────────────────────");
        $display("─── Keller Simulation Complete ───");
        $finish;
    end
endmodule
`;
