// js/llm_anthropic_service.js - LLM integration via local server
export const LLMService = {
  serverUrl: 'http://localhost:3001',

  async init() {
    // No initialization needed
    return true;
  },

  async generatePatch(userDescription) {
    try {
      const response = await fetch(`${this.serverUrl}/api/generate-patch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description: userDescription }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate patch');
      }

      const data = await response.json();
      return data.patch;
    } catch (error) {
      console.error('Error calling server:', error);

      // If it's a network error, provide a helpful message
      if (error.message.includes('fetch')) {
        throw new Error(
          'Cannot connect to server. Make sure the server is running with: npm run server'
        );
      }

      throw error;
    }
  },
};
