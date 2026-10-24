# 架构设计 - 实现玩家移动与重力物理

## 架构模式
phaser3-vite-typescript-player-movement-gravity-arcade-physics

## 技术栈

- **runtime**: Phaser 3
- **language**: TypeScript
- **build_tool**: Vite
- **physics**: Phaser.Physics.Arcade
- **input**: Keyboard (Cursor Keys + WASD), desktop-first prototype

## 模块设计

### Player game object
职责: Encapsulate the player character as a physics-enabled sprite. Owns horizontal velocity logic and exposes tuning constants. Declares the required Arcade body type and calls super.preUpdate().

### GameScene integration
职责: Spawn the player at a spawn point, wire keyboard input, register collision with the static level, and attach the camera follow with bounds clamp.

### Player texture generation
职责: Generate a simple rectangle texture for the player (no external assets) so the Arcade.Sprite has a texture key to use before GameScene starts.

### Physics config enablement
职责: Turn on global Arcade gravity and remove the stale 'no gravity yet' comment so the player falls and lands.

### Player tuning constants
职责: Centralize all movement/physics tuning values so feel can be adjusted in one place without touching scene/gameobject logic.

## 关键决策
- Player is implemented as a Phaser.Physics.Arcade.Sprite (not a raw Rectangle/Graphics) so collider + camera follow + world bounds work out of the box; texture is generated procedurally in BootScene to avoid external assets.
- Horizontal movement uses direct velocity assignment (setVelocityX) rather than acceleration for a crisp, predictable prototype feel; acceleration can be revisited during tuning.
- Input is owned by GameScene, movement math by Player — keeps input wiring and physics behavior separated and testable.
- Gravity is enabled globally in gameConfig.arcade (single source of truth) rather than per-body, and its value is pulled from constants.ts.
- This ticket scopes to horizontal movement + gravity + collision + camera follow only; jump (single/double) and dash are intentionally deferred to follow-up tickets to keep the increment reviewable. The stale 'No gravity yet' comment in gameConfig is removed as part of this change.
- Camera uses startFollow with lerp (0.1) and setBounds to worldBounds so the player stays in view and the camera never pans past level edges.
- Mobile/virtual controls are out of scope for this ticket (desktop keyboard first, per prototype priority).
