# 目的地信息和时间控件优化

> 优化时间：2026-06-15
> 优化范围：form-extractor.js、form-filler.js

---

## 优化1：目的地信息字段调整

### 调整内容

#### 1. 字段顺序调整
**优化前**：目的地信息在所有表单字段之后
**优化后**：目的地信息在基础信息分组的**第一位**

**实现**：
```javascript
_extractGroup(bodyEl) {
  const groupData = {};

  // 1. 首先提取目的地信息
  const destinationInfo = this._extractDestinationInfo(bodyEl);
  if (destinationInfo) {
    groupData['目的地信息'] = destinationInfo;
  }

  // 2. 然后提取表单字段
  const formItems = bodyEl.querySelectorAll('.ant-row.ant-form-item.mb16, .ant-row.ant-form-item');
  // ...
}
```

#### 2. 特殊字符过滤
**需求**：只允許輸入中文、英文、數字及指定符號

**允许的字符**：
- 中文：`一-龥`
- 英文：`a-zA-Z`
- 数字：`0-9`
- 全角符号：`，`、`：`、`「`、`」`、`＋`、`＆`、`—`、`｜`
- 半角符号：`·`、`°`、`%`、`-`
- 空格

**实现**：
```javascript
_extractDestinationInfo(bodyEl) {
  let text = titleEl.textContent.trim();
  
  // 过滤特殊字符，只保留允许的字符
  text = text.replace(/[^一-龥a-zA-Z0-9，、：「」＋＆—｜·°%\-\s]/g, '');
  text = text.trim();
  
  return {
    domKey: 'baseInfo.destinationInfo',
    label: '目的地信息',
    value: text,
    fieldType: 'input'
  };
}
```

**效果对比**：

**优化前**：
```
格鲁吉亚+亚美尼亚10日9晚私家团·=定制线路·不含酒店=英文司机+中文管家| 24h接送机+独立成团 | 孤独星球封面*四驱车登山*酒庄品酒*诺亚方舟停靠地*高加索蓝眼泪
```

**优化后**：
```
格鲁吉亚＋亚美尼亚10日9晚私家团·定制线路·不含酒店英文司机＋中文管家｜ 24h接送机＋独立成团 ｜ 孤独星球封面四驱车登山酒庄品酒诺亚方舟停靠地高加索蓝眼泪
```

**过滤掉的字符**：
- `=`（等号）
- `*`（星号）

---

## 优化2：时间控件填写修复

### 问题描述
**现象**：提前预订中的时间控件（TimePicker）填写失败

**原因**：Ant Design TimePicker 需要特定的事件序列才能正确触发 React 的状态更新

### 修复方案

**优化前**：
```javascript
else if (ctrl.type === 'timePicker' && part.type === 'timePicker') {
  nativeInputSetter.call(ctrl.element, String(part.value));
  ctrl.element.dispatchEvent(new Event('input', { bubbles: true }));
  ctrl.element.dispatchEvent(new Event('change', { bubbles: true }));
  partIdx++;
}
```

**优化后**：
```javascript
else if (ctrl.type === 'timePicker' && part.type === 'timePicker') {
  // 先聚焦输入框
  ctrl.element.focus();
  
  // 设置值
  nativeInputSetter.call(ctrl.element, String(part.value));
  
  // 触发完整事件序列
  ctrl.element.dispatchEvent(new Event('input', { bubbles: true }));
  ctrl.element.dispatchEvent(new Event('change', { bubbles: true }));
  ctrl.element.dispatchEvent(new Event('blur', { bubbles: true }));
  
  partIdx++;
}
```

**关键改进**：
1. ✅ 添加 `focus()` - 模拟用户聚焦
2. ✅ 添加 `blur` 事件 - 触发 TimePicker 的值验证和更新

---

## 填写流程

### 提前预订字段示例

**导出数据**：
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

**填写步骤**：
1. 找到 label[for="bookingControls.advanceBooking"]
2. 收集 form-item 内的所有控件：
   - inputNumber 控件
   - timePicker 控件
3. 按顺序填写：
   - **Step 1**: 填写 inputNumber ← `2`
   - **Step 2**: 填写 timePicker ← `18:00`
     - `input.focus()` - 聚焦
     - 设置 value = "18:00"
     - 触发 input、change、blur 事件
4. 跳过 separator（不填写）

---

## 测试验证

### 1. 目的地信息测试

**测试数据**：
```html
<span data-lcpignore="true">
  格鲁吉亚+亚美尼亚10日9晚私家团·=定制线路·不含酒店=英文司机+中文管家| 24h接送机+独立成团 | 孤独星球封面*四驱车登山*酒庄品酒*诺亚方舟停靠地*高加索蓝眼泪
</span>
```

**预期导出**：
```json
{
  "基础信息": {
    "目的地信息": {
      "domKey": "baseInfo.destinationInfo",
      "label": "目的地信息",
      "value": "格鲁吉亚＋亚美尼亚10日9晚私家团·定制线路·不含酒店英文司机＋中文管家｜ 24h接送机＋独立成团 ｜ 孤独星球封面四驱车登山酒庄品酒诺亚方舟停靠地高加索蓝眼泪",
      "fieldType": "input"
    },
    "产品名称": { ... },
    "产品类型": { ... }
  }
}
```

**验证点**：
- ✅ 目的地信息是第一个字段
- ✅ `=` 和 `*` 被过滤
- ✅ 保留了允许的符号（`＋`、`｜`、`·`）

### 2. 时间控件测试

**测试页面**：`test-advance-booking.html`

**测试步骤**：
1. 导出包含提前预订字段的数据
2. 切换到国际版页面
3. 导入数据
4. 点击"确认填写"
5. 检查时间控件的值

**预期结果**：
- ✅ TimePicker 显示 "18:00"
- ✅ 回读验证通过
- ✅ 表单提交时值正确

---

## 技术细节

### 1. 正则表达式说明

```javascript
/[^一-龥a-zA-Z0-9，、：「」＋＆—｜·°%\-\s]/g
```

- `[^...]` - 匹配**不在**括号内的字符
- `一-龥` - 中文字符范围
- `a-zA-Z` - 英文字母
- `0-9` - 数字
- `，、：「」＋＆—｜` - 全角符号
- `·°%` - 半角符号
- `\-` - 减号（需要转义）
- `\s` - 空格
- `/g` - 全局替换

### 2. TimePicker 事件序列

**为什么需要 blur 事件？**

Ant Design TimePicker 的工作流程：
1. `focus` - 打开时间选择面板
2. 用户输入或选择时间
3. `input` / `change` - 更新内部状态
4. `blur` - **触发验证和最终确认**

如果缺少 `blur` 事件，TimePicker 可能：
- 显示值正确，但内部状态未更新
- 表单提交时取不到值
- 回读验证失败

### 3. 字段顺序保证

JavaScript 对象的属性顺序（ES2015+）：
- **按插入顺序**保留
- 先插入的属性先遍历

因此，只要在 `_extractGroup()` 中先添加目的地信息，它就会在导出 JSON 中排在第一位。

---

## 边界情况

### 1. 目的地信息全部被过滤

如果原始文本只包含不允许的字符：
```javascript
const text = "★☆✨✓✗";
// 过滤后 text = ""
if (!text) return null; // 不添加该字段
```

### 2. 时间格式不标准

如果导入的时间值不是标准格式（如 "18点"）：
```javascript
// TimePicker 会尝试解析
ctrl.element.value = "18点";
// 解析失败时，显示为空或错误提示
```

**建议**：在导入前验证时间格式（HH:mm）

### 3. 多个时间控件

如果一个字段包含多个 timePicker：
```javascript
// parts 中有多个 timePicker
const parts = [
  { type: 'timePicker', value: '09:00' },
  { type: 'separator', text: ' - ' },
  { type: 'timePicker', value: '17:00' }
];
// 按顺序逐个填写
```

---

## 修改的文件

- ✅ `content/form-extractor.js`
  - 调整 `_extractGroup()` 中的字段提取顺序
  - 更新 `_extractDestinationInfo()` 添加字符过滤

- ✅ `content/form-filler.js`
  - 优化 `_fillMixedGroup()` 中的 timePicker 填写逻辑

---

## 后续建议

1. **字符白名单配置化**
   - 允许用户在设置中自定义允许的符号
   - 不同字段可配置不同的过滤规则

2. **时间格式验证**
   - 在导入前验证时间值格式
   - 提供"HH:mm"格式转换提示

3. **填写反馈**
   - TimePicker 填写失败时显示具体错误
   - 提供"手动调整"选项

---

*本次优化确保目的地信息排在第一位且只包含允许的字符，同时修复了时间控件的填写问题。*
