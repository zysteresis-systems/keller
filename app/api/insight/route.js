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

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'GROQ_API_KEY is not configured on the server.' },
        { status: 500 }
      );
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

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Here is the log output:\n\n${log}` }
        ],
        temperature: 0.2, // Keep it focused and analytical
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[KELLER] Groq API Error:', errorText);
      return NextResponse.json(
        { success: false, error: `Groq AI API error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const insight = data.choices[0]?.message?.content || 'No insights generated.';

    return NextResponse.json({ success: true, insight });

  } catch (error) {
    console.error('[KELLER] Insights API Exception:', error);
    return NextResponse.json(
      { success: false, error: `Server error: ${error.message}` },
      { status: 500 }
    );
  }
}
