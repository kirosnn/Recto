# Velocity Integration Plan

## Goal

Velocity is the native Recto capture and encoding engine. It uses DXGI desktop duplication for screen capture, hardware video encoding through AMF or Media Foundation, and WASAPI loopback audio encoded as Opus.

The existing browser engine remains the default path. Velocity is opt-in and desktop-only until the native transport is complete.

## Completed In This Branch

### Settings Model

- Added the `browser` and `velocity` streaming engine selector.
- Kept `browser` as the default engine for existing and new users.
- Added Velocity-specific settings:
  - target FPS,
  - native or 1080p resolution policy,
  - Opus system audio toggle,
  - automatic or explicit maximum bitrate.
- Bumped settings migration to version 4.
- Mirrored the engine field in the web settings model. Web keeps `browser` because browsers cannot run the native DXGI/AMF pipeline.

### Desktop Settings UI

- Added a dedicated `Moteur de streaming` section.
- Added browser and Velocity engine cards.
- Velocity is only selectable inside the Tauri desktop app.
- The desktop page calls `velocity_caps` to check native availability.
- Added a `Tester Velocity` action that calls `velocity_selftest` and reports measured FPS, bitrate, and encoder.

### Web Settings UI

- Added the same `Moteur de streaming` section.
- Velocity is visible but disabled with a desktop-only explanation.
- Browser remains the only usable web engine.

### Native App Wiring

- Compiled the existing native capture and encoder modules into the Tauri app binary.
- Added `velocity_caps`.
- Added `velocity_selftest`, which runs a short native capture and encode loop without writing probe files.

## Current Limit

Velocity is now visible and testable from settings, but it is not yet the live streaming path.

The current Recto session path is:

1. Frontend calls `navigator.mediaDevices.getDisplayMedia`.
2. Frontend creates an `RTCPeerConnection`.
3. Browser WebRTC encodes and sends media.
4. Supabase signaling exchanges the SDP offer and answer.

The Velocity path currently produces native H264 and Opus packets in Rust, but there is no Rust WebRTC transport connected to the existing Verso receiver yet.

## Required Transport Work

To make Velocity stream live to web and desktop Verso, the app needs a native WebRTC sender:

1. Create a Rust transport module.
2. Generate a browser-compatible WebRTC offer with H264 video and Opus audio tracks.
3. Reuse the existing Supabase signaling table for offer, answer, and session status.
4. Packetize Velocity H264 Annex-B output into RTP.
5. Packetize Opus frames into RTP.
6. Handle DTLS, SRTP, ICE, STUN, and connection state.
7. Receive receiver feedback such as PLI and bitrate estimation.
8. Forward input data channel messages back into the existing native input injector.
9. Add `velocity_start` and `velocity_stop` Tauri commands.
10. Branch `RectoSessionContext` so `engine === "velocity"` starts the native transport instead of the browser `getDisplayMedia` path.

## Validation Done

- `npm run build` passes for the desktop frontend.
- `cargo check --manifest-path src-tauri/Cargo.toml` passes.
- `npm run build` passes in `web`.

`bunx tsc --noEmit` still fails on pre-existing project-wide TypeScript issues outside this Velocity work, including unused test variables, `ImportMeta.env` typing, and an existing `resizeMode` media constraint type error.

## Next Milestone

The next milestone is the native WebRTC sender. Without that transport, Velocity can be configured and self-tested, but not used for a real Verso session.
