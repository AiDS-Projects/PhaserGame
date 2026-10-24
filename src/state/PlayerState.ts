/**
 * 玩家跳跃与冲刺状态管理（受控 action 驱动）。
 *
 * 支持「跳跃 + 二段跳」：
 *  - 跳跃次数（jumpCount）只能通过 dispatch(action) 更新，外部不可直接修改；
 *  - 起跳消耗一次跳跃次数，落地（LAND）时重置跳跃次数；
 *  - 默认 maxJumps = 2，即允许一次跳跃 + 一次二段跳。
 *
 * 支持「冲刺 + 无敌帧 + 冷却反馈」：
 *  - 冲刺（DASH）消耗冷却，冲刺期间与冲刺后一段时间内处于无敌帧（invincible）；
 *  - 冷却 / 无敌帧 / 冲刺时长均为时间驱动，通过 TICK action 推进；
 *  - 冷却结束前再次冲刺会被忽略，可查询剩余冷却比例用于 UI 反馈。
 */

export type PlayerAction =
  | { type: 'JUMP' }
  | { type: 'LAND' }
  | { type: 'RESET' }
  | { type: 'DASH' }
  | { type: 'TICK'; deltaMs: number };

export interface PlayerStateSnapshot {
  /** 已使用的跳跃次数 */
  readonly jumpCount: number;
  /** 允许的最大跳跃次数（二段跳 = 2） */
  readonly maxJumps: number;
  /** 是否处于落地状态 */
  readonly isGrounded: boolean;
  /** 冲刺冷却剩余时间（ms），0 = 就绪 */
  readonly dashCooldownRemaining: number;
  /** 冲刺总冷却时间（ms） */
  readonly dashCooldownMs: number;
  /** 本次冲刺剩余持续时间（ms），0 = 未在冲刺 */
  readonly dashRemaining: number;
  /** 单次冲刺持续时间（ms） */
  readonly dashDurationMs: number;
  /** 无敌帧剩余时间（ms），0 = 无无敌帧 */
  readonly invincibleRemaining: number;
  /** 无敌帧总时长（ms） */
  readonly invincibleDurationMs: number;
}

export interface DashConfig {
  /** 冲刺总冷却时间（ms） */
  cooldownMs: number;
  /** 单次冲刺持续时间（ms） */
  durationMs: number;
  /** 冲刺后无敌帧时长（ms） */
  invincibleMs: number;
}

export const INITIAL_PLAYER_STATE: PlayerStateSnapshot = Object.freeze({
  jumpCount: 0,
  maxJumps: 2,
  isGrounded: true,
  dashCooldownRemaining: 0,
  dashCooldownMs: 800,
  dashRemaining: 0,
  dashDurationMs: 150,
  invincibleRemaining: 0,
  invincibleDurationMs: 250,
});

/**
 * 纯函数 reducer：根据 action 与当前状态计算下一状态。
 * jumpCount 与冲刺 / 无敌帧计时只能在此处被修改，保证状态更新受控。
 */
export function playerStateReducer(
  state: PlayerStateSnapshot,
  action: PlayerAction,
): PlayerStateSnapshot {
  switch (action.type) {
    case 'JUMP': {
      // 已用尽跳跃次数（含二段跳），忽略本次起跳
      if (state.jumpCount >= state.maxJumps) {
        return state;
      }
      return {
        ...state,
        jumpCount: state.jumpCount + 1,
        isGrounded: false,
      };
    }
    case 'LAND':
      // 落地重置跳跃次数
      return {
        ...state,
        jumpCount: 0,
        isGrounded: true,
      };
    case 'DASH': {
      // 冷却未结束，忽略本次冲刺
      if (state.dashCooldownRemaining > 0) {
        return state;
      }
      return {
        ...state,
        dashCooldownRemaining: state.dashCooldownMs,
        dashRemaining: state.dashDurationMs,
        invincibleRemaining: state.invincibleDurationMs,
      };
    }
    case 'TICK': {
      const deltaMs = Math.max(0, action.deltaMs);
      const dashCooldownRemaining = Math.max(
        0,
        state.dashCooldownRemaining - deltaMs,
      );
      const dashRemaining = Math.max(0, state.dashRemaining - deltaMs);
      const invincibleRemaining = Math.max(
        0,
        state.invincibleRemaining - deltaMs,
      );
      // 计时器均未变化时返回原引用，避免无意义的更新
      if (
        dashCooldownRemaining === state.dashCooldownRemaining &&
        dashRemaining === state.dashRemaining &&
        invincibleRemaining === state.invincibleRemaining
      ) {
        return state;
      }
      return {
        ...state,
        dashCooldownRemaining,
        dashRemaining,
        invincibleRemaining,
      };
    }
    case 'RESET':
      return {
        ...state,
        jumpCount: 0,
        isGrounded: true,
        dashCooldownRemaining: 0,
        dashRemaining: 0,
        invincibleRemaining: 0,
      };
    default:
      return state;
  }
}

export class PlayerStateManager {
  private state: PlayerStateSnapshot;

  constructor(maxJumps = 2, dashConfig: Partial<DashConfig> = {}) {
    const {
      cooldownMs = INITIAL_PLAYER_STATE.dashCooldownMs,
      durationMs = INITIAL_PLAYER_STATE.dashDurationMs,
      invincibleMs = INITIAL_PLAYER_STATE.invincibleDurationMs,
    } = dashConfig;

    this.state = {
      ...INITIAL_PLAYER_STATE,
      maxJumps,
      dashCooldownMs: cooldownMs,
      dashDurationMs: durationMs,
      invincibleDurationMs: invincibleMs,
    };
  }

  /** 当前状态的只读快照 */
  get snapshot(): PlayerStateSnapshot {
    return { ...this.state };
  }

  /** 是否还能继续跳跃（跳跃 + 二段跳各一次） */
  get canJump(): boolean {
    return this.state.jumpCount < this.state.maxJumps;
  }

  /** 是否处于落地状态 */
  get isGrounded(): boolean {
    return this.state.isGrounded;
  }

  /** 已使用的跳跃次数 */
  get jumpCount(): number {
    return this.state.jumpCount;
  }

  /** 冲刺冷却是否已结束（能否再次冲刺） */
  get canDash(): boolean {
    return this.state.dashCooldownRemaining <= 0;
  }

  /** 是否正处于冲刺过程中 */
  get isDashing(): boolean {
    return this.state.dashRemaining > 0;
  }

  /** 是否处于无敌帧 */
  get isInvincible(): boolean {
    return this.state.invincibleRemaining > 0;
  }

  /** 冲刺冷却剩余时间（ms） */
  get dashCooldownRemaining(): number {
    return this.state.dashCooldownRemaining;
  }

  /** 冲刺总冷却时间（ms） */
  get dashCooldownMs(): number {
    return this.state.dashCooldownMs;
  }

  /** 本次冲刺剩余持续时间（ms） */
  get dashRemaining(): number {
    return this.state.dashRemaining;
  }

  /** 无敌帧剩余时间（ms） */
  get invincibleRemaining(): number {
    return this.state.invincibleRemaining;
  }

  /** 冷却剩余比例：1 = 刚冲刺完，0 = 就绪（用于冷却条反馈） */
  get dashCooldownFraction(): number {
    if (this.state.dashCooldownMs <= 0) {
      return 0;
    }
    return this.state.dashCooldownRemaining / this.state.dashCooldownMs;
  }

  /**
   * 派发受控 action 更新状态，并返回最新快照。
   * 这是修改状态的唯一入口。
   */
  dispatch(action: PlayerAction): PlayerStateSnapshot {
    this.state = playerStateReducer(this.state, action);
    return this.snapshot;
  }

  /** 尝试起跳：若还有跳跃次数则消耗一次并返回 true，否则返回 false。 */
  tryJump(): boolean {
    if (!this.canJump) {
      return false;
    }
    this.dispatch({ type: 'JUMP' });
    return true;
  }

  /** 尝试冲刺：若冷却已结束则触发并返回 true，否则返回 false。 */
  tryDash(): boolean {
    if (!this.canDash) {
      return false;
    }
    this.dispatch({ type: 'DASH' });
    return true;
  }

  /** 推进时间（ms）：驱动冲刺冷却与无敌帧倒计时。 */
  tick(deltaMs: number): void {
    this.dispatch({ type: 'TICK', deltaMs });
  }

  /** 落地：重置跳跃次数。 */
  land(): void {
    this.dispatch({ type: 'LAND' });
  }

  /** 重置整个状态（例如重生 / 关卡重开）。 */
  reset(): void {
    this.dispatch({ type: 'RESET' });
  }
}