# AGENTS.md

`dsh-file-link-menu`：给 DSH Web 界面补上文件与链接右键菜单、并把路径 chip 显示成「类型图标 + 文件名」的独立插件。

## 定位

- **官方外壳不动**：不 disable 任何官方行，不占用任何单例插槽；只往 `conversation.input.overlay`（list 槽）加一个渲染为空的宿主条目，用来持有捕获阶段的 `contextmenu` / `click` 监听、portal 菜单、附件预览，以及路径 chip 的显示层。选这个槽而不是会话头部，是因为会话还没有消息时官方不渲染头部，而那正是输入框里挂着刚粘贴附件的会话。
- **官方原版 DSH 上可用**：零内核改动，不依赖任何未合并的上游补丁。运行中的 DSH 是 0.1.5-rc.2，依赖版本按它对齐。
- 只有在确实没有插槽时，才使用 DOM 锚点做增强；锚点与失效条件集中写在 `src/client/surfaces.ts` 的模块注释里。**锚点失效只允许丢对应界面的菜单或图标，不允许影响会话数据，也不允许拦住官方菜单或改动官方交互**：识别不到就不 `preventDefault`，已被他人 `preventDefault` 过的事件直接放行，渲染不认识的 chip 一律原样保留。
- 同时适配 `dsh web`（普通浏览器）与 DSH Desktop（Tauri 封装端）；行与文案按宿主能力裁剪，而不是按平台猜。

## 显示层（路径 chip）

把 chip 改写成「类型图标 + 文件名」的那一层，是**在官方拥有的 DOM 上就地改写**，所以它的安全论证必须一直成立。改这一层前先读 `src/client/chips.ts`、`src/client/enhance.ts`、`src/client/icons.ts` 的模块注释与 `tests/chips.spec.ts`：

1. **只插入、只改文本，不删除、不搬动官方节点。** shell 自己画的图标用 CSS 隐藏（`chips.module.css`），绝不 `remove()`：那个节点仍归 React 所有，移出 DOM 会让虚拟 DOM 与文档不一致。
2. **完整路径必须留在元素上**（`data-flm-full-path`）。官方的 chip 文本本来就是路径，缩短之后文本不再能反推出路径，菜单与后续 pass 都只认这个戳；`surfaces.ts` 的 `chipPathOf` 先读戳再读文本。**改动这里必须同时检查 `toolTargetOf` 的用例**，否则菜单会去开错文件。
3. **必须能分辨"自己写的名字"与"shell 之后覆写的文本"**：React 在 prop 变化时会重建按钮的子节点，流式调用每帧都在变。所以记录 `data-flm-shown`，两者不一致即以可见文本为准重算（`chips.ts` 的 `pathOf`）。去掉这个判断会让 chip 永久显示上一个文件名。
4. **id 按实例追加后缀，不替换**：同一份图形里可能有多个 `dsh-code-icon-*` id，形状用 `url(#…)` 分别引用；替换成同一个值会打断其中一部分填充。`useId` 在复用的渲染 root 里每次返回同一个值，所以按类型缓存必须配实例后缀（`scopeIconIds`）。
5. **读 chip 文本一律用 `chipTextOf`，绝不用 `textContent`。** `textContent` 会递归读进 `<svg>` 子树，而 DSH 有四份图形用 SVG `<text>` 把字母画出来：`.css` 画 `CSS`、`.env` 画 `.ENV`、`.ini` 画 `INI`、`objective-c`（`.m`/`.mm`）画 `OC`。读到的字符串是「字母 + 路径」，末尾仍是合法扩展名，于是被当成更长的路径写回去——**每趟加一份字母，无上限增长**（0.1.0 的真实缺陷，见 `chipTextOf` 的注释）。判据是 HTML 的通用规则「`<svg>` 里是图形不是文本」，不是「跳过某个图标」，所以新增图标不会重新引入它。
6. **每一趟都必须收敛**：已经带图标、已缩短、已记录名字的 chip 不再改写，否则观察器会被自己的写入反复唤醒。
7. **失败退化为官方渲染**：拿不到图标、算不出名字、识别不了的 chip，保持原样，绝不抛错。

改这一层后必须跑 `tests/chips.spec.ts`；其中「glyphs that paint their label as text」一组用带 `<text>` 的图形覆盖第 5 条，新增此类图形时应照着扩展它。

## 安全红线

1. 浏览器传来的路径一律不可信：宿主必须先跟随符号链接解析，确认落在宿主自己给出的两个根内——会话工作区（相对路径只按它解析）与 dsh 的附件仓库（`src/authorize.ts`）。仓库是第二个根，因为粘贴出来的附件必然在所有工作区之外，而卡片上只有文件名；浏览器只可能从 `/attachment` 路由拿到仓库内的路径。工作区未知时拒绝一切相对路径与工作区路径，绝不放宽到任意目录。
2. 启动命令只用 argv 数组 + `spawn`，绝不过 shell。
3. **宿主自己去连**的路由（`download-link`、`save-link-as`，以及抓取过程中重定向的逐跳复检）只允许 `http`/`https`，逐跳重校验重定向，拒绝回环与内网地址（SSRF），并限制时间与体积——改动这一处必须同时补 `tests/routes.spec.ts` 的拒绝用例。**只把 URL 交给用户浏览器**的 `open-url` 不做内网拒绝：宿主不发起任何连接，而同一菜单里"在新标签页中打开"本来就能打开同样的地址，多这条限制只会让本机面板/内网链接点不开。
4. 每条路由都先过 `connection` 的 Host/Origin 与登录校验。

## 约定

- 默认中文交流；客户端文案全部进 `src/client/locales.ts` 的中英词典，不得新增硬编码文案。
- **粘贴引用的命名约定**：`dsh-auto-paste` 把粘贴文件命名成 `paster-<时间戳>.txt`，并在消息里按**文件名**（而不是那条很长的仓库路径）引用它；本插件按 `paster-` 前缀把该引用认成附件（`surfaces.ts` 的 `isPasteName`），再经 `/attachment` 路由回查仓库——所以它的左键由本插件接管（那个名字照工作区相对路径解析必然失败）。改前缀要同时改两个插件。
- 菜单项按 `caps` 能力组合，不做"点了必然失败"的项；失败以 Toast 反馈，错误码到文案的映射集中在 `src/client/FileLinkMenu.tsx` 的 `ERROR_KEYS`。
- 验证链：`pnpm run typecheck` → `pnpm test` → `pnpm run build` → `dsh plugin --profile web add <本仓库路径>` 后在真实界面确认（效果由用户确认，不要自己截图）。
- **本仓库是独立仓库，必须自包含**：`tsconfig.json` 与 `vitest.config.ts` 不得 `extends`/`import` 仓库外的文件，否则发布时的 `prepublishOnly` 构建会失败。要验证这一点，把仓库复制到一个空目录（不含 node_modules）后跑 `pnpm install --frozen-lockfile --ignore-scripts && pnpm run build`。
- **构建钩子只用 `prepublishOnly`，不要用 `prepare`**：`prepare` 会在每次安装后执行，而 pnpm ≥10 要求安装者先 `allowBuilds` 授权，否则报 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`；本仓库已提交 `lib/`，安装时无物可构建。改回 `prepare` 会让 `dsh plugin add` 在用户机器上失败。
- 官方 `@deepseek-ai/*` 依赖用 `peerDependencies` 声明；范围必须带显式的预发布分支（如 `>=0.1.5-rc.1 <0.1.6 || >=0.1.6-alpha.1 <0.2.0-0`），否则 node-semver 会静默排除 harness 的预发布构建，用户安装时报 `ERESOLVE`。
