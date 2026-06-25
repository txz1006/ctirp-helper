# 携程数据迁移助手 — 架构重构设计文档

> 版本：v0.5.1 | 状态：已评审并已实施（阶段0-3，2026-06-22）
> 目标：可维护性、扩展性、简化开发难度与代码量，且后续新增页面功能绝不影响已上线页面
>
> 实施摘要：阶段0 已建立 baseInfoMerge `_extractFormItem` 快照基线；阶段1 已拆分 `page-adapters.js` → `pages/*/adapter.js` 并接入 `PageRegistry`/`FieldTypeRegistry`；阶段2 已在 fill/extract 双侧接入 Registry 增量通道（老类型空跑、冻结）；阶段3 已抽 `services/sanitizers.js` 并补 Sanitizers 单测。

---

## 0. 第一性约束（贯穿全文）

> **后续每开发一个新页面的导入导出，绝不能影响已上线页面的功能逻辑。**

所有架构决策都为这条约束服务。任何"看起来更优雅但削弱隔离性"的方案一律否决。

### 后续开发工作流（已确定）

```
用户提供：国内版页面 HTML + 导出 JSON 样本 + 国际版页面 HTML
    ↓
分析：该页面有哪些字段类型？
    ├─ 复用现有字段类型（input/select/复合行…）→ 场景1，物理隔离即可
    └─ 引入全新字段类型 → 场景2，走 Registry 增量通道 + 快照保护
    ↓
新页面所有代码物理隔离在 pages/<新页面>/ 目录内，不碰核心 switch
```

---

## 1. 现状诊断与目标

### 1.1 现状痛点

| 痛点 | 位置 | 后果 |
|------|------|------|
| 提取与填充逻辑中心化 | `form-extractor.js` `_extractFormItem()`、`form-filler.js` `_fillField()` 各一个大 switch | 新增字段类型必须改核心文件，回归风险高 |
| 页面适配器挤在单文件 | `page-adapters.js` 353 行塞两个适配器 | 页面数增长后文件膨胀，改 A 页面可能碰到 B 页面代码 |
| 无回归基线 | `test/` 只有 field-matcher 单元测试 | "功能不变"无法自动验证，全靠手动回归 |
| AI 清洗逻辑埋在对话框 | `ai-rewrite-dialog.js:300` `_sanitizeForInternationalRules()` | 无法独立测试，新字段想用不同清洗规则要改对话框 |
| 脚本加载顺序隐式依赖 | `manifest.json` content_scripts.js 23 个脚本强依赖 | 新增脚本插错位置即全站崩 |

### 1.2 四个目标与可验证标准

| 目标 | 验证标准 |
|------|---------|
| 可维护性 | 快照测试覆盖两个已上线页面；核心逻辑改动后 `npm test` 抓回归 |
| 扩展性 | 新增页面只新增文件、不改核心 switch；新字段类型通过注册加入 |
| 简化开发难度 | 新页面有明确范式（§7），开发步骤可 checklist 化 |
| 简化代码量 | 新页面不重复实现已有字段逻辑；清洗函数抽离复用 |
| 新页面不影响老页面 | 场景1 物理隔离零风险；场景2 快照兜底可发现回归 |

### 1.3 复杂度预算

本次重构控制在：新增/改动文件 ≤ 10，新增抽象 ≤ 2（FieldTypeRegistry、Sanitizers）。超出即视为过度设计。

---

## 2. 核心概念与术语

| 规范术语 | 英文 | 定义 | 典型 fieldType |
|---------|------|------|---------------|
| **单控件字段** | Single-control Field | 一个字段 ↔ 一个 DOM 控件，走智能匹配定位 | input, textarea, select, searchSelect, multiSearchSelect, inputNumber, checkbox, radio |
| **复合行字段** | Composite-row Field | 一个字段 ↔ 一整行 form-item 内多个控件，走 `label[for]` 行级定位 | mixedGroup, selectGroup, inputNumberGroup, searchSelectGroup |
| **专用复合字段** | Page-specific Field | 特定页面专属的结构化字段，由页面适配器注册 | recommendReason, richText |
| **字段处理器** | Field Handler | 描述某 fieldType 提取+填充逻辑的对象，注册到 Registry | — |
| **页面适配器** | Page Adapter | 描述某 URL 页面的提取编排、专属字段的模块 | baseInfoMerge, productImageText |

> **关键判别**：本次 baseInfoMerge 回归的根因，就是"复合行字段"被误当成"单控件字段"匹配。三分类在类型层物理隔离这两者。该根因已由 `form-filler.js:104` 的 `rowLevelTypes` 检查修复，本重构将其固化为架构规则。

---

## 3. 架构决策记录（已评审）

| # | 决策 | 选择 | 一句话理由 |
|---|------|------|-----------|
| D1 | 字段切分维度 | **维度 A**：按 DOM 定位方式三分类 | 贴合现状三套处理路径，类型层隔离回归风险 |
| D2 | 迁移策略 | **绞杀法**（Strangler Fig） | 老类型留在 switch（冻结），新类型走 Registry，可逐类型回滚 |
| D3 | Registry 定位 | **增量通道**，非全量迁移目标 | 老代码验证过不动=零风险；新类型注册加入=扩展性达标 |
| D4 | 命名冲突语义 | **语义 B**：不允许同名覆盖 | 页面专属字段必须用全局不存在的新名，杜绝隐式污染 |
| D5 | 适配器生命周期 | **机制 α**：URL 激活，单页面单适配器 | 同一时刻只有一个页面专属字段在表，物理保证隔离 |
| D6 | 字符清洗实现 | **函数式**（不上责任链） | 当前规模责任链过度设计，抽成独立可测函数即可 |
| D7 | 回归基线 | **端到端快照**：真实 HTML → 提取 JSON 逐字节比对 | 最贴近"功能等价"的验证粒度 |

### 3.1 被否决的方案（NOT in scope）

| 方案 | 否决理由 |
|------|---------|
| matchStrategy 声明式字符串分发 | 已有 `category` 字段可推导匹配路径，再加一层声明是 DRY 违规。匹配引擎当前三策略已稳定，不需可插拔 |
| `dom/selectors.js` 单一真相源 | AntD 选择器双写已散落在各处，强行收拢改动面大、收益小。等真正因 AntD 升级大面积改选择器时再做 |
| AIRewriteService 门面重写 | 现有 `ai-rewrite-dialog.js` 流程能用，重写是纯重构无功能收益。只抽清洗函数即可 |
| 责任链清洗 | D6 否决。函数集足够 |
| 全量把 15 种字段类型搬到 Registry | D3 否决。大范围搬移风险高，且老代码已验证，不动即零回归 |

---

## 4. 目标目录结构

```
extension/content/
├── core/                          # 引擎核心（页面无关）
│   ├── field-registry.js          # FieldTypeRegistry — 新字段类型增量入口
│   ├── page-registry.js           # PageRegistry — 页面适配器注册表 + 机制α
│   └── field-detector.js          # 类型探测纯函数（从 _extractFormItem 抽出，可选）
├── field-matcher.js               # 智能匹配引擎（已存在，不动）
├── match-strategies/              # 匹配策略（已存在，不动）
│   ├── exact-match.js
│   ├── pattern-match.js
│   └── semantic-match.js
├── pages/                         # 页面适配器（每个页面自包含）
│   ├── base-info-merge/
│   │   └── adapter.js             # 提取编排
│   ├── product-image-text/
│   │   ├── adapter.js
│   │   └── field-handlers/        # 该页面专属字段处理器（如有）
│   │       ├── recommend-reason.js
│   │       └── rich-text.js
│   └── <future-page>/             # 新页面：整个目录内闭环
├── services/
│   └── sanitizers.js              # 字符清洗函数集（函数式，从 ai-rewrite-dialog 抽出）
├── form-extractor.js              # 通用表单提取（保留 switch，冻结，不再加 case）
├── form-filler.js                 # 通用表单填充（switch 前加 Registry 查询，老 case 冻结）
├── page-ue-bridge.js              # UEditor 桥接（已存在，不动）
└── ...                            # 其他已存在模块不动
```

> 与 v0.4.0 草稿差异：砍掉 `field-types/` 全局目录（D3，不做全量迁移）、`dom/selectors.js`（否决）、`ui/sections/`（超范围）。`field-detector.js` 标可选，阶段1不强制。

---

## 5. 核心接口与契约

### 5.1 FieldTypeRegistry（增量通道，D3）

> Registry 规模预期：全局 + 当前页面专属合计 ≤ 几十个 handler。`resolve()` 单次 O(1)，`detect()` 遍历为 O(items × handlers)，页面表单项几十个 × handler 几十个 = 几百次纯 DOM 判断，可接受，不引入索引优化。

```javascript
// core/field-registry.js
const FieldTypeRegistry = {
  _global: new Map(),       // 通用字段处理器
  _pageScoped: new Map(),   // 当前激活页面的专属字段处理器

  // 通用字段处理器：新字段类型注册入口
  // 老的 15 种类型不注册，仍走 form-filler 的 switch（冻结）
  registerGlobal(type, handler) {
    if (this._global.has(type)) throw new Error(`字段类型已注册: ${type}`);
    this._global.set(type, handler);
  },

  // 页面专属字段：页面激活时注册（语义B：禁止与全局同名）
  registerScoped(type, handler) {
    if (this._global.has(type)) {
      throw new Error(`页面专属字段 "${type}" 与全局字段同名，请改用新名（语义B）`);
    }
    this._pageScoped.set(type, handler);
  },

  resolve(type) {
    return this._pageScoped.get(type) || this._global.get(type) || null;
  },

  // 供 _extractFormItem 遍历所有已注册 handler 调 detect（Issue 7）
  handlers() {
    return [...this._pageScoped.values(), ...this._global.values()];
  },

  clearScoped() {
    this._pageScoped.clear();
  }
};
```

**字段处理器契约（仅对新类型生效）：**

```javascript
/**
 * @typedef {Object} FieldHandler
 * @property {string}                                       type     字段类型名（注册键）
 * @property {(formItem: HTMLElement) => boolean}          [detect]  类型探测：这个 form-item 是不是本类型（Issue 7，extract 侧）
 * @property {(formItem: HTMLElement) => FieldData}        extract   提取：DOM → 字段数据
 * @property {(field: FieldData, ctx: FillContext) => Promise<FillResult>} fill  填充
 * @property {(field: FieldData) => string}                [display] 预览显示值
 * @property {(field: FieldData) => 'single-element'|'row-level'} [matchMode] 匹配路径提示
 * }
 *
 * matchMode 缺省按 fieldType 名约定：已知复合行类型走行级，其余走智能匹配。
 * 新 handler 若需走智能匹配，应在 fill 内自行调用 ctx.FieldMatcher.smartMatch()
 * （Issue 15：handler 自决，Registry 不代调）。
 */
```

> 不再要求 `category`/`matchStrategy`/`ai` 等字段。匹配路径由 `fieldType` 名字 + handler 自决。AI 清洗由 Sanitizers 按类型查表，不在处理器上挂 `ai` 属性。

**FillContext 契约（Issue 6）：** handler.fill 通过 ctx 复用现有能力，不重写：

```javascript
/**
 * @typedef {Object} FillContext
 * @property {object} FieldMatcher        智能匹配引擎（window.FieldMatcher）
 * @property {object} AntD1Filler         AntD 1.x 填充器
 * @property {object} ReactFiller         React Fiber 填充器
 * @property {(ms: number) => Promise}    delay  延迟（form-filler._delay）
 * @property {(field) => Promise}         smartMatchField  单控件智能匹配（form-filler._smartMatchField）
 * @property {function}                   results  推送结果（form-filler.results.push）
 */
```

### 5.2 form-filler 切换点（D2 绞杀开关）

```javascript
// form-filler.js _fillField() 开头插入一句，其余 switch 不动
async _fillField(field) {
  const { fieldType, value } = field;

  // 【新】Registry 增量通道：已注册类型走新路径，未注册走老 switch
  const handler = FieldTypeRegistry.resolve(fieldType);
  if (handler) {
    try {
      await handler.fill(field, this._buildContext());
      this.results.push({ field: field.label, status: 'success', strategy: 'registry' });
    } catch (err) {
      this.results.push({ field: field.label, status: 'failed', reason: err.message });
    }
    return;
  }

  // 【老】下面原有 switch 完全保留，不再新增 case
  if (fieldType === 'recommendReason') { ... }
  // ...
}
```

> 老的 15 个 case **冻结**：不再往里加新类型。新字段类型一律注册到 Registry。这是"扩展性"目标的落点——新类型加入是纯增量，不动 switch 即不可能影响老类型。

**异常边界（Issue 13）：** handler.fill 抛出的异常由 `_fillField` 的 try-catch 捕获并记入 `this.results`（`status: 'failed'`），与现有 switch case 行为一致。handler 内部无需自行 try-catch 包裹整个逻辑，但应对子步骤失败做局部处理（参考现有 `_fillRecommendReason` 对 category/description 分别 try-catch）。

### 5.3 PageRegistry + 机制 α

```javascript
// core/page-registry.js
const PageRegistry = {
  _adapters: [],
  _active: null,

  register(adapter) {            // { urlPattern, activate, deactivate }
    this._adapters.push(adapter);
  },

  detect() {
    const url = location.href;
    return this._adapters.find(a => url.includes(a.urlPattern)) || null;
  },

  activate() {                   // 状态机 registered→active
    const adapter = this.detect();
    if (!adapter) return null;
    if (this._active === adapter) return adapter;
    this.deactivate();           // 先卸载上一个
    adapter.activate?.();        // 适配器注册自己的专属字段
    this._active = adapter;
    return adapter;
  },

  deactivate() {                 // active→inactive
    if (!this._active) return;
    this._active.deactivate?.();
    FieldTypeRegistry.clearScoped();
    this._active = null;
  }
};
```

**机制 α 状态机（Issue 16）：**

```
        register()              activate() 命中且非当前
[registered] ─────────► [active] ─────────────────► deactivate()
   适配器加入列表            │                          │
                            │ activate() 命中且=当前      │ clearScoped()
                            │ (幂等，不变)               │
                            ▼                          ▼
                       [active] ◄─────────────── [inactive]
                            │   activate() 重新命中        │
                            │                             │
                            └───── 任意时刻只允许一个 active ──┘
```

> **机制 α 的隔离保证**：任何时刻 `_pageScoped` 只含当前激活页面的字段。productImageText 的 recommendReason 激活时，其它页面字段物理上不在表里 → 不可能冲突。

**PageRegistry 触发点（Issue 3）：** `activate()` 必须在三处调用，保证 SPA 下状态机正确：

1. `main.js` 初始化时（页面首次加载）
2. 按钮点击前（导出/导入入口，确保当前适配器已激活）
3. SPA URL 变化时（main.js 的 MutationObserver 检测到路由切换）

**适配器与版本关系（Issue 5）：** PageRegistry 仅按 URL 选适配器，与国内版/国际版无关。适配器内部用 `PageDetector.detect()` 判断版本，走不同提取/填充分支。同一 URL 的适配器同时承担国内提取与国际填充，不拆分。

### 5.4 Sanitizers（D6 函数式）

```javascript
// services/sanitizers.js — 从 ai-rewrite-dialog.js:300 抽出，独立可测
const Sanitizers = {
  default: (text) => String(text ?? '').trim(),

  // 国际版推荐理由清洗（现有 _sanitizeForInternationalRules 逻辑原样搬）
  internationalRules: (text) => { /* 原 ai-rewrite-dialog.js:300 实现 */ },

  // 富文本 imageid 统一（现有 form-filler.js:1166 _normalizeRichTextImageId 逻辑）
  normalizeImageId: (html, fixedId = '41973044') =>
    html.replace(/(\bimageid\s*=\s*")[^"]*(")/gi, `$1${fixedId}$2`)
};
```

> `ai-rewrite-dialog.js` 和 `form-filler.js` 改为调用 `Sanitizers.*`，删掉本地实现。这是"简化代码量"目标的落点——两处重复清洗逻辑合一。

### 5.5 适配器完整示例（Issue 8）

```javascript
// pages/base-info-merge/adapter.js
const baseInfoMergeAdapter = {
  urlPattern: '/ivbk/vendor/baseInfoMerge',

  // 页面激活时注册专属字段（当前无专属字段，留空）
  activate() {
    // 如有专属字段：FieldTypeRegistry.registerScoped('xxx', handler)
  },

  deactivate() {
    // 清理由 activate 注册的资源（FieldTypeRegistry.clearScoped 由 PageRegistry 统一调用）
  },

  // 提取编排：委托现有 FormExtractor 通用逻辑
  extract() {
    const result = {
      version: '1.0',
      source: PageDetector.detect() === 'domestic' ? 'domestic' : 'international',
      tab: this._detectCurrentTab(),
      timestamp: new Date().toISOString(),
      data: {}
    };
    const cards = document.querySelectorAll('.content-card');
    cards.forEach(card => {
      const titleEl = card.querySelector('.content-cardtitle-text');
      const groupName = titleEl ? titleEl.textContent.trim() : '未命名分组';
      const bodyEl = card.querySelector('.content-cardbody');
      if (!bodyEl) return;
      const groupData = FormExtractor._extractGroup(bodyEl);
      if (Object.keys(groupData).length > 0) result.data[groupName] = groupData;
    });
    return result;
  },

  // 匹配预览字段映射
  extractFieldMap() {
    // ... 现有 baseInfoMergeAdapter 逻辑搬入
  },

  _detectCurrentTab() {
    const activeTab = document.querySelector('.ant-tabs-tab-active');
    return activeTab ? activeTab.textContent.trim() : 'default';
  }
};

// 自注册（脚本加载即注册，依赖 manifest 顺序保证 PageRegistry 先加载）
PageRegistry.register(baseInfoMergeAdapter);
```

> 适配器与版本关系见 §5.3：URL 选适配器，适配器内 `PageDetector.detect()` 判版本走不同分支。

### 5.6 模块导出与全局名称约定（Issue 10）

所有新增 `core/`、`pages/`、`services/` 文件沿用现有模块导出模式（见 `form-extractor.js` / `services/sanitizers.js`），文件末尾：

```javascript
if (typeof window !== 'undefined') { window.XXX = XXX; }
if (typeof module !== 'undefined' && module.exports) { module.exports = XXX; }
```

全局名称约定：
- `window.FieldTypeRegistry`、`window.PageRegistry`、`window.Sanitizers`
- 适配器内部对象不挂 window（仅通过 `PageRegistry.register` 注册）
- 适配器文件加载即执行 `register()`，依赖 manifest 顺序（§6.4）保证 Registry 先加载

### 5.7 extract 侧 Registry 接入（Issue 2、Issue 7）

`form-extractor.js` 的 `_extractFormItem` 在类型识别前，先遍历 Registry 已注册 handler 的 `detect`：

```javascript
_extractFormItem(item) {
  const labelEl = item.querySelector('.ant-form-item-label label');
  if (!labelEl) return null;
  // ... label 解析同现有 ...

  // 【新】Registry 增量通道：已注册类型先探测
  for (const handler of FieldTypeRegistry.handlers()) {
    if (handler.detect && handler.detect(item)) {
      return handler.extract(item);   // 新类型走注册路径
    }
  }

  // 【老】下面原有类型识别逻辑完全保留，不再新增分支
  // typeCount > 1 → mixedGroup ...
  // numberInputs.length > 1 → inputNumberGroup ...
}
```

`FormExtractor.extract()` 与 `extractFieldMap()` 的委托点也改为走 PageRegistry：

```javascript
// form-extractor.js:13-20 改为
extract() {
  const adapter = PageRegistry.activate();
  if (adapter && adapter.extract) return adapter.extract();
  return this._fallbackExtract();   // 原兜底逻辑重命名
}
```

> 这样 extract 与 fill 两侧都是纯增量：新类型注册后自动被识别和填充，老 switch/识别逻辑冻结不动 = 新类型不影响老类型。

---

## 6. 迁移实施计划

### 阶段 0：建立回归基线（已实施，前置，最高优先级）

**快照对象（Issue 1）：纯函数输出，不做端到端 React 渲染。** 静态 HTML + jsdom 跑不出 React 受控值（`input.value`、`.ant-select-selection-selected-value` 在 jsdom 下为空），端到端 `FormExtractor.extract()` 会因数据缺失而误报。改为固化纯函数的输入输出：给定 DOM 片段（含手写 value/selected-value）→ 期望字段对象。

```
test/fixtures/
├── form-items/
│   ├── mixed-group.html             # 单个 form-item DOM 片段
│   ├── select-group.html
│   └── ...
└── snapshots/
    ├── extract-snapshot-test.js     # _extractFormItem 等纯函数快照
    └── sanitize-test.js             # Sanitizers 单元测试
```

```javascript
// test/snapshots/extract-snapshot-test.js
const fs = require('fs');
const path = require('path');

describe('_extractFormItem 快照', () => {
  const cases = [
    { fixture: 'mixed-group.html', expectKey: '提前预订' }
  ];

  cases.forEach(({ fixture, expectKey }) => {
    it(`${fixture} 提取结果与基线等价`, () => {
      document.body.innerHTML = fs.readFileSync(
        path.join(__dirname, '../fixtures/form-items/', fixture), 'utf8'
      );
      const item = document.querySelector('.ant-form-item');
      const result = FormExtractor._extractFormItem(item);
      expect(result.label).toBe(expectKey);
      expect(result).toEqual(expectedSnapshotFor(fixture));  // 逐字段比对
    });
  });
});
```

> fixtures 的 DOM 片段需手写 `value`/`title`/`selected-value` 属性，模拟 React 渲染后状态。这样测试不依赖 React，纯验证提取逻辑等价性。
>
> `extension/国内产品基础信息tab.txt`（已存在，100KB）可作为 DOM 片段来源，从中抠出代表性 form-item 固化为 fixture。
>
> 没有这层基线，"功能不变"无法验证。每改一处提取逻辑，跑一次快照。**快照失败 = 回归，立即回滚。**

### 阶段 1：物理隔离 page-adapters → pages/<page>/（已实施）

- `page-adapters.js` 拆为 `pages/base-info-merge/adapter.js` + `pages/product-image-text/adapter.js`（示例见 §5.5）
- 新建 `core/page-registry.js`（§5.3）+ `core/field-registry.js`（§5.1）
- `main.js` 初始化时调用 `PageRegistry.activate()`（§5.3 触发点1）
- `form-extractor.js` `extract()`/`extractFieldMap()` 委托改为 `PageRegistry.activate()`（§5.7）
- `manifest.json` content_scripts.js 调整加载顺序（见 §6.4）
- **验证**：跑快照测试 + 手动回归两个页面
- **回滚**：还原 page-adapters.js + form-extractor.js 委托 + manifest.json

### 阶段 2：Registry 增量通道（fill + extract 双侧，已实施）

- `form-filler.js` `_fillField()` 开头插入 Registry 查询（§5.2），老 switch 冻结
- `form-extractor.js` `_extractFormItem()` 开头遍历 Registry handler detect（§5.7），老识别逻辑冻结
- **验证**：跑快照测试（应 100% 通过，因为没有类型注册，全走老路径）
- **回滚**：删两侧 Registry 查询

### 阶段 3：抽 Sanitizers（已实施）

- 抽 `services/sanitizers.js`（§5.4），`ai-rewrite-dialog.js`/`form-filler.js` 改调用，删本地实现
- **验证**：跑 Sanitizers 单元测试 + 手动回归 AI 改写、富文本保存

> 阶段 3 不含 recommendReason/richText 重写（Issue 11：现有可用逻辑不动，遵循绞杀法）。Registry 通道由未来新字段类型需求自然验证。

### 6.4 manifest.json 加载顺序（阶段1必须同步调整）

新增 `core/` 和 `pages/` 后，content_scripts.js 顺序：

| 顺序 | 脚本 | 说明 |
|------|------|------|
| 1 | `content/safe-storage.js` | 不变 |
| 2 | `content/field-matcher.js` | 不变 |
| 3-5 | `content/match-strategies/*.js` | 不变 |
| 6 | `content/ui/match-confirmation-dialog.js` | 不变 |
| 7-8 | `content/antd1-filler.js` / `react-filler.js` | 不变 |
| 9 | `content/page-detector.js` | 不变 |
| **10** | **`content/core/field-registry.js`** | **新增，早于适配器** |
| **11** | **`content/core/page-registry.js`** | **新增，早于适配器** |
| **12-13** | **`content/pages/*/adapter.js`** | **替换原 page-adapters.js，自注册到 PageRegistry** |
| 14 | `content/form-extractor.js` | 原 11 |
| 15 | `content/form-filler.js` | 原 12 |
| 16+ | templates / ai-rewrite / export / import / panel / main | 顺延 |

> 适配器文件改为 `PageRegistry.register({ urlPattern, activate, deactivate, extract, extractFieldMap })`，`PageRegistry.detect()` 替代原 `PageAdapters.detectAdapter()`。`FormExtractor.extract()` 改为委托 `PageRegistry.activate()?.extract()`。

---

## 7. 新页面开发范式

### 场景1：复用现有字段类型（90% 情况）

```
1. 用户提供国际版页面 HTML + 期望 JSON
2. 分析字段：全部属于现有 15 种类型？
   是 → 场景1
3. 新建 pages/<page>/adapter.js，实现 extract() + extractFieldMap()
4. adapter.js 末尾 PageRegistry.register(adapter)  ← 自注册（非加到遗留 PageAdapters）
5. manifest.json content_scripts[0].js 加载新 adapter.js（位置在 page-registry.js 之后）
6. manifest.json content_scripts[0].matches 加 URL 匹配
7. 跑全量快照测试，确认已有页面零回归
8. 用户手动验证新页面
```

**零核心文件改动 = 零老页面影响。**

### 场景2：引入全新字段类型（10% 情况）

```
1. 用户提供国际版页面 HTML + 期望 JSON
2. 分析字段：发现现有 15 种类型覆盖不了的新类型
   → 场景2
3. 【前置】给受影响的老页面补快照（如果新类型提取逻辑会动 form-extractor）
4. 新建 pages/<page>/field-handlers/<new-type>.js，实现 FieldHandler 契约（§5.1）
   含 detect/extract/fill，handler.fill 内自行调用 ctx.FieldMatcher（若需智能匹配，Issue 15）
5. 适配器 activate() 时 FieldTypeRegistry.registerScoped('<new-type>', handler)
   （若新类型跨页面通用，用 registerGlobal）
6. form-filler._fillField 的 Registry 查询自动接管填充，不加 switch case
7. form-extractor._extractFormItem 的 Registry detect 遍历自动接管提取，不加 if 分支
8. import.js _applyRules 补新类型的 source 判定（Issue 17），否则走 default 'auto' 可能跳过翻译
9. manifest.json 加载新 field-handlers 文件（位置在 field-registry.js 之后、adapter.js 之前或之内）
10. 跑全量快照 + 新 handler 的单元测试（Issue 12）+ 用户手动验证
```

**Registry 注册是纯增量，不动 switch/识别逻辑 = 新类型不可能影响老类型。**

---

## 8. 验收标准

每个迁移阶段必须满足：

1. ✅ 快照测试通过（baseInfoMerge / productImageText 提取结果逐字节等价）
2. ✅ `node --check` 语法通过
3. ✅ 该阶段涉及字段在真实页面手动验证（用户提供样本）
4. ✅ 未迁移部分行为零变化（绞杀法保证）
5. ✅ 可单阶段回滚

**新字段类型 handler 额外要求（Issue 12）：**

6. ✅ 新 handler 提供单元测试：给定 DOM 片段 → 期望字段对象（extract），给定 field → 期望 DOM 状态（fill）
7. ✅ 新 handler 的 detect 不误命中老类型 form-item（用老页面 fixture 反向验证）

> **底线**：任何一步若无法证明"功能等价"，立即回滚，不留半成品。

---

## 9. 新页面开发检查清单

- [ ] 新页面导出 JSON 结构正确（含 version/source/tab/data）
- [ ] 导入后字段能正确填充
- [ ] 匹配预览正确（无索引偏移、无误报）
- [ ] 叠加标签正常显示
- [ ] **已有页面功能不受影响**（跑全量快照测试）
- [ ] 新字段类型（如有）通过 Registry 注册，未改 form-filler switch / form-extractor 识别逻辑
- [ ] 新字段类型（如有）有单元测试，且 detect 不误命中老类型
- [ ] 新字段类型（如有）已在 import.js _applyRules 补 source 判定
- [ ] manifest.json 加载顺序正确（参考 §6.4），新 adapter.js 在 page-registry.js 之后
- [ ] manifest.json matches 加了新页面 URL

---

## 10. 决策依据摘要

| 砍掉的 | 为什么砍 | 何时重新考虑 |
|--------|---------|-------------|
| matchStrategy 声明式 | category 已能推导，DRY 违规 | 出现第 4 种匹配路径且无法用 category 区分时 |
| dom/selectors.js 单一真相源 | 改动面大、当前双写可控 | AntD 大版本升级导致选择器全面失效时 |
| AIRewriteService 门面 | 现有流程能用，纯重构无收益 | AI 改写流程需要跨多字段类型编排时 |
| 全量 switch → Registry 迁移 | 老代码已验证，搬移=制造回归 | 老类型需要共享给第 3 个以上页面时（见 TODOS.md） |
| field-detector.js 强制抽 | 提取逻辑耦合度低，收益小 | _extractFormItem 超过 300 行时 |
| 阶段3 重写 recommendReason/richText | 现有可用，重写违反绞杀法 | 该类型逻辑需大改时 |

---

## 11. 与 v0.4.0 草稿的差异

| 项 | v0.4.0 | v0.5.1 | 原因 |
|----|--------|--------|------|
| Registry 定位 | 全量迁移目标（15 类型全搬） | 增量通道（老冻结、新注册） | 风险控制，minimal diff |
| Registry 覆盖 | 仅 fill 侧 | fill + extract 双侧（§5.7） | Issue 2，承诺"新类型不影响老类型"全真 |
| matchStrategy | 声明式字符串分发 | 删除，handler 自决调 FieldMatcher | DRY，避免与 category 重复 |
| dom/selectors.js | 单一真相源 | 删除 | 改动面大收益小 |
| AIRewriteService | 门面重写 | 删除，只抽 Sanitizers | 纯重构无功能收益 |
| field-types/ 全局目录 | 15 类型各一文件 | 删除 | D3 不做全量迁移 |
| 迁移阶段 | 三刀（detect→extract/fill→filler） | 三阶段（基线→隔离→Registry双侧） | 基线前置，双侧纯增量 |
| 场景2 处理 | 未明确 | Registry 注册 + 快照保护 + import.js 同步 | 补 gap |
| 快照对象 | 端到端提取 JSON | 纯函数输出（DOM 片段→字段对象） | Issue 1，jsdom 跑不出 React 受控值 |
| FillContext | 未定义 | §5.1 定义（注入 AntD1Filler/ReactFiller/FieldMatcher） | Issue 6，避免重复造轮子 |
| 适配器示例 | 无 | §5.5 完整示例 | Issue 8，可按文档执行 |
| 全局导出约定 | 未提 | §5.6 明确 | Issue 10 |
| 异常边界 | 未提 | §5.2 明确 | Issue 13 |
| 机制α 状态图 | 文字 | ASCII 状态图 | Issue 16 |
| SPA 触发点 | 未提 | §5.3 三触发点 | Issue 3 |
