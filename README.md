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
- **Custom Patches**: Load custom synthesizer patches via JSON
- **Visual Feedback**: Dynamic ray effects that respond to your playing

## Quick Start

### Prerequisites

- Node.js 22+ and npm
- Modern web browser with WebRTC support
- Webcam for hand tracking

### Installation

```bash
# Clone the repository
git clone [repository-url]
cd sorcerer

# Install dependencies
npm install
```

### Development

```bash
# Start development server with hot reload
npm run dev
# Opens at http://localhost:3000
```

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
- Offline usage
- Email attachments
- Simple hosting (GitHub Pages, etc.)

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
│   └── patch_manager.js # Instrument preset management
├── patches/             # Instrument presets (JSON)
│   ├── classic_theremin.json
│   ├── bright_saw_lead.json
│   └── brutal_brass_bass.json
├── package.json         # NPM configuration
├── vite.config.mjs      # Build configuration
└── README.md            # This file
```

## Creating Custom Patches

Patches are JSON files that define synthesizer parameters. Create a new patch:

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

### Loading Custom Patches

1. In the UI, paste your JSON into the text area that appears after starting
2. Click "Load Custom Patch"

## Deployment

### GitHub Pages

```bash
# Build and deploy
npm run build
# Push dist/index.html to gh-pages branch
```

### Netlify/Vercel

```bash
# Build command
npm run build

# Publish directory
dist
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

**Performance issues:**

- Reduce camera resolution in `hand_input.js`
- Disable ray effects in patch visuals
- Close other tabs/applications

## License

MIT License - See LICENSE file for details
