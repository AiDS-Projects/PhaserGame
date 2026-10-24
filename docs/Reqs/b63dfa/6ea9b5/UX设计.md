# UX 设计 — 搭建关卡场景：地面与平台

> 所属需求：平台跳跃可玩原型：主角二段跳 + 冲刺

## 交互流程图

```mermaid
flowchart TD
  Boot["启动加载"] --> GameScene["GameScene 背景 #0F172A"]
  GameScene --> Spawn["玩家出生 y≈0 自由下落"]
  Spawn --> Play["可玩状态：移动 / 跳跃 / 冲刺"]
  Play --> Ground["地面 static 碰撞体 1920px"]
  Play --> Platforms["平台 static 碰撞体 ≥3 错开分布"]
  Ground --> Stay["站立稳定 不穿透下沉"]
  Platforms --> Stay
  Play --> Bounds["世界边界 左 x=0 / 右 x=1920 / 底部"]
  Bounds --> Blocked["阻挡越界 / 防坠落"]
  GameScene --> Camera["相机跟随玩家 + world bounds 限制 无黑边越界"]

stateDiagram-v2
  [*] --> Falling: 出生 y≈0
  Falling --> OnGround: 触地
  Falling --> OnPlatform: 触平台
  OnGround --> Running: 左右输入
  OnPlatform --> Running: 左右输入
  Running --> Jumping: 跳跃输入
  Jumping --> DoubleJump: 空中二段跳
  DoubleJump --> Falling: 跳跃结束
  Jumping --> Falling: 跳跃结束
  Running --> BlockedWall: 撞左右边界
  BlockedWall --> Running: 反向移动
  Falling --> BlockedBottom: 触底部边界
  BlockedBottom --> OnGround: 被地面拦住
  OnGround --> Falling: 走出平台边缘
  OnPlatform --> Falling: 走出平台边缘
```

## 组件线框说明

场景画布 Canvas：Phaser 渲染区，设计分辨率 960×540\n游戏世界 World：宽 1920 大于视口 960，由 world bounds 定义\n  - 地面 Ground：static 矩形碰撞体，宽 1920，位于关卡底部\n  - 平台 Platform ×3+：static 矩形碰撞体，高度与水平错开，任意两平台水平或垂直间距 ≥60px\n  - 世界边界：左 x=0、右 x=1920 不可见墙 + 底部边界\n相机 Camera：跟随玩家，被 world bounds 夹紧，视口不超关卡\n玩家占位体 Player：可碰撞主体，移动逻辑由 movement 工单提供\n背景 Background：COLORS.bg #0F172A 全屏填充\n配置层：地面/平台尺寸与位置集中到 config/constants 共享层

## 交互状态定义

玩家（可交互主体，移动逻辑由 movement 工单）：\n  - 默认 idle：站立地面/平台\n  - 移动 running：左/右，被边界阻挡\n  - 跳跃 jumping：一段跳\n  - 二段跳 doubleJump：空中二次跳跃\n  - 冲刺 dash\n  - 下落 falling：y≈0 自由下落\n  - 落地 landing：落到地面/平台后静止，不穿透\n  - 阻挡 blocked：撞左右边界 / 触底部边界\n平台与地面（static 碰撞体）：\n  - 默认 collidable：可站立碰撞，无 hover/active/disabled 等 Web 状态\n相机：\n  - 跟随 following\n  - 边缘夹紧 clamped：视口不超 world bounds\n加载/页面状态：\n  - 首次加载：3s 内进入 GameScene，背景 #0F172A\n  - 空/错误状态：本工单不涉及（无 HUD、无网络请求）

## 响应式/适配规则

基准设计分辨率：960×540\n  - desktop >1024px：Phaser Scale.FIT 等比缩放，保持 16:9，多余区域 letterbox（背景色 #0F172A）\n  - tablet 768-1024px：Scale.FIT 等比缩放\n  - mobile <768px：本原型暂不支持（PRD 排除虚拟摇杆/触控），仅桌面键盘\n物理与碰撞使用固定世界坐标（世界宽 1920），与屏幕缩放无关，避免随分辨率漂移

## UI 资产清单（初稿）

本工单无外部资源，地面/平台用 COLORS 色彩 token 绘制纯色矩形占位\n- icon: 无（无 HUD/图标需求）\n- illustration: 无（无空状态/插画需求）\n- image: 无（不引入美术贴图）\n后续工单预留（非本工单范围）：玩家角色贴图、平台贴图、背景视差层
