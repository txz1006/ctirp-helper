# 行程描述页（tourdays）导入导出方案

> 状态：方案设计，待审查后实施  
> 日期：2026-06-25  
> 目标页面：`/ivbk/vendor/tourdays` 行程描述 Tab  
> 样本：`docs/国内行程描述tab.html`、`docs/国际行程描述tab.html`

---

## 1. 背景与目标

行程描述页是第三个需要支持的页面。与 baseInfoMerge / productImageText 不同，它不是普通 `content-card` 表单，也不是单个 UEditor 富文本，而是按“天”组织的大型动态行程卡片表单。

本轮目标：

1. 国内版行程描述页可导出结构化 JSON。
2. 国际版行程描述页可导入该 JSON。
3. 导入前先把国际页的每天卡片结构补齐到与国内导出结构一致。
4. 只在新页面目录内新增代码，不改老页面逻辑。
5. 不影响已上线的 baseInfoMerge / productImageText。

本方案遵守已实施的架构重构规则：

- 页面逻辑放在 `content/pages/tourdays/`。
- 页面适配器通过 `PageRegistry.register()` 自注册。
- 新字段类型通过 `FieldTypeRegistry.registerScoped()` 注册，不往 `form-filler.js` 旧 switch 添加 case。
- 老页面快照与现有测试保持全绿。

---

## 2. 样本结构观察

### 2.1 共同结构

国内/国际样本都存在稳定的 day 容器：

```html
<div id="td-day-wrap-0">...</div>
<div id="td-day-wrap-1">...</div>
...
<div id="td-day-wrap-9">...</div>
```

每一天内部包含：

- day title 区：`tripDescribe__pml-day-titleform--...`
- 卡片列表：`tripDescribe__td-day-card-list--...`
- 多个卡片：`tripDescribe__td-day-card--...`
- 每张卡片内通常有一个“补充说明” textarea。

textarea 普遍没有稳定 `id`，label 也没有稳定 `for`，因此不能复用通用 `domKey` / `label[for]` 定位方式。

### 2.2 样本数量

基于当前样本的只读分析：

| 页面 | day 容器 | textarea | 已有内容 |
|---|---:|---:|---|
| 国内行程描述 | 10 | 27 | 前 3 天有标题与多个卡片内容 |
| 国际行程描述 | 10 | 15 | 前 3 天为空模板，每天约 1 标题 + 3 餐饮 + 1 酒店 |

这说明国际页当前模板不包含国内源数据里的全部景点、交通、自由活动等卡片。若只填已有 textarea，会丢失大量源内容。

### 2.3 国际页新增卡片机制

用户补充确认：国际版每个 day 的卡片区域上方有加号：

```html
<div class="tripDescribe__td-add-box--1TEAj">
  <div class="tripDescribe__td-add-plus-btn--mT190">...</div>
  <div class="tripDescribe__td-add-item-btn-wrap--3j_mI ...">
    <div class="tripDescribe__td-add-item-btn-new--OPyhP" id="vbk-...-project-select-餐饮">餐飲</div>
    <div class="tripDescribe__td-add-item-btn-new--OPyhP" id="vbk-...-project-select-酒店">酒店</div>
    <div class="tripDescribe__td-add-item-btn-new--OPyhP" id="vbk-...-project-select-景点">景點</div>
    ...
  </div>
</div>
```

点击加号展示浮动面板，再点击项目选项即可新增指定类型卡片。

样本中可见类型：

| 内部类型（按钮 id） | 国际展示文案 | 计划 cardKind |
|---|---|---|
| 餐饮 | 餐飲 | meal |
| 酒店 | 酒店 | hotel |
| 景点 | 景點 | scenic |
| 购物 | 購物 | shopping |
| 自由活动 | 自由活動 | freeActivity |
| 交通 | 交通 | traffic |
| 其他 | 其他 | other |
| 集合 | 集合 | assembly |
| 解散 | 解散 | dismiss |
| 机票 | 航班 | flight |
| 火车 | 火車 | train |
| 船 | 船 | ship |
| 联运 | 聯運 | intermodal |

---

## 3. 范围定义

### 3.1 本轮实现范围

本轮实现“全字段导出 + 位置化匹配导入”：

1. 导出国内页每一天的全部卡片字段：标题、补充说明 textarea，以及每张卡片内的 input / radio / checkbox / inputNumber / timePicker / select 等控件值。
2. 识别每个卡片的类型与同类型序号（occurrenceIndex）。
3. 导入国际页时，先按导出结构补齐卡片数量和类型（阶段 D）。
4. 补齐后按 `dayIndex + cardKind + occurrenceIndex + role` 做位置匹配，逐字段填入：
   - textarea：React 原生 setter + 事件（阶段 C 已实现）
   - input / inputNumber / inputNumberGroup：DOM 原生 setter + input/change 事件
   - radio / checkbox：按 value 点击目标项
   - select（普通下拉）：按文本模糊匹配选项
   - select（搜索式/级联，如用餐地点、景点项目、酒店名称、景点类型）：按显示文本搜索并选择
5. 匹配预览展示可匹配/未匹配/不支持自动填写的字段，帮助用户确认。

### 3.2 明确不做

本轮不做以下内容：

1. 不调用后端接口；所有操作在浏览器 DOM 层完成。
2. 不自动删除国际页已有多余卡片（只新增缺失卡片）。
3. 不保证所有卡片类型一次性完整支持。优先支持当前样本中出现的餐饮、酒店、景点、交通、自由活动/其他。
4. 不修改 baseInfoMerge / productImageText 适配器。
5. 复杂搜索式/级联下拉（景点项目关联、酒店名称精确匹配）优先按文本尽力匹配；匹配失败时标 failed 不阻塞流程，由用户手动选择。

这些非目标可以在后续迭代中逐步扩展。

---

## 4. 总体方案

采用页面专属适配器 + scoped handler：

```text
content/pages/tourdays/
├── adapter.js                  # PageRegistry 自注册；导出/字段映射/激活 handler
├── field-handlers/
│   └── itinerary-field.js    # FieldTypeRegistry scoped handler：全 role 填充（type=itineraryField）
└── utils/
    ├── day-parser.js           # 解析 day/card/textarea 结构
    └── card-builder.js         # 国际页补齐卡片结构
```

为了控制复杂度，允许第一版先把 utils 内联在 `adapter.js` / handler 中；若文件超过约 250 行，再拆出 utils。

---

## 5. 数据模型设计

行程描述页新增页面专属字段类型家族：`itineraryField`，按控件类型细分子 role。

### 5.1 字段类型设计

为保持与现有 FormFiller 契约一致，同时区分行程页专属定位，采用单一 fieldType `itineraryField`，通过 `meta.role` 区分子控件类型：

| meta.role | 控件类型 | 说明 |
|---|---|---|
| title | textarea | 当天标题 |
| note | textarea | 卡片补充说明 |
| text | input | 单行文本（接机/站地址、酒店名称等） |
| number | inputNumber | 行驶距离、行驶时间、活动时长等数字 |
| numberGroup | inputNumberGroup | 时分组合等 |
| radio | radio | 用车类型、当天用车、可服务时间段、时间段类型等 |
| checkbox | checkbox | 集合方式多选 |
| select | select | 景点类型、餐饮类型等普通下拉 |
| searchSelect | searchSelect | 用餐地点、景点项目、酒店名称等搜索下拉 |
| radioTime | radio + select 复合 | 交通/餐饮"时间"字段：radio（不限/全天/上午/下午/晚上/具体时间），选具体时间(value=-1)时展开两个 select（时/分）。导出 `{radio, time:[时,分]}` |

### 5.1.1 集合卡多套子表单（moduleBlock）

集合方式 checkbox 多选（集合点=1/上门接=2/接机站=3）时，每种选中方式展开一套独立子表单，由 `tripDescribe__td-card-module-title` 标题分隔：
- **设置集合点**（value=1）：集合地址(searchSelect) + 集合时间(timePicker) + 等待时长(inputNumberGroup)
- **设置上门接范围**（value=2）：上门范围(input) + 用车类型(radio) + 可服务时间段(radio+timePicker)
- **设置接机/站**（value=3）：接机/站地址(input) + 用车类型(radio) + 可服务时间段(radio+timePicker)

不同区块可能有同名字段（如多个"用车类型""可服务时间段"）。`_parseCardItems` 给每个顶层 form-item 标注 `moduleBlock`（前一个 module-title 文本）；`_buildCardItemField` 在同卡内 label 重复时，用 `moduleBlock` 作前缀去重 label（如"设置接机/站 用车类型"），单套时不加前缀保持兼容。itemIndex 仍是 DOM 顺序，导入时按 itemIndex 定位。

### 5.2 字段示例

补充说明 textarea：

```js
{
  label: '第2天 景点 3 补充说明',
  domKey: 'tourdays.day1.scenic.2.note',
  value: '<strong>...</strong>',
  fieldType: 'itineraryField',
  meta: {
    dayIndex: 1,
    role: 'note',
    cardKind: 'scenic',
    cardKindSource: '景点',
    occurrenceIndex: 2,
    itemIndex: 12,        // 卡片内 form-item 顺序
    isDayTitle: false
  }
}
```

当天标题：

```js
{
  label: '第2天 标题',
  domKey: 'tourdays.day1.title',
  value: '第比利斯...',
  fieldType: 'itineraryField',
  meta: { dayIndex: 1, role: 'title', cardKind: 'dayTitle', occurrenceIndex: 0, itemIndex: 0, isDayTitle: true }
}
```

普通下拉（景点类型）：

```js
{
  label: '第2天 景点 3 景点类型',
  domKey: 'tourdays.day1.scenic.2.select.9',
  value: { text: '无需门票' },
  fieldType: 'itineraryField',
  meta: { dayIndex: 1, role: 'select', cardKind: 'scenic', occurrenceIndex: 2, itemIndex: 9 }
}
```

单选（当天用车）：

```js
{
  label: '第2天 交通 1 当天用车',
  domKey: 'tourdays.day1.traffic.0.radio.1',
  value: 'B',
  fieldType: 'itineraryField',
  meta: { dayIndex: 1, role: 'radio', cardKind: 'traffic', occurrenceIndex: 0, itemIndex: 1 }
}
```

### 5.3 按天分组导出 JSON

```js
{
  version: '1.0',
  source: 'domestic',
  tab: 'tourdays',
  data: {
    '第1天': {
      '第1天 标题': itineraryField,
      '第1天 交通 1 当天用车': itineraryField,
      '第1天 交通 1 集合方式': itineraryField,
      '第1天 交通 1 接机/站地址': itineraryField,
      '第1天 交通 1 行驶距离': itineraryField,
      '第1天 交通 1 行驶时间': itineraryField,
      '第1天 交通 1 补充说明': itineraryField,
      '第1天 餐饮 1 餐饮类型': itineraryField,
      '第1天 餐饮 1 补充说明': itineraryField
    }
  }
}
```

### 5.4 字段过滤规则

导出时按以下规则过滤，避免导出大量空字段：

- 标题为空 → 不导出
- 补充说明为空 → 不导出
- input/inputNumber 值为空 → 不导出
- radio/checkbox：**只导出已选中项的 value**；全未选中 → 不导出（与 input 空值一致，不引入"空数组占位"死字段）
- select/searchSelect：选中值为空 → 不导出


---

## 6. 卡片类型识别

### 6.1 优先级

卡片类型识别必须避免只靠正文文本，因为正文可能误导。例如酒店补充说明正文可能不含“酒店”，但该卡片仍是酒店卡片。

识别优先级：

1. 卡片图标 class / 类型 class（如 `IconHotel`、`IconScene`、`IconTraffic`）。
2. 卡片标题/表单标签关键结构（如“住宿类型”、“景点类型”、“餐饮类型”、“行驶距离/行驶时间”）。
3. 新增按钮类型映射（导入补卡时已知要创建的类型）。
4. 文本关键词兜底。
5. 无法识别时归为 `other`。

### 6.2 类型映射

```js
const CARD_KIND_TO_ADD_BUTTON = {
  meal: '餐饮',
  hotel: '酒店',
  scenic: '景点',
  shopping: '购物',
  freeActivity: '自由活动',
  traffic: '交通',
  other: '其他',
  assembly: '集合',
  dismiss: '解散',
  flight: '机票',
  train: '火车',
  ship: '船',
  intermodal: '联运'
};
```

按钮选择器不要依赖完整动态 id 前缀，应使用后缀匹配：

```js
const selector = `[id$="project-select-${buttonName}"]`;
```

---

## 7. 导出流程

`tourdaysAdapter.extract()`：

> **提取路径（评审决议 1A）**：每个 form-item 统一调 `FormExtractor._extractFormItem(item)` 提取，再把结果包装为 `itineraryField` + meta。value 结构与现有 15 种字段类型一致，填充可复用 FormFiller 现有 `_fillSelect` 等，预览 `_getDisplayValue` 可统一处理。不为 textarea 单独写提取，避免数据模型分裂。

1. 遍历 `document.querySelectorAll('[id^="td-day-wrap-"]')`。
2. 按 id 解析 `dayIndex`。
3. 提取 day title textarea（标题 form-item，role=title）。
4. 遍历 day 内卡片：
   - 识别 `cardKind`；
   - 记录同类型 `occurrenceIndex`；
   - 遍历卡片的 `.ant-form-item`，按 `itemIndex` 记录，对每个 item 调 `FormExtractor._extractFormItem(item)`：
     - 据其返回的 fieldType 映射到 meta.role（textarea→note/title、input→text、inputNumber→number、inputNumberGroup→numberGroup、radio→radio、checkbox→checkbox、select→select、searchSelect→searchSelect）
     - 包装为 itineraryField 字段
5. 过滤空值（见 §5.4）。

输出：按“第 N 天”分组的 `itineraryField` 字段集合。

### 7.1 卡片内字段 role 列表（基于真实样本）

| cardKind | itemIndex | role | 控件 | 示例值 |
|---|---:|---|---|---|
| 交通(交通当日用车) | 1 | 当天用车 | radio(N/B/P) | B |
| 交通 | 2 | 集合方式 | checkbox(1/2/3) | [3] |
| 交通 | 3 | 接机/站地址 | text | 第比利斯国际机场 |
| 交通 | 4 | 用车类型 | radio(1/2) | 1 |
| 交通 | 5 | 可服务时间段 | radio+text | 0 |
| 交通/餐饮/酒店/景点通用 | · | 行驶距离 | number | 20.0 |
| 通用 | · | 行驶时间 | numberGroup | [0,40] |
| 通用 | · | 时间 | radio(N/D/M/A/E/-1)+text(时分) | -1, 08:00 |
| 餐饮 | · | 餐饮类型 | select/checkbox | 早餐 |
| 餐饮 | · | 成人是否含餐 | radio | 含 |
| 餐饮 | · | 儿童是否含餐 | radio | 不含 |
| 餐饮 | · | 用餐地点 | searchSelect | 第比利斯... |
| 餐饮 | · | 补充说明 | textarea | ... |
| 酒店 | · | 酒店来源 | radio | 自选 |
| 酒店 | · | 住宿类型 | select | 酒店 |
| 酒店 | · | 补充说明 | textarea | ... |
| 景点 | · | 景点类型 | select | 无需门票 |
| 景点 | · | 景点项目 | searchSelect | 第比利斯圣三一... |
| 景点 | · | 活动时长 | numberGroup | [1,0] |
| 景点 | · | 补充说明 | textarea | ... |

> 注：`itemIndex` 为卡片内 form-item 顺序索引，用于导入时位置匹配，不依赖 label 文本语义。


---

## 8. 导入前结构补齐

这是本页面的核心差异点，也是达成"两边卡片结构一致"目标的关键。

### 8.1 结构补齐目标

导入前，国际页每一天的卡片序列（数量**和顺序**）应与国内导出结构一致：

```text
导入数据第2天序列：[餐饮, 景点, 景点, 交通, 餐饮, 餐饮]
国际页面第2天初始：[餐饮, 餐饮, 餐饮, 酒店]（模板自带）
补齐后：按导入序列顺序逐个对齐——
  位置0 餐饮：国际已有餐饮，复用
  位置1 景点：国际无，在该位置插入景点
  位置2 景点：国际无，插入景点
  位置3 交通：插入交通
  位置4 餐饮：国际已有餐饮，复用
  位置5 餐饮：复用
  多余的酒店卡片保留不动（不删除）
```

> **顺序补齐（评审决议 1A）**：不只补数量，要保证两边同类型同序号卡片在视觉位置上一致，避免"内容对、位置错"。

### 8.2 补齐算法

`ensureDayStructure(dayIndex, sourceCards)`：

1. 取国内导出该 day 的卡片序列（已含 cardKind + occurrenceIndex）。
2. 解析国际页该 day 当前卡片序列。
3. 按国内序列顺序逐个对齐：
   - 维护国际页卡片游标，对国内序列每个位置 i：
     - 若国际页对应位置已有同 cardKind 卡片 → 复用，游标前进；
     - 否则 → 在该位置插入新卡片（见 §8.3），等待 DOM。
4. 全部对齐后重新解析页面字段映射。

伪代码：

```js
async function ensureDayStructure(dayIndex, sourceCards) {
  let intlCards = parseIntlDayCards(dayIndex);
  let intlIdx = 0;
  for (let i = 0; i < sourceCards.length; i++) {
    const src = sourceCards[i];
    // 跳过国际页多余的前置卡片（不删除，只推进游标找下一个同类型）
    while (intlIdx < intlCards.length && intlCards[intlIdx].cardKind !== src.cardKind) {
      intlIdx++;
    }
    if (intlIdx < intlCards.length) {
      intlIdx++; // 复用已有
    } else {
      // 该位置缺卡片，用第 i 个 add-box 插入
      await addCardAt(dayIndex, i, src.cardKind);
      await waitForCardCount(dayIndex, src.cardKind, countNow + 1);
      intlCards = parseIntlDayCards(dayIndex); // 重新解析
      intlIdx++;
    }
  }
}
```

> 注：游标推进策略需在实际页面上验证——若国际页卡片顺序与国内差异大，复用判断要更宽松。首版以"同类型 occurrenceIndex 对齐"为准。

### 8.3 点击项目按钮补卡

`_addCardAt(dayEl, position, cardKind)`：

> **插入位置选择（评审决议 2A）**：card-list 内 add-box 与 card 严格交替（add-box, card, add-box, card, ..., add-box）。第 `position` 个 add-box（0-indexed）位于 card `position` 之前。

> **真实交互（用户确认）**：补卡不是"先点加号展开菜单再点项目"，而是**直接点击 add-box 内的 project-select 项目按钮**即可触发 React onClick 在该位置插入新卡片。项目按钮始终存在于 DOM 中（13 种全量），无需先点加号。原方案"点击 add-plus-btn 展开菜单"是错误假设，已修正。

1. 取 day 元素 `#td-day-wrap-${dayIndex}`。
2. 取 card-list 直接子元素的第 `position` 个 `.tripDescribe__td-add-box--*`。
3. 在**该 add-box 内**找 `[id$="project-select-${buttonName}"]`（限定范围，避免重复 id 误选）。
4. 直接 `mousedown → mouseup → click` 触发 React onClick（不先点加号）。
5. 条件等待该类型卡片数量 +1（`_waitForCardCount`，不用固定 sleep）。

对齐策略（`_ensureDayStructure`，按国内序列顺序推进 `intlCursor`）：
- 对国内序列每个位置 i，扫描国际页从 `intlCursor` 起的卡片找第一张同 cardKind 的；
- 命中 → 复用，`intlCursor` 前进到它之后；
- 未命中 → 在 `intlCursor` 对应的 add-box 插入新卡片，等待渲染后 `intlCursor` +1。
- 国际页多余卡片保留不动（不删除，决议 §3.2）。

注意：
- 多个 add box 内存在重复 id（同 day 多次出现 `project-select-餐饮`），查询必须限定在当前 add box 内。
- 补卡后 React 会新增 card 和 add-box，下次定位必须重新解析，不能缓存。
- 补卡阶段应复用 `fillAll` 的 onProgress 给用户进度反馈（如"正在补齐第 N 天卡片..."）。

---

## 9. 填充流程

`tourdaysAdapter.activate()` 注册 scoped handler：

```js
FieldTypeRegistry.registerScoped('itineraryField', itineraryFieldHandler);
```

> **命名约定（评审决议 3A）**：handler 文件 `field-handlers/itinerary-field.js`，type `itineraryField`，设值函数（fillTextarea/fillInput 等）提到 handler 对象或共享 utils 可复用，避免下个 PR 改两遍。

> **补卡时序契约（评审决议 2A）**：补卡在 `fillAll` 逐字段填充前批量执行（day 粒度 `ensureAllStructure(data)`），补完再逐字段 fill。不在每字段 fill 时触发补卡，避免 DOM 异步渲染导致的定位竞态。需在 panel.js 确认填写后、逐字段 fill 前调用此钩子。

handler 契约（按 meta.role 分发）：

```js
const itineraryFieldHandler = {
  type: 'itineraryField',
  detect() { return false; }, // 不参与通用 _extractFormItem 遍历
  async fill(field, ctx) {
    // 阶段 D：补卡已在 fillAll 前批量完成，此处只定位+填充
    const target = tourdaysAdapter.findElementByMeta(field.meta);
    if (!target) throw new Error(`未找到行程描述目标: ${describeMeta(field.meta)}`);

    switch (field.meta.role) {
      case 'title':
      case 'note':
        return fillTextarea(target, field.value);
      case 'text':
      case 'number':
        return fillInput(target, field.value);
      case 'numberGroup':
        return fillInputNumberGroup(target, field.value);
      case 'radio':
        return fillRadio(target, field.value);          // 按 value 点击
      case 'checkbox':
        return fillCheckbox(target, field.value);        // value 数组逐个点击
      case 'select':
        return fillSelect(target, field.value, ctx);     // 文本匹配，复用 AntD1Filler/ReactFiller
      case 'searchSelect':
        return fillSearchSelect(target, field.value, ctx);
      default:
        throw new Error(`不支持的 role: ${field.meta.role}`);
    }
  }
};
```

### 9.1 各控件填充实现要点

- **textarea / input**：React 原生 setter + input/change/blur 事件（标题、补充说明、接机地址、行驶距离、活动时长）。
- **radio**：在 form-item 内找 `input[type=radio][value=field.value]`，先 mousedown 再 click（兼容 AntD），单选只点击一个。
- **checkbox**：field.value 为数组，逐个找 `input[type=checkbox][value=v]` 并 click；目标页已选但源未选的项可不动（保守不取消）。
- **select（普通下拉）**：复用现有 FormFiller `_fillSelect` / AntD1Filler.fillSelect：展开、按 selected-value 文本匹配下拉项、点击。
- **searchSelect**：复用 FormFiller `_fillSearchSelect`：聚焦搜索框、输入文本、等待下拉、点匹配项。景点项目/用餐地点/酒店名称这类需此路径，可能匹配失败，failed 不阻塞。
- **numberGroup**：按 order 分别填多个 .ant-input-number-input。

### 9.2 定位目标元素

`findElementByMeta(meta)`：

1. `meta.isDayTitle || role==='title'` → 返回标题 textarea。
2. 否则按 `dayIndex + cardKind + occurrenceIndex` 定位卡片，再按 `itemIndex` 取卡片内第 N 个 `.ant-form-item`，根据 role 返回该 form-item 内主控件（textarea/input/radio组/select）。


---

## 10. 匹配预览

`tourdaysAdapter.extractFieldMap()` 使用与导出相同的 day/card/textarea 解析逻辑，但不要求当前值非空。

字段 key 与导出保持一致：

- `第1天 标题`
- `第1天 餐饮 1 补充说明`
- `第2天 景点 3 补充说明`

匹配预览分两步：

1. 初次预览：显示当前页面已有结构能匹配哪些字段，缺少卡片的字段显示未匹配。
2. 确认填写后：handler 先补齐结构，再填入内容。

可选增强：在匹配预览前就执行一次 dry-run 的结构补齐提示，告诉用户“将新增 X 张卡片”。首版可先只在确认填写时补齐，减少预览阶段副作用。

---

## 11. 错误处理

1. day 容器不存在：该 day 的字段记 failed，reason：`未找到第 N 天容器`。
2. add box 不存在：该卡片字段记 failed，reason：`无法新增 <类型> 卡片`。
3. 项目按钮不存在：记 failed，reason：`目标页不支持 <类型> 卡片`。
4. 新增后超时：记 failed，reason：`新增 <类型> 卡片超时`。
5. 目标控件定位失败：记 failed，reason：`未找到第 N 天 <类型> 第 M 个 <role>`。
6. radio/checkbox 目标项不存在：记 failed，reason：`<role> 选项不存在: <value>`。
7. select/searchSelect 选项匹配失败：记 failed，reason：`<role> 未匹配选项: <text>`；不阻塞其余字段，用户可手动选择。
8. 单个字段失败不阻塞其他字段，统一由 `_fillField()` 的 Registry try-catch 记入 `results`。

实现上 handler 内部可抛带清晰 message 的 Error。

---

## 12. 测试计划

### 12.1 自动化测试

Jest 测试文件（父目录 `vtrip/test/snapshots/`）：

- `tourdays-adapter-test.js` — 导出/字段映射解析
- `itinerary-field-handler-test.js` — handler 各 role 填充

> **测试范围（评审决议 4A）**：自动化覆盖 7 条可测路径（导出全字段/findElementByMeta 定位/text/number/numberGroup/radio/checkbox/select 文本匹配）；补卡 ensureAllStructure 与 searchSelect 异步下拉因 jsdom 无法模拟点击后 React 渲染，只测选择器与参数构造，完整流程靠手动回归。

测试内容：

1. 用 `docs/国内行程描述tab.html` 验证导出：
   - 识别 10 个 day 容器；
   - 提取前 3 天标题；
   - 提取每张卡片的全部 form-item 字段（不只 textarea）；
   - 验证交通卡片含 radio（当天用车）、checkbox（集合方式）、text（接机地址）、number（行驶距离）、numberGroup（行驶时间）；
   - radio/checkbox 全未选时不导出；
   - 字段 label/meta/itemIndex 稳定。
2. 用 `docs/国际行程描述tab.html` 验证字段映射：
   - 能识别前 3 天标题 textarea；
   - 能识别每天已有 3 个餐饮 + 1 个酒店卡片及其 form-item；
   - 空值也返回字段映射（用于预览对齐）。
3. handler 单元测试（合成 fixture）：
   - title/note role：定位 textarea 并设值、触发 input/change/blur；
   - text/number role：定位 input 并设值；
   - numberGroup role：按序填多个 inputNumber；
   - radio role：按 value 点击目标 radio 项；
   - checkbox role：按 value 数组点击多项；
   - select role：展开下拉并按文本匹配选项（含简繁归一化）；
   - 缺失目标时抛清晰错误，不抛原始 TypeError。
4. 补卡选择器测试（合成 fixture，不验证点击后渲染）：
   - 能定位第 i 个 add-box；
   - 能在 add-box 内找到 `[id$="project-select-<类型>"]`；
   - ensureDayStructure 伪代码的游标推进逻辑（用 mock 的 addCardAt 验证调用序列）。

由于 jsdom 无法真实验证点击后 React 动态新增卡片，`addCardAt()` / `ensureDayStructure()` 的完整渲染流程以浏览器手动回归为准；自动化只测试选择器、定位逻辑、设值事件与游标算法。

### 12.2 手动回归

1. 重新加载扩展并关闭重开 tourdays 国内页。
2. 国内页导出：确认 JSON 包含 `tab: 'tourdays'`、按天分组、字段数量符合页面内容（含 input/select/radio 等，不止 textarea）。
3. 国际页导入：粘贴 JSON → 转换预览 → 匹配预览。
4. 确认填写：观察国际页按需新增景点/交通/餐饮/酒店等卡片。
5. 检查文本与控件：标题、补充说明、行驶距离、用车类型、餐饮类型等写入正确。
6. 保存页面，确认内容不丢失。
7. 回归 baseInfoMerge / productImageText。

---

## 13. 实施步骤建议

> **本轮实施范围（评审决议 5A）**：一次性做完整——补卡(D) + 全字段导出(A2) + 全 role 填充(C 余下)。不再分步推迟，以达成"先卡片一致再内容同步"的完整目标。

### 阶段 A：只读解析与导出（textarea）

- 新建 `content/pages/tourdays/adapter.js`。
- 实现 day/card/textarea 解析。
- 实现 `extract()`。
- 加 manifest adapter 脚本。
- 加导出结构测试。

验收：国内页导出 JSON 结构正确。✅ 已完成

### 阶段 B：字段映射与预览

- 实现 `extractFieldMap()`。
- 匹配预览能显示国际页已有字段。
- 缺失字段明确显示未匹配。

验收：匹配预览不崩溃，已有字段能匹配。✅ 已完成（textarea 维度）

### 阶段 A2：全字段导出扩展

- 在 `_parseDayCards` 中遍历卡片全部 `.ant-form-item`，按 `itemIndex` 记录。
- 统一调 `FormExtractor._extractFormItem` 提取，映射 fieldType→meta.role。
- radio/checkbox 全未选不导出。
- 扩展测试覆盖交通/餐饮/景点卡片的非 textarea 字段。

验收：导出 JSON 含每张卡片的完整 form-item 字段。⏳ 本轮实施

### 阶段 C：Registry handler 全 role 填充

- 新建/扩展 `field-handlers/itinerary-field.js`（type 统一为 `itineraryField`）。
- `activate()` 注册 scoped handler。
- 实现 title/note/text/number/numberGroup/radio/checkbox/select 各 role 填充。
- searchSelect 复用 FormFiller 现有逻辑，匹配失败标 failed。
- 设值函数提到可复用位置。

验收：国际页已有控件能按 role 填入。⏳ 本轮实施（title/note 已完成，其余 role 本轮补齐）

### 阶段 D：导入前补齐卡片

- 实现 `ensureAllStructure(data)` / `ensureDayStructure()` / `addCardAt()`。
- 按国内序列顺序逐个补齐（决议 1A），用第 i 个 add-box 定位插入（决议 2A）。
- 在 panel.js 确认填写后、fillAll 前批量调用（决议 2A 时序）。
- 先支持当前样本高频类型：`meal`、`hotel`、`scenic`、`traffic`、`freeActivity`、`other`。
- 逐步扩展 shopping/assembly/dismiss/flight/train/ship/intermodal。

验收：导入前国际页卡片结构与国内一致，再按全 role 填入。⏳ 本轮实施

---

## 14. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 动态 class 带 hash | 选择器不稳定 | 用 class 前缀/包含选择器，如 `[class*="td-add-box"]` |
| 重复 id | 全局选择器选错按钮 | 限定在当前 add box 内查询 `[id$="project-select-餐饮"]` |
| 新增卡片异步渲染 | 填充时找不到控件 | 使用条件等待 `waitForCardCount`，不用固定 sleep |
| 卡片类型误判 | 填错卡片 | 图标/class/结构优先，正文关键词只兜底 |
| 国际页模板已有多余卡片 | 顺序错位 | 不删除多余卡片；按同类型 occurrenceIndex 匹配 |
| 部分类型未支持 | 字段失败 | 清晰失败 reason，不阻塞其他字段 |
| 控件无稳定 id | 无法用 domKey 定位 | 按 `dayIndex+cardKind+occurrenceIndex+itemIndex` 位置定位 |
| 简繁选项文本差异 | select 匹配失败 | 文本匹配时做简繁归一化（参考 import.js 现有简繁映射） |
| radio/checkbox value 为内部码 | 无法按语义选择 | 直接按 value 点击；value 跨版本一致即可 |
| searchSelect 候选项异步 | 选择超时 | 条件等待 + 超时标 failed，不阻塞 |

---

## 15. 结论

行程描述页需要页面专属适配器，不适合复用通用 `_extractFormItem`。推荐实现路径是：

1. 把国内页导出为按天/按卡片类型/按 form-item 位置组织的结构化 `itineraryField` 字段集合，覆盖 textarea + input/radio/checkbox/inputNumber/select 等全部控件。
2. 国际页导入时先根据该结构自动新增缺失卡片（阶段 D）。
3. 再用 scoped handler 根据 `dayIndex + cardKind + occurrenceIndex + itemIndex + role` 定位并填入对应控件。

该方案既满足“先构成和国内页面一样的卡片结构后再导入”的要求，又保持在新页面目录内物理隔离，符合当前架构重构后的扩展范式。

### 当前实施状态

- 阶段 A（textarea 导出）：✅ 已完成
- 阶段 B（字段映射预览，textarea 维度）：✅ 已完成
- 阶段 A2（全字段导出）：✅ 已完成（统一调 `FormExtractor._extractFormItem`，radio/checkbox 覆盖提取选中项 value，顶层 form-item 避免 inputNumberGroup 嵌套重复计数）
- 阶段 C（全 role 填充）：✅ 已完成（handler 文件 `itinerary-field.js`，type 统一为 `itineraryField`，title/note/text/number/numberGroup/radio/checkbox/select/searchSelect 全 role，复用 FormFiller 设值能力）
- 阶段 D（导入前补齐卡片，顺序对齐）：✅ 已完成（`ensureAllStructure` 在 panel.js 确认填写后、fillAll 前批量调用，按第 i 个 add-box 定位插入；jsdom 无法验证点击后渲染，完整流程靠浏览器手动回归）

> 评审决议汇总：1A 顺序补齐 / 2A 第 i 个 add-box 定位 / 3A radio/checkbox 全未选不导出 / 4A 可测路径全覆盖测试 / 5A 一次性完整实施

### 实施补充说明（与样本验证差异）

- **卡片类型识别**：样本证实图标容器 class 形态为 `tripDescribe__Icon{Type}`（Traffic/Hotel/Scene/Meal/Other...），餐饮另用 span `tripDescribe__icon-meal`；集合/解散无图标 class，用卡片标题文本兜底。原方案 §6.1 的 `IconHotel` 正则方向正确，已落实为图标容器 class 优先 + 标题文本兜底。
- **form-item 嵌套**：行驶时间/用餐时长/活动时长 等 inputNumberGroup 的子 form-item 会被 `querySelectorAll('.ant-form-item')` 重复计数，实现只取顶层 form-item（`parentElement.closest('.ant-form-item')` 为空者）。
- **fieldType 统一为 `itineraryField`**（决议 3A），按 `meta.role` 分发；早期实现曾用 `itineraryTextarea`，已全部迁移并删除旧文件。
- **补卡真实交互修正**：原方案 §8.3 假设"先点 add-plus-btn 展开菜单再点项目按钮"，经用户确认实际是**直接点击 add-box 内的 project-select 项目按钮**即触发 React onClick 在该位置插入卡片（项目按钮始终在 DOM 中，无需先点加号）。`_addCardAt` 已改为直接 `mousedown→mouseup→click` 项目按钮，失败兜底先点加号展开再点。对齐用 `intlCursor` 游标推进（复用同类型已有卡片，缺失则在该位置插入），已用真实样本模拟验证产出顺序与国内源一致。
- **多余默认模板卡清理**：国际版每天预置空模板卡（如餐饮×3+酒店），补齐+填写后会残留多余空卡。新增 `cleanupExcessCards`（fillAll 后调用）：对每天每类型，超出源序列期望数量的尾部空卡（`_isCardEmpty` 判定无已填值）点击其"删除"按钮移除；有内容的卡保留。避免残留多余空卡，也避免误删用户已有内容。
- **条件渲染字段重试定位**：集合卡片勾选"接机/站"(checkbox value=3) 后才动态渲染"接机/站地址/用车类型/可服务时间段"子项，handler 按 itemIndex 顺序填写时这些控件可能尚未出现。`fill` 改为 `findElementByMeta` 返回 null 时按 300/600/1000ms 退避重试，等待条件渲染。
- **number/numberGroup/input 写入可靠性**：`ant-input-number`/`input` 是 React 受控组件，`fillSingleInputNumber`/`fillInput` 改为 **ReactFiller 预热 + 始终原生 setter + input/change/blur** 双保险：先调 ReactFiller.fillInputNumber（直接触发 onChange 更新 React 状态），再用原生 setter 设 DOM 值并 dispatch input/change/blur（触发 React 合成 onChange），确保 React 状态与 DOM 一致。修复行驶时间/活动时长/接机/站地址等写入失败。
- **window.FormFiller 暴露**：原 form-filler.js 仅 `const FormFiller` 未挂 window，导致 tourdays itineraryField handler 的 `window.FormFiller._fillPlainSelectByElement` 报"不可用"。已加 `window.FormFiller = FormFiller`，select/searchSelect 复用 FormFiller 设值方法。
- **itineraryField 预览回写保护**：panel `_collectPreviewEdits` 原只跳过老复合类型（inputNumberGroup 等），itineraryField 的 numberGroup 值对象被预览输入框字符串覆盖（导致 verify "期望 {"）。已把 `itineraryField` 加入跳过列表；`_getDisplayValue` 增加 itineraryField 按 meta.role 取显示值分支，避免对象被 JSON.stringify。
- **卡片标题读取修正**：`_readCardTitle` 原用 `[class*="card-title--"]` 会误命中 `card-title-icon`（图标容器，无文本），导致集合等无 Icon* 类的卡片读不到标题 → 识别成 other → 补卡后 findElementByMeta 找不到。改为优先 `[class*="card-title-flex"]`，兜底 `[class*="card-title--"]` 且跳过 `card-title-icon`。`_titleToKind` 补 `集結/集结/解散` 繁体兼容。
