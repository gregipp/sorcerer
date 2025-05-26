# SORCERER Development Guide

## Architecture Overview

SORCERER is built as a modular ES6 application with clear separation of concerns:

- **`main.js`** - Application controller and lifecycle management
- **`config.js`** - Global configuration and defaults
- **`audio_engine.js`** - Web Audio API synthesis engine
- **`hand_input.js`** - MediaPipe hand tracking integration
- **`renderer.js`** - Canvas-based visualization
- **`patch_manager.js`** - Instrument preset management

## Development Workflow

### Initial Setup

```bash
# First time setup
npm run setup

# Or manually:
npm install
```

### Development Server

```bash
# Start Vite dev server with HMR
npm run dev
# Opens at http://localhost:3000
```

### Quick Testing

```bash
# Serve without building (uses source files)
npm run serve
```

## Build System

The project uses Vite for building with two distinct modes:

### Static Build (Monolithic)

- Single HTML file with everything inlined
- Uses `vite-plugin-singlefile`
- Patches are embedded as JavaScript
- No external dependencies
- Ideal for offline use

### Dynamic Build (Modular)

- Preserves module structure
- Separate JS/CSS files
- External patch files
- Better for CDN deployment
- Easier debugging

## Code Architecture

### Module Dependencies

```plaintext
config.js (no deps)
    ↓
patch_manager.js → config.js
    ↓
audio_engine.js → config.js
hand_input.js → config.js
renderer.js → config.js
    ↓
main.js → all modules
```

### Key Design Patterns

1. **Singleton Modules**: Each module exports a single object with methods
2. **Event-Driven**: Hand tracking drives audio and visual updates
3. **Functional Reactive**: Hand positions flow through the system
4. **Configuration-Based**: Patches define both audio and visual behavior

## Adding Features

### New Synthesizer Parameter

1. Add to `config.js` defaults:

   ```javascript
   audioDefaults: {
     // ... existing
     myNewParam: 1.0
   }
   ```

2. Update patch schema in patches:

   ```json
   "audio": {
     "myNewParam": 2.0
   }
   ```

3. Implement in `audio_engine.js`:

   ```javascript
   applyPatch(patch) {
     this.currentSettings.myNewParam = patch.audio.myNewParam;
     // Apply to audio nodes
   }
   ```

### New Visual Effect

1. Add to visual config in `config.js`
2. Update patch schema for visual override
3. Implement in `renderer.js`

### New Gesture

1. Detect in `hand_input.js` `_processHandResults()`
2. Add to hand data structure
3. Handle in `main.js` `onHandsUpdate()`

## Performance Considerations

### Hand Tracking

- 2K resolution provides better accuracy but higher CPU
- Reduce to 720p if performance issues
- Model complexity 1 is a good balance

### Audio

- Oscillator count affects CPU usage
- Filter and reverb are computationally expensive
- Use `setTargetAtTime()` for smooth parameter changes

### Rendering

- Ray effects can be expensive with high density
- Canvas clearing is optimized
- RequestAnimationFrame ensures 60fps sync

## Debugging

### Common Issues

**No sound:**

```javascript
// Check in console:
AudioEngine.audioCtx.state // Should be "running"
AudioEngine.isPlaying // Should be true when hands detected
```

**Hand tracking issues:**

```javascript
// Check hand data:
HandInput.handPositions // Should update when hands visible
```

**Patch loading fails:**

```javascript
// Check patches:
PatchManager.patches // Should contain loaded patches
```

### Debug Mode

Add to URL: `?debug=true` (when implemented) or use console:

```javascript
// Enable verbose logging
window.DEBUG = true;
```

## Testing

### Manual Testing Checklist

- [ ] Both hands tracked properly
- [ ] Pitch control (left hand Y)
- [ ] Reverb control (left hand X)
- [ ] Overtone control (right hand Y)
- [ ] Vibrato control (right hand X)
- [ ] Arpeggiator (right fist)
- [ ] Patch switching (left fist open)
- [ ] All patches load correctly
- [ ] Custom patch loading
- [ ] Visual effects match audio
- [ ] No hands message appears/disappears
- [ ] Performance is smooth

### Browser Testing

Test in:

- Chrome (primary)
- Firefox
- Safari
- Edge

### Build Testing

```bash
# Test both builds
npm run build
npm run preview:static
npm run preview:dynamic
```

## Deployment

### GitHub Pages

```bash
# Build and deploy
npm run build:static
# Push dist/static/index.html to gh-pages branch
```

### Netlify

```toml
# netlify.toml
[build]
  command = "npm run build:dynamic"
  publish = "dist/dynamic"

[[headers]]
  for = "/*.js"
  [headers.values]
    Content-Type = "application/javascript; charset=UTF-8"
```

### Custom Server

Nginx example:

```nginx
location / {
    root /var/www/sorcerer;
    try_files $uri $uri/ /index.html;
}

location ~ \\.js$ {
    add_header Content-Type application/javascript;
}

location ~ \\.json$ {
    add_header Content-Type application/json;
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Follow existing code style
4. Test thoroughly
5. Submit pull request

### Code Style

- ES6 modules
- Async/await over promises
- Descriptive variable names
- JSDoc comments for public methods
- Console.log for debugging (removed in production)

## Future Enhancements

- [ ] MIDI output support
- [ ] Recording capabilities
- [ ] More hand gestures
- [ ] Visual shader effects
- [ ] Preset interpolation
- [ ] Multi-user support
- [ ] Mobile touch fallback
