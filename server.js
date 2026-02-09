import 'dotenv/config';
import express from 'express';

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

function buildPrompt(language, code) {
  return [
    {
      role: 'user',
      content:
        `You are an expert code analyzer. Your job: detect whether the provided code has an error, explain it, and provide corrected code. You must respond with ONLY valid JSON.\n\nLanguage: ${language}\n\nCode:\n\n${code}\n\nReturn ONLY JSON in this exact shape:\n{\n  "hasError": boolean,\n  "error": {\n    "type": string,\n    "reason": string,\n    "line": number|null\n  }|null,\n  "correctedCode": string|null\n}\n\nRules:\n- If there is no error, set hasError=false, error=null, correctedCode=null.\n- If there is an error, set hasError=true and fill: type (e.g., SyntaxError/CompilationError/TypeError/etc), reason (clear explanation), and line (specific line number if possible).\n- Provide correctedCode as the corrected full code.\n- Be strict: respond with JSON only, no markdown, no extra keys.\n- If multiple issues exist, report the most critical one and still provide a corrected version of the full code.`,
    },
  ];
}

app.post('/api/analyze', async (req, res) => {
  try {
    const { language, code } = req.body ?? {};

    if (!language || typeof language !== 'string') {
      return res.status(400).json({ error: 'Missing language' });
    }

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Missing code' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Server missing GEMINI_API_KEY' });
    }

    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`, {
      timeout: 30000,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: buildPrompt(language, code).map(msg => ({
          role: msg.role === 'system' ? 'user' : msg.role,
          parts: [{ text: msg.content }]
        })),
        generationConfig: {
          temperature: 0,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Gemini error status:', response.status, response.statusText);
      console.error('Gemini error body:', text);
      
      // Handle rate limit specifically
      if (response.status === 429) {
        return res.status(429).json({ 
          error: 'Rate limit exceeded. Please wait a moment before trying again.', 
          details: 'Free tier limit: 20 requests per day. Try again later or upgrade your plan.',
          isRateLimit: true 
        });
      }
      
      return res.status(502).json({ error: 'Gemini request failed', details: text });
    }

    const data = await response.json();
    console.log('Gemini raw response:', JSON.stringify(data, null, 2));
    
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content || typeof content !== 'string') {
      console.error('Gemini returned empty or invalid content:', data);
      return res.status(502).json({ error: 'Gemini returned empty response', details: JSON.stringify(data) });
    }

    console.log('Gemini content:', content);

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse Gemini response as JSON:', content);
      console.error('Parse error:', e.message);
      return res.status(502).json({ error: 'Gemini returned non-JSON', details: content });
    }

    const hasError = Boolean(parsed?.hasError);
    const error = parsed?.error ?? null;
    const correctedCode = parsed?.correctedCode ?? null;

    if (!hasError) {
      return res.json({ hasError: false, error: null, correctedCode: null });
    }

    if (!error || typeof error !== 'object') {
      return res.json({ hasError: true, error: { type: 'UnknownError', reason: 'Unknown', line: null }, correctedCode });
    }

    return res.json({
      hasError: true,
      error: {
        type: typeof error.type === 'string' ? error.type : 'UnknownError',
        reason: typeof error.reason === 'string' ? error.reason : 'Unknown',
        line: typeof error.line === 'number' ? error.line : null,
      },
      correctedCode: typeof correctedCode === 'string' ? correctedCode : null,
    });
  } catch (e) {
    console.error('Server error details:', e);
    return res.status(500).json({ error: 'Server error', details: e instanceof Error ? e.message : String(e) });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
