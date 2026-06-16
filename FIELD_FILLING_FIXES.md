# 字段填写问题修复

> 修复时间：2026-06-15
> 修复的问题：提前预订时间控件、下拉框匹配、集合/目的城市

---

## 修复的问题

### 1. ✅ 提前预订：时间控件未填写

**问题描述**：
```
期望: "2 天 18:00 前可订"
实际: "2 天 前可订"  （时间控件18:00未填写）
```

**根本原因**：
在 `_fillMixedGroup()` 的循环中，当控件类型不匹配时，会执行 `partIdx++`，导致跳过了后续的 timePicker 数据。

**修复前代码**：
```javascript
for (const ctrl of domControls) {
  if (ctrl.type === 'inputNumber' && part.type === 'inputNumber') {
    // 填写...
    partIdx++;
  } else {
    // 类型不匹配，跳过
    partIdx++;  // ← 错误：这会跳过数据
  }
}
```

**修复后代码**：
```javascript
for (const ctrl of domControls) {
  if (ctrl.type === 'inputNumber' && part.type === 'inputNumber') {
    // 填写...
    partIdx++;
  } else if (ctrl.type === 'timePicker' && part.type === 'timePicker') {
    // 填写...
    partIdx++;
  }
  // 不匹配时不增加 partIdx，继续尝试下一个DOM控件
}
```

**原理**：
- DOM控件顺序：`[inputNumber, timePicker]`
- 数据顺序（过滤separator）：`[inputNumber(2), timePicker(18:00)]`
- 匹配策略：逐个DOM控件尝试匹配当前数据，匹配成功才移动到下一个数据

---

### 2. ✅ 服务语言：下拉框匹配错误

**问题描述**：
```
期望: "普通话"
实际: "粵語"
```

**根本原因**：
`_fillPlainSelectByElement()` 使用简单的 `trim()` 匹配，没有规范化空白字符，导致匹配失败后选择了错误的选项。

**修复前代码**：
```javascript
const match = Array.from(options).find(opt => {
  const optText = opt.textContent.trim();
  return optText === text || optText.includes(text) || text.includes(optText);
});
```

**修复后代码**：
```javascript
const targetText = this._normalizeText(text);

// 1. 优先精确匹配
let match = Array.from(options).find(opt => {
  const optText = this._normalizeText(opt.textContent);
  return optText === targetText;
});

// 2. 模糊匹配
if (!match) {
  match = Array.from(options).find(opt => {
    const optText = this._normalizeText(opt.textContent);
    return optText.includes(targetText) || targetText.includes(optText);
  });
}
```

**`_normalizeText()` 方法**：
```javascript
_normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}
```

**改进**：
- ✅ 使用 `_normalizeText()` 统一处理文本
- ✅ 先精确匹配，再模糊匹配
- ✅ 避免错误匹配相似的选项

---

### 3. ⚠️ 集合城市/目的城市：显示部分值

**问题描述**：
```
期望: "格鲁吉亚-第比利斯"
实际: "第比利斯"
```

**可能原因**：

#### 原因A：导出的数据不完整
如果导出时只提取了 "第比利斯"，那么导入时自然也只能填写 "第比利斯"。

**检查方法**：
查看导出的 JSON，检查集合城市字段的值：
```json
{
  "集合城市": {
    "value": {
      "text": "第比利斯"  // ← 如果这里就是"第比利斯"，需要修复导出逻辑
    }
  }
}
```

#### 原因B：搜索匹配不完整
如果导出值是 "格鲁吉亚-第比利斯"，但搜索结果中同时有：
- "第比利斯"
- "格鲁吉亚-第比利斯"

当前的模糊匹配可能会匹配到 "第比利斯"（因为 "格鲁吉亚-第比利斯" includes "第比利斯"）。

**当前逻辑**：
```javascript
// 等待搜索结果
const result = await this._waitForSearchResult(text, 5000);
// text = "格鲁吉亚-第比利斯"

_waitForSearchResult(text, timeout) {
  const targetText = this._normalizeText(text);  // "格鲁吉亚-第比利斯"
  
  // 1. 精确匹配
  const exactMatch = options.find(opt => 
    this._normalizeText(opt.textContent) === targetText
  );
  if (exactMatch) return exactMatch;
  
  // 2. 模糊匹配
  const fuzzyMatch = options.find(opt => {
    const optionText = this._normalizeText(opt.textContent);
    return optionText.includes(targetText) || targetText.includes(optionText);
  });
  // 如果有"第比利斯"选项，targetText.includes("第比利斯") 为 true
  // 会错误匹配到"第比利斯"
  return fuzzyMatch;
}
```

**建议修复**：
优先匹配最长的选项（最具体的）：
```javascript
// 2. 模糊匹配：优先选择最长匹配
const fuzzyMatches = options.filter(opt => {
  const optionText = this._normalizeText(opt.textContent);
  return optionText.includes(targetText) || targetText.includes(optionText);
});

if (fuzzyMatches.length > 0) {
  // 按选项文本长度降序排序，选择最长的
  fuzzyMatches.sort((a, b) => 
    b.textContent.length - a.textContent.length
  );
  return fuzzyMatches[0];
}
```

---

### 4. ⚠️ 产品线：null 问题说明

**问题描述**：
```
期望: "null"
实际: ""
```

**分析**：
这个"期望"本身是错误的。产品线字段如果值为 `null`，应该填写为空字符串，而不是字符串 `"null"`。

**已修复**：
在 `_fillInput()` 中已经将 `null` 转换为空字符串：
```javascript
const finalValue = (value === null || value === undefined) ? '' : String(value);
```

**如果需要填写 "null" 字符串**：
那说明导出时出了问题，应该在导出时就将 `null` 转换为空字符串，而不是保留 `null` 值。

---

### 5. ⏭️ 线上400电话：跳过

**问题描述**：
```
期望: "18854"
实际: "797345"
```

**分析**：
这可能是字段映射错误，或者有多个电话号码字段被混淆了。需要具体的 HTML 结构和导出数据才能诊断。

**建议排查**：
1. 检查导出 JSON 中 "线上400电话" 字段的值
2. 检查页面上是否有多个电话号码输入框
3. 检查 domKey 是否正确

---

## 修改的文件

- ✅ `content/form-filler.js`
  - 修复 `_fillMixedGroup()` - 不匹配时不跳过数据
  - 修复 `_fillPlainSelectByElement()` - 使用文本规范化和分级匹配

---

## 测试建议

### 1. 提前预订测试

**测试数据**：
```json
{
  "提前预订": {
    "fieldType": "mixedGroup",
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

**预期结果**：
- ✅ 天数输入框：`2`
- ✅ 时间选择器：`18:00`

### 2. 服务语言测试

**测试数据**：
```json
{
  "服务语言": {
    "fieldType": "select",
    "value": { "text": "普通话" }
  }
}
```

**预期结果**：
- ✅ 下拉框选中 "普通话"
- ❌ 不应该选中 "粵語" 或其他语言

### 3. 集合/目的城市测试

**步骤1：检查导出数据**
```json
{
  "集合城市": {
    "value": {
      "text": "格鲁吉亚-第比利斯"  // 检查是否完整
    }
  }
}
```

**步骤2：检查搜索结果**
- 输入 "格鲁吉亚-第比利斯"
- 观察下拉菜单中的选项
- 确认是否匹配到正确的选项

---

## 后续优化建议

1. **搜索框匹配优化**
   - 对于模糊匹配，优先选择最长（最具体）的选项
   - 添加日志记录匹配过程

2. **混合控件填写增强**
   - 添加类型不匹配的警告日志
   - 支持部分填写成功的情况

3. **下拉框匹配增强**
   - 支持拼音匹配
   - 支持繁简体自动转换

---

*本次修复解决了提前预订时间控件和下拉框匹配的关键问题。*
