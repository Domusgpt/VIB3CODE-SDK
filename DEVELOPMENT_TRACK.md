# VIB3+ CORE - Phase 6: Unified Reactivity & Export System

**Session Started**: 2026-01-25
**Branch**: `claude/phase-5-hardening-a4Wzn`
**Previous Work**: WASM core working, e2e tests passing, 3 systems operational

---

## 🎯 OBJECTIVE

Build a unified ReactivityConfig system that:
1. Configures audio/tilt/interactivity mappings
2. Exports complete behavior with visualizations
3. Integrates with C++ WASM core for performance
4. Supports agentic control via MCP/CLI
5. Enables portable use in web, video, UI, and creative applications

---

## 📐 ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────┐
│                     UNIFIED REACTIVITY SYSTEM                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │  AUDIO INPUT    │  │  DEVICE TILT    │  │  INTERACTION    │      │
│  │  ───────────    │  │  ───────────    │  │  ───────────    │      │
│  │  bass/mid/high  │  │  α/β/γ → 6D     │  │  mouse/click/   │      │
│  │  → parameters   │  │  rotation       │  │  scroll/touch   │      │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘      │
│           │                    │                    │                │
│           └────────────────────┼────────────────────┘                │
│                                │                                     │
│                    ┌───────────▼───────────┐                        │
│                    │   ReactivityConfig    │                        │
│                    │   ─────────────────   │                        │
│                    │   {                   │                        │
│                    │     audio: {...},     │                        │
│                    │     tilt: {...},      │                        │
│                    │     interaction: {...}│                        │
│                    │   }                   │                        │
│                    └───────────┬───────────┘                        │
│                                │                                     │
│         ┌──────────────────────┼──────────────────────┐             │
│         │                      │                      │              │
│         ▼                      ▼                      ▼              │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐          │
│  │   QUANTUM   │      │   FACETED   │      │ HOLOGRAPHIC │          │
│  │   ENGINE    │      │   SYSTEM    │      │   SYSTEM    │          │
│  └─────────────┘      └─────────────┘      └─────────────┘          │
│                                                                       │
├─────────────────────────────────────────────────────────────────────┤
│                         EXPORT SYSTEM                                 │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  VIB3Package = {                                             │    │
│  │    version: "2.0",                                           │    │
│  │    system: "quantum",                                        │    │
│  │    parameters: {...},          // Visual parameters          │    │
│  │    reactivity: {...},          // Full behavior config       │    │
│  │    metadata: {...},            // Author, created, etc       │    │
│  │    embed: {                    // Portable embed code        │    │
│  │      html: "...",                                            │    │
│  │      css: "...",                                             │    │
│  │      js: "..."                                               │    │
│  │    }                                                         │    │
│  │  }                                                           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  Export Targets:                                                     │
│  • Web Component (.html/.js)    • Video Background (.mp4/.webm)     │
│  • UI Widget (React/Vue/Svelte) • OBS Source (Browser source)       │
│  • Trading Card (.html)         • Social Media (Instagram/TikTok)   │
│  • API Endpoint (JSON)          • Creative Suite (AE/Premiere)      │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📋 PHASE 6 DEVELOPMENT PLAN

### **PHASE 6.1: ReactivityConfig Core** (Foundation)

**Goal**: Create the unified configuration object that ties all input sources to parameters.

**Files to Create**:
```
src/reactivity/
├── ReactivityConfig.js      # Main config schema and validation
├── ReactivityManager.js     # Coordinates all input sources
├── AudioReactivityEngine.js # Enhanced audio with configurable mappings
├── TiltReactivityEngine.js  # Device tilt with configurable sensitivity
├── InteractionEngine.js     # Mouse/touch/click with modes
└── index.js                 # Module exports
```

**ReactivityConfig Schema**:
```javascript
{
  version: "1.0",

  audio: {
    enabled: false,
    globalSensitivity: 1.0,
    smoothing: 0.8,
    bands: {
      bass: {
        enabled: true,
        sensitivity: 1.5,
        targets: [
          { param: "morphFactor", weight: 0.8, mode: "add" },
          { param: "intensity", weight: 0.3, mode: "multiply" }
        ]
      },
      mid: {
        enabled: true,
        sensitivity: 1.0,
        targets: [
          { param: "chaos", weight: 0.5, mode: "add" }
        ]
      },
      high: {
        enabled: true,
        sensitivity: 0.8,
        targets: [
          { param: "speed", weight: 0.4, mode: "add" },
          { param: "hue", weight: 10, mode: "add" }
        ]
      }
    }
  },

  tilt: {
    enabled: false,
    sensitivity: 1.0,
    smoothing: 0.1,
    dramaticMode: false,
    mappings: {
      alpha: { target: "rot4dXY", scale: 0.006 },
      beta: { target: "rot4dXW", scale: 0.01 },
      gamma: { target: "rot4dYW", scale: 0.015 }
    }
  },

  interaction: {
    enabled: true,
    mouse: {
      mode: "rotation",  // rotation|velocity|shimmer|none
      sensitivity: 1.0,
      targets: ["rot4dXY", "rot4dYZ"]
    },
    click: {
      mode: "burst",     // burst|blast|ripple|none
      intensity: 1.0,
      target: "morphFactor"
    },
    scroll: {
      mode: "cycle",     // cycle|wave|sweep|zoom|none
      sensitivity: 1.0,
      target: "geometry"
    },
    touch: {
      multiTouchEnabled: true,
      pinchZoom: true,
      swipeGestures: true
    }
  }
}
```

**MCP Tools to Add**:
- `set_reactivity_config` - Set full config
- `get_reactivity_config` - Get current config
- `set_audio_mapping` - Configure single audio band
- `set_tilt_mapping` - Configure tilt axis
- `set_interaction_mode` - Configure interaction type

---

### **PHASE 6.2: Core Type Selector UI** (3 Modulations)

**Goal**: Expose the Base/Hypersphere/Hypertetrahedron core type selection in UI.

**What Already Exists**:
- `warpHypersphereCore()` in `/src/geometry/warp/HypersphereCore.js`
- `warpHypertetraCore()` in `/src/geometry/warp/HypertetraCore.js`
- Geometry encoding: `geometry = coreIndex * 8 + baseIndex`

**UI Changes**:
- Add 3-button Core Type selector: [Base] [Hypersphere] [Hypertetra]
- When core type changes, recalculate geometry index
- Show current core type in geometry display

**Files to Modify**:
- `index.html` - Add Core Type buttons
- `/js/ui-handlers.js` - Wire up core type selection
- `/src/core/Parameters.js` - Add `coreType` parameter (0-2)

---

### **PHASE 6.3: Reactivity UI Controls**

**Goal**: Add UI panels for configuring audio/tilt/interaction mappings.

**UI Panels**:

1. **Audio Reactivity Panel**
   - Enable/disable toggle
   - Global sensitivity slider (0.1-3.0)
   - Per-band configuration:
     - Bass: target param dropdown, sensitivity slider
     - Mid: target param dropdown, sensitivity slider
     - High: target param dropdown, sensitivity slider
   - Visual feedback (real-time audio levels)

2. **Tilt Settings Panel**
   - Enable/disable toggle
   - Sensitivity slider (0.1-3.0)
   - Smoothing slider (0.01-1.0)
   - Dramatic Mode toggle
   - Axis mapping dropdowns (which axis → which rotation)

3. **Interaction Settings Panel**
   - Mouse mode selector: Rotation / Velocity / Shimmer / None
   - Click mode selector: Burst / Blast / Ripple / None
   - Scroll mode selector: Cycle / Wave / Sweep / Zoom / None
   - Sensitivity sliders for each

**Files to Create**:
```
js/ui/
├── ReactivityPanel.js       # Main reactivity UI component
├── AudioConfigPanel.js      # Audio band configuration
├── TiltConfigPanel.js       # Tilt axis configuration
└── InteractionConfigPanel.js # Mouse/click/scroll configuration
```

---

### **PHASE 6.4: Enhanced Export System** (VIB3Package)

**Goal**: Export complete visualization packages with behavior.

**VIB3Package Format**:
```javascript
{
  // Metadata
  version: "2.0",
  type: "vib3-package",
  name: "My Visualization",
  author: "User Name",
  created: "2026-01-25T...",

  // Visual State
  system: "quantum",
  geometry: 10,
  parameters: {
    rot4dXY: 0.5,
    rot4dXW: 1.2,
    // ... all parameters
  },

  // Behavior (NEW)
  reactivity: {
    audio: { ... },
    tilt: { ... },
    interaction: { ... }
  },

  // Embed Code (NEW)
  embed: {
    // Self-contained HTML that recreates the visualization
    html: "<div id='vib3-container'>...</div>",
    css: "...",
    js: "...",

    // Or as URLs for CDN-hosted versions
    scriptUrl: "https://cdn.../vib3-embed.min.js",
    styleUrl: "https://cdn.../vib3-embed.min.css"
  },

  // Integration Helpers (NEW)
  integrations: {
    // React component code
    react: "import { Vib3Viz } from 'vib3-react'; ...",
    // Vue component code
    vue: "<template>...</template>",
    // Web component usage
    webComponent: "<vib3-viz config='...'></vib3-viz>",
    // OBS browser source URL
    obsSource: "http://localhost:3457/embed/[id]",
    // Video export settings
    video: {
      recommendedResolution: "1920x1080",
      recommendedFps: 60,
      duration: null // infinite
    }
  },

  // Agentic Control (NEW)
  agentConfig: {
    mcpEndpoint: "http://localhost:3000/mcp",
    cliCommand: "vib3 load package.json",
    eventStream: "http://localhost:3000/events"
  }
}
```

**Export Targets**:
| Target | Format | Use Case |
|--------|--------|----------|
| Web Embed | HTML/JS/CSS | Website backgrounds, landing pages |
| React Component | JSX | React applications |
| Vue Component | SFC | Vue applications |
| Web Component | Custom Element | Framework-agnostic |
| Trading Card | HTML | Social sharing, collections |
| OBS Source | URL | Live streaming backgrounds |
| Video Background | MP4/WebM | Video editing, presentations |
| API Config | JSON | Programmatic control |
| Creative Suite | After Effects | Motion graphics |

**Files to Create/Modify**:
```
src/export/
├── VIB3PackageExporter.js   # Main package export
├── EmbedGenerator.js        # Generate embed code
├── WebComponentExporter.js  # Export as web component
├── VideoExporter.js         # Export video frames
├── IntegrationGenerator.js  # Generate framework-specific code
└── index.js
```

---

### **PHASE 6.5: Agentic Integration**

**Goal**: Expose reactivity config through MCP/CLI for agent control.

**New MCP Tools**:
```javascript
// Full reactivity control
'set_reactivity_config': {
  description: 'Set complete reactivity configuration',
  inputSchema: ReactivityConfigSchema
},

'get_reactivity_config': {
  description: 'Get current reactivity configuration'
},

// Audio-specific
'configure_audio_band': {
  description: 'Configure single audio frequency band',
  inputSchema: {
    band: 'bass|mid|high',
    enabled: boolean,
    sensitivity: number,
    targets: [{ param, weight, mode }]
  }
},

// Export
'export_package': {
  description: 'Export complete VIB3Package',
  inputSchema: {
    name: string,
    includeReactivity: boolean,
    includeEmbed: boolean,
    format: 'json|html|webcomponent'
  }
},

// Behavior presets
'apply_behavior_preset': {
  description: 'Apply a named behavior preset',
  inputSchema: {
    preset: 'calm|energetic|reactive|ambient|aggressive'
  }
}
```

**CLI Commands**:
```bash
# Set reactivity
vib3 reactivity audio --band bass --target morphFactor --sensitivity 1.5
vib3 reactivity tilt --enable --dramatic
vib3 reactivity interaction --mouse rotation --click burst

# Export
vib3 export package --name "My Viz" --include-reactivity --format json
vib3 export embed --format webcomponent > my-viz.js
vib3 export video --duration 30 --fps 60 --output background.mp4

# Presets
vib3 preset apply calm
vib3 preset save "my-preset"
vib3 preset list
```

---

### **PHASE 6.6: Behavior Presets**

**Goal**: Pre-configured behavior presets for common use cases.

**Preset Categories**:

1. **Ambient** - Calm, slow, minimal reactivity
   - Audio: disabled
   - Tilt: low sensitivity, high smoothing
   - Interaction: subtle mouse following

2. **Reactive** - High audio reactivity
   - Audio: bass→morphFactor, mid→chaos, high→speed
   - Tilt: enabled, normal sensitivity
   - Interaction: burst on click

3. **Immersive** - Full device tilt + dramatic mode
   - Audio: disabled
   - Tilt: enabled, dramatic mode, full 6D mapping
   - Interaction: all gestures enabled

4. **Performance** - Optimized for live shows
   - Audio: high sensitivity all bands
   - Tilt: disabled
   - Interaction: disabled (audio-only control)

5. **Background** - Minimal, non-distracting
   - Audio: very low sensitivity
   - Tilt: disabled
   - Interaction: disabled

**Files to Create**:
```
src/presets/
├── PresetManager.js         # Load/save/apply presets
├── behavioral/
│   ├── ambient.json
│   ├── reactive.json
│   ├── immersive.json
│   ├── performance.json
│   └── background.json
└── index.js
```

---

## 📊 IMPLEMENTATION ORDER

| Phase | Tasks | Priority | Dependencies |
|-------|-------|----------|--------------|
| 6.1 | ReactivityConfig Core | HIGH | None |
| 6.2 | Core Type Selector UI | HIGH | None |
| 6.3 | Reactivity UI Controls | HIGH | 6.1 |
| 6.4 | Enhanced Export System | HIGH | 6.1 |
| 6.5 | Agentic Integration | MEDIUM | 6.1, 6.4 |
| 6.6 | Behavior Presets | MEDIUM | 6.1 |

---

## 🔗 INTEGRATION WITH EXISTING SYSTEMS

### C++ WASM Core
- Audio processing could be offloaded to WASM for performance
- 6D rotation matrices already computed in WASM
- Add `vib3_apply_reactivity()` function for batch parameter updates

### PolytopeInstanceBuffer.ts
- Add reactivity uniforms to buffer layout
- `audioEnergy` already in misc field - expand this
- Add `reactivityMultiplier` per-instance

### Telemetry System
- New event types:
  - `vib3.reactivity.config.change`
  - `vib3.reactivity.audio.peak`
  - `vib3.reactivity.tilt.extreme`
  - `vib3.export.package.created`

---

## 📝 SESSION LOG

### Session 1 - 2026-01-25

**Completed**:
- [x] Fixed WASM loading in browser tests
- [x] All 4 e2e tests passing
- [x] Comprehensive codebase analysis
- [x] Created this development plan

**Next Session**:
- [ ] Begin Phase 6.1: Create ReactivityConfig schema
- [ ] Create src/reactivity/ directory structure
- [ ] Implement ReactivityManager base class

---

## 🚀 SUCCESS CRITERIA

Phase 6 is complete when:

1. ✅ ReactivityConfig can be created, validated, saved, loaded
2. ✅ Audio bands can be mapped to any parameter
3. ✅ Tilt sensitivity and mode are configurable
4. ✅ Interaction modes are selectable per input type
5. ✅ Core Type selector (Base/Hypersphere/Hypertetra) works in UI
6. ✅ Export includes full reactivity configuration
7. ✅ VIB3Package can be imported and recreates full experience
8. ✅ MCP tools can control all reactivity settings
9. ✅ CLI can export complete packages
10. ✅ Presets can be applied with one command

---

## 🌟 A Paul Phillips Manifestation

**Send Love, Hate, or Opportunity to:** Paul@clearseassolutions.com
**Join The Exoditical Moral Architecture Movement today:** [Parserator.com](https://parserator.com)

> *"The Revolution Will Not be in a Structured Format"*

---

**© 2025 Paul Phillips - Clear Seas Solutions LLC**
**All Rights Reserved - Proprietary Technology**
