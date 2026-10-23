# PhaserGame

## Web 项目规范

**技术栈**：
**仓库**：https://github.com/AiDS-Projects/PhaserGame

### 组件开发规范

- 组件文件名使用 PascalCase，样式文件与组件同名
- Props 必须声明 TypeScript 类型
- 副作用统一放在 `useEffect`，依赖数组不得遗漏
- 避免在渲染函数中创建对象/函数（memo/callback）

### API 调用规范

- 所有请求通过统一的 `api/` 模块发起，不直接 fetch
- 错误处理：网络错误、业务错误（非 2xx）分开处理
- Loading 状态必须反映在 UI 上，不得让用户面对空白

### 禁止事项

- 禁止在组件里直接操作 DOM（用 ref）
- 禁止 `any` 类型（用 `unknown` + 类型守卫代替）
- 禁止硬编码 API base URL（用环境变量）


## Pack: typescript-quality

# PhaserGame — TypeScript 编码规范

## 1. 共享逻辑优先

**禁止**在业务模块中编写内联辅助函数，公共逻辑必须沉淀到共享层。

编写任何逻辑前，先搜索项目中是否已有相同或相似的工具函数。发现重复逻辑（≥2 处），必须抽象为泛型工具函数。

```typescript
// ❌ 在业务组件中内联
const formatDate = (d: Date) => d.toISOString().split('T')[0];

// ✅ 沉淀到 utils/
// utils/date.ts
export function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}
```

## 2. 类型安全边界

**禁止**对外部数据进行猜测性访问。API 响应、localStorage、用户输入、postMessage 等外部数据，必须经过运行时校验后再使用。

**禁止 `any`**，**减少 `as` 断言**（仅在类型系统确实无法推断时允许，且必须附注释说明原因）。

```typescript
// ❌ 盲信外部数据
const data = await api.get('/user') as any;

// ✅ Zod 边界校验
import { z } from 'zod';
const UserSchema = z.object({ name: z.string() });
const data = UserSchema.parse(await api.get('/user'));
```

```typescript
// ❌ postMessage 无校验
window.addEventListener('message', (e) => {
  const { type } = e.data; // 可能是任意数据
});

// ✅ 类型守卫
function isMyMessage(data: unknown): data is MyMessage {
  return typeof data === 'object' && data !== null && 'type' in data;
}
window.addEventListener('message', (e) => {
  if (!isMyMessage(e.data)) return;
  // 此处有完整类型推断
});
```

## 3. 状态管理不变性

全局状态变更必须通过受控的 Actions，确保逻辑集中且可追踪。

禁止在组件中直接修改 store 属性，必须通过 action 方法；禁止在路由/控制器中直接操作内部状态对象，必须通过 service 层。

```typescript
// ❌ 直接修改 store
store.previewUrl = newUrl;

// ✅ 通过 action
store.setPreviewUrl(newUrl);
```

## 速查表

| 场景 | 禁止 | 正确做法 |
|------|------|---------|
| 辅助函数 | 业务文件内 inline 定义 | 沉淀到 `utils/` 或 `services/` |
| API 响应 | `as any` + 直接访问属性 | Zod `parse()` / 类型守卫 |
| 类型声明 | `any`、宽松 `as` 断言 | 严格 `interface` / `type` |
| 状态变更 | 直接赋值 store 属性 | 通过 action 方法 |
| 外部消息 | 无校验直接解构 | 类型守卫函数过滤 |
