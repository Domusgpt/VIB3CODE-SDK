# Licensing tiers (draft)

This document outlines the proposed licensing tiers for the VIB3+ SDK and agentic tooling. It is intended as a working draft for Phase 5.

## Proposed tiers
| Tier | Price | Revenue Limit | Key Features |
| --- | --- | --- | --- |
| Community | Free (MIT) | Non-commercial | Runtime access, watermark on exports |
| Indie | $29/mo | <$100K | Commercial use, standard formats |
| Studio | $99/mo/seat | <$500K | Priority support, all formats |
| Pro | $249/mo/seat | <$2M | Source access, custom shaders |
| Enterprise | Custom | $2M+ | Indemnification, dedicated support |
| OEM/White-Label | Custom annual | Any | Rebranding/redistribution rights |

## Feature matrix by tier

| Feature | Community | Indie | Studio | Pro | Enterprise |
|---------|-----------|-------|--------|-----|------------|
| WebGL backend | Yes | Yes | Yes | Yes | Yes |
| WebGPU backend | Yes | Yes | Yes | Yes | Yes |
| 24 geometry variants | Yes | Yes | Yes | Yes | Yes |
| 6D rotation | Yes | Yes | Yes | Yes | Yes |
| Export watermark | Yes | No | No | No | No |
| SVG export | 3/day | Unlimited | Unlimited | Unlimited | Unlimited |
| Lottie export | No | Yes | Yes | Yes | Yes |
| CSS variables export | No | Yes | Yes | Yes | Yes |
| Custom shaders | No | No | No | Yes | Yes |
| WASM core | No | No | Yes | Yes | Yes |
| Flutter bindings | No | No | Yes | Yes | Yes |
| Source access | No | No | No | Yes | Yes |
| Priority support | No | No | Yes | Yes | Yes |
| Dedicated support | No | No | No | No | Yes |
| SLA | No | No | No | No | Yes |

## Activation workflow (implementation)

### 1. License key format
```
VIB3-{TIER}-{UUID}-{CHECKSUM}

Examples:
VIB3-INDIE-a1b2c3d4-e5f6g7h8-XXXX
VIB3-STUDIO-b2c3d4e5-f6g7h8i9-YYYY
VIB3-PRO-c3d4e5f6-g7h8i9j0-ZZZZ
```

### 2. Activation flow
```
┌─────────────────────────────────────────────────────────────────┐
│                        LICENSE ACTIVATION                        │
└─────────────────────────────────────────────────────────────────┘

  User                    CLI/UI                    License Server
    │                        │                            │
    │  1. Enter license key  │                            │
    │───────────────────────>│                            │
    │                        │  2. Validate key format    │
    │                        │───────────────────────────>│
    │                        │                            │
    │                        │  3. Return signed token    │
    │                        │<───────────────────────────│
    │                        │                            │
    │                        │  4. Store token locally    │
    │                        │  (encrypted, machine-bound)│
    │                        │                            │
    │  5. Activation success │                            │
    │<───────────────────────│                            │
```

### 3. CLI activation commands
```bash
# Activate a license
vib3 license activate VIB3-INDIE-a1b2c3d4-e5f6g7h8-XXXX

# Check license status
vib3 license status

# Deactivate (for moving to new machine)
vib3 license deactivate

# Refresh license token (manual heartbeat)
vib3 license refresh
```

### 4. Programmatic activation
```javascript
import { LicenseManager } from '@vib3/sdk/license';

const license = new LicenseManager();

// Activate
const result = await license.activate('VIB3-INDIE-...');
if (result.success) {
  console.log('Tier:', result.tier);
  console.log('Expires:', result.expiresAt);
}

// Check status
const status = license.getStatus();
// { tier: 'indie', valid: true, expiresAt: '2026-02-23', features: [...] }

// Feature gating
if (license.hasFeature('lottie-export')) {
  await exportToLottie(scene);
}
```

## License token schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "version": { "type": "integer", "const": 1 },
    "licenseKey": { "type": "string", "pattern": "^VIB3-[A-Z]+-[a-f0-9-]+$" },
    "tier": { "enum": ["community", "indie", "studio", "pro", "enterprise", "oem"] },
    "machineId": { "type": "string" },
    "issuedAt": { "type": "string", "format": "date-time" },
    "expiresAt": { "type": "string", "format": "date-time" },
    "features": {
      "type": "array",
      "items": { "type": "string" }
    },
    "signature": { "type": "string" }
  },
  "required": ["version", "licenseKey", "tier", "machineId", "issuedAt", "expiresAt", "signature"]
}
```

## Offline validation

### Grace period rules
- **Initial grace period:** 7 days without network connection
- **Refresh interval:** Token refresh attempted every 24 hours when online
- **Expiration warning:** 3 days before token expiration
- **Hard expiration:** After grace period, features downgrade to Community tier

### Offline validation flow
```javascript
// Pseudocode for offline validation
function validateOffline(token) {
  // 1. Verify signature with embedded public key
  if (!verifySignature(token, PUBLIC_KEY)) {
    return { valid: false, reason: 'invalid_signature' };
  }

  // 2. Check expiration with grace period
  const now = Date.now();
  const expires = new Date(token.expiresAt).getTime();
  const gracePeriod = 7 * 24 * 60 * 60 * 1000; // 7 days

  if (now > expires + gracePeriod) {
    return { valid: false, reason: 'expired', gracePeriodExceeded: true };
  }

  // 3. Verify machine binding
  if (token.machineId !== getMachineId()) {
    return { valid: false, reason: 'machine_mismatch' };
  }

  return {
    valid: true,
    tier: token.tier,
    features: token.features,
    gracePeriodActive: now > expires
  };
}
```

## Feature gating implementation

### Runtime feature checks
```javascript
// src/license/FeatureGate.js
export class FeatureGate {
  constructor(licenseManager) {
    this.license = licenseManager;
  }

  // Check if feature is available
  can(feature) {
    const status = this.license.getStatus();
    if (!status.valid) return false;
    return status.features.includes(feature);
  }

  // Gate a function call
  guard(feature, fn) {
    if (!this.can(feature)) {
      throw new FeatureNotAvailableError(feature, this.license.getStatus().tier);
    }
    return fn();
  }

  // Async gate
  async guardAsync(feature, fn) {
    if (!this.can(feature)) {
      throw new FeatureNotAvailableError(feature, this.license.getStatus().tier);
    }
    return await fn();
  }
}

// Usage in export pipeline
const gate = new FeatureGate(licenseManager);

async function exportScene(scene, format) {
  switch (format) {
    case 'svg':
      // Community: 3/day limit
      if (gate.can('unlimited-svg')) {
        return await exportSVG(scene);
      } else {
        return await exportSVGWithLimit(scene, 3);
      }

    case 'lottie':
      return await gate.guardAsync('lottie-export', () => exportLottie(scene));

    case 'css':
      return await gate.guardAsync('css-export', () => exportCSS(scene));
  }
}
```

## Watermark implementation (Community tier)

For Community tier exports, a subtle watermark is applied:
```javascript
function applyWatermark(svg) {
  const watermark = `
    <g id="vib3-watermark" opacity="0.3" transform="translate(10, ${height - 20})">
      <text font-size="10" fill="#666">Created with VIB3+ Community</text>
    </g>
  `;
  return svg.replace('</svg>', `${watermark}</svg>`);
}
```

## Telemetry (opt-in)

Anonymous usage telemetry can be enabled to help improve the SDK:
```javascript
// Telemetry is opt-in and respects license tier
const telemetryConfig = {
  enabled: userConsent && license.tier !== 'enterprise',
  events: ['render_frame', 'export_complete', 'geometry_change'],
  excludeFields: ['custom_shader_source', 'scene_data']
};
```

## Migration path

### Upgrading tiers
- Seamless upgrade via CLI or dashboard
- Existing exports retain their tier watermark status
- No re-export required for previously exported assets

### Downgrading tiers
- Features revert to lower tier limits
- Existing high-tier exports continue to work
- New exports subject to new tier limits

## Implementation status

| Component | Status | Location |
|-----------|--------|----------|
| License key format | Defined | This document |
| Token schema | Defined | This document |
| CLI commands | TODO | `src/cli/license.js` |
| LicenseManager | TODO | `src/license/LicenseManager.js` |
| FeatureGate | TODO | `src/license/FeatureGate.js` |
| Offline validation | TODO | `src/license/OfflineValidator.js` |
| Server endpoints | TODO | External service |
| Dashboard | TODO | External service |
