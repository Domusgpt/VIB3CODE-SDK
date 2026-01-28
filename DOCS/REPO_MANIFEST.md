# Repository manifest

This document enumerates the repository’s directory structure and provides a high-level purpose for
each folder. Use it as a navigation guide when onboarding or auditing the codebase.

## Top-level folders
- `.git/` — Git metadata and internal state.
- `DOCS/` — authored documentation (onboarding, setup, CI, lifecycle guides).
- `cpp/` — native core (C++ sources, headers, bindings, and math).
- `demo/` — demo assets and sandbox content.
- `docs/` — documentation site sources and static docs assets.
- `flutter/` — Flutter plugin and platform integration.
- `integrated-demo/` — integrated demo workspace.
- `js/` — JavaScript-based runtime modules (controls, audio, geometry, UI, interactions).
- `src/` — primary engine source tree (core, renderers, math, tooling).
- `styles/` — CSS and style assets.
- `tests/` — unit/integration tests.
- `tools/` — CLI/tooling scripts (telemetry, export, math utilities).
- `types/` — shared TypeScript type declarations.
- `wasm/` — WebAssembly artifacts and related assets.

## Depth-2 directory manifest
### `.git/`
- `.git/branches/` — legacy branch metadata.
- `.git/hooks/` — git hook templates.
- `.git/info/` — local exclude and repo metadata.
- `.git/logs/` — reflog history.
- `.git/objects/` — object database.
- `.git/refs/` — refs and tags.

### `DOCS/`
- `DOCS/` — documentation set (onboarding, setup, CI, lifecycle, etc.).
- `DOCS/QUATERNION_ADJACENCY_GEOMETRIC_ENGINE.md` — proposal for quaternion-driven adjacency and plastic-ratio scaling engine.

### `cpp/`
- `cpp/bindings/` — native bindings and interop layers.
- `cpp/include/` — public C++ headers.
- `cpp/math/` — math utilities for the native core.
- `cpp/src/` — native engine sources.

### `docs/`
- `docs/src/` — documentation site sources.
- `docs/wasm/` — WebAssembly-related docs assets.

### `flutter/`
- `flutter/android/` — Android plugin implementation and build files.
- `flutter/ios/` — iOS plugin implementation and podspec.
- `flutter/lib/` — Dart package sources.

### `js/`
- `js/audio/` — audio pipelines and reactivity modules.
- `js/controls/` — UI controls for parameter tuning.
- `js/core/` — core runtime utilities and managers.
- `js/gallery/` — gallery/scene browsers.
- `js/geometry/` — geometry definitions and helpers.
- `js/interactions/` — user interaction handling.
- `js/ui/` — UI components and layout.

### `src/`
- `src/agent/` — agentic tooling and MCP integration.
- `src/cli/` — CLI entry points.
- `src/config/` — configuration helpers.
- `src/core/` — core engine orchestration.
- `src/export/` — export pipeline.
- `src/faceted/` — faceted renderer/system.
- `src/features/` — feature flags and optional subsystems.
- `src/gallery/` — gallery rendering and orchestration.
- `src/geometry/` — geometry generation and definitions.
- `src/holograms/` — holographic system.
- `src/llm/` — LLM integrations.
- `src/math/` — math primitives and projection utilities.
- `src/physics/` — physics helpers.
- `src/platforms/` — platform-specific targets (WASM, etc.).
- `src/quantum/` — quantum visualization system.
- `src/render/` — rendering backends and registries.
- `src/schemas/` — JSON schemas for tooling/validation.
- `src/scene/` — scene composition helpers.
- `src/testing/` — testing utilities.
- `src/ui/` — UI integration and components.
- `src/variations/` — visual variations and presets.
- `src/viewer/` — viewer-facing wrappers.
- `src/wasm/` — WASM-specific entry points.

### `tests/`
- `tests/agent/` — agent/tooling tests.
- `tests/geometry/` — geometry unit tests.
- `tests/math/` — math stability/unit tests.
- `tests/render/` — rendering tests.
- `tests/scene/` — scene tests.

### `tools/`
- `tools/agentic/` — agentic helper scripts.
- `tools/cli/` — CLI tooling scripts.
- `tools/export/` — export pipeline tools.
- `tools/math/` — math test baselines/utilities.
- `tools/telemetry/` — telemetry tooling.

### `types/`
- `types/render/` — render-related type definitions.
