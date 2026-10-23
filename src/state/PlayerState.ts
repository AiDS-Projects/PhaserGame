/**
 * 玩家跳跃状态管理（受控 action 驱动）。
 *
 * 支持「跳跃 + 二段跳」：
 *  - 跳跃次数（jumpCount）只能通过 dispatch(action) 更新，外部不可直接修改；
 *  - 起跳消耗一次跳跃次数，落地（LAND）时重置跳跃次数；
 *  - 默认 maxJumps = 2，即允许一次跳跃 + 一次二段跳。
 */

export type PlayerAction =
  | { type: 'JUMP' }
  | { type: 'LAND' }
  | { type: 'RESET' };

export interface PlayerStateSnapshot {
  /** 已使用的跳跃次数 */
  readonly jumpCount: number;
  /** 允许的最大跳跃次数（二段跳 = 2） */
  readonly maxJumps: number;
  /** 是否处于落地状态 */
  readonly isGrounded: boolean;
}

export const INITIAL_PLAYER_STATE: PlayerStateSnapshot = Object.freeze({
  jumpCount: 0,
  maxJumps: 2,
  isGrounded: true,
});

/**
 * 纯函数 reducer：根据 action 与当前状态计算下一状态。
 * jumpCount 只能在此处被修改，保证状态更新受控。
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
        jumpCount: state.jumpCount + 1,
        maxJumps: state.maxJumps,
        isGrounded: false,
      };
    }
    case 'LAND':
      // 落地重置跳跃次数
      return {
        jumpCount: 0,
        maxJumps: state.maxJumps,
        isGrounded: true,
      };
    case 'RESET':
      return {
        jumpCount: 0,
        maxJumps: state.maxJumps,
        isGrounded: true,
      };
    default:
      return state;
  }
}

export class PlayerStateManager {
  private state: PlayerStateSnapshot;

  constructor(maxJumps = 2) {
    this.state = { ...INITIAL_PLAYER_STATE, maxJumps };
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

  /** 落地：重置跳跃次数。 */
  land(): void {
    this.dispatch({ type: 'LAND' });
  }

  /** 重置整个状态（例如重生 / 关卡重开）。 */
  reset(): void {
    this.dispatch({ type: 'RESET' });
  }
}