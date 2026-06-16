# 控件组合导出/导入修复说明

> 修复时间：2026-06-15
> 修复范围：form-extractor.js、form-filler.js

---

## 修复的问题

### 1. **隐藏控件被错误导出**
**问题**：提前预订字段中包含一个 `class="nodisplay"` 的隐藏时区选择器，该选择器被错误地提取到导出数据中。

**示例 HTML**：
```html
<div class="nodisplay ant-select">
  <div class="ant-select-selection-selected-value">(UTC+08:00)北京时间</div>
</div>
```

**修复方案**：
- 在 `_walkChildren()` 方法中添加隐藏元素检测
- 新增 `_isHidden()` 方法，检查 `nodisplay` 类、`display: none`、`visibility: hidden`
- 在 `_collectDomControls()` 中同样应用隐藏检测

**代码变更**：
```javascript
// form-extractor.js
_walkChildren(container, parts) {
  // ...
  if (this._isHidden(node)) continue;  // 新增：跳过隐藏控件
  // ...
}

_isHidden(element) {
  if (element.classList.contains('nodisplay')) return true;
  const style = window.getComputedStyle(element);
  if (style.display === 'none') return true;
  if (style.visibility === 'hidden') return true;
  return false;
}
```

---

### 2. **selectGroup 类型丢失分隔符信息**
**问题**：儿童年龄字段（两个下拉框 + 分隔文本）只提取了 `values` 数组，丢失了分隔符 `-` 和 `周岁（不含）`。

**旧结构**：
```json
{
  "fieldType": "selectGroup",
  "value": { "values": ["2", "12"] }
}
```

**新结构**：
```json
{
  "fieldType": "selectGroup",
  "value": {
    "values": ["2", "12"],
    "separators": ["-", "周岁（不含）"]
  }
}
```

**修复方案**：
- 将 `_extractSelectGroup()` 改为使用 `_walkChildren()` 提取完整结构
- 与 `inputNumberGroup` 保持一致的数据格式
- 在 `_getDisplayValue()` 中正确拼接 values 和 separators

**代码变更**：
```javascript
// form-extractor.js
_extractSelectGroup(labelFor, labelText, controlWrapper, plainSelects) {
  const children = controlWrapper.querySelector('.ant-form-item-children') || controlWrapper;
  const parts = [];
  this._walkChildren(children, parts);  // 使用 walk 提取完整结构

  const values = parts.filter(p => p.type === 'select').map(p => p.text);
  const separators = parts.filter(p => p.type === 'separator').map(p => p.text);

  return {
    domKey: labelFor,
    label: labelText,
    value: { values, separators },  // 包含 separators
    fieldType: 'selectGroup'
  };
}
```

---

### 3. **selectGroup 显示值格式不一致**
**问题**：`_getDisplayValue()` 中 `selectGroup` 只是简单用 `-` 连接，没有使用实际的 `separators`。

**旧代码**：
```javascript
if (field.fieldType === 'selectGroup' && field.value.values) {
  return field.value.values.join(' - ');  // 硬编码分隔符
}
```

**新代码**：
```javascript
if (field.fieldType === 'selectGroup' && field.value.values) {
  const vals = field.value.values;
  const seps = field.value.separators || [];
  let display = '';
  vals.forEach((v, i) => {
    display += (v !== null && v !== undefined ? v : '');
    if (i < seps.length) display += seps[i];
  });
  return display;
}
```

**效果对比**：
- 旧：`2 - 12`（固定格式）
- 新：`2-12周岁（不含）`（原始格式）

---

### 4. **form-filler.js 中缺少隐藏控件过滤**
**问题**：填写 `selectGroup` 时，没有过滤隐藏的下拉框，导致索引错位。

**修复方案**：
- `_fillSelectGroup()` 中添加 `_isHidden()` 检测
- `_collectDomControls()` 中跳过隐藏控件
- `_formatValueForDisplay()` 中支持 `separators` 拼接

**代码变更**：
```javascript
// form-filler.js
async _fillSelectGroup(domKey, value) {
  // ...
  const plainSelects = Array.from(formItem.querySelectorAll('.ant-select')).filter(sel => {
    if (this._isHidden(sel)) return false;  // 新增：过滤隐藏控件
    return !sel.querySelector('input.ant-select-search__field[id]');
  });
  // ...
}

_formatValueForDisplay(value) {
  // ...
  if (value.values && value.separators) {  // 新增：支持 separators
    const vals = value.values;
    const seps = value.separators;
    let display = '';
    vals.forEach((v, i) => {
      display += (v !== null && v !== undefined ? v : '');
      if (i < seps.length) display += seps[i];
    });
    return display;
  }
  // ...
}
```

---

## 测试验证

### 测试页面
已创建 `test-mixed-controls.html`，包含三个典型场景：

1. **提前预订**（mixedGroup）
   - 隐藏时区选择器（应被跳过）
   - 可见天数输入框
   - 时间选择器

2. **儿童年龄**（selectGroup）
   - 两个下拉框
   - 分隔符：`-` 和 `周岁（不含）`

3. **行程天数**（inputNumberGroup）
   - 两个数字输入框
   - 分隔符：`天` 和 `晚`

### 预期导出结果

```json
{
  "预订设置": {
    "提前预订": {
      "fieldType": "mixedGroup",
      "value": {
        "parts": [
          { "type": "inputNumber", "value": 1 },
          { "type": "separator", "text": "天" },
          { "type": "timePicker", "value": "18:00" },
          { "type": "separator", "text": "前可订" }
        ]
      }
    },
    "儿童年龄": {
      "fieldType": "selectGroup",
      "value": {
        "values": ["2", "12"],
        "separators": ["-", "周岁（不含）"]
      }
    },
    "行程天数": {
      "fieldType": "inputNumberGroup",
      "value": {
        "values": [3, 2],
        "separators": ["天", "晚"]
      }
    }
  }
}
```

### 验证步骤

1. 在 Chrome 中打开 `test-mixed-controls.html`
2. 确保插件已加载
3. 点击"导出产品数据"按钮
4. 检查导出的 JSON：
   - ✅ 提前预订中**没有**隐藏的时区选择器
   - ✅ 儿童年龄包含 `separators` 数组
   - ✅ 所有字段的 `_getDisplayValue()` 输出格式正确

5. 切换到国际版页面，点击"导入产品数据"
6. 检查回读验证报告：
   - ✅ selectGroup 字段的 expectedDisplay/actualDisplay 一致
   - ✅ 没有因隐藏控件导致的索引错位

---

## 影响范围

### 修改的文件
- `content/form-extractor.js`
  - `_walkChildren()` - 添加隐藏元素检测
  - `_extractSelectGroup()` - 提取完整结构（包括 separators）
  - `_getDisplayValue()` - 支持 separators 拼接
  - `_isHidden()` - 新增方法

- `content/form-filler.js`
  - `_fillSelectGroup()` - 过滤隐藏控件
  - `_collectDomControls()` - 跳过隐藏控件
  - `_formatValueForDisplay()` - 支持 separators 拼接
  - `_isHidden()` - 新增方法

### 兼容性
- ✅ 向后兼容：旧数据中 `selectGroup` 没有 `separators` 时，使用 `[]` 兜底
- ✅ 不影响其他字段类型（inputNumberGroup、mixedGroup 已有 separators 支持）
- ✅ 显示逻辑降级：无 separators 时回退到 `join(' - ')`

---

## 后续建议

1. **全面测试**：在真实的携程/Trip.com VBK 后台测试所有包含控件组的页面
2. **日志增强**：在 `_isHidden()` 中添加 console.log，方便调试时查看哪些控件被跳过
3. **文档更新**：在 `PROJECT_SUMMARY.md` 中更新"已解决的关键问题"章节

---

*本次修复确保了插件对复杂控件组合的准确处理，特别是隐藏控件的过滤和分隔符的完整保留。*
