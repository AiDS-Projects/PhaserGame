# 代码审查 — 实现玩家移动与重力物理

## 评分: 5/10 🚫 需修复

## 🔴 严重问题（必须修复）
- {'level': 'critical', 'file': 'src/scenes/GameScene.ts / src/gameobjects/Player.ts', 'message': "Player.update() is executed twice per frame. Player's constructor calls scene.add.existing(this), and Phaser's GameObjectFactory.existing() registers any object with a preUpdate method (Sprite has one) into the scene's update list, so Player.update() runs automatically each frame. GameScene.update() additionally calls this.player?.update(). Movement/jump logic therefore runs twice per frame — jump JustDown is consumed on the first call (masking the bug) but velocity is recomputed twice and any future non-idempotent logic will break. Fix: remove the manual this.player?.update() call, or (less clean) avoid the auto-update path."}

## 🟡 警告（建议修复）
- {'level': 'warning', 'file': 'src/config/gameConfig.ts', 'message': "Stale/contradictory gravity config. gameConfig still sets arcade.gravity.y = 0 with the comment 'No gravity yet... the jump ticket will set it', but GameScene.create() sets physics.world.gravity.y = 900. The config is no longer the single source of truth and the comment is misleading. Update the config (or remove the runtime override) and fix the comment."}
- {'level': 'warning', 'file': 'src/scenes/GameScene.ts', 'message': "this.input.removeAllListeners() is a blunt instrument. It removes every listener on the InputPlugin, which can strip listeners Phaser's InputManager/other systems depend on, not just this scene's. Prefer targeted cleanup (e.g. key/pad teardown or rely on scene shutdown) instead of nuking all input listeners."}
- {'level': 'warning', 'file': 'src/scenes/GameScene.ts / src/gameobjects/Player.ts', 'message': "Magic numbers scattered across the code: gravity 900, placeholder texture size 24x32, setMaxVelocity(800, 1600), camera deadzone 64x64, follow lerp 0.1, default moveSpeed 260 / jumpVelocity -480. These should be named constants (per the project's global coding rules) and centralized to avoid drift between spawn size, physics caps and design tokens."}
- {'level': 'warning', 'file': 'src/gameobjects/Player.ts / src/scenes/GameScene.ts', 'message': "Unsafe non-null assertions. scene.input.keyboard! can be null on touch-only devices or if the keyboard plugin is disabled, causing a runtime crash in the constructor. Likewise this.levelBuilder.staticGroup! assumes build() already ran. Validate with explicit guards instead of '!'."}

## 🟢 建议（可选优化）
- {'level': 'suggestion', 'file': 'src/scenes/GameScene.ts', 'message': "Move placeholder player texture generation out of GameScene and into BootScene (or a dedicated asset loader). GameScene currently mixes asset creation with gameplay setup; the textures.exists('player') guard is also a smell that this belongs in a preload/asset phase."}
- {'level': 'suggestion', 'file': 'src/gameobjects/Player.ts', 'message': 'Replace repeated `this.body as Phaser.Physics.Arcade.Body` casts with a typed helper/getter (e.g. a private `get body(): Phaser.Physics.Arcade.Body` accessor) to reduce `as` assertions and centralize the cast in one place.'}
- {'level': 'suggestion', 'file': 'src/scenes/GameScene.ts', 'message': "Guard this.levelBuilder.staticGroup with an explicit null check and a descriptive error message (or throw if build() was not invoked) rather than the non-null assertion '!'."}
- {'level': 'suggestion', 'file': 'src/scenes/GameScene.ts', 'message': 'Consider camera.setRoundPixels(true) and integer spawn/surface coordinates for a crisp pixel-art look, since the player texture and level use integer rects while follow lerp 0.1 produces fractional camera positions.'}
- {'level': 'suggestion', 'file': 'src/gameobjects/Player.ts', 'message': 'The jump condition uses body.blocked.down for ground detection, which does not account for standing on a platform with a side collision. Consider tracking an explicit on-ground flag (e.g. via body.touching.down or a ground-touch collider callback) if later tickets add wall/side interactions.'}

## 审查的代码
- src/scenes/GameScene.ts
- docs/Reqs/b63dfa/b77e76/dev-notes.md
