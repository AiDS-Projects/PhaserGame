import Phaser from 'phaser';

// ---- Tunables (acceptance baseline) ----
const GAME_W = 960;
const GAME_H = 540;
const GROUND_TOP = 480;
const GRAVITY = 1500;
const MOVE_SPEED = 360;
const JUMP_VELOCITY = -620;
const MAX_JUMPS = 2;
const DASH_SPEED = 1100;
const DASH_DURATION = 150;
const DASH_COOLDOWN = 800;
const INVINCIBLE_MS = 250;

// ---- Shared input state (keyboard + touch) ----
const inputState = { left: false, right: false };
const pendingActions = { jump: false, dash: false };

// ---- Touch fallback detection ----
const showTouch =
  'ontouchstart' in window ||
  navigator.maxTouchPoints > 0 ||
  /[?&]touch=1/.test(window.location.search);

interface PlayerState {
  jumpCount: number;
  isGrounded: boolean;
  dashCooldownRemaining: number;
  dashRemaining: number;
  invincibleRemaining: number;
  facing: number;
  dashDir: number;
}

interface GameStateSnapshot {
  jumpCount: number;
  maxJumps: number;
  isGrounded: boolean;
  dashCooldownRemaining: number;
  dashRemaining: number;
  invincibleRemaining: number;
  facing: number;
}

let activeScene: GameScene | null = null;

class GameScene extends Phaser.Scene {
  private ground!: Phaser.GameObjects.Rectangle;
  private player!: Phaser.GameObjects.Rectangle;
  private barBg!: Phaser.GameObjects.Rectangle;
  private barFill!: Phaser.GameObjects.Rectangle;
  private barLabel!: Phaser.GameObjects.Text;
  private hud!: Phaser.GameObjects.Text;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private leftKeys!: Phaser.Input.Keyboard.Key[];
  private rightKeys!: Phaser.Input.Keyboard.Key[];
  private jumpKeys!: Phaser.Input.Keyboard.Key[];
  private dashKeys!: Phaser.Input.Keyboard.Key[];

  st!: PlayerState;

  constructor() {
    super('game');
  }

  create() {
    activeScene = this;

    // Ground
    this.ground = this.add.rectangle(GAME_W / 2, GROUND_TOP + 40, GAME_W, 80, 0x1e293b);
    this.physics.add.existing(this.ground, true);
    this.add.rectangle(GAME_W / 2, GROUND_TOP + 2, GAME_W, 4, 0x334155);

    // Player
    this.player = this.add.rectangle(GAME_W / 2, GROUND_TOP - 26, 40, 52, 0x38bdf8);
    this.physics.add.existing(this.player);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    body.setGravityY(GRAVITY);
    body.setMaxVelocity(DASH_SPEED + 100, 1400);

    this.physics.add.collider(this.player, this.ground);

    // Player state
    this.st = {
      jumpCount: 0,
      isGrounded: true,
      dashCooldownRemaining: 0,
      dashRemaining: 0,
      invincibleRemaining: 0,
      facing: 1,
      dashDir: 1,
    };

    // Cooldown bar (screen-space)
    this.barBg = this.add
      .rectangle(16, 16, 200, 18, 0x1e293b)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x94a3b8)
      .setScrollFactor(0);
    this.barFill = this.add
      .rectangle(18, 25, 196, 14, 0x22c55e)
      .setOrigin(0, 0.5)
      .setScrollFactor(0);
    this.barLabel = this.add
      .text(224, 25, 'READY', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#e2e8f0',
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);

    // HUD (assertion surface for Playwright)
    this.hud = this.add
      .text(16, 46, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#94a3b8',
      })
      .setScrollFactor(0);

    // Instructions
    this.add
      .text(GAME_W / 2, 20, 'A/D or arrows move · SPACE jump (double) · SHIFT dash', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#64748b',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);

    // Keyboard
    this.cursors = this.input.keyboard!.createCursorKeys();
    const kb = this.input.keyboard!;
    this.leftKeys = [this.cursors.left, kb.addKey('A')];
    this.rightKeys = [this.cursors.right, kb.addKey('D')];
    this.jumpKeys = [this.cursors.space, this.cursors.up, kb.addKey('W'), kb.addKey('Z')];
    this.dashKeys = [this.cursors.shift, kb.addKey('X'), kb.addKey('K'), kb.addKey('J')];

    // Touch controls (fallback)
    if (showTouch) this.createTouchControls();

    this.renderBar();
    this.renderHud();
  }

  private createTouchControls() {
    const makeButton = (
      x: number,
      y: number,
      w: number,
      h: number,
      label: string,
      fontSize: number,
      onDown: () => void,
      onUp: () => void,
    ) => {
      const rect = this.add
        .rectangle(x, y, w, h, 0x1e293b, 0.7)
        .setStrokeStyle(2, 0x94a3b8)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(x, y, label, {
          fontFamily: 'monospace',
          fontWeight: '700',
          fontSize: `${fontSize}px`,
          color: '#e2e8f0',
        })
        .setOrigin(0.5)
        .setScrollFactor(0);

      const press = () => {
        rect.setFillStyle(0x38bdf8, 0.35);
        rect.setStrokeStyle(2, 0x38bdf8);
        onDown();
      };
      const release = () => {
        rect.setFillStyle(0x1e293b, 0.7);
        rect.setStrokeStyle(2, 0x94a3b8);
        onUp();
      };

      rect.on('pointerdown', press);
      rect.on('pointerup', release);
      rect.on('pointerout', release);
      rect.on('pointerupoutside', release);
    };

    makeButton(52, GAME_H - 52, 72, 72, '\u25C4', 26, () => { inputState.left = true; }, () => { inputState.left = false; });
    makeButton(136, GAME_H - 52, 72, 72, '\u25BA', 26, () => { inputState.right = true; }, () => { inputState.right = false; });
    makeButton(GAME_W - 148, GAME_H - 52, 84, 84, 'DASH', 15, () => { pendingActions.dash = true; }, () => {});
    makeButton(GAME_W - 52, GAME_H - 52, 84, 84, 'JUMP', 15, () => { pendingActions.jump = true; }, () => {});
  }

  private anyDown(keys: Phaser.Input.Keyboard.Key[]): boolean {
    return keys.some((k) => k.isDown);
  }

  private anyJustDown(keys: Phaser.Input.Keyboard.Key[]): boolean {
    return keys.some((k) => Phaser.Input.Keyboard.JustDown(k));
  }

  tryJump(): boolean {
    if (this.st.jumpCount >= MAX_JUMPS) return false;
    this.st.jumpCount += 1;
    this.st.isGrounded = false;
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocityY(JUMP_VELOCITY);
    return true;
  }

  tryDash(): boolean {
    if (this.st.dashCooldownRemaining > 0) return false;
    const dir = (inputState.right ? 1 : 0) - (inputState.left ? 1 : 0);
    this.st.dashDir = dir !== 0 ? dir : this.st.facing;
    this.st.dashCooldownRemaining = DASH_COOLDOWN;
    this.st.dashRemaining = DASH_DURATION;
    this.st.invincibleRemaining = INVINCIBLE_MS;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocityY(0);
    return true;
  }

  update(_time: number, delta: number) {
    const body = this.player.body as Phaser.Physics.Arcade.Body;

    // Consume queued touch actions
    if (pendingActions.jump) {
      pendingActions.jump = false;
      this.tryJump();
    }
    if (pendingActions.dash) {
      pendingActions.dash = false;
      this.tryDash();
    }

    // Keyboard actions
    if (this.anyJustDown(this.jumpKeys)) this.tryJump();
    if (this.anyJustDown(this.dashKeys)) this.tryDash();

    const left = inputState.left || this.anyDown(this.leftKeys);
    const right = inputState.right || this.anyDown(this.rightKeys);

    if (left && !right) this.st.facing = -1;
    else if (right && !left) this.st.facing = 1;

    // Horizontal movement
    if (this.st.dashRemaining > 0) {
      body.setVelocityX(this.st.dashDir * DASH_SPEED);
    } else {
      let vx = 0;
      if (left) vx -= MOVE_SPEED;
      if (right) vx += MOVE_SPEED;
      body.setVelocityX(vx);
    }

    // Timers
    if (this.st.dashCooldownRemaining > 0) {
      this.st.dashCooldownRemaining = Math.max(0, this.st.dashCooldownRemaining - delta);
    }
    if (this.st.dashRemaining > 0) {
      this.st.dashRemaining = Math.max(0, this.st.dashRemaining - delta);
      if (this.st.dashRemaining === 0) body.setAllowGravity(true);
    }
    if (this.st.invincibleRemaining > 0) {
      this.st.invincibleRemaining = Math.max(0, this.st.invincibleRemaining - delta);
    }

    // Grounded detection
    if (body.blocked.down) {
      if (!this.st.isGrounded) {
        this.st.isGrounded = true;
        this.st.jumpCount = 0;
      }
    } else {
      this.st.isGrounded = false;
    }

    // Visuals
    if (this.st.invincibleRemaining > 0) {
      const blink = Math.floor(this.st.invincibleRemaining / 40) % 2 === 0;
      this.player.setAlpha(blink ? 0.35 : 0.85);
      this.player.setFillStyle(0xfde047);
    } else {
      this.player.setAlpha(1);
      this.player.setFillStyle(0x38bdf8);
    }

    this.renderBar();
    this.renderHud();
  }

  private renderBar() {
    if (this.st.dashCooldownRemaining > 0) {
      const f = this.st.dashCooldownRemaining / DASH_COOLDOWN;
      this.barFill.setFillStyle(0xf59e0b).setScale(f, 1);
      this.barLabel.setText((this.st.dashCooldownRemaining / 1000).toFixed(1) + 's');
    } else {
      this.barFill.setFillStyle(0x22c55e).setScale(1, 1);
      this.barLabel.setText('READY');
    }
  }

  private renderHud() {
    this.hud.setText(
      'JUMPS ' + this.st.jumpCount + '/' + MAX_JUMPS +
      '  GROUND ' + (this.st.isGrounded ? 'Y' : 'N') +
      '  DASH ' + (this.st.dashRemaining > 0 ? 'Y' : 'N') +
      '  CD ' + Math.ceil(this.st.dashCooldownRemaining) +
      '  INV ' + Math.ceil(this.st.invincibleRemaining),
    );
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#0f172a',
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [GameScene],
};

new Phaser.Game(config);

// ---- Playwright screenshot / acceptance self-test harness ----
function getState(): GameStateSnapshot | null {
  if (!activeScene) return null;
  return {
    jumpCount: activeScene.st.jumpCount,
    maxJumps: MAX_JUMPS,
    isGrounded: activeScene.st.isGrounded,
    dashCooldownRemaining: activeScene.st.dashCooldownRemaining,
    dashRemaining: activeScene.st.dashRemaining,
    invincibleRemaining: activeScene.st.invincibleRemaining,
    facing: activeScene.st.facing,
  };
}

declare global {
  interface Window {
    __game: {
      getState: () => GameStateSnapshot | null;
      jump: () => boolean;
      dash: () => boolean;
      moveLeft: (on: boolean) => void;
      moveRight: (on: boolean) => void;
      showTouch: boolean;
    };
  }
}

window.__game = {
  getState,
  jump: () => (activeScene ? activeScene.tryJump() : false),
  dash: () => (activeScene ? activeScene.tryDash() : false),
  moveLeft: (on: boolean) => { inputState.left = on; },
  moveRight: (on: boolean) => { inputState.right = on; },
  showTouch,
};