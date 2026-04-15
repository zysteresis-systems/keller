import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { log } = await request.json();

    if (!log) {
      return NextResponse.json(
        { success: false, error: 'No log content provided.' },
        { status: 400 }
      );
    }

    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;
    
    // If no API key is configured, provide a mock response for development
    if (!deepseekKey && !groqKey) {
      console.warn('[KELLER] No AI API key configured. Using mock response.');
      
      const mockInsight = generateMockInsight(log);
      return NextResponse.json({ success: true, insight: mockInsight });
    }

    const systemPrompt = `You are Keller Insight Tutor, a world-class digital design mentor for beginners.
You analyze raw EDA logs from Yosys synthesis, Icarus Verilog, and Verilator simulation.

Output requirements (strict):
1) Start with: "## AI Design Insight".
2) Then include a one-line status: pass/fail/partial + confidence.
3) Provide "### What Happened" in plain language.
4) Provide "### Key Signals In The Log" with 3-8 bullets quoting exact evidence from the log.
5) Provide "### Root Cause" (or "No blocking issue found").
6) Provide "### Action Plan" with ordered steps. Each step must be specific and executable.
7) If there is an error, include one minimal corrected Verilog/SystemVerilog snippet when possible.
8) If synthesis succeeded, extract metrics when present (cells, wires, area, timing, warnings) and explain impact.
9) If simulation succeeded, explain testbench outcome, VCD/waveform hints, and next tests to add.
10) Keep language beginner-friendly, no fluff, no generic statements, no policy talk.

Important:
- Be concise but high-value (roughly 180-350 words).
- Never invent metrics; say "not present in log" when missing.
- Prefer actionable debugging over theory.`;

    let response;
    let modelUsed;
    
    // Try DeepSeek API first
    if (deepseekKey && deepseekKey !== 'sk-1234567890abcdef1234567890abcdef') {
      try {
        console.log('[KELLER] Trying DeepSeek API...');
        response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${deepseekKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Here is the log output:\n\n${log}` }
            ],
            temperature: 0.2,
            max_tokens: 500,
          }),
        });
        modelUsed = 'deepseek-chat';
      } catch (error) {
        console.error('[KELLER] DeepSeek API Error:', error);
      }
    }
    
    // Fallback to Groq API if DeepSeek failed or no DeepSeek key
    if (!response && groqKey) {
      try {
        console.log('[KELLER] Trying Groq API...');
        response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama3-8b-8192',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Here is the log output:\n\n${log}` }
            ],
            temperature: 0.2,
            max_tokens: 500,
          }),
        });
        modelUsed = 'llama3-8b-8192';
      } catch (error) {
        console.error('[KELLER] Groq API Error:', error);
      }
    }

    if (!response) {
      console.warn('[KELLER] All AI APIs failed. Using mock response.');
      const mockInsight = generateMockInsight(log);
      return NextResponse.json({ success: true, insight: mockInsight });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[KELLER] Model request failed:`, errorText);
      
      // Fallback to mock response on API error
      const mockInsight = generateMockInsight(log);
      return NextResponse.json({ 
        success: true, 
        insight: mockInsight + '\n\n*Model: keller-insight-heuristic*'
      });
    }

    const data = await response.json();
    const insight = data.choices[0]?.message?.content || 'No insights generated.';
    const modelHeader = `*Model: ${modelUsed || 'unknown-model'}*`;

    console.log(`[KELLER] Successfully generated insight using model ${modelUsed}`);
    return NextResponse.json({ success: true, insight: `${modelHeader}\n\n${insight}` });

  } catch (error) {
    console.error('[KELLER] Insights API Exception:', error);
    
    // Fallback to mock response on any error
    const mockInsight = generateMockInsight('Error occurred');
    return NextResponse.json({ 
      success: true, 
      insight: mockInsight + '\n\n*Model: keller-insight-heuristic*'
    });
  }
}

function generateMockInsight(log) {
  // Simple mock insight based on log content
  const isSynthesis = log.includes('synthesis') || log.includes('Yosys') || log.includes('cells') || log.includes('Number of wires');
  const isSimulation = log.includes('simulation') || log.includes('iverilog') || log.includes('VCD');
  const hasError = log.includes('error') || log.includes('Error') || log.includes('FAILED');
  const hasSuccess = log.includes('success') || log.includes('Success') || log.includes('completed') || log.includes('0 problems');
  
  let insight = `## AI Design Insight\n\n`;
  
  if (hasError) {
    insight += `**Status**: Failed (high confidence)\n\n`;
    insight += `### What Happened\nThe compile/sim flow hit one or more blocking errors, so output is incomplete.\n\n`;
    insight += `### Root Cause\nLikely syntax/module connectivity mismatch based on error patterns.\n\n`;
    insight += `### Action Plan\n1. Fix the first reported error line before touching later errors.\n2. Check module names and port widths match exactly.\n3. Re-run simulation after each small fix.\n\n`;
  } else if (hasSuccess || isSynthesis || isSimulation) {
    insight += `**Status**: Passed (medium confidence)\n\n`;
    
    if (isSynthesis) {
      // Extract metrics from synthesis log
      const wiresMatch = log.match(/Number of wires:\s*(\d+)/);
      const cellsMatch = log.match(/Number of cells:\s*(\d+)/);
      const problemsMatch = log.match(/found and reported (\d+) problems/);
      
      insight += `### What Happened\nSynthesis completed and generated a gate-level representation.\n\n`;
      
      if (wiresMatch) {
        insight += `### Key Signals In The Log\n`;
        insight += `- Number of wires: ${wiresMatch[1]}\n`;
        if (cellsMatch) insight += `- Number of cells: ${cellsMatch[1]}\n`;
        if (problemsMatch && problemsMatch[1] === '0') insight += `- CHECK pass found 0 problems\n`;
        insight += `\n`;
      } else {
        insight += `### Key Signals In The Log\n- Metrics not present in log\n\n`;
      }
      
      insight += `### Root Cause\nNo blocking issue found.\n\n`;
      insight += `### Action Plan\n1. Inspect schematic for logic intent match.\n2. Run simulation with edge-case vectors.\n3. If area is high, try alternative synthesis recipe.\n\n`;
    } else if (isSimulation) {
      insight += `### What Happened\nSimulation completed and the design executed under the provided testbench.\n\n`;
      insight += `### Root Cause\nNo blocking issue found.\n\n`;
      insight += `### Action Plan\n1. Validate waveforms at reset, edge, and steady-state windows.\n2. Add corner-case test vectors (min/max values, back-to-back transitions).\n3. Add assertions for expected protocol behavior.\n\n`;
    }
  } else {
    insight += `**Status**: Partial (low confidence)\n\n`;
    insight += `### What Happened\nThe log does not contain enough signal to classify pass/fail.\n\n`;
    insight += `### Root Cause\nInsufficient log detail.\n\n`;
    insight += `### Action Plan\n1. Re-run and copy full compile + simulation logs.\n2. Ensure testbench includes $dumpfile and $dumpvars.\n3. Retry insights with complete output.\n\n`;
  }
  
  insight += `*Model: keller-insight-heuristic*`;
  
  return insight;
}
