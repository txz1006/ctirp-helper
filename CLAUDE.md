# CLAUDE.md — 项目总导航

> 新 Agent 会话的入口文档。目标：5 分钟内理解项目、定位资源、知道怎么干活。
 > 本文档只做导航，规范细节见 [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md)，产品需求见 [PRD.md](PRD.md)。

## 一、项目是什么

携程数据迁移助手 — Chrome Extension。在国内版携程商户后台页面**提取**表单数据为 JSON，在国际版页面**填入**表单实现数据迁移。

**当前版本**：v0.3.0 + 架构重构阶段 0-3 已实施。已支持 baseInfoMerge（产品基础信息）、productImageText（产品图文）、tourdays（行程描述）三个页面的导出导入。tourdays 采用页面专属 `itineraryField` 类型 + 全 role scoped handler + 导入前补齐卡片结构，详见 [docs/TOURDAYS_ADAPTER_PLAN.md](docs/TOURDAYS_ADAPTER_PLAN.md)。

**核心瓶颈**：后续还有 ~15 个页面要做。新增页面时不能影响已有页面功能。因此正在推进架构重构（[重构设计](docs/ARCHITECTURE_REFACTOR.md)）。

## 二、项目在哪

```
根目录：extension/   ← Git 仓库根目录（不是父目录 vtrip/）
```

注意：`package.json` 和 `test/` 目录在父目录 `vtrip/`，不在 `extension/`。运行测试需在 `vtrip/` 下执行（见 §三）。

### 目录关注范围（重要）

**只关注两个目录：**

- `extension/` — 插件项目本体（Git 仓库根，所有代码、测试、文档都在这里）
- `extension/docs/` — 项目设计文档（ARCHITECTURE_REFACTOR.md、TEMPLATE_SYSTEM_SPEC.md 等）

**父目录 `vtrip/` 下的内容一律忽略，与本次插件开发无关：**

- 根目录散落的 `*.json` / `*.txt`（如 `74214286_*.json`、`国内产品详情_*.json`、`*curl.txt`、`产品详情response.json` 等）— 接口抓包/临时数据样本，非项目代码
- `vtrip/docs/`（含 `plans/`）— 历史规划草稿，已被 `extension/docs/` 取代
- `vtrip/TODOS.md` — 历史待办，架构相关条目已迁入 `extension/docs/ARCHITECTURE_REFACTOR.md`
- `vtrip/TASK2_SUMMARY.txt` 等零散 txt — 临时记录

> 例外：`vtrip/package.json`、`vtrip/test/`、`vtrip/node_modules/` 是测试运行所需（见 §三），不可忽略。
> 需要页面 HTML 样本时，从 `extension/国内产品基础信息tab.txt` 等 `extension/` 内的样本文件取，不要去 `vtrip/` 根目录翻找。

## 三、怎么跑

**无需构建。直接加载到 Chrome：**

1. `chrome://extensions/` → 开启"开发者模式"
2. "加载已解压的扩展程序" → 选择 `extension/` 目录
3. 修改代码后 → 点击扩展的"重新加载"🔄 → **关闭并重开**所有携程后台标签页 → 测试

> ⚠️ **只刷新标签页不够**。content script 会被旧扩展实例持有，必须关闭再重开。原因：扩展重新加载后，旧 content script 的 `chrome.*` API 上下文失效（`SafeStorage` 即为缓解此问题而存在）。

**测试（在父目录 `vtrip/` 下运行）：**
```bash
node --check extension/content/<修改的文件>.js          # 语法检查（任意目录）
cd d:\newcapec\ai-code\vtrip && npm test                # 运行所有 Jest 测试
cd d:\newcapec\ai-code\vtrip && npm test -- test/field-matcher-test.js  # 单个测试
```

测试文件分布：
- `vtrip/test/field-matcher-test.js` — 智能匹配引擎测试
- `vtrip/test/snapshots/extract-snapshot-test.js` — `_extractFormItem` 快照基线
- `vtrip/test/snapshots/sanitize-test.js` — Sanitizers 单元测试
- `vtrip/test/snapshots/product-image-text-adapter-test.js` — productImageText 适配器回归测试
- `extension/test/template-system-test.js` — 浏览器控制台手动测试脚本（Jest 已忽略）

Jest 配置在 `vtrip/package.json` 的 `jest` 字段，匹配 `**/test/**/*-test.js`，并排除 `extension/test/` 手动脚本目录。

## 四、核心业务流程（概要）

```
【导出】国内版页面
  浮动按钮 → PageRegistry 激活当前页面适配器 → extract() 提取表单 → JSON → 剪贴板

【导入】国际版页面
  浮动按钮 → 粘贴JSON → 转换预览(可编辑) → 匹配预览 → 确认填写 → 回读验证
```

完整业务流程（含分支、AI 改写时机、模板系统）见 [PRD.md 第四章](PRD.md#四用户流程)。

## 五、代码在哪找

### 5.1 文件组织（与 manifest.json 实际加载路径一致）

```
extension/
├── manifest.json                 # Chrome Extension 配置（Manifest V3）
├── content/                      # Content Script（注入页面）
│   ├── safe-storage.js           # chrome.storage 安全封装（最先加载）
│   ├── field-matcher.js          # 智能匹配引擎核心
│   ├── match-strategies/         # 匹配策略（依赖 field-matcher）
│   │   ├── exact-match.js
│   │   ├── pattern-match.js
│   │   └── semantic-match.js
│   ├── ui/
│   │   └── match-confirmation-dialog.js  # 匹配确认弹窗
│   ├── antd1-filler.js           # Ant Design 1.x 填写器（旧版组件专配）
│   ├── react-filler.js           # React Fiber 填充器（兜底）
│   ├── page-detector.js          # 国内外版本识别
│   ├── core/
│   │   ├── field-registry.js     # 新字段类型增量入口（Registry）
│   │   └── page-registry.js      # 页面适配器注册表 + 机制α
│   ├── pages/
│   │   ├── base-info-merge/
│   │   │   └── adapter.js        # baseInfoMerge 适配器
│   │   ├── product-image-text/
│   │   │   └── adapter.js        # productImageText 适配器
│   │   └── tourdays/
│   │       ├── adapter.js        # tourdays 适配器（全字段导出 + 补齐卡片 + 定位）
│   │       └── field-handlers/itinerary-field.js  # itineraryField 全 role scoped handler
│   ├── form-extractor.js         # 通用表单提取
│   ├── form-filler.js            # 通用表单填充（含所有字段填写逻辑）
│   ├── templates/                # 模板系统（CRUD + UI）
│   ├── services/
│   │   └── sanitizers.js         # 字符清洗函数集（AI改写/富文本）
│   ├── ai-rewrite-dialog.js      # AI 改写对话框
│   ├── page-ue-bridge.js         # UEditor 主世界桥接（通过 web_accessible_resources 注入）
│   ├── import.js                 # 导入数据转换
│   ├── export.js                 # 导出流程编排
│   ├── panel.js                  # 导入浮层面板 UI
│   ├── main.js                   # 入口：页面探测 + 按钮注入（最后加载）
│   └── injected-styles.css       # 注入样式
├── popup/                         # 扩展弹窗（模式切换 + LLM 配置 + 状态概览）
│   ├── popup.html / popup.js / popup.css
├── background/
│   └── service-worker.js         # Service Worker（LLM API 代理，绕过 CORS）
├── rules/                         # 转换规则配置
│   ├── base-info.js              # 基础信息字段映射 + 枚举映射
│   └── field-mappings.json
├── test/                          # 浏览器控制台手动测试脚本（Jest 忽略）
├── docs/                          # 设计文档
└── icons/                         # 扩展图标
```

### 5.2 脚本加载顺序（manifest.json content_scripts[0].js）

加载顺序是**强依赖**，新增脚本必须插到正确位置：

| 顺序 | 脚本 | 依赖说明 |
|------|------|---------|
| 1 | `safe-storage.js` | 最先加载，其他模块依赖 `SafeStorage` |
| 2 | `field-matcher.js` | 匹配引擎，策略注册依赖 `window.FieldMatcher` |
| 3-5 | `match-strategies/*.js` | 策略自注册，依赖 `window.FieldMatcher.registerStrategy()` |
| 6 | `ui/match-confirmation-dialog.js` | 匹配确认弹窗 |
| 7-8 | `antd1-filler.js` / `react-filler.js` | 底层填充器，被 form-filler 调用 |
| 9 | `page-detector.js` | 国内外版本识别 |
| 10-11 | `core/field-registry.js` / `core/page-registry.js` | 字段 Registry + 页面适配器注册表 |
| 12-13 | `pages/base-info-merge/adapter.js`、`pages/product-image-text/adapter.js` | 页面适配器（加载即自注册） |
| 14-15 | `pages/tourdays/adapter.js`、`pages/tourdays/field-handlers/itinerary-field.js` | tourdays 适配器 + itineraryField scoped handler（handler 在 adapter.activate 时注册） |
| 16-17 | `form-extractor.js` / `form-filler.js` | 提取 + 填充 |
| 18-23 | `templates/*.js` | 模板系统 |
| 24 | `services/sanitizers.js` | AI 改写 / 富文本字符清洗 |
| 25 | `ai-rewrite-dialog.js` | AI 改写 |
| 26-27 | `export.js` / `import.js` | 导出/导入编排 |
| 28 | `panel.js` | 导入面板 UI（tourdays 在确认填写后调 `adapter.ensureAllStructure` 补卡） |
| 29 | `main.js` | 入口，必须最后加载 |

### 5.3 核心模块职责

| 模块 | 职责 | 关键说明 |
|------|------|---------|
| `safe-storage.js` | chrome.storage.local 封装 | 处理扩展重载后上下文失效；`get/set/addListener` |
| `page-detector.js` | 国内外版本识别 | 3 策略：label 文本 → select 选中值 → footer 按钮文本；带缓存；用户手动设置优先 |
| `core/page-registry.js` | 页面适配器注册表 | `activate()` 按 URL 激活单个适配器（机制α），适配器文件加载即自注册 |
| `core/field-registry.js` | 新字段类型增量入口 | 老字段类型冻结，新字段类型通过 Registry 注册（fill/extract 双侧接入） |
| `pages/*/adapter.js` | 各页面适配器 | 每个页面物理隔离，实现 `extract()` + `extractFieldMap()` |
| `form-extractor.js` | 通用表单提取 | 15 种字段类型；委托给 PageRegistry；extract 侧 Registry 空跑接入 |
| `form-filler.js` | 通用表单填充 | 入口 `_fillField()` 按字段类型分发；fill 侧 Registry 空跑接入；含智能匹配集成。**已挂 `window.FormFiller`**，tourdays itineraryField handler 等跨文件通过 `window.FormFiller._fillPlainSelectByElement/_fillSearchSelect` 复用 |
| `field-matcher.js` | 智能匹配引擎 | 三级策略 Exact(100)→Pattern(90)→Semantic(50)；策略自注册 |
| `antd1-filler.js` | Ant Design 1.x 专配器 | 旧版组件（直接设 value + change 事件）；form-filler 优先调用 |
| `react-filler.js` | React Fiber 填充器 | 通过 `__reactInternalInstance` 修改 fiber；antd1 失败时兜底。挂 `window.ReactFiller`/`window.AntD1Filler`，FillContext 经 `_buildContext()` 注入给 Registry handler |
| `page-ue-bridge.js` | UEditor 主世界桥接 | 通过 `web_accessible_resources` 注入主世界，调用 `UE.setContent()` |
| `ai-rewrite-dialog.js` | AI 改写对话框 | 用户在转换预览中勾选字段后触发；通过 background 代理调 LLM |
| `panel.js` | 导入浮层面板 | 5 个状态：input→preview→match→filling→verify。`_collectPreviewEdits` 把复杂类型（含 `itineraryField`）加入跳过列表，避免预览输入框字符串覆盖对象值结构；tourdays 确认填写后调 `adapter.ensureAllStructure` 补卡、fillAll 后调 `adapter.cleanupExcessCards` 删多余空卡 |
| `background/service-worker.js` | Service Worker | LLM API 代理（绕过 CORS）；初始化默认配置 |
| `popup/` | 扩展弹窗 | 模式切换（auto/domestic/international）+ LLM 配置 + 最近状态 |
| `rules/` | 转换规则 | 字段映射（JSON）+ 格式转换（JS 函数） |

## 六、文档在哪找

| 想了解什么 | 看哪个 |
|-----------|--------|
| 这个插件为什么要做、怎么用、完整业务流程 | [PRD.md](PRD.md) |
| 开发时要遵守的规则、字段三分类、常见陷阱、代码约定 | [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) |
| 架构改造目标、重构路线图 | [docs/ARCHITECTURE_REFACTOR.md](docs/ARCHITECTURE_REFACTOR.md) |
| 模板系统设计（v0.2） | [docs/TEMPLATE_SYSTEM_SPEC.md](docs/TEMPLATE_SYSTEM_SPEC.md) |
| 行程描述页（tourdays）导入导出方案、补卡机制、全 role 填充 | [docs/TOURDAYS_ADAPTER_PLAN.md](docs/TOURDAYS_ADAPTER_PLAN.md) |
| 架构重构执行状态、后续新增页面范式、已知边界 | [docs/ARCHITECTURE_REFACTOR.md](docs/ARCHITECTURE_REFACTOR.md) |

## 七、新 Agent 接手 checklist

接手项目时按顺序完成：

### 7.1 环境验证
1. 加载 `extension/` 到 Chrome（见 §三）
2. 打开携程后台 baseInfoMerge 页面，确认浮动按钮出现
3. 打开 Console，确认无报错，能看到 `[Main]` 日志

### 7.2 回归测试已有页面
- **baseInfoMerge**（`/ivbk/vendor/baseInfoMerge`）：
  - 国内版导出：点击导出 → 确认 JSON 含 `content-card` 分组 → 剪贴板有内容
  - 国际版导入：粘贴 JSON → 转换预览 → 匹配预览 → 确认填写 → 检查复合行字段（mixedGroup/selectGroup）正常
- **productImageText**（`/product/input/productImageText`）：
  - 国内版导出：确认推荐理由 + 产品特色（富文本）提取正常
  - 国际版导入：确认推荐理由分类+描述填入正常，富文本保存后不丢内容
- **tourdays**（`/ivbk/vendor/tourdays`，行程描述）：
  - 国内版导出：确认 JSON 含按天分组、每张卡片的全字段（标题/补充说明/行驶距离/用车类型/餐饮类型/景点类型 等，不止 textarea）
  - 国际版导入：粘贴 JSON → 转换预览 → 匹配预览 → 确认填写（观察国际页按需新增景点/交通/餐饮/酒店卡片，补齐后再逐字段填入）

### 7.3 代码导航
1. 读 `manifest.json` → 了解脚本加载顺序（§5.2）
2. 读 `content/main.js` → 了解入口流程
3. 读 `content/core/page-registry.js` → 了解适配器激活机制α
4. 读 `content/pages/*/adapter.js` → 了解页面适配器模式
5. 读 `content/form-filler.js` 的 `_fillField()` → 了解字段分发与 Registry 增量通道
6. 读 [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) → 了解字段三分类（**最重要的架构规则**）

### 7.4 常见问题排查
| 现象 | 原因 | 解决 |
|------|------|------|
| 修改代码后页面无变化 | content script 被旧扩展持有 | 重新加载扩展 + **关闭再重开**标签页 |
| `chrome.storage` 报错 | 扩展重载后上下文失效 | `SafeStorage` 已处理，确认调用方都用 `SafeStorage` 而非直接 `chrome.storage` |
| 富文本填入后保存为空 | content script 隔离世界无法访问 `window.UE` | 确认 `page-ue-bridge.js` 通过 `web_accessible_resources` 注入 |
| 匹配预览字段错位 | 隐藏 `.ant-form-item-hidden` 占用 DOM index | 用独立计数器，不用 NodeList index（见 [DEVELOPMENT_GUIDE.md §3.2](DEVELOPMENT_GUIDE.md#32-隐藏表单项导致索引偏移)） |
| `npm test` 失败 | 在 `extension/` 目录运行 | 切到父目录 `vtrip/` 运行 |

## 八、开发习惯

### 工作流

1. **用户发 HTML+JSON 样本** → 我分析字段类型 → 开发 → **用户手动测试验证**
2. 测试通过后 → 用户明确说"提交"才 commit
3. 绝不自动提交

### 版本号规则

每完成一个新的页面导入导出适配，并且用户手动回归确认通过后，版本号 +1。当前约定按 minor 递增：`v0.3.0 → v0.4.0 → v0.5.0`。

必须同步修改三处：

- `extension/manifest.json` 的 `"version"`
- 父目录 `vtrip/package.json` 的 `"version"`
- `extension/CLAUDE.md` §一 "当前版本：vX.Y.Z" 文案

注意：小修小补、bugfix、文档补充不触发页面适配版本递增；只有完成一个新页面的导入导出适配并经用户确认后才递增。

### 代码约定（详见 [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md)）

- **字段三分类**：单控件 / 复合行 / 专用复合，物理隔离（[§1.2](DEVELOPMENT_GUIDE.md#12-字段类型三分类重要)）
- **复合行字段不碰智能匹配**：走 `label[for]` 行级定位
- **日志前缀统一**：[§4.1](DEVELOPMENT_GUIDE.md#41-日志前缀)
- **DOM 选择器兼容新旧 AntD**：`.ant-select-selection, .ant-select-selector` 双写

### Git

- 仓库根：`extension/`
- Commit 格式：`feat:` / `fix:` / `refactor:` / `docs:` / `chore:`
- Commit 前：`node --check` + `npm test` 通过
- 不 push（本地开发无 remote）

## 九、关键术语

| 术语 | 含义 |
|------|------|
| 国内版 | 携程国内 VBK，SSR 渲染 | ← PageDetector 自动识别 |
| 国际版 | Trip.com 国际 VBK，CSR 渲染 | ← PageDetector 自动识别 |
| 单控件字段 | 1 字段 ↔ 1 DOM 元素，走智能匹配 | input, select, textarea... |
| 复合行字段 | 1 字段 ↔ 1 整行 form-item（多控件），走行级定位 | mixedGroup, selectGroup... |
| 专用复合字段 | 某页面专属结构，页面适配器处理 | recommendReason, richText |
| matchData | 导出时记录的三层定位信息（exact/pattern/semantic） | 供 FieldMatcher 使用 |

完整术语表见 [DEVELOPMENT_GUIDE.md §1.2](DEVELOPMENT_GUIDE.md#12-字段类型三分类重要) 和 [ARCHITECTURE_REFACTOR.md §1](docs/ARCHITECTURE_REFACTOR.md#1-核心概念与术语glossary)。
