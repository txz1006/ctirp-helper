# 业务开发规范手册

> 版本：v0.3.0 | 基于 2026-06-17 ~ 06-21 真实开发经验编写
>
> 本文档只记录开发规范与陷阱，项目导航见 [CLAUDE.md](CLAUDE.md)，产品需求见 [PRD.md](PRD.md)。

---

## 一、核心架构原则

### 1.1 页面适配器隔离原则

**每个页面必须有自己的适配器，不混用提取/填充逻辑。**

```
PageRegistry.activate()
  ├─ /ivbk/vendor/baseInfoMerge          → pages/base-info-merge/adapter.js
  ├─ /product/input/productImageText     → pages/product-image-text/adapter.js
  ├─ /ivbk/vendor/tourdays               → 未适配（返回 null / fallback）
  └─ ...
```

**规则：**
- 新增页面：新建 `content/pages/<page>/adapter.js`，文件末尾 `PageRegistry.register(adapter)` 自注册
- 页面专属逻辑只放该页面目录；不要改其他页面适配器
- 未适配页面不应依赖 baseInfoMerge 兜底行为；需要支持时必须显式新增适配器

### 1.2 字段类型三分类（重要）

**这是项目最重要的架构规则。**

| 类别 | 典型 fieldType | 含义 | 定位方式 |
|------|---------------|------|---------|
| **单控件** | input, textarea, select, searchSelect, radio, checkbox, inputNumber | 1 字段 ↔ 1 DOM 元素 | 智能匹配 / domKey |
| **复合行** | inputNumberGroup, mixedGroup, selectGroup, searchSelectGroup | 1 字段 ↔ 1 整行 form-item（多控件） | `label[for]` → form-item → 按序收集 |
| **专用复合** | recommendReason, richText | 页面专属结构 | 页面适配器专用 |

**规则：**

1. **复合行字段绝不允许走 FieldMatcher 单元素匹配**。它们必须保持 `label[for] → closest(.ant-form-item)` 的行级定位。

2. **单控件字段可以走智能匹配**，但 domKey 兜底：
   ```js
   if (window.FieldMatcher && field.matchData) {
     return await window.FieldMatcher.smartMatch(field);
   }
   if (field.domKey) {
     return document.getElementById(field.domKey);
   }
   ```

3. **新增字段类型**：不要往 `_fillField()` 的旧 switch 增加 case；通过 `FieldTypeRegistry` 注册 handler，fill/extract 双侧走 Registry 增量通道。

### 1.3 智能匹配的适用范围

**FieldMatcher 只适用于跨版本 ID 不一致的场景。**

适用：同字段不同页面版本 ID 命名规则不同（如 `pmRcmdItems_0` vs `pmRcmdRegionGroups_0_items_0`）

不适用：复合行 / 页面专属结构 / UEditor 富文本

---

## 二、新增页面开发

### 标准流程

```
1. 分析目标页面 DOM 结构
2. 新建 content/pages/<page>/adapter.js
3. adapter.js 实现 urlPattern + activate/deactivate + extract() + extractFieldMap()
4. 文件末尾 PageRegistry.register(adapter) 自注册
5. 如有全新字段类型，新建 FieldHandler 并在 activate() 中通过 FieldTypeRegistry.registerScoped() 注册
6. manifest.json 添加 URL 匹配（matches）与 adapter/handler 脚本（位置见 CLAUDE.md §5.2）
7. 跑快照/Jest + 手动测试完整管线 + 回归已有页面
```

### 适配器接口契约

每个适配器必须实现两个方法：

#### `extract()` — 导出时调用

**返回值结构：**
```js
{
  version: '1.0',
  source: 'domestic' | 'international',  // PageDetector.detect() 结果
  tab: string,                            // 当前 Tab 标识
  timestamp: ISO 8601,
  data: {
    [groupName]: {
      [fieldLabel]: {
        domKey: string,                   // DOM 元素 ID（单控件）
        label: string,                    // 字段标签
        value: any,                       // 字段值
        fieldType: string,                // 字段类型（见 §1.2）
        matchData?: {                     // 智能匹配定位信息（单控件字段）
          exact: { domKey },
          pattern: { baseName, index, suffix, regionIndex },
          semantic: { container, label, index, ...selector }
        }
      }
    }
  }
}
```

#### `extractFieldMap()` — 导入匹配预览时调用

**返回值结构：**
```js
{
  [groupName]: {
    [fieldLabel]: {
      domKey: string,
      label: string,
      fieldType: string,
      currentValue: any                   // 当前页面上的值
    }
  }
}
```

### 新增页面示例（伪代码）

```js
// content/pages/new-page/adapter.js
const newPageAdapter = {
  urlPattern: '/ivbk/vendor/newPage',

  activate() {
    // 如有页面专属新字段类型：FieldTypeRegistry.registerScoped('xxx', handler)
  },

  deactivate() {
    // 清理页面专属资源；FieldTypeRegistry.clearScoped() 由 PageRegistry 统一调用
  },

  extract() {
    const result = {
      version: '1.0',
      source: PageDetector.detect() === 'domestic' ? 'domestic' : 'international',
      tab: 'newPage',
      timestamp: new Date().toISOString(),
      data: {}
    };
    // 提取逻辑...
    return result;
  },

  extractFieldMap() {
    const result = {};
    // 提取字段映射...
    return result;
  }
};

PageRegistry.register(newPageAdapter);
```

### manifest.json 修改

新增页面需添加 URL 匹配，并把 adapter 脚本插入到 `content/core/page-registry.js` 之后、`content/form-extractor.js` 之前：

```json
{
  "content_scripts": [{
    "matches": [
      "https://vbooking.ctrip.com/ivbk/vendor/newPage*",
      "http://vbooking.ctrip.com/ivbk/vendor/newPage*"
    ],
    "js": [
      "content/core/page-registry.js",
      "content/pages/new-page/adapter.js",
      "content/form-extractor.js"
    ]
  }]
}
```

### 检查清单

- [ ] 新页面导出 JSON 结构正确（含 version/source/tab/data）
- [ ] 导入后字段能正确填充
- [ ] 匹配预览正确（无索引偏移、无误报）
- [ ] 叠加标签正常显示
- [ ] **已有页面功能不受影响**（回归 baseInfoMerge + productImageText）

---

## 三、常见陷阱

### 3.1 label 无 `for` 属性
```js
// ❌
document.querySelector(`label[for="${domKey}"]`);
// ✅
const input = document.querySelector(`input#${CSS.escape(domKey)}`);
const selectEl = input ? input.closest('.ant-select') : null;
```

### 3.2 隐藏表单项导致索引偏移
```js
// ❌ 用 NodeList 迭代 index
formItems.forEach((item, index) => { key = `推荐理由_${index}`; });
// ✅ 独立计数器
let i = 0; formItems.forEach(item => { if (skip(item)) return; key = `推荐理由_${i}`; i++; });
```

### 3.3 预览面板合并复合字段
在 `_renderPreview()` 中拆成多行，用 `data-field-path` 回写。

### 3.4 预览回写覆盖原始数据
`_collectPreviewEdits()` 跳过 complex types（richText 等），推荐理由通过 path 回写。

### 3.5 AntD 版本差异选择器
```js
'.ant-select-selection, .ant-select-selector'
'.ant-select-dropdown-menu-item, .ant-select-item-option'
```

### 3.6 AI 改写未过滤非法字符
在 prompt 中告知字符限制 + 本地 `Sanitizers.internationalRules()` 二次清洗（`content/services/sanitizers.js`）。

### 3.7 富文本显示但保存为空

**根因**：content script 运行在隔离世界，无法访问页面 `window.UE` 实例。直接写 iframe body 的 innerHTML 只更新显示，不更新 UEditor 数据模型，导致保存时 `editor.getContent()` 读到空内容。

**解决方案**：通过 `web_accessible_resources` 注入桥接脚本到主世界。

**完整机制（3 步）：**

1. **manifest.json 声明可访问资源**：
   ```json
   {
     "web_accessible_resources": [{
       "resources": ["content/page-ue-bridge.js"],
       "matches": ["https://vbooking.ctrip.com/*", "http://vbooking.ctrip.com/*"]
     }]
   }
   ```

2. **content script 创建 payload 节点 + 注入桥接脚本**（`form-filler.js` 的 `_fillRichTextViaPageUE()`）：
   ```js
   // 用 <script type="application/json"> 传递数据（避免引号转义问题）
   const payload = document.createElement('script');
   payload.type = 'application/json';
   payload.id = payloadId;
   payload.textContent = JSON.stringify({ iframeId, html });

   // 注入桥接脚本到主世界（src 方式不受 inline CSP 限制）
   const bridge = document.createElement('script');
   bridge.src = chrome.runtime.getURL('content/page-ue-bridge.js');
   bridge.setAttribute('data-payload-id', payloadId);
   document.head.appendChild(bridge);
   ```

3. **桥接脚本在主世界执行**（`page-ue-bridge.js`）：
   ```js
   // 通过 document.currentScript 的 data-payload-id 找到 payload 节点
   var payloadEl = document.getElementById(payloadId);
   var data = JSON.parse(payloadEl.textContent);
   // 调用真正的 UEditor API
   var editor = UE.getEditor(data.iframeId);
   editor.setContent(data.html);
   editor.sync();                          // 同步到隐藏 textarea
   editor.fireEvent('contentchange');      // 触发变更事件
   ```

### 3.8 跨版本 ID 不一致
导出时 `PatternMatch.parseId()` 记录模式，导入时按模式构建并匹配。

### 3.9 主世界 API 访问模式（通用化）

当 content script 需要访问页面主世界的全局对象（如 `window.UE`、页面自定义全局变量）时，**不能直接访问**，必须通过桥接脚本注入。

**通用模式：**
1. `manifest.json` 的 `web_accessible_resources` 声明桥接脚本
2. content script 创建 `<script type="application/json">` payload 节点传参
3. content script 创建 `<script src="chrome.runtime.getURL(...)">` 注入桥接脚本
4. 桥接脚本通过 `document.currentScript.getAttribute('data-payload-id')` 找到 payload
5. 桥接脚本在主世界执行完毕后移除自身和 payload 节点

**注意**：
- 用 `src` 方式注入外部脚本，不受页面 inline CSP 限制
- 用 `<script type="application/json">` 传参，避免 HTML 引号转义问题
- 桥接脚本执行后应清理 DOM 残留

---

## 四、代码约定

### 4.1 日志前缀

| 前缀 | 模块 | 前缀 | 模块 |
|------|------|------|------|
| `[Main]` | 按钮注入 | `[FieldMatcher]` | 匹配引擎 |
| `[PageRegistry]` | 适配器注册表 | `[ExactMatch]` | 精确匹配 |
| `[FormFiller]` | 填写 | `[PatternMatch]` | 模式匹配 |
| `[PlainSelect]` | 下拉框 | `[SemanticMatch]` | 语义匹配 |
| `[MixedGroup]` | 混合控件 | `[Import]` | 导入转换 |
| `[ImportPanel]` | 面板 UI | `[AIRewriteDialog]` | AI 改写 |
| `[PageAdapter]` | 单个适配器内部 | `[AntD1]` | AntD1 填写器 |
| `[SafeStorage]` | 存储封装 | `[Background]` | Service Worker |

### 4.2 错误处理

1. 匹配策略内部捕获异常，返回 `null`
2. 填充方法可抛异常，由 `_fillField()` 捕获记入 `results`
3. 匹配失败不阻塞流程

### 4.3 DOM 操作

```js
// ID 选择器用 CSS.escape
document.querySelector(`input#${CSS.escape(domKey)}`);

// 点击前先 mousedown（兼容 AntD）
el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
el.click();

// 设值后触发 React 同步
nativeSetter.call(input, value);
input.dispatchEvent(new Event('input', { bubbles: true }));
input.dispatchEvent(new Event('change', { bubbles: true }));
```

### 4.4 模块导出

```js
if (typeof window !== 'undefined') { window.ModuleName = ModuleName; }
if (typeof module !== 'undefined' && module.exports) { module.exports = ModuleName; }
```

### 4.5 策略自注册

```js
if (typeof window !== 'undefined' && window.FieldMatcher) {
  window.FieldMatcher.registerStrategy(YourStrategy);
}
```

---

## 五、测试规范

每次改动至少：
```bash
node --check extension/content/<文件>.js          # 语法检查（任意目录）
cd d:\newcapec\ai-code\vtrip && npm test          # Jest 测试（必须在父目录运行）
```

手动回归：
- **baseInfoMerge**：复合行字段（mixedGroup/selectGroup）正常
- **productImageText**：推荐理由 + 产品特色（富文本保存不丢内容）正常
- **模板系统**：保存/应用正常

---

## 六、版本历史

| 版本 | 日期 | 关键变更 |
|------|------|---------|
| v0.1 | 2026-06-01 | baseInfoMerge 基础导出导入 |
| v0.2 | 2026-06-15 | 模板系统 + productImageText 支持 |
| v0.3 | 2026-06-18 | 智能匹配引擎 + 跨版本导入 |
| v0.5 | 2026-06-22 | 架构重构阶段0-3：快照基线、PageRegistry/pages 物理隔离、FieldTypeRegistry 增量通道、Sanitizers 抽离 |
