# 三个关键问题修复

> 修复时间：2026-06-15
> 修复问题：目的地信息排序、字符过滤、国家景区显示、null值处理

---

## 问题1：目的地信息不是第一条数据

### 问题描述
虽然在 `_extractGroup()` 中先添加了目的地信息，但导出的JSON中目的地信息仍然不是基础信息的第一条。

### 根本原因
JavaScript 对象属性在某些操作（如 `Object.assign`）后可能改变顺序。

### 修复方案
先收集所有字段到临时对象，最后重新组装，确保目的地信息在第一位：

```javascript
_extractGroup(bodyEl) {
  const tempData = {};

  // 1. 先提取所有表单行
  const formItems = bodyEl.querySelectorAll('.ant-row.ant-form-item.mb16, .ant-row.ant-form-item');
  formItems.forEach(item => {
    const field = this._extractFormItem(item);
    if (field) {
      tempData[field.label] = field;
    }
  });

  // 2. 提取特殊区域
  const scenicArea = bodyEl.querySelector('#scenic_area');
  if (scenicArea) {
    tempData['国家景区'] = this._extractScenicArea(scenicArea);
  }

  // 3. 提取目的地信息
  const destinationInfo = this._extractDestinationInfo(bodyEl);

  // 4. 重新组装：目的地信息放第一位
  const groupData = {};
  if (destinationInfo) {
    groupData['目的地信息'] = destinationInfo;
  }
  Object.assign(groupData, tempData);

  return groupData;
}
```

**关键改进**：
- ✅ 使用临时对象收集字段
- ✅ 创建新对象时先添加目的地信息
- ✅ 使用 `Object.assign` 添加其他字段

---

## 问题2：需要去掉所有中文符号

### 问题描述
要求去掉 `=`、`|`、`*` 等所有中文符号，只保留半角符号。

### 修复前
```javascript
// 保留全角符号：，、：「」＋＆—｜
text = text.replace(/[^一-龥a-zA-Z0-9，、：「」＋＆—｜·°%\-\s]/g, '');
```

### 修复后
```javascript
// 只保留半角符号：· ° % -
text = text.replace(/[^一-龥a-zA-Z0-9·°%\-\s]/g, '');
```

**允许的字符**：
- 中文：`一-龥`
- 英文：`a-zA-Z`
- 数字：`0-9`
- 半角符号：`·`、`°`、`%`、`-`
- 空格：`\s`

**效果对比**：

**原始文本**：
```
格鲁吉亚+亚美尼亚10日9晚私家团·=定制线路·不含酒店=英文司机+中文管家| 24h接送机+独立成团 | 孤独星球封面*四驱车登山
```

**修复后**：
```
格鲁吉亚亚美尼亚10日9晚私家团·定制线路·不含酒店英文司机中文管家 24h接送机独立成团  孤独星球封面四驱车登山
```

**过滤掉的字符**：
- 全角符号：`＋`、`｜`、`=`
- 半角符号：`+`、`|`、`=`、`*`

---

## 问题3：国家景区字段只取到一个 `[` 符号

### 问题描述
国家景区（cascader 类型）的 value 是数组，但在显示时被 `JSON.stringify()` 处理，只显示了 `[`。

### 根本原因
`_getDisplayValue()` 方法中缺少对 `cascader` 类型的处理逻辑。

**cascader 数据结构**：
```json
{
  "国家景区": {
    "domKey": "nameAreas.countryScienc",
    "label": "国家景区",
    "fieldType": "cascader",
    "value": ["黄山风景区", "九寨沟"]
  }
}
```

### 修复方案
在 `_getDisplayValue()` 中添加 cascader 类型的处理：

```javascript
_getDisplayValue(fieldData) {
  // ... 其他类型 ...
  
  // 添加 cascader 类型处理
  if (fieldData.fieldType === 'cascader' && Array.isArray(fieldData.value)) {
    return fieldData.value.join(' / ');
  }
  
  // ... 其他类型 ...
}
```

**效果对比**：

**修复前**：
```
国家景区: [
```

**修复后**：
```
国家景区: 黄山风景区 / 九寨沟
```

---

## 问题4：产品线字段将 null 作为字符串插入

### 问题描述
当字段值为 `null` 时，被转换为字符串 `"null"` 填入输入框。

### 根本原因
`_fillInput()` 方法中直接使用 `String(value)`，会将 `null` 转换为字符串 `"null"`。

### 修复方案
在填写前检查 null 值，转换为空字符串：

```javascript
_fillInput(domKey, value) {
  // ... 查找 input ...

  // 将 null 和 undefined 转换为空字符串
  const finalValue = (value === null || value === undefined) ? '' : String(value);

  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  nativeSetter.call(input, finalValue);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
```

**效果对比**：

**修复前**：
```javascript
// value = null
String(null)  // "null"
// 输入框显示：null
```

**修复后**：
```javascript
// value = null
finalValue = (null === null) ? '' : String(null)  // ''
// 输入框显示：（空）
```

---

## 修改的文件

### 1. form-extractor.js
- ✅ 修改 `_extractGroup()` - 确保目的地信息排第一位
- ✅ 修改 `_extractDestinationInfo()` - 去掉所有中文符号

### 2. form-filler.js
- ✅ 修改 `_fillInput()` - 将 null 转换为空字符串

### 3. panel.js
- ✅ 修改 `_getDisplayValue()` - 添加 cascader 类型处理

---

## 测试验证

### 1. 目的地信息排序测试

**测试步骤**：
1. 打开 VBK 产品编辑页面
2. 点击"导出产品数据"
3. 检查导出的 JSON

**预期结果**：
```json
{
  "data": {
    "基础信息": {
      "目的地信息": { ... },  // ← 第一个字段
      "产品名称": { ... },
      "产品类型": { ... }
    }
  }
}
```

### 2. 字符过滤测试

**测试数据**：
```
格鲁吉亚+亚美尼亚10日9晚私家团·=定制线路·不含酒店=英文司机+中文管家| 24h接送机+独立成团 | 孤独星球封面*四驱车登山
```

**预期结果**：
```
格鲁吉亚亚美尼亚10日9晚私家团·定制线路·不含酒店英文司机中文管家 24h接送机独立成团  孤独星球封面四驱车登山
```

### 3. 国家景区显示测试

**测试步骤**：
1. 导出包含国家景区字段的数据
2. 导入该数据
3. 检查"转换预览"中国家景区的显示

**预期结果**：
```
国家景区: 黄山风景区 / 九寨沟
```

### 4. null 值测试

**测试步骤**：
1. 导出包含空产品线字段的数据
2. 导入该数据
3. 点击"确认填写"
4. 检查产品线输入框

**预期结果**：
- ✅ 输入框为空
- ❌ 不应该显示 "null" 字符串

---

## 技术细节

### 1. Object.assign 的属性顺序

ES2015+ 规范保证对象属性按插入顺序遍历：
```javascript
const obj = {};
obj['a'] = 1;  // 第1个
obj['b'] = 2;  // 第2个
obj['c'] = 3;  // 第3个
Object.keys(obj);  // ['a', 'b', 'c']
```

`Object.assign` 也遵循此规则：
```javascript
const target = { first: 1 };
Object.assign(target, { second: 2, third: 3 });
Object.keys(target);  // ['first', 'second', 'third']
```

### 2. 正则表达式字符类

```javascript
/[^一-龥a-zA-Z0-9·°%\-\s]/g
```

- `[^...]` - 匹配**不在**字符类内的字符
- `\-` - 转义的减号（字符类中需要转义）
- `/g` - 全局标志，替换所有匹配

### 3. null 的类型检查

```javascript
value === null           // 严格等于 null
value === undefined      // 严格等于 undefined
value == null            // null 或 undefined（隐式转换）
```

最佳实践：使用严格等于并分别检查：
```javascript
(value === null || value === undefined) ? '' : String(value)
```

### 4. cascader 与数组的区别

- **cascader**：`{ fieldType: 'cascader', value: ['item1', 'item2'] }`
- **multiSearchSelect**：`{ fieldType: 'multiSearchSelect', value: { text: ['item1', 'item2'] } }`

cascader 的 value 直接是数组，而 multiSearchSelect 的 text 是数组。

---

## 边界情况

### 1. 目的地信息为空

```javascript
const destinationInfo = this._extractDestinationInfo(bodyEl);
// destinationInfo = null

const groupData = {};
if (destinationInfo) {  // 不添加
  groupData['目的地信息'] = destinationInfo;
}
```

### 2. 过滤后文本为空

```javascript
let text = "=====";
text = text.replace(/[^一-龥a-zA-Z0-9·°%\-\s]/g, '');  // ""
text = text.trim();  // ""

if (!text) return null;  // ← 不添加该字段
```

### 3. 国家景区为空数组

```javascript
{
  "value": []
}

// 显示为空字符串
[].join(' / ')  // ""
```

### 4. value 是对象但包含 null

```javascript
const value = { text: null };
String(value.text ?? '')  // ""
```

---

## 后续建议

1. **字符白名单配置化**
   - 不同字段可配置不同的允许字符
   - 用户可在设置中自定义规则

2. **cascader 填写支持**
   - 目前只实现了显示，还需要实现填写逻辑
   - 需要处理级联选择的展开和选择

3. **null 值的统一处理**
   - 在 transform 阶段就将所有 null 转换为合适的默认值
   - 减少各个 fill 方法中的重复判断

---

*本次修复解决了四个关键问题，确保数据导出、显示和填写的准确性。*
