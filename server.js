// server.js - Simple proxy server for Anthropic API
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Proxy endpoint for Anthropic API
app.post('/api/generate-patch', async (req, res) => {
  const { description } = req.body;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const patchGeneratorTool = {
    name: 'generate_sorcerer_patch',
    description:
      'Generate a JSON patch for the SORCERER hand-tracking musical instrument',
    input_schema: {
      type: 'object',
      properties: {
        patchSchemaVersion: { type: 'string', enum: ['1.0'] },
        name: { type: 'string' },
        description: { type: 'string' },
        audio: {
          type: 'object',
          properties: {
            oscillatorType: {
              type: 'string',
              enum: ['sine', 'square', 'sawtooth', 'triangle'],
            },
            overtoneCount: { type: 'integer', minimum: 1, maximum: 20 },
            attackTime: { type: 'number', minimum: 0.01, maximum: 5.0 },
            releaseTime: { type: 'number', minimum: 0.01, maximum: 5.0 },
            lfoMinFreq: { type: 'number', minimum: 0.1, maximum: 10 },
            lfoMaxFreqMultiplier: { type: 'number', minimum: 1, maximum: 10 },
            lfoMaxDepthMultiplier: { type: 'number', minimum: 1, maximum: 50 },
            filterCutoff: { type: 'number', minimum: 200, maximum: 20000 },
            filterQ: { type: 'number', minimum: 0.1, maximum: 10 },
            reverbMix: { type: 'number', minimum: 0.0, maximum: 1.0 },
          },
          required: [
            'oscillatorType',
            'overtoneCount',
            'attackTime',
            'releaseTime',
            'lfoMinFreq',
            'lfoMaxFreqMultiplier',
            'lfoMaxDepthMultiplier',
            'filterCutoff',
            'filterQ',
            'reverbMix',
          ],
        },
        octaveOffset: { type: 'integer', minimum: -4, maximum: 4 },
        arpeggiator: {
          type: 'object',
          properties: {
            interval: { type: 'integer', minimum: 50, maximum: 1000 },
            pattern: { type: 'array', items: { type: 'integer' } },
          },
          required: ['interval', 'pattern'],
        },
        visuals: {
          type: 'object',
          properties: {
            rayDensityMultiplier: { type: 'number', minimum: 0.1, maximum: 50 },
            raySpeedMultiplier: { type: 'number', minimum: 0.1, maximum: 10 },
            rayColor: {
              type: 'string',
              pattern:
                '^rgba?\\(\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*\\d+\\s*(,\\s*[\\d.]+\\s*)?\\)$',
            },
            crosshairBaseSize: { type: 'integer', minimum: 100, maximum: 300 },
          },
          required: [
            'rayDensityMultiplier',
            'raySpeedMultiplier',
            'rayColor',
            'crosshairBaseSize',
          ],
        },
      },
      required: [
        'patchSchemaVersion',
        'name',
        'description',
        'audio',
        'octaveOffset',
        'arpeggiator',
        'visuals',
      ],
    },
  };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-20250514',
        max_tokens: 1000,
        temperature: 0.7,
        system: `You are a creative sound designer for the SORCERER hand-tracking musical instrument. Generate interesting and musical patches based on user descriptions.

Sound design guidelines:
- Bass sounds: use octaveOffset -1 to -3, lower filterCutoff (200-2000), sawtooth or square waves
- Lead sounds: use octaveOffset 0 to 1, higher filterCutoff (5000-15000)
- Pad sounds: use sine waves, slow attack (0.5-2.0), high reverb
- Aggressive sounds: use sawtooth, fast attack, high filterQ
- Ethereal sounds: use sine, slow attack, high reverb, gentle vibrato`,
        tools: [patchGeneratorTool],
        tool_choice: { type: 'tool', name: 'generate_sorcerer_patch' },
        messages: [
          { role: 'user', content: `Create a patch for: ${description}` },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'API request failed');
    }

    const toolUse = data.content.find((item) => item.type === 'tool_use');
    if (!toolUse?.input) {
      throw new Error('Invalid response from API');
    }

    res.json({ patch: toolUse.input });
  } catch (error) {
    console.error('Error generating patch:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
