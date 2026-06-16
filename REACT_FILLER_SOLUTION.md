# React Fiber 填写方案

> 创建时间：2026-06-15
> 新增文件：react-filler.js

---

## 为什么需要 React Fiber 填写？

### 原有方案的问题

使用原生 DOM 操作和事件触发的方式填写 Ant Design 表单组件时，存在以下问题：

1. **事件不被识别**：直接触发的 `input`、`change` 事件无法触发 React 的状态更新
2. **值不同步**：DOM 值改变了，但 React 内部状态没有更新
3. **验证失败**：组件的验证逻辑没有被触发
4. **选择失败**：下拉框、搜索框的选项点击不生效

### React Fiber 方案的优势

通过直接操作 React 内部状态，可以：

- ✅ 触发真正的 React 事件处理器
- ✅ 同步更新 React 组件状态
- ✅ 触发表单验证
- ✅ 确保填写可靠性

---

## 实现原理

### 1. 查找 Fiber 节点

每个 DOM 元素都有一个隐藏属性指向其 React Fiber 节点：

```javascript
findFiber(element) {
  const key = Object.keys(element).find(k =>
    k.startsWith('__reactInternalInstance') ||
    k.startsWith('__reactFiber')
  );
  return element[key] || null;
}
```

### 2. 查找 onChange 处理器

React 组件的事件处理器存储在 Fiber 节点的 props 中：

```javascript
findOnChange(fiber) {
  let current = fiber;
  while (current) {
    if (current.memoizedProps?.onChange || current.pendingProps?.onChange) {
      return current;
    }
    current = current.return;  // 向上查找父节点
  }
  return null;
}
```

### 3. 调用 React 事件处理器

创建模拟事件对象，调用 onChange：

```javascript
fillInput(input, value) {
  const fiber = this.findFiber(input);
  const changeFiber = this.findOnChange(fiber);
  const onChange = changeFiber?.memoizedProps?.onChange;

  if (onChange) {
    const event = {
      target: { value },
      currentTarget: { value },
      // ... 其他事件属性
    };
    onChange(event);  // 直接调用 React 的事件处理器
    return true;
  }
  return false;
}
```

---

## API 说明

### ReactFiller.fillInput(input, value)

填写普通输入框

```javascript
const input = document.querySelector('#productName');
ReactFiller.fillInput(input, '格鲁吉亚私家团');
```

### ReactFiller.fillInputNumber(input, value)

填写数字输入框

```javascript
const input = document.querySelector('.ant-input-number-input');
ReactFiller.fillInputNumber(input, 2);
```

### ReactFiller.fillTimePicker(input, value)

填写时间选择器

```javascript
const input = document.querySelector('.ant-time-picker-input');
ReactFiller.fillTimePicker(input, '18:00');
```

**特点**：
- 自动聚焦和失焦
- 触发时间验证

### ReactFiller.fillSelect(selectEl, targetText)

填写普通下拉框

```javascript
const selectEl = document.querySelector('.ant-select');
await ReactFiller.fillSelect(selectEl, '普通话');
```

**特点**：
- 自动展开下拉框
- 精确匹配 + 模糊匹配
- 通过 React 事件点击选项

### ReactFiller.fillSearchSelect(searchInput, targetText)

填写搜索下拉框

```javascript
const searchInput = document.querySelector('#gatherCity');
await ReactFiller.fillSearchSelect(searchInput, '格鲁吉亚-第比利斯');
```

**特点**：
- 自动清除旧值
- 输入搜索文本
- 等待搜索结果
- 点击匹配选项

---

## 集成到 FormFiller

### 策略：优先 React，回退原生

所有填写方法都采用这个策略：

```javascript
_fillInput(domKey, value) {
  const input = /* 查找输入框 */;
  
  // 1. 优先使用 ReactFiller
  if (window.ReactFiller && window.ReactFiller.fillInput(input, value)) {
    return;
  }
  
  // 2. 回退到原生方法
  nativeSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
```

**好处**：
- React 方案失败时自动降级
- 兼容非 React 组件
- 渐进增强

---

## 修复的问题

### 1. ✅ 提前预订：时间控件填写

**问题**：时间控件 18:00 未填写

**修复**：
```javascript
// 使用 ReactFiller.fillTimePicker
if (ctrl.type === 'timePicker' && part.type === 'timePicker') {
  if (window.ReactFiller && window.ReactFiller.fillTimePicker(ctrl.element, part.value)) {
    partIdx++;
    continue;
  }
  // 回退方法...
}
```

**效果**：
- 时间控件值：`18:00`
- React 状态已更新
- 验证通过

### 2. ✅ 服务语言：下拉框匹配

**问题**：期望"普通话"，实际"粵語"

**修复**：
```javascript
// 使用 ReactFiller.fillSelect
async _fillPlainSelectByElement(selectEl, text) {
  if (window.ReactFiller) {
    const success = await window.ReactFiller.fillSelect(selectEl, text);
    if (success) return;
  }
  // 回退方法...
}
```

**效果**：
- 精确匹配"普通话"
- 通过 React onClick 触发选择
- 状态同步正确

### 3. ✅ 集合城市/目的城市：搜索选择

**问题**：期望"格鲁吉亚-第比利斯"，实际"第比利斯"

**修复**：
```javascript
// 使用 ReactFiller.fillSearchSelect
async _fillSearchSelect(domKey, value) {
  if (window.ReactFiller) {
    const success = await window.ReactFiller.fillSearchSelect(searchInput, text);
    if (success) return;
  }
  // 回退方法...
}
```

**效果**：
- 通过 React onChange 输入搜索文本
- 等待完整的搜索结果
- 精确匹配选项
- 状态同步正确

---

## 加载顺序

在 `manifest.json` 中，`react-filler.js` 必须在 `form-filler.js` 之前加载：

```json
{
  "js": [
    "content/safe-storage.js",
    "content/react-filler.js",      // ← 先加载
    "content/page-detector.js",
    "content/form-extractor.js",
    "content/form-filler.js",        // ← 后使用
    "content/export.js",
    "content/import.js",
    "content/panel.js",
    "content/main.js"
  ]
}
```

---

## 调试方法

### 检查 Fiber 节点

```javascript
const input = document.querySelector('#productName');
const fiber = ReactFiller.findFiber(input);
console.log('Fiber:', fiber);
console.log('Props:', fiber?.memoizedProps);
```

### 检查 onChange 处理器

```javascript
const changeFiber = ReactFiller.findOnChange(fiber);
console.log('onChange:', changeFiber?.memoizedProps?.onChange);
```

### 手动测试填写

```javascript
// 在浏览器控制台
const input = document.querySelector('#productName');
ReactFiller.fillInput(input, '测试值');

// 检查值是否更新
console.log('DOM值:', input.value);
console.log('React值:', ReactFiller.findFiber(input)?.memoizedProps?.value);
```

---

## 边界情况处理

### 1. React Fiber 不存在

```javascript
if (!fiber) {
  console.warn('[ReactFiller] 未找到 Fiber 节点');
  return false;  // 回退到原生方法
}
```

### 2. onChange 不存在

```javascript
if (!onChange) {
  console.warn('[ReactFiller] 未找到 onChange 处理器');
  return false;  // 回退到原生方法
}
```

### 3. 搜索无结果

```javascript
const result = await this.waitForSearchResult(targetText, 5000);
if (!result) return false;  // 回退到原生方法或报错
```

---

## 性能考虑

### 1. Fiber 查找开销

```javascript
// 最多向上遍历 20 层
while (current && depth < 20) {
  if (current.memoizedProps?.onChange) {
    return current;
  }
  current = current.return;
  depth++;
}
```

### 2. 等待超时

```javascript
// 搜索结果等待：5秒
await this.waitForSearchResult(text, 5000);

// 下拉框展开等待：500ms
await this.delay(500);
```

---

## 未来优化

1. **批量填写优化**
   - 收集所有字段后一次性更新 React 状态
   - 减少重复渲染

2. **错误恢复**
   - React 方法失败时记录日志
   - 提供详细的失败原因

3. **支持更多组件**
   - Radio 单选按钮
   - Checkbox 复选框
   - Cascader 级联选择器

---

*通过 React Fiber 直接操作 React 状态，确保表单填写的可靠性和准确性。*
