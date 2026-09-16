# AGENTS.md

`dsh-file-link-menu`：给 DSH Web 界面补上文件与链接右键菜单的独立插件。

## 定位

- **官方外壳不动**：不 disable 任何官方行，不占用任何单例插槽；只往 `conversation.input.overlay`（list 槽）加一个渲染为空的宿主条目，用来持有捕获阶段的 `contextmenu` / `click` 监听、portal 菜单与附件预览。选这个槽而不是会话头部，是因为会话还没有消息时官方不渲染头部，而那正是输入框里挂着刚粘贴附件的会话。
- **官方原版 DSH 上可用**：零内核改动，不依赖任何未合并的上游补丁。运行中的 DSH 是 0.1.5-rc.2，依赖版本按它对齐。
- 只有在确实没有插槽时，才使用 DOM 锚点做增强；锚点与失效条件集中写在 `src/client/surfaces.ts` 的模块注释里。**锚点失效只允许丢对应界面的菜单，不允许影响会话数据，也不允许拦住官方菜单**：识别不到就不 `preventDefault`，已被他人 `preventDefault` 过的事件直接放行。
- 同时适配 `dsh web`（普通浏览器）与 DSH Desktop（Tauri 封装端）；行与文案按宿主能力裁剪，而不是按平台猜。

## 安全红线

1. 浏览器传来的路径一律不可信：宿主必须先跟随符号链接解析，确认落在宿主自己给出的两个根内——会话工作区（相对路径只按它解析）与 dsh 的附件仓库（`src/authorize.ts`）。仓库是第二个根，因为粘贴出来的附件必然在所有工作区之外，而卡片上只有文件名；浏览器只可能从 `/attachment` 路由拿到仓库内的路径。工作区未知时拒绝一切相对路径与工作区路径，绝不放宽到任意目录。
2. 启动命令只用 argv 数组 + `spawn`，绝不过 shell。
3. **宿主自己去连**的路由（`download-link`、`save-link-as`，以及抓取过程中重定向的逐跳复检）只允许 `http`/`https`，逐跳重校验重定向，拒绝回环与内网地址（SSRF），并限制时间与体积——改动这一处必须同时补 `tests/routes.spec.ts` 的拒绝用例。**只把 URL 交给用户浏览器**的 `open-url` 不做内网拒绝：宿主不发起任何连接，而同一菜单里"在新标签页中打开"本来就能打开同样的地址，多这条限制只会让本机面板/内网链接点不开。
4. 每条路由都先过 `connection` 的 Host/Origin 与登录校验。

## 约定

- 默认中文交流；客户端文案全部进 `src/client/locales.ts` 的中英词典，不得新增硬编码文案。
- **粘贴引用的命名约定**：`dsh-auto-paste` 把粘贴文件命名成 `paster-<时间戳>.txt`，并在消息里按**文件名**（而不是那条很长的仓库路径）引用它；本插件按 `paster-` 前缀把该引用认成附件（`surfaces.ts` 的 `isPasteName`），再经 `/attachment` 路由回查仓库——所以它的左键由本插件接管（那个名字照工作区相对路径解析必然失败）。改前缀要同时改两个插件。
- 菜单项按 `caps` 能力组合，不做"点了必然失败"的项；失败以 Toast 反馈，错误码到文案的映射集中在 `src/client/FileLinkMenu.tsx` 的 `ERROR_KEYS`。
- 验证链：`pnpm run typecheck` → `pnpm test` → `pnpm run build` → `dsh plugin --profile web add ./plugins/dsh-file-link-menu` 后在真实界面确认（效果由用户确认，不要自己截图）。
- 提交发生在**本目录**；上游 DSH 仓库只作为参考，仅在用户明确授权时才修改。
