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

const systemPrompt = `You are Keller AI Tutor, an expert-level VLSI/EDA engineering assistant.
Your job is to read dense output logs from Icarus Verilog or Yosys synthesis and transform them into brilliant, highly-readable metrics and debugging advice.

STRICT OUTPUT FORMAT RULES:
1. Always start with a top-level heading: "# ✨ Design Insights".
2. If this is a SYNTHESIS log, extract the following into a neatly aligned Markdown Table under "## 📊 Synthesis Metrics":
    - Tool/PDK used (if present)
    - Total Cells / Gates
    - Estimated Area (if 'Chip area for module' is listed)
    - Number of Wires / Public Wires
    - Any syntax errors or 'found and reported X problems'
3. If this is a SIMULATION log, provide a "## 📈 Simulation Outcome" section summarizing \\$dumpfile behavior, testbench ticks, and any runtime assertions.
4. Provide "## 🔍 Deep Analysis". Explain *what the numbers mean* for a student (e.g., "Your design requires 56 standard cells, which is highly optimal for a 4-bit adder").
5. Provide "## 🛠️ Actionable Next Steps". Use bullet points. If there's an error, point directly to the line number and write a Code Block with the fix.

TONE:
Professional, extremely analytical, but accessible to a junior engineer. Use bolding to highlight numbers and file names. Do NOT output standard conversational filler, just the requested markdown sections.`;

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
            temperature: 0.1,
            max_tokens: 800,
          }),
        });
        modelUsed = 'deepseek-chat';
      } catch (error) {
        console.error('[KELLER] DeepSeek API Error:', error);
      }
    }
    
    // Fallback to Groq API (Flagship 70B model)
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
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Here is the log output:\n\n${log}` }
            ],
            temperature: 0.1,
            max_tokens: 800,
          }),
        });
        modelUsed = 'llama-3.3-70b-versatile';
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
      const mockInsight = generateMockInsight(log);
      return NextResponse.json({ 
        success: true, 
        insight: mockInsight + `\n\n*API Error: The upstream AI provider returned an error.*`
      });
    }

    const data = await response.json();
    const insight = data.choices[0]?.message?.content || 'No insights generated.';
    const modelHeader = `<div class="text-[10px] text-keller-dim mb-4 tracking-widest uppercase flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-keller-success animate-pulse"></span> Powered by ${modelUsed}</div>`;

    console.log(`[KELLER] Successfully generated insight using model ${modelUsed}`);
    return NextResponse.json({ success: true, insight: `${modelHeader}\n\n${insight}` });

  } catch (error) {
    console.error('[KELLER] Insights API Exception:', error);
    const mockInsight = generateMockInsight('Error occurred');
    return NextResponse.json({ 
      success: true, 
      insight: mockInsight + '\n\n*Server Exception Encountered*'
    });
  }
}

function generateMockInsight(log) {
  return `# ✨ Design Insights\n\n**Warning:** The application is currently running in offline heuristic mode because standard AI API connections failed.\n\n### 🔍 Basic Log Scan\n- Look for terms like "Error" or "syntax error" in your code.\n- Check whether $dumpfile is correctly invoked.\n\n### 🛠️ Actionable Next Steps\n- Add a valid Groq or DeepSeek API key in your deployment settings to enable full Llama-3.3-70b AI intelligence.`;
}
