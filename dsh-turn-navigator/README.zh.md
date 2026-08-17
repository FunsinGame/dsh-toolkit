# @deepseek-ai/dsh-turn-navigator

[English](README.md) | 中文

面向长 DSH Web 会话的紧凑轮次导航。它会跟随会话滚动，在鼠标悬停时预览用户轮次，并在点击后跳转到该轮次。会话至少包含 3 个用户轮次时才会显示。

## 效果预览

![紧凑的轮次导航高亮显示第 4 轮，并展示其悬停预览。](docs/assets/turn-navigator-hover.png)

它支持键盘聚焦、浅色与深色主题，以及减少动态效果偏好。需要时，它只加载足以判断是否应显示导航的更早历史，同时保持读者当前的位置不变。

## 安装

该插件为私有插件，不会发布。其私有仓库为 `dsh-external/dsh-turn-navigator`，但在首次经过评审的推送完成前，该仓库仍为空。在经过评审的 commit 可用前，请使用本地安装路径，然后启动 Web：

```sh
dsh plugin --profile web add -w "/path/to/dsh-turn-navigator"
dsh web
```

首次推送经过评审的 commit 后，使用以下命令安装该私有仓库的确切修订版本：

```sh
dsh plugin --profile web add -w github:dsh-external/dsh-turn-navigator#<reviewed-commit>
```

已提交的 `lib/` 输出无需重新构建即可安装。需要兼容的 DSH Web 版本。删除插件：

```sh
dsh plugin --profile web remove -w @deepseek-ai/dsh-turn-navigator
```

## 所需的 DSH Web slot

该插件注册到 `conversation.chat.navigator`；它并不拥有或渲染这个 slot。兼容的 DSH Web 构建必须在宿主运行时和官方私有 client SDK 声明中同时交付相同契约。插件内的类型扩充不能替代这一要求：它可能让 TypeScript 检查通过，但不渲染该 slot 的宿主不会显示导航，也不会报告错误。

请在负责该 slot 的 `@deepseek-ai/dsh-client-ui-conversation` 包中添加以下内容：

1. 在 slot 契约中声明一个会话级 single slot，由 owner 提供保持锚点的更早历史加载能力，并将它加入 chat view 的 `PropsRenderSlots` union：

```ts
export interface TurnNavigatorOwnerProps {
  loadOlder: () => void
}

interface SlotMap {
  'conversation.chat.navigator': {
    kind: 'single'
    scope: 'session'
    owner: TurnNavigatorOwnerProps
  }
}
```

2. 在 chat view 注册中，以相同 kind 和 scope 声明其 child slot：

```ts
children: {
  'conversation.chat.navigator': { kind: 'single', scope: 'session' },
}
```

3. 在 chat view 组件中，在 transcript 滚动容器旁渲染该 slot，并传入回调；在更早历史记录添加到开头时，该回调会保持当前阅读行不变：

```tsx
{renderSlot('conversation.chat.navigator', { loadOlder: loadOlderAnchored })}
```

4. 在宿主包测试中覆盖声明和资源释放、渲染分发以及保持锚点的更早历史加载，然后为 `@deepseek-ai/dsh-client-ui-conversation` 及其对齐的 client peers 发布匹配的私有 SDK 版本。如果外部插件只基于 registry 中的官方包开发，仅修改宿主源码并不能解除阻塞。

## 开发与验证

项目 `.npmrc` 选择私有 `@deepseek-ai/*` scope；pnpm 11 使用 `${NPM_TOKEN}` 认证映射，该映射来自受信任的用户级 `~/.npmrc`。SDK 包固定为经过评审的 `0.0.1-rc.2` 版本组。请设置 `NPM_TOKEN`，安装时跳过 lifecycle scripts，然后运行检查：

```sh
pnpm install --ignore-scripts
pnpm run check
```

不要将 DSH 源码 checkout 链接到该目录。如需实时查看浏览器改动，请运行 `pnpm run watch`，同时运行 `dsh web --dev`。隔离组装的 Web fixture 见 [`compat/`](compat/README.md)。

## 模型体验

无。该插件只在浏览器中渲染现有会话数据。

#### KV Cache 影响

无。

## 已知限制与暂缓事项

- 私有 `0.0.1-rc.2` SDK 尚未声明[所需的 `conversation.chat.navigator` slot](#所需的-dsh-web-slot)，因此完整开发检查仍会被阻塞，直到发布匹配的官方 SDK 版本。不要添加本地类型 shim；安装目标必须提供真实 slot。
- 只有已加载的历史记录才会生成标记；加载更早的历史后，更早的轮次才会显示。
- 预览仅显示文本。
