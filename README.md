# model-source-picker

把 DeepSeek Harness 输入框上的模型选择器改成「先选来源、再选模型」的两级结构：**模型来源放大**在最上层，点进去才是具体模型。

## 安装

```bash
dsh plugin --profile desktop add github:BEAVER-awa/dsh-model-source-picker
```

装完如果界面没变化，在插件管理器里把这个 bundle 关掉再打开一次（或重启应用）——比反复刷新页面可靠，原因见下面的「诊断」。

要求：DeepSeek Harness ≥ 0.2.1（用到 `modelDirectories` 服务），Node ≥ 22。插件只占客户端 UI 座位，不碰 agent 循环、工具和提示词。

## 改了什么

|  | 原生选择器 | 这个插件 |
|---|---|---|
| 输入框上的触发器 | 图标 + 模型名 | **来源**（如 `TokenPlan`）+ 模型名 + 推理强度 |
| 菜单第一层 | 所有来源的模型一次性平铺 | **来源列表**（名称放大、带首字母徽标、模型数量、当前来源标记） |
| 菜单第二层 | 无 | 该来源下的模型列表（可搜索、当前项打勾、显示描述与推理档数） |
| 推理强度 | 平铺在菜单里 | 第一层的独立一行，或带推理档模型的第三层 |

## 交互

- 点来源 → 进入该来源的模型列表；左上角 `‹ 模型来源` 或 `Esc` 返回上一层
- 模型超过 6 个时出现搜索框，直接打字过滤
- 选中即生效，不会自动关闭会话之外的东西
- 会话正在运行时仍可切换（与原选择器一致）
- 被指派的子代理会话不显示这个控件（与原选择器一致）

## 实现

- 完全复用官方插件的模型目录：以 `priority: -20` 占用 `conversation.input.model` 座位，通过 `ctx.get('modelDirectories').directoryFor(sessionId)` 拿到与 `/model` 命令共用的同一个 store（`load()` / `select()`），不自己发请求、不自建 catalog。优先级 -20 可以同时盖过官方选择器（0）和 `dsh-codex-subscription` 的替换版（-10）。
- 动态 client 半边拿到的是受限 ctx（只有 `get` / `on` / `provide` / `effect`），所以所有服务都用 `ctx.get()` 读取并逐个判空，不设顶层 `inject` 门禁 —— 少一个服务就静默不挂载是最难排查的失败方式。
- 样式只用主题 token（`--dsw-alias-*`、`--dsw-font-*`），自动跟随深浅色；菜单 portal 到 `document.body`，避免被停靠的输入框裁剪。
- 文案走 locale（`model-source-picker` 命名空间，中英双语），locale 注册失败时退回内置字符串。
- 注册若失败会打印 `[model-source-picker] ...` 并让位，输入框回落到原来的选择器，不会让界面崩掉。

## 文件

- `lib/client.js` —— 浏览器半边（全部 UI）
- `lib/index.js` —— Host 半边（占位，保证包在两种半边都成立）
- `cordis.patch.yml` —— bundle patch，插入 `model-source-picker` 这一行
- `package.json` —— `dsh.bundle.patch` + `dsh.client{ platform, immediately }`

## 诊断

`shell.overlay` 里留了一个什么都不画的 `model-source-picker-probe` 占位条目：它的唯一作用是证明「这个 bundle 真的在页面里跑起来了」。用 Slots 检查面板看 `shell.overlay` 的 occupants 有没有它，就能把「模块没送到浏览器」和「注册被拒绝」区分开。

如果刚安装完界面没变化，说明新插件行还没进客户端模块图：在插件管理器里把 `dsh-model-source-picker` 关掉再打开一次（或重启应用），比反复刷新页面更可靠。

## 关闭 / 卸载

在插件管理器里禁用 bundle `dsh-model-source-picker`，或删掉 `cordis.patch.yml` 里那一行 insert；刷新页面即可回到原生选择器。

## English

A provider-first model picker for DeepSeek Harness. The control on the composer opens with the **model source** (account / provider) as an enlarged first-level list — name, initial badge, model count, current marker — and the concrete models of that source live one level down, searchable, with the current one checked.

|  | Stock picker | This plugin |
|---|---|---|
| Composer trigger | icon + model name | **source** (e.g. `TokenPlan`) + model + reasoning effort |
| Menu level 1 | every model of every source, flattened | **source list**, enlarged |
| Menu level 2 | — | models of that source, searchable |
| Reasoning effort | flat in the menu | its own row on level 1, or a third level for models with efforts |

It claims the `conversation.input.model` seat at `priority: -20` (over the stock picker at `0` and `dsh-codex-subscription`'s at `-10`) and reads the same catalog as `/model` through `ctx.get('modelDirectories').directoryFor(sessionId)`, so nothing can disagree about what is selectable. A thrown render abdicates the seat, and a failed registration logs `[model-source-picker] ...` and lets the composer fall back to the stock picker instead of breaking the UI.

Install with `dsh plugin add github:BEAVER-awa/dsh-model-source-picker`. If nothing changes after installing, toggle the bundle off and on again in the plugin manager (or restart) — that is what re-seeds the client module graph.

## License

MIT.
