# 携程数据迁移助手 - 业务开发规范手册

> 版本：v0.3.0 | 基于 2026-06-17 至 2026-06-18 实际开发经验总结

---

## 一、核心架构原则

### 1.1 页面适配器隔离原则

**每个页面类型必须有自己的适配器，不得混用提取/填充逻辑。**

```text
PageAdapters.detectAdapter()
  ├─ baseInfoMerge      → baseInfoMergeAdapter（原产品信息页）
  ├─ productImageText   → productImageTextAdapter（产品图文页）
  ├─ tourdays           → fallback to baseInfoMergeAdapter（未适配）
  ├─ packageManage      → fallback to baseInfoMergeAdapter（未适配）
  └─ newResourceRule    → fallback to baseInfoMergeAdapter（未适配）
```

**规则：**
- 新增页面时，必须在 `page-adapters.js` 的 `detectAdapter()` 中注册 URL 匹配规则
- 未适配的页面默认走 `baseInfoMergeAdapter`，但不应假设其能正常工作
- 每个适配器必须实现 `extract()` 和 `extractFieldMap()` 两个方法

### 1.2 字段类型两分法：单控件 vs 复合行

**这是当前项目最重要的架构规则。**

| 类别 | 字段类型 | 含义 | 定位方式 |
|------|----------|------|---------|
| 单控件 | `input`, `textarea`, `select`, `searchSelect`, `multiSearchSelect`, `checkbox`, `radio`, `inputNumber` | 一个字段 = 一个 DOM 元素 | 智能匹配 / domKey 直接定位 |
| 复合行 | `inputNumberGroup`, `mixedGroup`, `selectGroup`, `searchSelectGroup` | 一个字段 = 一整行 form-item，内含多个控件 | `label[for]` → form-item → 按 DOM 顺序收集子控件 |
| 专用复合 | `recommendReason`, `richText` | productImageText 专属结构 | 页面适配器专用处理 |

**规则：**

1. **复合行字段绝不允许走 FieldMatcher 单元素匹配**。它们必须保持旧版 `label[for] → closest(.ant-form-item)` 的行级定位逻辑。

2. **单控件字段可以走智能匹配**，但必须保留 `domKey` 兜底：
   ```js
   // 智能匹配优先
   if (window.FieldMatcher && field.matchData) {
     return await window.FieldMatcher.smartMatch(field, true);
   }
   // domKey 兜底
   if (field.domKey) {
     const element = document.getElementById(field.domKey);
     ...
   }
   ```

3. **新增字段类型时，先在 `form-filler.js` 的 `_fillField()` 入口处判断属于哪一类**，再决定执行路径。

### 1.3 智能匹配的适用范围

**FieldMatcher 只适用于跨版本 ID 不一致的场景，不是万能匹配器。**

适用场景：
- 同字段在不同页面版本中 ID 命名规则不同（如 `pmRcmdItems_0` vs `pmRcmdRegionGroups_0_items_0`）
- DOM 结构相似但 ID 不同的单控件字段

不适用场景：
- 一个 label 下有多个控件的复合行
- 页面适配器专用结构（如 recommendReason 的嵌套子字段）
- 富文本编辑器（UEditor 走专用 API）

---

## 二、新增页面开发流程

### 2.1 标准流程

```
1. 分析目标页面 DOM 结构
2. 在 page-adapters.js 中创建适配器
3. 实现 extract() 方法（导出）
4. 实现 extractFieldMap() 方法（匹配预览）
5. 如有特殊字段，在 form-filler.js 中添加专用填充方法
6. 在 manifest.json 的 matches 中添加 URL 匹配规则
7. 在 detectAdapter() 中注册 URL 映射
8. 测试导出 → 导入 → 匹配预览 → 确认填写 → 回读验证
```

### 2.2 适配器模板

```javascript
// page-adapters.js
yourPageAdapter: {
  extract() {
    const result = {
      version: '1.0',
      source: PageDetector.detect() === 'domestic' ? 'domestic' : 'international',
      tab: 'yourPageType',
      timestamp: new Date().toISOString(),
      data: {}
    };

    // 提取逻辑
    // ...

    return result;
  },

  extractFieldMap() {
    const result = {};
    // 字段映射逻辑
    return result;
  }
}
```

### 2.3 新增页面时的检查清单

在提交代码前，必须确认：

- [ ] 新页面导出 JSON 结构正确
- [ ] 导入后字段能正确填充
- [ ] 匹配预览显示正确（不应出现索引偏移或误报未匹配）
- [ ] 页面左上角叠加标签正常显示
- [ ] **原有页面（baseInfoMerge 和 productImageText）的导出导入功能不受影响**

---

## 三、常见陷阱与解决方案

### 3.1 陷阱：label 无 `for` 属性

**问题：** 某些页面（如 productImageText 推荐理由）的 label 没有 `for` 属性，导致 `document.querySelector('label[for="..."]')` 找不到。

**解决：** 不要硬编码 `label[for]` 查找。优先通过 `input#domKey` 找最近的 DOM 容器，再定位目标控件。

```javascript
// ❌ 不可靠
const label = document.querySelector(`label[for="${domKey}"]`);

// ✅ 更可靠
const input = document.querySelector(`input#${CSS.escape(domKey)}`);
const selectEl = input ? input.closest('.ant-select') : null;
```

### 3.2 陷阱：隐藏表单项导致索引偏移

**问题：** 页面中可能存在隐藏的 `.ant-form-item`（如 `ant-form-item-hidden`），如果在遍历 NodeList 时使用原始 index，会导致字段名与实际数据错位。

**解决：** 使用独立的计数器，只统计真正需要处理的表单项。

```javascript
// ❌ 使用 NodeList 的迭代 index
formItems.forEach((item, index) => {
  const fieldKey = `推荐理由_${index}`; // 可能因为隐藏项而偏移
});

// ✅ 使用独立计数器
let recommendIndex = 0;
formItems.forEach(item => {
  if (shouldSkip(item)) return;
  const fieldKey = `推荐理由_${recommendIndex}`;
  recommendIndex++;
});
```

### 3.3 陷阱：预览面板把复合字段合并成单个值

**问题：** 预览面板默认对每个字段调用 `_getDisplayValue()`，复合字段（如 recommendReason）的 category 和 description 会被合并成一行显示。

**解决：** 在 `_renderPreview()` 中为复合字段渲染多个子输入框，每个子输入框用 `data-field-path` 单独回写。

```html
<!-- 推荐理由拆成两行 -->
推荐理由_0 / 分类    [select值]
推荐理由_0 / 描述    [textarea值]
```

```javascript
// 回写时按路径定位嵌套字段
_setFieldValueByPath(fieldPath, value) {
  // "推荐理由::推荐理由_0::description.value"
  const [groupName, fieldLabel, nestedPath] = fieldPath.split('::');
  // 按 nestedPath 写入多层嵌套对象
}
```

### 3.4 陷阱：预览回写覆盖原始数据

**问题：** `_collectPreviewEdits()` 会遍历所有预览输入框并回写 `_transformedData`。如果 `richText` 的 HTML 被覆盖成预览显示文本，后续填写就会丢失完整 HTML。

**解决：** 在 `_collectPreviewEdits()` 中跳过不可简单覆盖的字段类型：

```javascript
const skipTypes = [
  'inputNumberGroup', 'mixedGroup', 'selectGroup',
  'searchSelectGroup', 'multiSearchSelect', 'customDisplay',
  'recommendReason', // 通过 data-field-path 单独回写
  'richText'         // 保持原始 HTML，不覆盖
];
```

### 3.5 陷阱：AntD 版本差异导致选择器失效

**问题：** 携程后台不同页面使用了不同版本的 Ant Design，DOM 类名不一致：
- 旧版：`.ant-select-selection`、`.ant-select-search__field`
- 新版：`.ant-select-selector`、`.ant-select-selection-search-input`

**解决：** 在 DOM 选择器中同时兼容新旧版本：

```javascript
// 展开下拉框
const selection = selectEl.querySelector(
  '.ant-select-selection, .ant-select-selector'
);

// 查找选项
const options = dropdown.querySelectorAll([
  '.ant-select-dropdown-menu-item:not(.ant-select-dropdown-menu-item-disabled)',
  '.ant-select-item-option:not(.ant-select-item-option-disabled)'
].join(','));
```

### 3.6 陷阱：AI 改写未过滤非法字符

**问题：** 国际版对输入内容有字符限制，AI 改写后的文本可能包含 emoji、箭头、不允许的符号等。

**解决：** 在 prompt 中明确告知字符限制，同时在本地对 AI 返回结果进行二次清洗：

```javascript
_sanitizeForInternationalRules(text) {
  // 符号映射（半角 → 全角）
  .replace(/:/g, '：')
  .replace(/\(/g, '（')
  .replace(/>/g, '—')
  // 删除不允许的字符
  .replace(/[^一-鿿A-Za-z0-9\s允许符号]/g, '')
}
```

### 3.8 陷阱：富文本（UEditor）显示正常但保存为空

**问题：** 直接写 iframe body 的 `innerHTML` 后，富文本编辑器页面上能正常显示，但点击保存后内容没有进入数据库。

**根因（两个）：**

1. **content script 运行在隔离世界**，`window.UE` 拿到的是扩展隔离环境的 window，**不是页面真正的 UEditor 实例**。所以 content script 里直接 `window.UE.getEditor()` 永远拿不到页面实例。

2. **直接写 iframe DOM 不更新 UEditor 数据模型**。保存时页面读取的是 UEditor 内部 model / 同步 textarea / React state，而不是 iframe 的 DOM。只改 iframe innerHTML 只更新显示，保存读到的还是空内容。

**解决：** 通过 `web_accessible_resources` 注入桥接脚本到页面主世界，调用真正的 UEditor 实例 API：

```javascript
// 1. manifest.json 声明可注入资源
"web_accessible_resources": [{
  "resources": ["content/page-ue-bridge.js"],
  "matches": ["https://vbooking.ctrip.com/*"]
}]

// 2. content script 注入外部脚本（不受页面 inline CSP 限制）
const bridge = document.createElement('script');
bridge.src = chrome.runtime.getURL('content/page-ue-bridge.js');
bridge.setAttribute('data-payload-id', payloadId); // 用 data 节点传 HTML
document.head.appendChild(bridge);

// 3. 桥接脚本在主世界调用真正的 UE 实例
editor.setContent(html);   // 更新数据模型
editor.sync();             // 同步到隐藏 textarea
editor.fireEvent('contentchange'); // 通知页面 React state 更新
```

**要点：**
- 不能用内联 `<script>textContent</script>`，会被页面 CSP `script-src` 拦截
- 必须用外部脚本文件（`chrome.runtime.getURL`）
- 含大量引号的 HTML 用 `<script type="application/json">` 节点传递，避免字符串转义
- 必须调用 `setContent()` + `sync()` + `fireEvent('contentchange')` 三件套，分别更新：数据模型、同步 textarea、页面监听器/React state
- iframe innerHTML 写入可作为即时显示兜底，但不是保存的关键路径

参见 `form-filler.js` 的 `_fillRichText()` / `_fillRichTextViaPageUE()` 和 `page-ue-bridge.js`。

### 3.9 陷阱：跨版本 ID 命名不一致

**问题：** 国内版和国际版同一字段的 DOM ID 格式不同。

**解决：** 使用 PatternMatch 策略匹配，导出时记录 ID 模式信息：

```javascript
// 导出时解析
PatternMatch.parseId('pmRcmdItems_0_pmRcmdCategoryId')
// → { baseName: 'pmRcmdItems', index: 0, suffix: 'pmRcmdCategoryId', regionIndex: 0 }

// 导入时按模式构建并匹配
pattern.build(baseName, index, suffix, regionIndex)
// 国内版：pmRcmdItems_0_pmRcmdCategoryId
// 国际版：pmRcmdRegionGroups_0_items_0_pmRcmdCategoryId
```

---

## 四、字段类型注册表

当需要新增字段类型时，必须同步更新以下位置：

| 文件 | 需要修改的位置 |
|------|---------------|
| `form-extractor.js` | `_extractFormItem()` — 检测逻辑 + `_extractValue()` — 提取值 |
| `form-filler.js` | `_fillField()` — 填写入口 + 专用填充方法 |
| `panel.js` | `_getDisplayValue()` — 预览显示 + `_collectPreviewEdits()` — 回写逻辑 |
| `import.js` | `_applyRules()` — 转换规则 |
| `PRD.md` | 字段类型文档 |

### 当前字段类型完整列表

| fieldType | 类别 | 说明 | 示例 |
|-----------|------|------|------|
| `input` | 单控件 | 普通文本输入框 | 产品名称 |
| `textarea` | 单控件 | 多行文本域 | 操作说明 |
| `select` | 单控件 | 普通下拉框 | 产品类型 |
| `searchSelect` | 单控件 | 搜索下拉框 | 目的地城市 |
| `multiSearchSelect` | 单控件 | 多选搜索下拉框 | 出发城市 |
| `inputNumber` | 单控件 | 数字输入框 | 行程天数 |
| `checkbox` | 单控件 | 复选框 | 是否启用 |
| `radio` | 单控件 | 单选框 | 语言选择 |
| `inputNumberGroup` | 复合行 | 成组数字输入框 | 天数+晚数 |
| `mixedGroup` | 复合行 | 混合控件组 | 提前预订（select+inputNumber+select） |
| `selectGroup` | 复合行 | 成组普通下拉框 | 儿童年龄范围 |
| `searchSelectGroup` | 复合行 | 成组搜索下拉框 | 集合城市+目的地城市 |
| `customDisplay` | 只读 | 自定义展示组件 | 只读信息展示 |
| `recommendReason` | 专用复合 | 推荐理由（productImageText） | 分类+描述 |
| `richText` | 专用 | 富文本编辑器（productImageText） | UEditor 产品特色 |

---

## 五、代码约定

### 5.1 控制台日志前缀

所有模块必须使用统一前缀，便于调试：

| 前缀 | 模块 |
|------|------|
| `[Main]` | 按钮注入 |
| `[PageAdapters]` | 适配器检测 |
| `[PageAdapter]` | productImageText 提取 |
| `[FormFiller]` | 填写操作 |
| `[FieldMatcher]` | 字段匹配引擎 |
| `[ExactMatch]` | 精确匹配策略 |
| `[PatternMatch]` | 模式匹配策略 |
| `[SemanticMatch]` | 语义匹配策略 |
| `[PlainSelect]` | 下拉框填写 |
| `[MixedGroup]` | 混合控件组填写 |
| `[Import]` | 导入转换 |
| `[ImportPanel]` | 导入面板 UI |
| `[AIRewriteDialog]` | AI 改写对话框 |

### 5.2 错误处理约定

1. **策略内部必须捕获异常**，返回 `null` 而非抛出异常，确保 FieldMatcher 能继续尝试下一个策略。
2. **填充方法可以抛出异常**，由 `_fillField()` 统一捕获并记录到 `this.results`。
3. **匹配失败不应阻塞流程**，应标记为 `skipped` 或 `failed`，让用户可以选择跳过。

### 5.3 DOM 操作约定

1. **ID 选择器使用 `CSS.escape()`** 转义特殊字符：
   ```javascript
   const el = document.querySelector(`input#${CSS.escape(domKey)}`);
   ```
2. **点击事件前先 dispatch `mousedown`**，确保兼容 AntD 的事件处理：
   ```javascript
   el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
   el.click();
   ```
3. **设置 input 值后触发 input 和 change 事件**，确保 React 受控组件同步：
   ```javascript
   nativeSetter.call(input, value);
   input.dispatchEvent(new Event('input', { bubbles: true }));
   input.dispatchEvent(new Event('change', { bubbles: true }));
   ```

### 5.4 模块导出约定

所有全局模块使用 `window` 挂载，同时支持 Node.js 测试：

```javascript
if (typeof window !== 'undefined') {
  window.ModuleName = ModuleName;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ModuleName;
}
```

### 5.5 策略自注册约定

匹配策略文件必须使用自注册模式，在文件末尾自动注册到 FieldMatcher（如果存在）：

```javascript
if (typeof window !== 'undefined' && window.FieldMatcher) {
  window.FieldMatcher.registerStrategy(YourStrategy);
}
```

---

## 六、测试规范

### 6.1 每次改动后必须验证

在提交代码前，至少执行：

```bash
# 1. 语法检查
node --check extension/content/form-filler.js
node --check extension/content/panel.js
node --check extension/content/page-adapters.js
node --check extension/content/ai-rewrite-dialog.js

# 2. 单元测试
npm test -- test/field-matcher-test.js

# 3. 手动回归测试
# - baseInfoMerge 页面：导出 → 导入 → 复合字段填写
# - productImageText 页面：导出 → 导入 → 推荐理由 + 产品特色
```

### 6.2 回归测试检查点

每次改动后必须确认以下场景不退化：

| 场景 | 页面 | 检查项 |
|------|------|--------|
| 复合行字段填写 | baseInfoMerge | inputNumberGroup / mixedGroup / selectGroup 正常 |
| 搜索下拉框 | baseInfoMerge | searchSelect / searchSelectGroup 正常 |
| 推荐理由 | productImageText | category select + description textarea 正常 |
| 产品特色 | productImageText | UEditor 富文本填写正常 |
| 匹配预览 | productImageText | 字段匹配正确，无索引偏移 |
| 模板系统 | 通用 | 保存/应用/管理正常 |

---

## 七、文档维护

### 7.1 必须同步更新的文档

| 文档 | 何时更新 |
|------|---------|
| `CLAUDE.md` | 架构变化、新增模块、新增字段类型 |
| `PRD.md` | 需求变更、决策记录 |
| `DEVELOPMENT_GUIDE.md`（本文件） | 发现新的陷阱、新增规范 |
| `TODOS.md` | 推迟的功能、已知问题 |

### 7.2 禁止保留的临时文件

以下类型的文件在开发完成后必须删除，不得提交到项目：

- 调试用的 HTML 文件（如 `test-*.html`）
- 一次性修复记录（如 `*_FIX.md`, `*_SUMMARY.md`）
- 开发过程日志（如 `*_COMPLETION_REPORT.md`）
- 空的测试文件

---

## 八、开发流程速查

### 新增一个简单字段

```
1. form-extractor.js: _extractFormItem() 添加检测逻辑
2. form-filler.js: _fillField() 添加 case + 实现填充方法
3. panel.js: _getDisplayValue() 添加预览显示逻辑
4. import.js: _applyRules() 添加转换规则
```

### 新增一个页面

```
1. page-adapters.js: 创建适配器 + detectAdapter() 注册 URL
2. manifest.json: matches 添加 URL 规则
3. form-filler.js: 如有特殊字段，添加专用填充方法
4. 回归测试：baseInfoMerge + productImageText
```

### 新增一个匹配策略

```
1. content/match-strategies/xxx.js: 实现 {name, priority, match()}
2. 文件末尾自注册到 FieldMatcher
3. manifest.json: 在 field-matcher.js 之后添加加载顺序
4. page-adapters.js: 导出时记录对应的 matchData
```

---

## 九、版本历史

| 版本 | 日期 | 关键变更 |
|------|------|---------|
| v0.1.0 | 2026-06-01 | 基础导出/导入，baseInfoMerge 支持 |
| v0.2.0 | 2026-06-15 | 模板系统，productImageText 页面支持 |
| v0.3.0 | 2026-06-18 | 智能字段匹配引擎，三级匹配策略，跨版本导入 |

---

**本手册基于实际开发经验编写，后续开发必须遵循以上规范。如有新的经验教训，请及时更新本手册。**