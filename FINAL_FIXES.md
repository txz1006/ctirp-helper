# 最终修复：搜索匹配和 null 值处理

> 修复时间：2026-06-15
> 修复内容：搜索框宽松匹配、JSON 解析时 null 转换

---

## 修复1：搜索框宽松匹配策略

### 问题描述

集合城市/目的城市填写时：
- 导入值：`"第比利斯"`
- 搜索结果包含：`"格鲁吉亚-第比利斯"` 和 `"第比利斯"`
- 期望：选择 `"格鲁吉亚-第比利斯"`（更完整的选项）
- 实际：可能匹配失败或等待超时

### 根本原因

原来的匹配策略过于复杂：
```javascript
// 精确匹配
const exactMatch = options.find(opt => opt.textContent.trim() === targetText);
if (exactMatch) return exactMatch;

// 双向模糊匹配
const fuzzyMatch = options.find(opt => {
  const text = opt.textContent.trim();
  return text.includes(targetText) || targetText.includes(text);
});
```

这种策略在搜索框场景下不适用，因为：
1. 用户输入的是搜索关键词，不是完整选项文本
2. 搜索结果可能包含多个匹配项
3. 应该选择第一个包含关键词的结果

### 修复方案：简化为"包含即选"

```javascript
async waitForSearchResult(targetText, timeout = 5000) {
  while (Date.now() - startTime < timeout) {
    await this.delay(200);

    const options = Array.from(dropdown.querySelectorAll('.ant-select-dropdown-menu-item:not(.ant-select-dropdown-menu-item-disabled)'));
    if (options.length === 0) continue;

    // 策略：只要选项包含搜索文本，就选择它（更宽松的匹配）
    const match = options.find(opt => {
      const text = opt.textContent.trim();
      return text.includes(targetText);
    });

    if (match) return match;
  }
  return null;
}
```

### 行为对比

**场景1：搜索"第比利斯"**

搜索结果：
- `"格鲁吉亚-第比利斯"` ✅ 包含"第比利斯"，选择此项
- `"第比利斯"`
- `"阿塞拜疆-第比利斯"`

**修复前**：精确匹配失败 → 双向模糊匹配可能匹配到第二项
**修复后**：直接选择第一个包含"第比利斯"的选项（"格鲁吉亚-第比利斯"）

**场景2：搜索"格鲁吉亚"**

搜索结果：
- `"格鲁吉亚-第比利斯"` ✅ 包含"格鲁吉亚"，选择此项
- `"格鲁吉亚-巴统"`

**修复后**：选择第一个包含"格鲁吉亚"的选项

### 优势

- ✅ 简单高效：只需一次遍历
- ✅ 符合用户期望：搜索框本来就是"包含"匹配
- ✅ 选择第一个匹配项：通常是最相关的
- ✅ 减少超时：不再等待精确匹配

---

## 修复2：JSON 解析时 null 转空字符串

### 问题描述

产品线字段值为 `null` 时：
```json
{
  "产品线": {
    "value": null
  }
}
```

填写时：
```javascript
String(null)  // "null"
```

结果：输入框显示字符串 `"null"`，而不是空白。

### 根本原因

`JSON.parse()` 会保留 `null` 值，后续填写时 `String(null)` 会转换为字符串 `"null"`。

### 修复方案：在解析时统一处理

在 `parseInput()` 中添加递归转换：

```javascript
parseInput(jsonText) {
  try {
    const data = JSON.parse(jsonText);
    if (!data.version || !data.data) {
      return { success: false, error: '数据格式不正确，缺少version或data字段' };
    }

    // 递归处理所有字段值，将 null 转换为空字符串
    this._convertNullToEmpty(data);

    return { success: true, data };
  } catch (e) {
    return { success: false, error: `JSON解析失败: ${e.message}` };
  }
}
```

**转换函数**：

```javascript
_convertNullToEmpty(obj) {
  if (obj === null || obj === undefined) return;

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      if (item === null) {
        obj[index] = '';  // 数组元素是 null，转为空字符串
      } else if (typeof item === 'object') {
        this._convertNullToEmpty(item);  // 递归处理
      }
    });
  } else if (typeof obj === 'object') {
    for (const key in obj) {
      if (obj[key] === null) {
        obj[key] = '';  // 对象属性是 null，转为空字符串
      } else if (typeof obj[key] === 'object') {
        this._convertNullToEmpty(obj[key]);  // 递归处理
      }
    }
  }
}
```

### 处理示例

**输入 JSON**：
```json
{
  "version": "1.0",
  "data": {
    "基础信息": {
      "产品线": {
        "value": null
      },
      "产品名称": {
        "value": "格鲁吉亚私家团"
      }
    }
  }
}
```

**解析后**：
```json
{
  "version": "1.0",
  "data": {
    "基础信息": {
      "产品线": {
        "value": ""  // ← null 已转换为空字符串
      },
      "产品名称": {
        "value": "格鲁吉亚私家团"
      }
    }
  }
}
```

**填写时**：
```javascript
String("")  // ""  ← 输入框为空白，正确！
```

### 覆盖场景

#### 1. 简单值是 null
```json
{ "value": null }  →  { "value": "" }
```

#### 2. 数组中有 null
```json
{ "value": ["A", null, "B"] }  →  { "value": ["A", "", "B"] }
```

#### 3. 嵌套对象中有 null
```json
{
  "value": {
    "text": null,
    "id": 123
  }
}
→
{
  "value": {
    "text": "",
    "id": 123
  }
}
```

#### 4. 数组中的对象有 null
```json
{
  "value": {
    "items": [
      { "text": "A", "id": null },
      { "text": null, "id": 2 }
    ]
  }
}
→
{
  "value": {
    "items": [
      { "text": "A", "id": "" },
      { "text": "", "id": 2 }
    ]
  }
}
```

---

## 修改的文件

- ✅ `content/react-filler.js`
  - 简化 `waitForSearchResult()` - 包含即选

- ✅ `content/form-filler.js`
  - 简化 `_waitForSearchResult()` - 包含即选

- ✅ `content/import.js`
  - 新增 `_convertNullToEmpty()` - 递归转换 null
  - 更新 `parseInput()` - 调用转换函数

---

## 测试验证

### 1. 搜索框测试

**测试步骤**：
1. 导出包含集合城市字段的数据
2. 导入该数据
3. 点击"确认填写"
4. 观察搜索框填写过程

**预期行为**：
- 输入搜索关键词后
- 等待搜索结果出现
- 选择第一个包含关键词的选项
- 不会等待超时

### 2. null 值测试

**测试数据**：
```json
{
  "产品线": { "value": null },
  "产品名称": { "value": "测试产品" }
}
```

**测试步骤**：
1. 在导入面板粘贴包含 null 的 JSON
2. 点击"解析并转换"
3. 检查转换预览中的产品线字段
4. 点击"确认填写"
5. 检查产品线输入框

**预期结果**：
- ✅ 转换预览：产品线显示为空（不是"null"）
- ✅ 填写后：输入框为空白（不是字符串"null"）

---

## 注意事项

### 搜索框匹配策略

**适用场景**：
- ✅ 搜索下拉框（输入关键词，从结果中选择）
- ✅ 用户输入的是部分文本

**不适用场景**：
- ❌ 普通下拉框（需要精确匹配选项文本）
- ❌ 用户输入的是完整文本

**为什么分开处理**：
- 搜索框：用户输入关键词 → 后端返回包含该关键词的选项 → 选第一个即可
- 普通下拉框：用户选择具体选项 → 必须精确匹配选项文本

### null 转换时机

**在解析时转换 vs 在填写时转换**：

| 方案 | 优点 | 缺点 |
|------|------|------|
| 解析时转换 | 一次性处理，后续无需关心 | 修改了原始数据 |
| 填写时转换 | 保留原始数据 | 每个填写方法都要处理 |

我们选择**解析时转换**，因为：
- ✅ 统一处理，避免遗漏
- ✅ 简化填写逻辑
- ✅ null 本身就是无效值，转换为空字符串更合理

---

## 后续建议

1. **搜索框匹配增强**
   - 支持拼音匹配
   - 支持缩写匹配（如"北京" → "BJ"）

2. **null 值配置化**
   - 允许用户配置 null 的默认值
   - 某些字段可能需要保留 null

3. **填写状态反馈**
   - 显示当前填写到哪个字段
   - 搜索匹配时显示匹配到的选项文本

---

*通过简化搜索匹配策略和统一处理 null 值，提升填写的可靠性和准确性。*
