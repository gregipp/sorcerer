# SORCERER

A hand-tracking musical instrument using MediaPipe and Web Audio API. Control synthesizers with hand gestures in your browser.

## How Patch Loading Works

The build system automatically handles patch loading for both development and production:

### Development / Dynamic Build

- Patches are loaded from `patches/*.json` files via fetch()
- Allows hot-reloading and easy patch development
- Standard JSON files with proper MIME types

### Static Build (Monolithic)

- Patches are embedded directly in the HTML as `<script type="application/json">` tags
- No network requests needed - everything is self-contained
- Patches remain as valid JSON (not converted to JavaScript)
- Example in the built HTML:

  ```html
  <script type="application/json" data-patch="classic_theremin.json" id="patch-0">
  {
    "name": "Classic Theremin",
    "audio": { ... }
  }
  </script>
  ```

The `PatchManager` automatically detects which method to use:

1. First checks for embedded patches in the DOM
2. Falls back to file-based loading if none found

This approach keeps the patches as pure JSON throughout the build process, making them easier to validate, edit, and maintain.

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

- Node.js 18+ and npm
- Modern web browser with WebRTC support
- Webcam for hand tracking

### Installation

```bash
# Clone the repository
git clone [repository-url]
cd sorcerer

# Install dependencies
npm install

# Note: This will create a package-lock.json file
# Commit this file to ensure consistent dependencies
```

### Development

```bash
# Start development server with hot reload
npm run dev
# Opens at http://localhost:3000
```

### Testing Locally

```bash
# Serve the current directory (no build needed)
npm run serve
# Opens at http://localhost:3000
```

## Building for Deployment

The project supports two deployment modes:

### 1. Static Build (Monolithic)

Creates a single HTML file with all assets inlined. Perfect for:

- Single file distribution
- Offline usage
- Email attachments
- Simple hosting

```bash
# Build static version
npm run build:static

# Preview static build
npm run preview:static

# Output: dist/static/index.html
```

### 2. Dynamic Build (Modular)

Preserves the module structure with separate files. Ideal for:

- CDN deployment
- Better caching
- Easier debugging
- Dynamic patch loading

```bash
# Build dynamic version
npm run build:dynamic

# Preview dynamic build
npm run preview:dynamic

# Output: dist/dynamic/
#   ├── index.html
#   ├── js/
#   ├── css/
#   └── patches/
```

### Build Both Versions

```bash
# Build both static and dynamic versions
npm run build
```

## Project Structure

```plaintext
sorcerer/
├── index.html          # Main HTML entry point
├── css/
│   └── style.css      # Application styles
├── js/
│   ├── config.js      # Global configuration
│   ├── main.js        # Application controller
│   ├── audio_engine.js # Web Audio synthesis
│   ├── hand_input.js  # MediaPipe hand tracking
│   ├── renderer.js    # Canvas visualization
│   └── patch_manager.js # Instrument preset management
├── patches/           # Instrument presets (JSON)
│   ├── classic_theremin.json
│   ├── bright_saw_lead.json
│   └── brutal_brass_bass.json
├── package.json       # NPM configuration
├── vite.config.js    # Build configuration
└── README.md         # This file
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
# Build static version
npm run build:static

# Deploy dist/static/index.html to GitHub Pages
```

### Netlify/Vercel

```bash
# Use dynamic build for better performance
npm run build:dynamic

# Deploy dist/dynamic/ directory
```

### Web Server

For dynamic deployment with a web server:

```bash
npm run build:dynamic
# Copy dist/dynamic/ contents to your web root
```

Note: The dynamic version requires proper MIME types for:

- `.js` → `application/javascript`
- `.json` → `application/json`

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14.1+
- Edge 90+

Requires:

- WebRTC for camera access
- Web Audio API
- ES6 modules (for dynamic build)

## Development Notes

- The static build inlines patches as JavaScript to avoid CORS issues
- Hand tracking works best with good lighting
- 2K camera resolution provides better tracking accuracy
- Use `console.log` for debugging (preserved in builds)

## Troubleshooting

**Camera not working:**

- Check browser permissions
- Ensure HTTPS or localhost
- Try a different browser

**No sound:**

- Click to start (Web Audio requires user interaction)
- Check system volume
- Verify browser supports Web Audio API

**Patches not loading (dynamic build):**

- Check web server MIME types
- Verify CORS headers if loading from CDN
- Check browser console for errors

**Performance issues:**

- Reduce camera resolution in `hand_input.js`
- Disable ray effects in patch visuals
- Use static build for better performance

## License

MIT License - See LICENSE file for details
