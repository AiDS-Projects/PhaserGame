# 代码审查 — 搭建关卡场景：地面与平台

## 评分: 5/10 🚫 需修复

## 🔴 严重问题（必须修复）
- {'severity': 'critical', 'file': 'src/level/levelBuilder.ts', 'location': 'LevelBuilder.build()', 'message': "build() is not idempotent and has no cleanup/destroy path. It unconditionally reassigns this.statics = scene.physics.add.staticGroup() and re-adds ground + every platform. GameScene.create() explicitly notes 'scene.start() reuses the instance' and calls build(this) every time create() runs, so any scene restart re-runs build() and accumulates duplicate rectangles and duplicate Arcade static bodies in the world (phantom collision geometry + unbounded memory growth). Add a guard (e.g. if (this.statics) return / destroy existing group first) or expose an explicit destroy() and call it before rebuild."}

## 🟡 警告（建议修复）
- {'severity': 'warning', 'file': 'src/level/levelBuilder.ts', 'location': 'LEVEL_COLORS', 'message': "LEVEL_COLORS duplicates the exact tokens already defined in src/constants.ts (COLORS.groundFill, COLORS.groundSurface, COLORS.platformFill, COLORS.platformSurface all carry identical values '#1E293B'/'#22D3EE'/'#4F46E5'). The comment claims these 'extend the base COLORS palette', which is false — they are pure duplication and will drift apart on any future color change. Import from COLORS or remove the duplicates from constants.ts."}
- {'severity': 'warning', 'file': 'src/level/levelBuilder.ts', 'location': 'addStaticRect()', 'message': "Inline color conversion Number.parseInt(String(fillColor).replace(/^#/, ''), 16) reimplements hexToNumber() from src/utils/color.ts, violating the project's 'shared logic first' rule (no inline helpers; common logic belongs in utils/). It also bypasses the isHexColor() runtime guard, so an invalid token silently produces NaN instead of failing loudly."}
- {'severity': 'warning', 'file': 'src/level/levelLayout.ts', 'location': 'platforms', 'message': 'Acceptance criteria (>= 3 platforms, >= 60px horizontal/vertical gap between any pair) are asserted only in a comment, never enforced. The global coding rule requires tests for new logic; there is no unit test validating these invariants or the world/ground bounds math (ground bottom == WORLD_HEIGHT). A future edit can silently break the spec.'}
- {'severity': 'warning', 'file': 'src/level/levelBuilder.ts', 'location': 'addStaticRect()', 'message': 'Redundant String(fillColor) cast — fillColor is already typed string. The cast masks the fact that the raw string is being parsed without validation and adds noise.'}

## 🟢 建议（可选优化）
- {'severity': 'suggestion', 'file': 'src/level/levelBuilder.ts', 'location': 'LEVEL_COLORS / addStaticRect()', 'message': 'Type LEVEL_COLORS values as HexColor and convert via hexToNumber(fillColor) after validating with isHexColor, reusing the existing utils/color.ts helpers instead of re-parsing inline.'}
- {'severity': 'suggestion', 'file': 'src/level/levelBuilder.ts', 'location': 'staticGroup getter', 'message': "The nullable 'Phaser.Physics.Arcade.StaticGroup | null' return type forces every consumer to null-check after build(). Consider a non-null assertion contract (build() guarantees it) plus an explicit destroy()/clear() lifecycle, or throw if accessed before build()."}
- {'severity': 'suggestion', 'file': 'src/level/levelLayout.ts', 'location': 'platforms', 'message': "The x/y/width/height platform numbers are magic values; derive or at least programmatically validate them (a validateLayout() that checks min gap and world containment) so the 'staggered ladder' spec is self-documenting and enforced."}
- {'severity': 'suggestion', 'file': 'src/utils/color.ts', 'location': 'withAlpha()', 'message': 'withAlpha() and isHexColor() are exported but unused anywhere in the current code paths. Either wire them into the level renderer (validation) or drop dead code to keep the surface area minimal.'}

## 审查的代码
- src/level/levelBuilder.ts
- docs/Reqs/b63dfa/6ea9b5/dev-notes.md
