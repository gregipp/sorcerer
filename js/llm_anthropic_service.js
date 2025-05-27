// js/llm_anthropic_service.js - LLM integration for patch generation
export const LLMService = {
  apiKey: null,
  apiEndpoint: 'https://api.anthropic.com/v1/messages',
  model: 'claude-4-sonnet-20250514',
  maxRetries: 3,

  async init() {
    // In production, this would come from a secure backend
    // For development, you can set it directly here or load from env
    this.apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY || '';

    if (!this.apiKey) {
      console.warn('Anthropic API key not configured');
      return false;
    }

    return true;
  },

  async generatePatch(userDescription) {
    if (!this.apiKey) {
      throw new Error('LLM service not configured');
    }

    // Define the tool schema for structured output
    const patchGeneratorTool = {
      name: 'generate_sorcerer_patch',
      description:
        'Generate a JSON patch for the SORCERER hand-tracking musical instrument',
      input_schema: {
        type: 'object',
        properties: {
          patchSchemaVersion: {
            type: 'string',
            enum: ['1.0'],
            description: "Must be '1.0'",
          },
          name: {
            type: 'string',
            description: 'Descriptive name for the patch',
          },
          description: {
            type: 'string',
            description: 'Brief description of the sound characteristics',
          },
          audio: {
            type: 'object',
            properties: {
              oscillatorType: {
                type: 'string',
                enum: ['sine', 'square', 'sawtooth', 'triangle'],
                description: 'Waveform type',
              },
              overtoneCount: {
                type: 'integer',
                minimum: 1,
                maximum: 20,
                description: 'Number of harmonics in additive synthesis',
              },
              attackTime: {
                type: 'number',
                minimum: 0.01,
                maximum: 5.0,
                description: 'Seconds to reach full volume',
              },
              releaseTime: {
                type: 'number',
                minimum: 0.01,
                maximum: 5.0,
                description: 'Seconds to fade to silence',
              },
              lfoMinFreq: {
                type: 'number',
                minimum: 0.1,
                maximum: 10,
                description: 'Base vibrato rate in Hz',
              },
              lfoMaxFreqMultiplier: {
                type: 'number',
                minimum: 1,
                maximum: 10,
                description: 'Maximum LFO rate multiplier',
              },
              lfoMaxDepthMultiplier: {
                type: 'number',
                minimum: 1,
                maximum: 50,
                description: 'Maximum vibrato depth',
              },
              filterCutoff: {
                type: 'number',
                minimum: 200,
                maximum: 20000,
                description: 'Filter cutoff frequency in Hz',
              },
              filterQ: {
                type: 'number',
                minimum: 0.1,
                maximum: 10,
                description: 'Filter resonance',
              },
              reverbMix: {
                type: 'number',
                minimum: 0.0,
                maximum: 1.0,
                description: 'Reverb wet/dry mix',
              },
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
          octaveOffset: {
            type: 'integer',
            minimum: -4,
            maximum: 4,
            description: 'Global pitch shift in octaves',
          },
          arpeggiator: {
            type: 'object',
            properties: {
              interval: {
                type: 'integer',
                minimum: 50,
                maximum: 1000,
                description: 'Milliseconds between arpeggio steps',
              },
              pattern: {
                type: 'array',
                items: { type: 'integer' },
                description: 'Array of semitone offsets from root',
              },
            },
            required: ['interval', 'pattern'],
          },
          visuals: {
            type: 'object',
            properties: {
              rayDensityMultiplier: {
                type: 'number',
                minimum: 0.1,
                maximum: 50,
                description: 'Ray spawn rate multiplier',
              },
              raySpeedMultiplier: {
                type: 'number',
                minimum: 0.1,
                maximum: 10,
                description: 'Ray movement speed multiplier',
              },
              rayColor: {
                type: 'string',
                pattern:
                  '^rgba?\\(\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*\\d+\\s*(,\\s*[\\d.]+\\s*)?\\)$',
                description: 'CSS color in rgba format',
              },
              crosshairBaseSize: {
                type: 'integer',
                minimum: 100,
                maximum: 300,
                description: 'Base crosshair size in pixels',
              },
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

    const systemPrompt = `You are a creative sound designer for the SORCERER hand-tracking musical instrument. Generate interesting and musical patches based on user descriptions.

Sound design guidelines:
- Bass sounds: use octaveOffset -1 to -3, lower filterCutoff (200-2000), sawtooth or square waves, higher filterQ (2-5)
- Lead sounds: use octaveOffset 0 to 1, higher filterCutoff (5000-15000), any wave type
- Pad sounds: use sine waves, slow attack (0.5-2.0), high overtone count, medium reverb
- Aggressive sounds: use sawtooth, fast attack, high filterQ, lower filterCutoff
- Ethereal sounds: use sine, slow attack, high reverb (0.5-0.8), gentle vibrato

Common arpeggiator patterns:
- Major chord: [0, 4, 7, 12]
- Minor chord: [0, 3, 7, 12]
- Dominant 7th: [0, 4, 7, 10]
- Wide spread: [-12, -8, -5, 0, 4, 7, 12, 7, 4, 0, -5, -8]
- Octaves: [0, 12, 24, 12]

Choose visual colors that match the sound character:
- Warm sounds: reds, oranges, yellows
- Cool sounds: blues, greens, purples
- Aggressive sounds: high saturation
- Soft sounds: lower saturation`;

    // Retry logic with tool calling
    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(this.apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 1000,
            temperature: 0.7,
            system: systemPrompt,
            tools: [patchGeneratorTool],
            tool_choice: { type: 'tool', name: 'generate_sorcerer_patch' },
            messages: [
              {
                role: 'user',
                content: `Create a patch for: ${userDescription}`,
              },
            ],
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            `API request failed: ${response.status} ${
              errorData.error?.message || response.statusText
            }`
          );
        }

        const data = await response.json();

        // Extract the tool use response
        if (!data.content || !Array.isArray(data.content)) {
          throw new Error('Invalid API response format');
        }

        const toolUse = data.content.find((item) => item.type === 'tool_use');
        if (!toolUse || !toolUse.input) {
          console.error(`Attempt ${attempt}: No tool use in response`);
          if (attempt === this.maxRetries) {
            throw new Error('No tool use in API response');
          }
          continue;
        }

        const patch = toolUse.input;

        console.log(`Successfully generated patch on attempt ${attempt}`);
        return patch;
      } catch (error) {
        console.error(
          `LLM generation error (attempt ${attempt}/${this.maxRetries}):`,
          error
        );
        lastError = error;

        if (attempt < this.maxRetries) {
          // Wait a bit before retrying (exponential backoff)
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    // All retries failed
    throw (
      lastError || new Error('Failed to generate valid patch after all retries')
    );
  },
};
