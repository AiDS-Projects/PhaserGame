import Phaser from 'phaser';

/**
 * 可玩原型玩家角色：键盘（方向键 / WASD）+ 触控拖拽兜底。
 */
export default class Player extends Phaser.Physics.Arcade.Sprite {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private speed = 240;
  private touchPointer: Phaser.Input.Pointer | null = null;
  private touchOrigin = new Phaser.Math.Vector2();

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player');

    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);

    const keyboard = scene.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.wasd = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // 触控兜底：按下时记录起点，拖拽方向即移动方向。
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
  }

  /** 生成占位纹理（若不存在）。 */
  static createTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists('player')) {
      return;
    }
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0x38bdf8, 1);
    graphics.fillRoundedRect(0, 0, 32, 32, 8);
    graphics.generateTexture('player', 32, 32);
    graphics.destroy();
  }

  update(): void {
    let vx = 0;
    let vy = 0;

    if (this.cursors.left.isDown || this.wasd.left.isDown) {
      vx = -1;
    } else if (this.cursors.right.isDown || this.wasd.right.isDown) {
      vx = 1;
    }

    if (this.cursors.up.isDown || this.wasd.up.isDown) {
      vy = -1;
    } else if (this.cursors.down.isDown || this.wasd.down.isDown) {
      vy = 1;
    }

    if (this.touchPointer?.isDown) {
      const dx = this.touchPointer.x - this.touchOrigin.x;
      const dy = this.touchPointer.y - this.touchOrigin.y;
      const distance = Phaser.Math.Distance.Between(0, 0, dx, dy);
      if (distance > 12) {
        vx = dx / distance;
        vy = dy / distance;
      }
    }

    const length = Math.hypot(vx, vy);
    if (length > 0) {
      vx /= length;
      vy /= length;
    }

    this.setVelocity(vx * this.speed, vy * this.speed);

    if (vx !== 0) {
      this.setFlipX(vx < 0);
    }
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.touchPointer) {
      this.touchPointer = pointer;
      this.touchOrigin.set(pointer.x, pointer.y);
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.touchPointer === pointer) {
      this.touchPointer = null;
    }
  }

  override destroy(fromScene?: boolean): void {
    const scene = this.scene;
    scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    super.destroy(fromScene);
  }
}