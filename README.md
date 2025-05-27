# SORCERER

A hand-tracking musical instrument using MediaPipe and Web Audio API. Control synthesizers with hand gestures in your browser.

## Features

- **Hand Tracking**: Uses MediaPipe for real-time hand detection
- **Multiple Instruments**: Switch between different synthesizer patches
- **Gesture Control**:
  - Left hand Y-axis: Pitch control
  - Left hand X-axis: Reverb amount
  - Right hand Y-axis: Overtone intensity
  - Right hand X-axis: Vibrato amount
  - Right hand fist: Activate arpeggiator
  - Left hand open fist gesture: Cycle through patches
- **Custom Patches**: Create custom synthesizer patches via JSON or AI-generated descriptions
- **Visual Feedback**: Dynamic ray effects that respond to your playing
- **AI Integration**: Generate patches using natural language descriptions (requires Anthropic API key)

## Quick Start

### Prerequisites

- Node.js 22+ and npm
- Modern web browser with WebRTC support
- Webcam for hand tracking
- (Optional) Anthropic API key for AI patch generation

### Installation

```bash
# Clone the repository
git clone [repository-url]
cd sorcerer

# Install dependencies
npm install
```

### Development

#### Basic Usage (without AI features)

```bash
# Start development server with hot reload
npm run dev
# Opens at http://localhost:3000
```

#### With AI Patch Generation

1. Create a `.env` file in the project root:
```env
ANTHROPIC_API_KEY=your-api-key-here
```

2. Start both the development server and API proxy:
```bash
# In one terminal, start the API proxy server
npm run server

# In another terminal, start the development server
npm run dev
```

The API proxy server runs on port 3001 by default and handles communication with the Anthropic API for patch generation.

## Building for Production

```bash
# Build single HTML file with everything embedded
npm run build

# Preview the build
npm run preview

# Output: dist/index.html
```

The build creates a single HTML file with all assets inlined - perfect for:

- Single file distribution
- Offline usage (note: AI features require server)
- Email attachments
- Simple hosting (GitHub Pages, etc.)

**Note**: The built version won't include AI patch generation unless you also deploy the server component.

## Project Structure

```plaintext
sorcerer/
├── index.html           # Main HTML entry point
├── css/
│   └── style.css        # Application styles
├── js/
│   ├── config.js        # Global configuration
│   ├── main.js          # Application controller
│   ├── audio_engine.js  # Web Audio synthesis
│   ├── hand_input.js    # MediaPipe hand tracking
│   ├── renderer.js      # Canvas visualization
│   ├── patch_manager.js # Instrument preset management
│   └── llm_service.js   # AI service integration
├── patches/             # Instrument presets (JSON)
│   ├── classic_theremin.json
│   ├── bright_saw_lead.json
│   └── brutal_brass_bass.json
├── server.js            # Express server for Anthropic API proxy
├── package.json         # NPM configuration
├── vite.config.mjs      # Build configuration
├── .env                 # Environment variables (create this)
├── .gitignore           # Git ignore file
└── README.md            # This file
```

## Creating Custom Patches

### Method 1: JSON Format

Patches are JSON files that define synthesizer parameters. Create or paste a JSON patch:

```json
{
  "patchSchemaVersion": "1.0",
  "name": "My Custom Patch",
  "description": "Description of the sound",
  "audio": {
    "oscillatorType": "sine",
    "overtoneCount": 4,
    "attackTime": 0.1,
    "releaseTime": 0.5,
    "lfoMinFreq": 2.0,
    "lfoMaxFreqMultiplier": 3,
    "lfoMaxDepthMultiplier": 10,
    "filterCutoff": 15000,
    "filterQ": 1.5,
    "reverbMix": 0.3
  },
  "octaveOffset": 0,
  "arpeggiator": {
    "interval": 200,
    "pattern": [0, 4, 7, 12]
  },
  "visuals": {
    "rayDensityMultiplier": 20,
    "raySpeedMultiplier": 2,
    "rayColor": "rgba(100, 220, 100, 0.8)",
    "crosshairBaseSize": 180
  }
}
```

### Method 2: AI Generation

With the server running, you can describe sounds in natural language:

- "A deep, growling bass with lots of reverb"
- "A bright, shimmering lead sound"
- "An ethereal pad with slow attack"
- "Aggressive dubstep bass"
- "Dreamy ambient texture"

### Loading Custom Patches

1. Click the "+" button in the patch panel
2. Either:
   - Paste your JSON into the text area
   - Describe the sound you want in natural language (requires server)
3. Click "Generate Patch" or press Ctrl+Enter

**Note**: Currently limited to one custom patch at a time. Delete existing custom patches to create new ones.

## Environment Variables

Create a `.env` file in the project root:

```env
# Required for AI patch generation
ANTHROPIC_API_KEY=your-anthropic-api-key

# Optional: Change server port (default: 3001)
PORT=3001
```

## Deployment

### Static Hosting (without AI features)

For GitHub Pages, Netlify, Vercel, etc.:

```bash
# Build command
npm run build

# Publish directory
dist

# Single file to deploy
dist/index.html
```

### Full Deployment (with AI features)

You'll need to deploy both the static site and the Node.js server:

1. **Frontend**: Deploy the built `dist/index.html` to any static host
2. **Backend**: Deploy `server.js` to a Node.js host (Heroku, Railway, etc.)
3. **Update** `js/llm_service.js` to point to your deployed server URL

Example server deployment (Heroku):
```bash
# Add Procfile
echo "web: node server.js" > Procfile

# Deploy
git push heroku main

# Set environment variable
heroku config:set ANTHROPIC_API_KEY=your-api-key
```

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14.1+
- Edge 90+

Requires:

- WebRTC for camera access
- Web Audio API
- ES6 modules

## Troubleshooting

**Camera not working:**

- Check browser permissions
- Ensure HTTPS or localhost
- Try a different browser

**No sound:**

- Click to start (Web Audio requires user interaction)
- Check system volume
- Verify browser supports Web Audio API

**AI patch generation not working:**

- Ensure the server is running (`npm run server`)
- Check that `.env` file contains valid `ANTHROPIC_API_KEY`
- Verify server is accessible at `http://localhost:3001`
- Check browser console for error messages

**Performance issues:**

- Reduce camera resolution in `hand_input.js`
- Disable ray effects in patch visuals
- Close other tabs/applications

## Security Notes

- Never commit your `.env` file or expose your API key
- The API proxy server prevents exposing your Anthropic API key to the browser
- In production, add appropriate CORS restrictions to `server.js`

