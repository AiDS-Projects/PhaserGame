import { test, expect, type Page } from '@playwright/test';

/**
 * E2E 测试：二段跳与受控状态管理。
 *
 * 前置约定（与 index.html / src/main.ts 保持一致）：
 *  - Vite dev server 由 playwright.config.ts 的 webServer 启动，此处使用相对路径。
 *  - Phaser 游戏实例通过 `window.game` 暴露。
 *  - 玩家通过 PlayerState 持有跳跃状态（单一事实来源）：
 *      - jumpCount：已使用跳跃次数，仅能通过受控 action（recordJump/resetJumpCount）更新；
 *      - maxJumps：最大跳跃次数（默认 2，二段跳）；
 *      - isGrounded：落地标记，由物理层驱动更新。
 */

const APP_URL = '/';

/** 跳跃状态快照：从玩家持有的 PlayerState 中读取 */
interface JumpState {
  jumpCount: number;
  maxJumps: number;
  isGrounded: boolean;
}

/** 等待 canvas 渲染完成，且游戏场景已就绪 */
async function waitForGame(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await page.waitForSelector('#game-container canvas', { state: 'visible' });
  await page.waitForFunction(() => {
    const game = (window as unknown as { game?: any }).game;
    return Boolean(game && game.scene && game.scene.getScenes(true).length > 0);
  });
}

/** 读取玩家的受控跳跃状态（PlayerState 为唯一事实来源） */
async function getJumpState(page: Page): Promise<JumpState | null> {
  return page.evaluate(() => {
    const game = (window as unknown as { game?: any }).game;
    if (!game) return null;
    const scene = game.scene.getScenes(true)[0] as any;
    if (!scene || !scene.children) return null;
    const player = scene.children.list.find((o: any) =>
      /player|hero|character/i.test(`${o.type ?? ''}${o.name ?? ''}`),
    );
    if (!player) return null;
    const state = player.state ?? player.playerState;
    if (!state) return null;
    return {
      jumpCount: state.jumpCount ?? state._jumpCount ?? 0,
      maxJumps: state.maxJumps ?? state._maxJumps ?? 0,
      isGrounded: state.isGrounded ?? state._isGrounded ?? false,
    };
  });
}

/** 等待玩家落地（body.blocked.down 为 true） */
async function waitUntilGrounded(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const game = (window as unknown as { game?: any }).game;
      if (!game) return false;
      const scene = game.scene.getScenes(true)[0] as any;
      if (!scene || !scene.children) return false;
      const player = scene.children.list.find((o: any) =>
        /player|hero|character/i.test(`${o.type ?? ''}${o.name ?? ''}`),
      );
      if (!player || !player.body) return false;
      return Boolean(player.body.blocked && player.body.blocked.down);
    },
    undefined,
    { timeout: 5000 },
  );
}

/** 触发一次跳跃输入（按下并释放 Space） */
async function pressJump(page: Page): Promise<void> {
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
}

test.describe('Player: Double Jump & Controlled Jump State', () => {
  test.beforeEach(async ({ page }) => {
    await waitForGame(page);
    await waitUntilGrounded(page);
  });

  test('exposes controlled jump state initialized for double jump', async ({ page }) => {
    const state = await getJumpState(page);
    expect(state, 'expected player to expose a jump state').not.toBeNull();

    // 初始状态：未跳跃、允许二段跳（maxJumps = 2）、贴地
    expect(state!.jumpCount).toBe(0);
    expect(state!.maxJumps).toBe(2);
    expect(state!.isGrounded).toBe(true);
  });

  test('first jump consumes one jump via the controlled action', async ({ page }) => {
    await pressJump(page);
    await page.waitForTimeout(150);

    const state = await getJumpState(page);
    expect(state, 'expected player to expose a jump state').not.toBeNull();
    expect(state!.jumpCount, 'first jump should record exactly one jump').toBe(1);
    expect(state!.isGrounded, 'player should be airborne after jumping').toBe(false);
  });

  test('double jump: a second mid-air jump consumes the remaining jump', async ({ page }) => {
    await pressJump(page);
    await page.waitForTimeout(150);
    await pressJump(page);
    await page.waitForTimeout(150);

    const state = await getJumpState(page);
    expect(state, 'expected player to expose a jump state').not.toBeNull();
    expect(state!.jumpCount, 'double jump should record exactly two jumps').toBe(2);
    expect(state!.isGrounded).toBe(false);
  });

  test('ignores a third jump while airborne (never exceeds maxJumps)', async ({ page }) => {
    await pressJump(page);
    await page.waitForTimeout(80);
    await pressJump(page);
    await page.waitForTimeout(80);
    await pressJump(page);
    await page.waitForTimeout(80);

    const state = await getJumpState(page);
    expect(state, 'expected player to expose a jump state').not.toBeNull();
    expect(state!.jumpCount).toBeLessThanOrEqual(state!.maxJumps);
    expect(state!.jumpCount).toBe(2);
  });

  test('landing resets jumpCount to zero via the controlled action', async ({ page }) => {
    await pressJump(page);
    await page.waitForTimeout(150);

    // 落地后 jumpCount 应通过受控 action（resetJumpCount）归零
    await waitUntilGrounded(page);

    const state = await getJumpState(page);
    expect(state, 'expected player to expose a jump state').not.toBeNull();
    expect(state!.jumpCount, 'jump count should reset to zero after landing').toBe(0);
    expect(state!.isGrounded, 'player should be grounded after landing').toBe(true);
  });
});