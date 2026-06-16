# 产品数据迁移助手 - 需求文档

> 版本：v0.2 | 创建：2026-06-14 | 更新：2026-06-14 | 状态：需求确认

---

## 一、项目背景

将携程国内版VBK后台的产品数据迁移到Trip.com国际版VBK后台。两个系统在同一个域名 `vbooking.ctrip.com` 下，表单结构大体相似但有差异（字段映射、ID体系不同、中文需翻译为英文）。

之前的API逆向方案已验证可行，但遇到**ID体系不匹配**问题（国内版和国际版的城市ID、路线ID不同，且国际版字典搜索API未逆向成功），导致部分字段无法通过纯API方式正确写入。

本方案另辟蹊径：在浏览器表单层面做导出/导入，让前端组件自己处理ID映射，绕开后端ID不匹配的问题。

### 前端技术栈

两端共用同一套技术栈：
- **React 16.14.0** + Loadable-Components
- **Lodash 4.17.21** + core-js 3.19.3
- 国内版为 SSR 渲染，国际版为 CSR 渲染

## 二、产品目标

开发一个Chrome浏览器插件，实现：
1. 在国内版产品编辑页面**一键导出**当前Tab的表单数据
2. 在国际版产品编辑页面**一键导入**，经过翻译和格式转换后自动填入表单
3. 人工审核确认后保存

## 三、核心决策记录

| # | 决策项 | 选择 | 理由 |
|---|--------|------|------|
| D1 | 数据提取策略 | DOM值为主，React fiber为辅 | DOM值覆盖大部分字段；搜索下拉框等DOM上只有ID的字段，从React fiber取显示文本 |
| D2 | 表单填写策略 | MVP仅DOM模拟，不做API兜底 | 先验证DOM填写覆盖率，API兜底涉及Cookie校验、请求构造等复杂度，放到后续迭代 |
| D3 | 翻译/转换时机 | 预置规则+大模型翻译（仅自由文本） | 结构化字段用规则即可，减少API调用和费用 |
| D4 | 大模型Key | 用户自填 | 避免共享Key的安全和费用问题 |
| D5 | 插件形态 | Chrome Extension | 需要注入按钮、弹窗UI、跨页面状态传递 |
| D6 | 数据传递方式 | 剪切板优先，写入失败时降级为文件下载 | 基础信息Tab数据量小（几KB），不预设阈值，写入失败再降级 |
| D7 | 操作粒度 | 按Tab逐个导出导入 | 不同Tab的DOM结构不同，逐Tab更可控，符合用户操作习惯 |
| D8 | 导出数据结构 | 保留层级结构 | 列表类数据平铺会丢失信息，层级结构对应表单分组 |
| D9 | 导入预览交互 | 展示转换后结果，全部可编辑，标记来源 | 用户可按需调整；标记"已自动转换"/"AI翻译"方便聚焦审查 |
| D10 | 模式切换 | 自动检测+手动切换 | 自动检测页面语言特征推荐模式，同时支持手动覆盖 |
| D11 | 导出字段key | name/id为主key + label保留 | 保证稳定性，同时方便用户在预览面板识别 |
| D12 | 搜索下拉框导出 | 导出{text, id, fieldType} | 文本用于国际版搜索，ID留作调试参考，fieldType指导导入策略 |
| D13 | 搜索下拉框填写失败 | 标记跳过，不阻塞流程 | 搜索框字段占比不高，阻塞整个流程代价太大，最后汇总提示 |
| D14 | 页面区分 | 自动检测+按钮隔离 | 检测页面语言特征推荐模式，只注入当前模式对应的按钮 |
| D15 | 大模型翻译策略 | 一次请求打包所有自由文本字段 | 减少调用次数，标题间有上下文关联，一起翻译质量更好 |
| D16 | 导入面板形态 | 页面内浮层（content script注入） | 不依赖新版Chrome API，空间灵活，与当前页面强关联 |
| D17 | 按钮注入位置 | 页面顶部操作栏 | VBK后台操作栏是用户自然操作位置，最直觉 |
| D18 | 转换规则维护 | JSON配置+JS函数混合 | 纯数据映射用JSON方便维护，格式转换逻辑用JS函数表达力更强 |
| D19 | Popup功能范围 | 设置+状态概览 | 除模式切换和API配置外，显示当前页面识别结果和最近操作状态 |
| D20 | 验收方式 | 半自动验证 | 填写后自动回读表单值与预期对比，给出匹配报告，保存仍由人工操作 |

## 四、用户流程

### 4.1 导出流程（国内版页面）

```
国内版产品编辑页 → 点击插件"导出"按钮 → 提取当前Tab表单值
    → 生成层级结构JSON → 复制到剪切板（写入失败则下载JSON文件）→ 提示"导出成功"
```

### 4.2 导入流程（国际版页面）

```
国际版产品编辑页 → 点击插件"导入"按钮 → 弹出导入浮层面板
    → 粘贴导出数据（或上传JSON文件）→ 点击"转换"
    → 预置规则处理结构化字段 + 大模型翻译自由文本（一次请求）
    → 展示转换后结果（全部可编辑，标记来源）→ 用户确认
    → 自动填入表单（DOM模拟）→ 自动回读验证 → 展示匹配报告
    → 提示"导入完成"（含失败/跳过字段汇总）
```

### 4.3 完整迁移流程（单条产品）

```
1. 打开国内版产品A的"基础信息"Tab → 导出
2. 打开国际版新产品B的"基础信息"Tab → 导入 → 确认
3. 切换到"行程安排"Tab → 国内版导出 → 国际版导入 → 确认
4. 重复以上步骤处理其他Tab
5. 在国际版后台人工检查并保存
```

## 五、功能需求

### 5.1 插件设置（Popup）

| 功能 | 说明 |
|------|------|
| 模式切换 | 切换"导出模式"（国内版）/ "导入模式"（国际版），自动检测页面语言特征推荐模式 |
| API Key配置 | 填写大模型API Key（支持OpenAI/Claude等） |
| API端点配置 | 可自定义大模型API端点（兼容自部署服务） |
| 状态概览 | 显示当前页面识别结果（国内版/国际版）、最近一次导出/导入的状态 |

### 5.2 导出功能（导出模式）

| 功能 | 说明 |
|------|------|
| 注入导出按钮 | 在国内版产品编辑页顶部操作栏注入"导出"按钮 |
| 页面自动识别 | 检测页面语言特征，推荐导出模式；模式不匹配时不注入按钮 |
| 表单数据提取 | DOM值为主（input/select/textarea），React fiber为辅（搜索下拉框显示文本） |
| 字段标识 | 以name/id为主key，同时保留label文本 |
| 搜索下拉框导出 | 导出{text, id, fieldType: "searchSelect"} |
| 数据序列化 | 将提取的数据序列化为层级JSON |
| 复制到剪切板 | 优先将JSON复制到剪切板 |
| 下载文件 | 剪切板写入失败时，自动降级为下载JSON文件 |
| 导出成功提示 | 通知用户导出成功及数据大小 |

### 5.3 导入功能（导入模式）

| 功能 | 说明 |
|------|------|
| 注入导入按钮 | 在国际版产品编辑页顶部操作栏注入"导入"按钮 |
| 页面自动识别 | 检测页面语言特征，推荐导入模式；模式不匹配时不注入按钮 |
| 导入浮层面板 | 点击后弹出页面内浮层，包含数据输入区和操作按钮 |
| 数据输入 | 支持粘贴JSON文本或上传JSON文件 |
| 数据解析 | 解析导入的JSON数据，校验格式 |
| 转换引擎 | 预置规则处理结构化字段，大模型翻译自由文本字段 |
| 结果预览 | 展示转换后的数据，全部可编辑，标记来源（"已自动转换"/"AI翻译"） |
| 自动填表 | 确认后自动将数据填入国际版表单（DOM模拟） |
| 搜索下拉框填写 | 输入英文文本 → 等待搜索结果 → 点击匹配项；失败时标记跳过 |
| 填表进度 | 显示填表进度和结果（成功/失败/跳过） |
| 回读验证 | 填写完成后自动回读表单值，与预期值对比，给出匹配报告 |

### 5.4 转换规则

#### 预置规则（本地处理，不调用大模型）

| 规则类型 | 示例 | 说明 | 实现方式 |
|----------|------|------|---------|
| 直接复制 | 行程天数、最大天数、人数限制等 | 数值型字段直接复制 | JSON映射 |
| 格式转换 | 目的地格式：级联下拉→短横线连接 | 国内版"目的地1/目的地2"→国际版"Destination1-Destination2" | JS函数 |
| 标题拼接 | mainName: `{Country} {N}D{N-1}N {TourType}` | 按国际版命名规则拼接 | JS函数 |
| 固定映射 | 服务语言、币种等枚举值 | 预置映射表 | JSON映射 |
| 保留模板 | bookingControls、advancedSettings等 | 产品级配置，迁移时不修改 | JSON映射 |

#### 大模型翻译（调用外部API）

| 字段类型 | 示例 | 说明 |
|----------|------|------|
| 产品名称 | mainName、name、subName | 中文→英文，保持旅游行业术语 |
| 路线名称 | routeName、routeMainTitle | 中文→英文 |
| 描述文本 | operationNote、产品描述等 | 中文→英文 |
| 景点名称 | scenicSpots中的poiName | 中文→英文 |

**大模型调用规范**：
- 一次请求打包所有自由文本字段，大模型返回结构化JSON
- 仅翻译纯文本字段，不翻译ID、枚举值等
- Prompt中提供上下文（旅游行业、中→英翻译）
- 翻译结果展示在预览面板中，标记为"AI翻译"，用户可修改
- 调用失败时回退为原文，标记为"翻译失败，需手动修改"
- 国际版支持中文、英文、繁体中文三种语言，翻译目标为英文

## 六、技术方案

### 6.1 插件架构

```
extension/
├── manifest.json          # Chrome Extension配置
├── content/               # Content Script（注入页面）
│   ├── export.js          # 导出逻辑（国内版）
│   ├── import.js          # 导入逻辑（国际版）
│   ├── form-extractor.js  # 表单数据提取器（DOM + React fiber）
│   ├── form-filler.js     # 表单自动填写器
│   └── panel.js           # 导入浮层面板UI
├── popup/                 # Popup页面（插件弹窗）
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── background/            # Background Service Worker
│   └── service-worker.js
├── lib/                   # 第三方库
│   └── ...
├── rules/                 # 转换规则配置
│   ├── base-info.js       # 基础信息Tab的转换规则（JS函数）
│   └── field-mappings.json # 字段映射表（JSON配置）
├── PRD.md                 # 本文档
└── CONTEXT.md             # 术语表和核心概念
```

### 6.2 Content Script注入策略

| 页面 | URL匹配规则 | 注入内容 |
|------|-------------|---------|
| 国内版产品编辑页 | `vbooking.ctrip.com/ivbk/vendor/baseInfoMerge*`（中文特征） | 导出按钮 + 表单提取逻辑 |
| 国际版产品编辑页 | `vbooking.ctrip.com/ivbk/vendor/baseInfoMerge*`（英文特征） | 导入按钮 + 表单填写逻辑 |

**页面识别策略**：
1. 自动检测页面语言特征（label文本语言、DOM结构差异）
2. 推荐对应模式，用户可在Popup中手动覆盖
3. 只注入当前模式对应的按钮，模式不匹配时不注入

### 6.2.1 DOM选择器策略（基于实际HTML分析）

**UI框架**：Ant Design（ant-form、ant-select、ant-tag等）

**操作栏按钮注入**：
- 锚点：`div.maincontent-bottomfooter > div`
- 注入方式：在"保存"和"提交审核"按钮后追加导出/导入按钮

**表单分组**：
- 分组容器：`div.content-card`
- 分组标题：`div.content-cardtitle > span.content-cardtitle-text`（如"基本信息"）
- 分组内容：`div.content-cardbody`

**字段行**：
- 行容器：`div.ant-row.ant-form-item`
- Label：`label[for="baseInfo.travelDays"]`，`for`属性即字段ID
- Label文本：`label > span` 或 `label` 的 `title` 属性
- 字段ID格式：`baseInfo.fieldName` 或 `nameAreas.fieldName`

**字段类型与提取选择器**：

| 字段类型 | DOM特征 | 提取选择器 | 值位置 |
|----------|---------|-----------|--------|
| 普通输入框 | `input[type=text]` 或 `input[type=number]` | `label[for]` → 同行 `input` | `input.value` |
| 文本域 | `textarea` | `label[for]` → 同行 `textarea` | `textarea.value` |
| 普通下拉框 | `div.ant-select`（无内部search input） | `label[for]` → 同行 `.ant-select-selection-selected-value` | `[title]` 属性 |
| 搜索下拉框 | `div.ant-select` 内含 `input.ant-select-search__field[id]` | `input.ant-select-search__field` 的 `id` 属性 | `.ant-select-selection-selected-value[title]` |
| 级联下拉框 | 多个连续 `div.ant-select`（国家/省/城市/景点/其他） | `div#scenic_area` 容器内 | `.ant-tag` 文本（已选值） |
| 复选框/单选框 | `input[type=checkbox/radio]` | `label[for]` → 同行 `input` | `checked` 属性 |

**搜索下拉框特殊特征**：
- 容器 `div.ant-select` 和内部 `input.ant-select-search__field` 共享同一个 id
- 选中值格式："中国-北京"、"塞尔维亚-贝尔格莱德"（国家-城市）
- 有清除按钮：`.ant-select-selection__clear`
- 国家景区区域的级联下拉框当前为 disabled 状态，已选值用 `ant-tag` 展示

### 6.3 表单数据提取（导出）

**提取策略**：DOM值为主，React fiber为辅。

```
1. 识别表单分组（通过DOM结构、label、fieldset等）
2. 遍历每个分组内的表单元素：
   - input/textarea → 取value
   - select → 取选中项的文本（非value/ID）
   - 搜索下拉框 → DOM取显示文本 + React fiber取完整状态
   - checkbox/radio → 取选中状态
3. 每个字段记录：
   - domKey: name/id属性（主key，保证稳定性）
   - label: 关联的label文本（方便用户识别）
   - value: 字段值
   - fieldType: 字段类型标记（"input"/"select"/"searchSelect"/"checkbox"等）
   - 搜索下拉框额外记录: {text, id, fieldType: "searchSelect"}
4. 构建层级JSON结构
5. 序列化并输出
```

**导出数据格式示例**（基础信息Tab）：

```json
{
  "version": "1.0",
  "source": "domestic",
  "tab": "baseInfo",
  "timestamp": "2026-06-14T14:00:00Z",
  "data": {
    "基本信息": {
      "产品名称": {
        "domKey": "mainName",
        "label": "产品名称",
        "value": "塞尔维亚9日私家团",
        "fieldType": "input"
      },
      "行程天数": {
        "domKey": "travelDays",
        "label": "行程天数",
        "value": 9,
        "fieldType": "input"
      },
      "行程晚数": {
        "domKey": "travelNights",
        "label": "行程晚数",
        "value": 8,
        "fieldType": "input"
      },
      "目的地城市": {
        "domKey": "destinationCity",
        "label": "目的地城市",
        "value": { "text": "贝尔格莱德", "id": 10257, "fieldType": "searchSelect" }
      },
      "目的地国家": {
        "domKey": "destinationCountry",
        "label": "目的地国家",
        "value": { "text": "塞尔维亚", "id": 1001, "fieldType": "searchSelect" }
      },
      "操作说明": {
        "domKey": "operationNote",
        "label": "操作说明",
        "value": "请参照可选项操作注意事项。",
        "fieldType": "textarea"
      }
    },
    "出发城市": [
      { "text": "北京", "id": 1, "fieldType": "searchSelect" },
      { "text": "上海", "id": 2, "fieldType": "searchSelect" },
      { "text": "天津", "id": 3, "fieldType": "searchSelect" },
      { "text": "重庆", "id": 4, "fieldType": "searchSelect" }
    ],
    "景点": [
      {
        "区域": { "text": "贝尔格莱德/塞尔维亚", "fieldType": "searchSelect" },
        "景点列表": [
          { "text": "贝尔格莱德国家博物馆", "fieldType": "searchSelect" },
          { "text": "卡莱梅格丹城堡", "fieldType": "searchSelect" }
        ]
      }
    ]
  }
}
```

### 6.4 表单自动填写（导入）

**填写策略**：MVP阶段仅DOM模拟，不做API兜底。

| 字段类型 | 填写方式 | 失败处理 |
|----------|---------|---------|
| 普通输入框 | 原生setter设值 + 触发input/change事件 | 标记失败 |
| 文本域 | 原生setter设值 + 触发input/change事件 | 标记失败 |
| 下拉选择框 | 触发展开 → 查找匹配项 → 点击选择 | 标记失败 |
| 搜索下拉框 | 输入英文文本 → 等待搜索结果 → 点击匹配项 | 标记跳过，不阻塞 |
| 复选框/单选框 | 点击切换 | 标记失败 |

**DOM填写核心逻辑**（React 16受控输入）：

```javascript
// 设置输入框值并触发React响应式更新
function setInputValue(element, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  nativeInputValueSetter.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

// 设置textarea值
function setTextAreaValue(element, value) {
  const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  ).set;
  nativeTextAreaValueSetter.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}
```

**搜索下拉框填写逻辑**：

```javascript
// 搜索下拉框：输入文本 → 等待搜索结果 → 点击匹配项
async function fillSearchSelect(element, searchText, options = {}) {
  const { timeout = 5000, retryInterval = 500 } = options;
  // 1. 聚焦并输入搜索文本
  setInputValue(element, searchText);
  // 2. 轮询等待搜索结果出现
  const result = await waitForSearchResult(searchText, timeout, retryInterval);
  if (result) {
    // 3. 点击匹配项
    result.click();
    return { success: true };
  }
  return { success: false, reason: '搜索结果未找到匹配项' };
}
```

**回读验证逻辑**：

```javascript
// 填写完成后自动回读表单值，与预期值对比
async function verifyFilledFields(expectedData) {
  const actualData = extractFormData(); // 复用导出的提取逻辑
  const report = { matched: [], mismatched: [], skipped: [] };
  // 逐字段对比
  for (const field of expectedData) {
    const actual = actualData[field.domKey];
    if (actual === undefined) {
      report.skipped.push({ field: field.domKey, reason: '字段未找到' });
    } else if (actual.value === field.expectedValue) {
      report.matched.push(field.domKey);
    } else {
      report.mismatched.push({
        field: field.domKey,
        expected: field.expectedValue,
        actual: actual.value
      });
    }
  }
  return report;
}
```

### 6.5 跨页面数据传递

| 方式 | 用途 | 说明 |
|------|------|------|
| 剪切板 | 快速传递 | 优先使用，用户可直接Ctrl+V粘贴 |
| 文件下载 | 写入失败兜底 | 剪切板写入失败时自动降级 |
| Chrome Storage (local) | 状态存储 | 存储插件设置、最近操作状态 |

### 6.6 大模型集成

**支持的API**：
- OpenAI兼容接口（OpenAI、DeepSeek、自部署服务等）
- Anthropic Claude接口

**调用流程**：
```
1. 用户在Popup设置中配置API Key和端点
2. 导入时识别需要翻译的字段
3. 一次请求打包所有自由文本字段，大模型返回结构化JSON
4. 解析翻译结果，填入预览面板，标记为"AI翻译"
5. 调用失败时回退为原文，标记"翻译失败，需手动修改"
```

**翻译Prompt模板**：
```
你是一个旅游行业翻译专家，将中文旅游产品信息翻译为英文。
保持专业术语的准确性，如"私家团"翻译为"Private Tour"。
保持格式不变，只翻译文本内容。
请严格按以下JSON格式返回翻译结果，不要添加任何其他内容：

{
  "mainName": "翻译后的产品名称",
  "subName": "翻译后的副标题",
  "operationNote": "翻译后的操作说明",
  ...
}

需要翻译的字段：
- mainName：{mainName}
- subName：{subName}
- operationNote：{operationNote}
...
```

### 6.7 导入浮层面板

**形态**：content script注入的页面内浮层div，固定在页面右侧。

**布局**：
```
┌─────────────────────────────────┐
│ 导入面板                    [×] │
├─────────────────────────────────┤
│ [粘贴JSON] [上传文件]           │
│ ┌─────────────────────────────┐ │
│ │ JSON输入区                  │ │
│ └─────────────────────────────┘ │
│ [转换]                          │
├─────────────────────────────────┤
│ 转换结果预览：                  │
│ ┌─────────────────────────────┐ │
│ │ mainName: [Serbia 9D8N...]  │ │
│ │   ↳ 标记：AI翻译            │ │
│ │ travelDays: [9]             │ │
│ │   ↳ 标记：已自动转换        │ │
│ │ destinationCity: [Belgrade] │ │
│ │   ↳ 标记：AI翻译            │ │
│ └─────────────────────────────┘ │
│ [确认填写]                      │
├─────────────────────────────────┤
│ 填写进度：                      │
│ ████████░░ 8/10                 │
│ ✅ mainName ✅ travelDays       │
│ ⚠️ destinationCity (跳过)       │
│ ❌ routeName (失败)             │
├─────────────────────────────────┤
│ 回读验证：                      │
│ 匹配 7/10 | 不匹配 1 | 跳过 2  │
└─────────────────────────────────┘
```

## 七、MVP范围

### 第一期：基础信息Tab

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 插件框架搭建 | P0 | manifest、popup、content script基础结构 |
| 模式切换+自动检测 | P0 | 自动检测页面语言推荐模式 + 手动切换 |
| 导出按钮注入 | P0 | 国内版页面顶部操作栏注入导出按钮 |
| 基础信息表单提取 | P0 | DOM值为主 + React fiber为辅，提取基础信息Tab |
| 数据序列化+剪切板 | P0 | JSON序列化并复制到剪切板，失败降级为文件下载 |
| 导入按钮注入 | P0 | 国际版页面顶部操作栏注入导入按钮 |
| 导入浮层面板 | P0 | 页面内浮层：粘贴数据、转换、预览、确认 |
| 预置转换规则 | P0 | 基础信息Tab的字段映射（JSON）和格式转换（JS函数） |
| 大模型翻译集成 | P1 | 一次请求打包翻译所有自由文本字段 |
| DOM自动填表 | P0 | 普通输入框/文本域自动填写（React原生setter） |
| 搜索下拉框填写 | P1 | 目的地、城市等搜索选择，失败标记跳过 |
| 回读验证 | P0 | 填写后自动回读对比，给出匹配报告 |
| Popup状态概览 | P1 | 当前页面识别结果、最近操作状态 |
| API Key配置 | P1 | 大模型API Key和端点设置 |

### 后续扩展

| 功能 | 说明 |
|------|------|
| API兜底 | DOM填写失败的字段，通过saveProductBaseInfo的round-trip模式写入 |
| 行程安排Tab | 导出/导入行程数据 |
| 价格/库存Tab | 导出/导入价格和库存配置 |
| 批量模式 | 一次导出多条产品，逐条导入 |
| 转换规则自定义 | 用户可编辑字段映射规则 |
| 翻译记忆 | 缓存翻译结果，相同内容不重复调用 |

## 八、开发顺序

按依赖关系排列：

1. **插件骨架** — manifest.json + popup（设置+状态概览）+ content script注入框架 + 页面自动识别
2. **导出功能** — 操作栏按钮注入 + 表单提取（DOM + React fiber）+ 序列化 + 剪切板
3. **导入面板** — 操作栏按钮注入 + 浮层UI + 数据输入/解析
4. **转换引擎** — 预置规则（JSON映射 + JS函数）+ 大模型翻译集成
5. **DOM填写** — 普通输入框/文本域 + 下拉选择 + 搜索下拉框
6. **回读验证** — 填写后自动提取对比，展示匹配报告

## 九、已知风险与约束

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| DOM结构变化 | 选择器失效，提取/填写失败 | 使用语义化选择器，配置化而非硬编码 |
| React 16 fiber内部API变化 | fiber提取逻辑失效 | fiber仅作辅助，DOM值为主；fiber提取逻辑隔离在独立模块 |
| React响应式不触发 | 设值后组件状态未更新 | 使用原生setter + input/change事件触发 |
| 搜索下拉框异步延迟 | 输入后搜索结果未返回 | 轮询等待 + 超时处理，失败标记跳过 |
| 大模型翻译质量 | 翻译不准确或不专业 | 预览面板允许手动修改，行业术语预置 |
| 国内版SSR页面结构 | 表单元素可能不在标准form内 | 需要适配SSR渲染的DOM结构 |
| 两个系统URL相同 | 无法自动区分国内版/国际版 | 自动检测页面语言特征 + 手动切换兜底 |
| 操作栏DOM锚点不稳定 | 按钮注入位置找不到 | 需要实际页面HTML片段确认注入策略，备选右下角浮动按钮 |

## 十、验收标准

1. 在国内版基础信息页面点击"导出"，能正确提取表单数据并复制到剪切板
2. 在国际版基础信息页面点击"导入"，粘贴导出数据后点击"转换"，能正确翻译和格式化
3. 确认后能自动填入国际版表单（至少覆盖普通输入框和文本域）
4. 填写完成后自动回读验证，给出匹配报告（匹配/不匹配/跳过）
5. 大模型翻译失败时不阻塞流程，回退为原文并提示用户手动修改
6. 搜索下拉框填写失败时标记跳过，不阻塞其他字段填写
7. Popup显示当前页面识别结果和最近操作状态
