# 架构设计 - 搭建关卡场景：地面与平台

## 架构模式
phaser3-vite-typescript-frontend-scaffold-incremental-level-ground-and-platforms

## 技术栈

- **runtime**: Web (H5)
- **language**: TypeScript 5.5
- **engine**: Phaser 3.80 (Arcade Physics)
- **bundler**: Vite 5
- **design_resolution**: 960x540 landscape (16:9), Phaser.Scale.FIT + CENTER_BOTH

## 模块设计

### 
职责: Add world geometry tokens so level sizing lives in one place.

### 
职责: Pure, typed, data-driven level definition (no Phaser import). Ground + floating platforms as plain data so layout can be tuned and unit-tested independently of rendering.

### 
职责: Convert levelLayout data into Arcade static physics bodies (immovable ground/platforms). Shared service-layer builder kept out of the scene so the movement ticket can query collisions via the returned group.

### 
职责: Wire the level into the scene lifecycle: clear listeners/leftover graphics, build level via LevelBuilder, and set world + camera bounds to enforce the boundary limit.

## 关键决策
- Keep landscape 960x540 (existing DESIGN_WIDTH/HEIGHT) rather than switching to portrait; extend only the world width to 1920 for future horizontal camera scroll.
- Keep gravity at { x: 0, y: 0 } — the gameConfig comment defers gravity to the jump ticket; this ticket only builds geometry and bounds.
- Use Arcade static bodies (immovable) for ground and platforms; dynamic player collisions are a later ticket.
- Separate level data (levelLayout.ts) from building logic (LevelBuilder.ts) and scene wiring (GameScene.ts) for testability and easy layout tuning.
- Defer camera-follow to the movement ticket since it requires a player target; this ticket only sets camera/world bounds for the boundary limit.
- Draw platforms with scene.add.rectangle + static physics rather than image textures, following the 'Graphics first, no art for background/buttons' rule.
