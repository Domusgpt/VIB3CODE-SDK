# Export formats

This reference documents the target export formats supported by the agentic pipelines and how they are validated.

## Supported formats

| Format | Extension | Description | License Tier |
|--------|-----------|-------------|--------------|
| SVG Sprite Sheet | `.svg` | Vector sprites for web or design tooling | Community (3/day) |
| Lottie JSON | `.json` | Motion-friendly JSON payloads for animation pipelines | Indie+ |
| CSS Variables | `.css` | Theme-ready CSS custom properties | Indie+ |
| Scene Pack | `.vib3` | Full scene serialization with parameters | All |
| PNG Raster | `.png` | High-resolution raster export | All |

## Format specifications

### SVG Sprite Sheet (`svg-sprite`)

Exports the current visualization frame as optimized SVG.

**Features:**
- Preserves vector paths for infinite scaling
- Includes all 3D projected geometry as 2D paths
- Supports transparency and gradients
- Embeds color palette as CSS variables

**Schema:**
```xml
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 {width} {height}"
     data-vib3-geometry="{geometryId}"
     data-vib3-system="{system}">
  <defs>
    <style>
      :root {
        --vib3-hue: {hue};
        --vib3-saturation: {saturation};
        --vib3-intensity: {intensity};
      }
    </style>
  </defs>
  <g id="geometry-layer">
    <!-- Projected geometry paths -->
  </g>
  <g id="vib3-watermark" opacity="0.3">
    <!-- Community tier only -->
  </g>
</svg>
```

**CLI export:**
```bash
vib3 export svg --geometry 12 --system quantum --output scene.svg
```

### Lottie JSON (`lottie-json`)

Exports animated visualization as Lottie-compatible JSON.

**Features:**
- Frame-by-frame keyframes for smooth animation
- Supports rotation animation curves
- Compatible with LottieFiles, After Effects, and web players
- Optimized for 60fps playback

**Schema (simplified):**
```json
{
  "v": "5.7.0",
  "fr": 60,
  "ip": 0,
  "op": 300,
  "w": 1920,
  "h": 1080,
  "nm": "VIB3+ Export",
  "ddd": 0,
  "assets": [],
  "layers": [
    {
      "ty": 4,
      "nm": "geometry",
      "ks": {
        "o": { "a": 0, "k": 100 },
        "r": { "a": 1, "k": [/* rotation keyframes */] },
        "p": { "a": 0, "k": [960, 540, 0] }
      },
      "shapes": [/* geometry shapes */]
    }
  ],
  "meta": {
    "generator": "@vib3/sdk",
    "version": "1.9.0",
    "system": "quantum",
    "geometry": 12
  }
}
```

**CLI export:**
```bash
vib3 export lottie --duration 5s --fps 60 --output animation.json
```

### CSS Variables (`css-variables`)

Exports current color palette and parameters as CSS custom properties.

**Features:**
- Ready-to-use CSS variables
- Includes color, rotation, and dimension values
- Compatible with any CSS framework
- Supports light/dark theme variants

**Output:**
```css
/* VIB3+ Theme Export - Generated 2026-01-23 */
:root {
  /* Color palette */
  --vib3-hue: 240;
  --vib3-saturation: 0.8;
  --vib3-intensity: 0.9;
  --vib3-primary: hsl(240, 80%, 50%);
  --vib3-secondary: hsl(240, 60%, 70%);
  --vib3-accent: hsl(270, 80%, 60%);

  /* Geometry parameters */
  --vib3-geometry: 12;
  --vib3-system: 'quantum';
  --vib3-dimension: 3.5;

  /* 6D rotation (radians) */
  --vib3-rot-xy: 0.5;
  --vib3-rot-xz: 0.3;
  --vib3-rot-yz: 0.0;
  --vib3-rot-xw: 1.2;
  --vib3-rot-yw: 0.8;
  --vib3-rot-zw: 0.4;

  /* Animation timing */
  --vib3-speed: 1.0;
  --vib3-chaos: 0.2;
}

/* Dark mode variant */
@media (prefers-color-scheme: dark) {
  :root {
    --vib3-primary: hsl(240, 80%, 60%);
    --vib3-secondary: hsl(240, 60%, 40%);
  }
}
```

**CLI export:**
```bash
vib3 export css --include-dark-mode --output theme.css
```

### Scene Pack (`.vib3`)

Full scene serialization for sharing and restoring states.

**Features:**
- Complete parameter state
- Thumbnail preview
- Metadata and versioning
- Compatible with Gallery system

**Schema:**
```json
{
  "version": "1.0.0",
  "meta": {
    "name": "My Scene",
    "author": "user@example.com",
    "created": "2026-01-23T22:00:00Z",
    "generator": "@vib3/sdk@1.9.0"
  },
  "parameters": {
    "system": "quantum",
    "geometry": 12,
    "rot4dXY": 0.5,
    "rot4dXZ": 0.3,
    "rot4dYZ": 0.0,
    "rot4dXW": 1.2,
    "rot4dYW": 0.8,
    "rot4dZW": 0.4,
    "hue": 240,
    "saturation": 0.8,
    "intensity": 0.9,
    "gridDensity": 32,
    "morphFactor": 1.0,
    "chaos": 0.2,
    "speed": 1.0,
    "dimension": 3.5
  },
  "thumbnail": "data:image/png;base64,..."
}
```

## Golden snapshot validation

Golden snapshots ensure export fidelity across updates. Each export format has baseline snapshots stored in `tests/snapshots/exports/`.

### Snapshot test implementation

```javascript
// tests/exports/golden.test.js
import { describe, it, expect } from 'vitest';
import { exportSVG, exportLottie, exportCSS } from '../../src/export/index.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const SNAPSHOT_DIR = 'tests/snapshots/exports';

// Standard test parameters for consistency
const TEST_PARAMS = {
  system: 'quantum',
  geometry: 8, // Hypersphere core tetrahedron
  rot4dXY: 0.5,
  rot4dXZ: 0.0,
  rot4dYZ: 0.0,
  rot4dXW: 1.0,
  rot4dYW: 0.0,
  rot4dZW: 0.0,
  hue: 200,
  saturation: 0.7,
  intensity: 0.8,
  gridDensity: 16,
  dimension: 3.5
};

describe('export golden snapshots', () => {
  describe('SVG export', () => {
    it('matches golden snapshot for quantum system', async () => {
      const result = await exportSVG(TEST_PARAMS, { width: 512, height: 512 });
      const golden = readFileSync(join(SNAPSHOT_DIR, 'quantum-g8.svg'), 'utf-8');

      // Normalize whitespace for comparison
      const normalize = (s) => s.replace(/\s+/g, ' ').trim();
      expect(normalize(result)).toBe(normalize(golden));
    });

    it('includes required metadata attributes', async () => {
      const result = await exportSVG(TEST_PARAMS, { width: 512, height: 512 });

      expect(result).toContain('data-vib3-geometry="8"');
      expect(result).toContain('data-vib3-system="quantum"');
      expect(result).toContain('viewBox="0 0 512 512"');
    });
  });

  describe('Lottie export', () => {
    it('matches golden snapshot structure', async () => {
      const result = await exportLottie(TEST_PARAMS, { fps: 30, duration: 1 });
      const golden = JSON.parse(readFileSync(join(SNAPSHOT_DIR, 'quantum-g8.json'), 'utf-8'));

      // Compare structure (not exact values due to animation)
      expect(result.v).toBe(golden.v);
      expect(result.fr).toBe(golden.fr);
      expect(result.layers.length).toBe(golden.layers.length);
      expect(result.meta.system).toBe('quantum');
      expect(result.meta.geometry).toBe(8);
    });

    it('produces valid Lottie schema', async () => {
      const result = await exportLottie(TEST_PARAMS, { fps: 30, duration: 1 });

      expect(result).toHaveProperty('v'); // version
      expect(result).toHaveProperty('fr'); // frame rate
      expect(result).toHaveProperty('ip'); // in point
      expect(result).toHaveProperty('op'); // out point
      expect(result).toHaveProperty('w'); // width
      expect(result).toHaveProperty('h'); // height
      expect(result).toHaveProperty('layers');
      expect(Array.isArray(result.layers)).toBe(true);
    });
  });

  describe('CSS export', () => {
    it('matches golden snapshot', async () => {
      const result = await exportCSS(TEST_PARAMS);
      const golden = readFileSync(join(SNAPSHOT_DIR, 'quantum-g8.css'), 'utf-8');

      expect(result).toBe(golden);
    });

    it('includes all required variables', async () => {
      const result = await exportCSS(TEST_PARAMS);

      expect(result).toContain('--vib3-hue: 200');
      expect(result).toContain('--vib3-saturation: 0.7');
      expect(result).toContain('--vib3-geometry: 8');
      expect(result).toContain("--vib3-system: 'quantum'");
      expect(result).toContain('--vib3-rot-xw: 1');
    });
  });
});
```

### Snapshot update workflow

```bash
# Run tests and check for snapshot mismatches
pnpm test -- tests/exports/golden.test.js

# Update snapshots when changes are intentional
pnpm test -- tests/exports/golden.test.js --update

# Review snapshot changes in git
git diff tests/snapshots/exports/
```

### Snapshot coverage matrix

| System | Geometry | SVG | Lottie | CSS | Status |
|--------|----------|-----|--------|-----|--------|
| Quantum | 0 (tetra) | Yes | Yes | Yes | Baseline |
| Quantum | 8 (hyper-tetra) | Yes | Yes | Yes | Baseline |
| Quantum | 16 (hypertetra-tetra) | Yes | Yes | Yes | Baseline |
| Faceted | 0 | Yes | Yes | Yes | Baseline |
| Faceted | 8 | Yes | Yes | Yes | Baseline |
| Holographic | 0 | Yes | Yes | Yes | Baseline |
| Holographic | 8 | Yes | Yes | Yes | Baseline |

### CI integration

```yaml
# .github/workflows/exports.yml
name: Export Validation

on: [push, pull_request]

jobs:
  golden-snapshots:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm test -- tests/exports/golden.test.js

      - name: Check for uncommitted snapshot changes
        run: |
          if [ -n "$(git status --porcelain tests/snapshots/)" ]; then
            echo "Snapshot files have changed. Please update and commit."
            git diff tests/snapshots/
            exit 1
          fi
```

## Export pipeline architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       EXPORT PIPELINE                            │
└─────────────────────────────────────────────────────────────────┘

  Parameters          ExportManager            Format Exporters
      │                    │                         │
      │  1. Request export │                         │
      │───────────────────>│                         │
      │                    │  2. Validate license    │
      │                    │  3. Select exporter     │
      │                    │───────────────────────>│
      │                    │                         │
      │                    │                         │  4. Generate
      │                    │                         │     output
      │                    │                         │
      │                    │  5. Apply watermark     │
      │                    │     (if Community)      │
      │                    │<───────────────────────│
      │                    │                         │
      │                    │  6. Validate against    │
      │                    │     schema              │
      │                    │                         │
      │  7. Return result  │                         │
      │<───────────────────│                         │
```

## Implementation status

| Component | Status | Location |
|-----------|--------|----------|
| SVG exporter | Implemented | `src/export/SVGExporter.js` |
| Lottie exporter | TODO | `src/export/LottieExporter.js` |
| CSS exporter | TODO | `src/export/CSSExporter.js` |
| Scene pack | Implemented | `src/export/ScenePackExporter.js` |
| Golden snapshots | TODO | `tests/snapshots/exports/` |
| CI validation | TODO | `.github/workflows/exports.yml` |

## CLI reference

```bash
# List available export formats
vib3 export --list

# Export with specific format
vib3 export <format> [options]

# Common options
  --output, -o    Output file path
  --system        Visualization system (quantum, faceted, holographic)
  --geometry      Geometry index (0-23)
  --width         Output width in pixels
  --height        Output height in pixels
  --quality       Quality level (draft, normal, high)

# Examples
vib3 export svg -o scene.svg --geometry 12 --system quantum
vib3 export lottie -o anim.json --duration 5s --fps 60
vib3 export css -o theme.css --include-dark-mode
vib3 export pack -o scene.vib3 --include-thumbnail
```
