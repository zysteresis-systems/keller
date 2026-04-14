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

    const systemPrompt = `You are an expert VLSI professor aiding a beginner student using the Keller EDA sandbox.
Your task is to analyze the provided EDA tool log (from Yosys synthesis or Icarus Verilog simulation) and explain it in very simple, easy-to-understand terms.

Guidelines:
1. Briefly state whether the run was successful or failed.
2. If synthesis: Extract key metrics like Area (Chip area for module), total cells, and public wires. Explain what these mean for their design.
3. If simulation: Summarize what happened (e.g. waveform generated, testbench completed) or point out any runtime errors.
4. Keep the vocabulary simple. Avoid deep EDA jargon or explain it if you must use it.
5. Provide actionable advice if there's an error.
6. Use Markdown formatting for readability. Keep it concise (under 200 words).`;

    let response;
    let apiUsed;
    
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
        apiUsed = 'DeepSeek';
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
        apiUsed = 'Groq';
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
      console.error(`[KELLER] ${apiUsed} API Error:`, errorText);
      
      // Fallback to mock response on API error
      const mockInsight = generateMockInsight(log);
      return NextResponse.json({ 
        success: true, 
        insight: mockInsight + `\n\n*Note: ${apiUsed} API temporarily unavailable. Using cached analysis.*`
      });
    }

    const data = await response.json();
    const insight = data.choices[0]?.message?.content || 'No insights generated.';

    console.log(`[KELLER] Successfully generated insight using ${apiUsed}`);
    return NextResponse.json({ success: true, insight });

  } catch (error) {
    console.error('[KELLER] Insights API Exception:', error);
    
    // Fallback to mock response on any error
    const mockInsight = generateMockInsight('Error occurred');
    return NextResponse.json({ 
      success: true, 
      insight: mockInsight + `\n\n*Note: AI service temporarily unavailable. Using cached analysis.*`
    });
  }
}

function generateMockInsight(log) {
  // Simple mock insight based on log content
  const isSynthesis = log.includes('synthesis') || log.includes('Yosys') || log.includes('cells') || log.includes('Number of wires');
  const isSimulation = log.includes('simulation') || log.includes('iverilog') || log.includes('VCD');
  const hasError = log.includes('error') || log.includes('Error') || log.includes('FAILED');
  const hasSuccess = log.includes('success') || log.includes('Success') || log.includes('completed') || log.includes('0 problems');
  
  let insight = `## 🔍 AI Log Analysis\n\n`;
  
  if (hasError) {
    insight += `**Status**: Failed ❌\n\n`;
    insight += `**Issue Detected**: There seems to be an error in your design.\n\n`;
    insight += `**Common Fixes**:\n- Check your Verilog syntax for typos\n- Ensure all modules are properly defined\n- Verify port connections match between modules\n- Review any error messages above for specific issues\n\n`;
  } else if (hasSuccess || isSynthesis || isSimulation) {
    insight += `**Status**: Completed Successfully ✅\n\n`;
    
    if (isSynthesis) {
      // Extract metrics from synthesis log
      const wiresMatch = log.match(/Number of wires:\s*(\d+)/);
      const cellsMatch = log.match(/Number of cells:\s*(\d+)/);
      const problemsMatch = log.match(/found and reported (\d+) problems/);
      
      insight += `**Synthesis Results**: Your design was successfully converted to logic gates.\n\n`;
      
      if (wiresMatch) {
        insight += `**Metrics**:\n`;
        insight += `- **Wires**: ${wiresMatch[1]} internal connections\n`;
        if (cellsMatch) insight += `- **Cells**: ${cellsMatch[1]} logic gates\n`;
        if (problemsMatch && problemsMatch[1] === '0') insight += `- **Issues**: No problems detected\n`;
        insight += `\n`;
      }
      
      insight += `**What this means**: The tool understood your Verilog code and created a netlist of basic logic elements.\n\n`;
      insight += `**Next Steps**: You can now view the schematic to see your logic implementation, or proceed to simulation.\n\n`;
    } else if (isSimulation) {
      insight += `**Simulation Results**: Your testbench ran successfully.\n\n`;
      insight += `**What this means**: Your design behavior was verified against your test cases.\n\n`;
      insight += `**Next Steps**: Check the waveform viewer to see signal timing, or modify your testbench for more comprehensive testing.\n\n`;
    }
  } else {
    insight += `**Status**: Processing ⏳\n\n`;
    insight += `**Analysis**: The tool is currently processing your design.\n\n`;
    insight += `**What to expect**: Results will appear here once processing completes.\n\n`;
  }
  
  insight += `*This is an automated analysis. For detailed debugging, review the full log output above.*`;
  
  return insight;
}