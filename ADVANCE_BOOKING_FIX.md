# 提前预订控件优化说明

> 优化时间：2026-06-15
> 优化范围：form-extractor.js

---

## 问题描述

**现象**：
导出"提前预订"字段时，除了控件数据外，还提取了末尾的长段说明文本：

```json
{
  "提前预订": {
    "value": {
      "parts": [
        { "type": "inputNumber", "value": 2 },
        { "type": "separator", "text": "天" },
        { "type": "timePicker", "value": "18:00" },
        { "type": "separator", "text": "前可订" },
        { "type": "separator", "text": "假设今天为6月1号，设置提前2天，18：00前可订，则表示客人在今天18:00前可以预订到6月3号出发的产品..." }
      ]
    }
  }
}
```

**问题**：
- ❌ 导出数据包含了 `publicTip` 说明文本（100+ 字符）
- ❌ 导入时会尝试将这段说明文本也填入表单
- ❌ 增加了不必要的翻译成本

**需求**：
只提取**控件数据**及其**紧邻的分隔符**，格式应为：`X天` + `HH:MM` + `前可订`（4个部分）

---

## 优化方案

### 1. 跳过说明性元素

**新增方法**：`_isDescriptionElement()`

识别并跳过以下说明性元素：
- 包含 `publicTip`、`tip`、`hint`、`help`、`description`、`note` 类名的元素
- 不包含表单控件且文本长度超过 20 字符的 div 元素

```javascript
_isDescriptionElement(element) {
  // 检查常见的说明性类名
  const descriptionClasses = ['publicTip', 'tip', 'hint', 'help', 'description', 'note'];
  for (const cls of descriptionClasses) {
    if (element.classList.contains(cls)) return true;
  }

  // 检查是否为纯文本展示的 div（通常是说明文字）
  if (element.tagName === 'DIV') {
    const hasFormControl = element.querySelector('.ant-input, .ant-select, .ant-input-number, .ant-time-picker, textarea');
    if (!hasFormControl) {
      const text = element.textContent.trim();
      // 长文本且不是简单的分隔符
      if (text.length > 20 && !['天', '晚', '周岁', '前可订', '-'].includes(text)) {
        return true;
      }
    }
  }

  return false;
}
```

### 2. 更新 _walkChildren 方法

添加 `skipDescriptions` 参数，在混合控件组提取时启用：

```javascript
_walkChildren(container, parts, skipDescriptions = false) {
  // ...
  
  // 跳过说明性元素（如 publicTip、提示文本等）
  if (skipDescriptions && this._isDescriptionElement(node)) continue;
  
  // ...
}
```

### 3. 优化 _extractMixedGroup 方法

**策略**：提取完成后，过滤掉最后一个控件之后的多余 separator

```javascript
_extractMixedGroup(labelFor, labelText, controlWrapper) {
  const children = controlWrapper.querySelector('.ant-form-item-children') || controlWrapper;
  const parts = [];
  this._walkChildren(children, parts, true); // 启用跳过说明性元素

  // 过滤逻辑：只保留控件及其紧邻的分隔符
  const filtered = [];
  let lastControlIndex = -1;

  // 找到最后一个控件的索引
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].type !== 'separator') {
      lastControlIndex = i;
      break;
    }
  }

  // 保留到最后一个控件后的第一个 separator
  let separatorsAfterLastControl = 0;
  for (let i = 0; i <= lastControlIndex + 1 && i < parts.length; i++) {
    if (i > lastControlIndex && parts[i].type === 'separator') {
      separatorsAfterLastControl++;
      if (separatorsAfterLastControl > 1) break; // 只保留一个
    }
    filtered.push(parts[i]);
  }

  return {
    domKey: labelFor,
    label: labelText,
    value: { parts: filtered },
    fieldType: 'mixedGroup'
  };
}
```

---

## 优化效果

### 优化前

```json
{
  "提前预订": {
    "value": {
      "parts": [
        { "type": "inputNumber", "value": 2 },
        { "type": "separator", "text": "天" },
        { "type": "timePicker", "value": "18:00" },
        { "type": "separator", "text": "前可订" },
        { "type": "separator", "text": "假设今天为6月1号，设置提前2天，18：00前可订，则表示客人在今天18:00前可以预订到6月3号出发的产品，在今天18:00后能订到6月4号出发的产品。若客人预订时的时区和设置时区不同，系统会自动转换。由携程大数据统计，客户下单时间高峰时间为晚上，建议设置较晚预订时间点，如22:00。" }
      ]
    }
  }
}
```

**问题**：
- 包含 149 字符的说明文本
- 翻译成本：~30 tokens
- 导入时会尝试填写这段说明文本

### 优化后

```json
{
  "提前预订": {
    "value": {
      "parts": [
        { "type": "inputNumber", "value": 2 },
        { "type": "separator", "text": "天" },
        { "type": "timePicker", "value": "18:00" },
        { "type": "separator", "text": "前可订" }
      ]
    }
  }
}
```

**改进**：
- ✅ 只包含 4 个部分（2 个控件 + 2 个分隔符）
- ✅ 数据干净，易于导入
- ✅ 节省翻译成本
- ✅ 格式统一：`X天` + `HH:MM` + `前可订`

---

## 导入行为

### 填写逻辑（form-filler.js）

无需修改，现有的 `_fillMixedGroup()` 方法已支持：

1. **按 parts 顺序匹配 DOM 控件**
2. **跳过 separator 类型**（只读取其 text，不填写）
3. **填写控件值**：
   - `inputNumber` → 使用 nativeSetter 设置 value
   - `timePicker` → 使用 nativeSetter 设置 value

### 示例流程

**导出数据**：
```json
{
  "parts": [
    { "type": "inputNumber", "value": 2 },
    { "type": "separator", "text": "天" },
    { "type": "timePicker", "value": "18:00" },
    { "type": "separator", "text": "前可订" }
  ]
}
```

**填写步骤**：
1. 收集 form-item 中所有控件（按 DOM 顺序）
2. 过滤出可见控件：`[inputNumber, timePicker]`
3. 从 parts 中过滤出值控件：`[inputNumber(2), timePicker(18:00)]`
4. 逐个匹配并填写：
   - inputNumber ← 2
   - timePicker ← 18:00
5. 跳过 separator（不填写）

---

## 测试验证

### 测试页面

已创建 `test-advance-booking.html`，包含完整的提前预订控件结构：
- 隐藏的时区选择器（应被跳过）
- 天数输入框
- 时间选择器
- publicTip 说明文本（应被跳过）

### 测试步骤

1. 在 Chrome 中打开 `test-advance-booking.html`
2. 确保插件已加载
3. 点击"导出产品数据"按钮
4. 检查导出的 JSON：
   ```json
   {
     "提前预订": {
       "value": {
         "parts": [
           { "type": "inputNumber", "value": 2 },
           { "type": "separator", "text": "天" },
           { "type": "timePicker", "value": "18:00" },
           { "type": "separator", "text": "前可订" }
         ]
       }
     }
   }
   ```
5. ✅ 确认只有 4 个 parts
6. ✅ 确认没有 publicTip 文本

### 导入测试

1. 切换到国际版页面
2. 点击"导入产品数据"，粘贴导出的 JSON
3. 点击"解析并转换"
4. 检查"转换预览"中"提前预订"字段：
   - 显示值：`2天 18:00 前可订`（拼接后的格式）
   - 无长段说明文本
5. 点击"匹配预览" → "确认填写"
6. 检查回读验证：
   - inputNumber 控件值：2
   - timePicker 控件值：18:00

---

## 影响范围

### 修改的文件

- `content/form-extractor.js`
  - `_extractMixedGroup()` - 添加过滤逻辑
  - `_walkChildren()` - 添加 skipDescriptions 参数
  - `_isDescriptionElement()` - 新增方法

### 影响的字段类型

- ✅ `mixedGroup` - 混合控件组（如提前预订）
- ❌ `inputNumberGroup` - 不影响（无说明文本）
- ❌ `selectGroup` - 不影响（无说明文本）
- ❌ 其他字段类型 - 不影响

### 兼容性

- ✅ 向后兼容：旧数据中包含长 separator 时，导入仍正常工作（只是会被忽略）
- ✅ 不影响其他字段类型的提取
- ✅ 填写逻辑无需修改

---

## 边界情况

### 1. 没有说明文本的混合控件

如果混合控件本身就没有说明文本，优化后行为不变：

```html
<div class="ant-form-item-children">
  <input type="number" value="3">
  <span>天</span>
  <input type="number" value="2">
  <span>晚</span>
</div>
```

**导出结果**：
```json
{
  "parts": [
    { "type": "inputNumber", "value": 3 },
    { "type": "separator", "text": "天" },
    { "type": "inputNumber", "value": 2 },
    { "type": "separator", "text": "晚" }
  ]
}
```

### 2. 多个说明性 div

如果有多个说明性 div，全部跳过：

```html
<div class="ant-form-item-children">
  <input type="number" value="2">
  <span>天</span>
  <div class="tip">提示1</div>
  <div class="publicTip">提示2</div>
</div>
```

**导出结果**：
```json
{
  "parts": [
    { "type": "inputNumber", "value": 2 },
    { "type": "separator", "text": "天" }
  ]
}
```

### 3. 短分隔符

短分隔符（≤20 字符）不会被误判为说明文本：

```html
<span style="margin-left: 4px;">前可订</span>
```

**导出结果**：正常提取为 separator

---

## 后续建议

1. **通用化**
   - 可以为所有字段类型启用 `skipDescriptions`，不仅限于 mixedGroup
   - 统一过滤说明性元素

2. **配置化**
   - 允许用户配置哪些类名应被视为说明性元素
   - 允许用户配置是否保留说明文本

3. **日志增强**
   - 在跳过说明性元素时，console.log 记录被跳过的文本
   - 方便调试时查看哪些内容被过滤

---

*本次优化确保提前预订字段只导出必要的控件数据，去除冗余的说明文本，提升数据质量和导入效率。*
