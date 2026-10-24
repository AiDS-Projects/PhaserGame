# 架构设计 - 可玩原型验收自测

## 架构模式
phaser3-vite-typescript-playwright-acceptance-self-test-touch-fallback

## 技术栈

- **runtime**: Phaser 3, TypeScript, Vite
- **physics**: Arcade Physics
- **test_runner**: Playwright Test (@playwright/test)
- **screenshot**: Playwright page.screenshot (fixed 402x874 viewport)
- **typecheck**: tsc --noEmit (h5_typecheck)
- **build**: vite build (h5_playtest)
- **orchestration**: Node ESM scripts (.mjs)

## 模块设计

### Acceptance Probe Bridge
职责: Expose a read-only runtime API (window.__ACCEPTANCE__) surfacing player position, velocity, grounded state, jumpCount, dashCooldown/invincible timers, scene key and camera scroll. Gated by ?acceptance=1 so it never ships to prod. This is the deterministic backbone that Playwright specs assert against instead of fragile pixel parsing.

### Playwright Config + Fixtures
职责: Define playwright.config.ts with a vite preview webServer, a desktop chromium project and a mobile touch project (hasTouch + 402x874 viewport), screenshot output dir, and shared fixtures for launching with ?acceptance=1.

### Screenshot Self-Test Spec
职责: Boot the game, wait for the probe ready signal, assert the canvas is non-blank, then capture key frames: idle, mid-jump, mid-dash, dash-cooldown. Validate screenshots exist and are non-empty; serve as human-eyeball feel check artifacts.

### Feel Confirmation Spec (desktop keyboard)
职责: Drive ← → / A D / Space / Shift via Playwright keyboard; assert: horizontal displacement on move, jump raises y then returns, double-jump allowed once in air and reset on land, dash displaces horizontally, dash grants i-frames and enters cooldown. Uses probe state snapshots with generous tolerances.

### Touch Controls Fallback (runtime)
职责: Add an additive mobile input layer: virtual left/right joystick + jump/dash buttons drawn with Graphics/Container, wired via pointerdown/pointerup to the same action paths as keyboard. Activated only when device.input.touch is detected, leaving desktop keyboard untouched.

### Touch Acceptance Spec
职责: In the Playwright touch context, tap the virtual jump/dash buttons and drag the joystick, then assert the same state transitions as the feel spec (jump count, dash cooldown, horizontal displacement). Confirms touch fallback is functional, not just rendered.

### Acceptance Orchestrator
职责: Single entry point that runs typecheck → build → playwright (screenshot + feel + touch) and aggregates a pass/fail report, so the prototype is validated in one command.

## 关键决策
- Use a read-only window.__ACCEPTANCE__ probe API (gated by ?acceptance=1) as the assertion surface instead of parsing pixels or DOM — makes feel checks deterministic and avoids rewriting existing PlayerState/Player code.
- Screenshot self-test validates non-blank canvas + artifact existence, not pixel-perfect diff, since this is a prototype-stage feel check; humans eyeball the captured frames.
- Touch fallback is an additive input module activated only on touch devices, mapping to the exact same action/velocity paths as keyboard rather than a parallel control flow.
- Reuse the existing scripts/*.mjs (acceptance-probe, capture-acceptance, player-acceptance, runtime-acceptance) as helpers inside Playwright specs rather than replacing them with a new framework.
- Feel assertions compare state snapshots with generous tolerances (not exact coordinates) to absorb Arcade Physics timing variance.
- Desktop keyboard is the priority for the prototype; touch is a fallback confirmed via a dedicated hasTouch Playwright project.
