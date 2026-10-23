// Renders the static level (ground, floating platforms, world boundaries) into
// a Phaser scene. Layout data lives in levelLayout.ts as plain, Phaser-free
// data; this builder is the single place that turns each rect into a visible
// game object plus an Arcade static body.
//
// "Boundaries" are implemented as the Arcade world bounds + camera clamp: the
// playable area is exactly the world rect from levelLayout.worldBounds, so the
// camera never pans past the edges and bodies are kept inside it.

import Phaser from 'phaser';
import { LevelLayout, Platform, Rect, levelLayout } from './levelLayout';

// Level-specific fill/surface tones sourced from the "colors" section of
// docs/Reqs/b63dfa/6ea9b5/design_tokens.json (ground_fill, ground_surface,
// platform_fill, platform_surface). Kept local because these extend the base
// COLORS palette in constants.ts and are only used by the level renderer.
const LEVEL_COLORS = {
  groundFill: '#1E293B',
  groundSurface: '#22D3EE',
  platformFill: '#4F46E5',
  platformSurface: '#22D3EE',
} as const;

/** Thickness (px) of the accent line drawn along a walkable top surface. */
const SURFACE_LINE_HEIGHT = 2;

/**
 * Builds the static level geometry for a scene. Call {@link LevelBuilder.build}
 * once per scene create; the resulting {@link LevelBuilder.staticGroup} can be
 * wired to character bodies for collisions.
 */
export class LevelBuilder {
  private readonly layout: LevelLayout;
  private statics: Phaser.Physics.Arcade.StaticGroup | null = null;

  constructor(layout: LevelLayout = levelLayout) {
    this.layout = layout;
  }

  /** Create all level objects (bounds, ground, platforms) in the scene. */
  build(scene: Phaser.Scene): void {
    this.applyWorldBounds(scene);

    this.statics = scene.physics.add.staticGroup();
    this.addGround(scene);
    this.layout.platforms.forEach((platform) => this.addPlatform(scene, platform));
  }

  /** Static collision group containing the ground and every platform. */
  get staticGroup(): Phaser.Physics.Arcade.StaticGroup | null {
    return this.statics;
  }

  /** Clamp the camera and the physics world to the level's bounds. */
  private applyWorldBounds(scene: Phaser.Scene): void {
    const { worldBounds } = this.layout;
    scene.physics.world.setBounds(
      worldBounds.x,
      worldBounds.y,
      worldBounds.width,
      worldBounds.height,
    );
    scene.cameras.main.setBounds(
      worldBounds.x,
      worldBounds.y,
      worldBounds.width,
      worldBounds.height,
    );
  }

  private addGround(scene: Phaser.Scene): void {
    const { ground } = this.layout;
    this.addStaticRect(scene, ground, LEVEL_COLORS.groundFill);
    this.addSurfaceLine(scene, ground.x, ground.y, ground.width, LEVEL_COLORS.groundSurface);
  }

  private addPlatform(scene: Phaser.Scene, platform: Platform): void {
    this.addStaticRect(scene, platform, LEVEL_COLORS.platformFill);
    this.addSurfaceLine(
      scene,
      platform.x,
      platform.y,
      platform.width,
      LEVEL_COLORS.platformSurface,
    );
  }

  /**
   * Add a visible rectangle at the rect's top-left origin and attach a static
   * Arcade body sized to it, so characters collide with the shape.
   */
  private addStaticRect(scene: Phaser.Scene, rect: Rect, fillColor: string): void {
    const image = scene.add.rectangle(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
      rect.width,
      rect.height,
      Number.parseInt(String(fillColor).replace(/^#/, ''), 16),
    );
    this.statics?.add(image);
  }

  /** Decorative accent line along the top of a walkable surface (no physics). */
  private addSurfaceLine(
    scene: Phaser.Scene,
    x: number,
    topY: number,
    width: number,
    color: string,
  ): void {
    scene.add.rectangle(
      x + width / 2,
      topY + SURFACE_LINE_HEIGHT / 2,
      width,
      SURFACE_LINE_HEIGHT,
      Number.parseInt(String(color).replace(/^#/, ''), 16),
    );
  }
}