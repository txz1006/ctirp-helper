# Ant Design 1.x 专用填写方案

> 创建时间：2026-06-15
> 适用版本：Ant Design 1.0.16（2016年发布）

---

## 问题根源

VBK 页面使用的是 **Ant Design 1.0.16**（antd/1.0.16），这是一个 2016 年的老版本，与现代的 Ant Design 4.x/5.x 有巨大差异：

### Ant Design 版本差异

| 版本 | 发布时间 | React 版本 | 特点 |
|------|----------|------------|------|
| **1.0.16** | 2016 | React 0.14/15 | 简单的 DOM 操作即可 |
| 3.x | 2017-2018 | React 15/16 | 引入更复杂的状态管理 |
| 4.x | 2020 | React 16+ | Hooks、Fiber 架构 |
| 5.x | 2023 | React 18+ | 并发渲染 |

### 为什么之前的方案失败？

1. **React Fiber 方案失败**
   - Ant Design 1.x 使用的 React 版本太老（React 0.14/15）
   - 没有 `__reactFiber` 属性
   - 控制台警告：`[ReactFiller] 未找到 Fiber 节点`

2. **原生事件触发不够**
   - Ant Design 1.x 的组件实现简单，但仍需要特定的事件序列
   - 时间选择器需要 `focus → input → change → blur`
   - 下拉框需要 `mousedown → click`

---

## 解决方案：AntD1Filler

专门为 Ant Design 1.x 设计的填写器，特点：

### 1. 简化的事件序列

```javascript
// 普通输入框
input.value = value;
input.dispatchEvent(new Event('input', { bubbles: true }));
input.dispatchEvent(new Event('change', { bubbles: true }));
```

### 2. 时间选择器特殊处理

```javascript
input.focus();
await delay(100);
input.value = value;
input.dispatchEvent(new Event('input', { bubbles: true }));
await delay(50);
input.dispatchEvent(new Event('change', { bubbles: true }));
await delay(50);
input.blur();  // ← 关键：触发验证
await delay(100);
```

**关键点**：
- ✅ 必须先聚焦
- ✅ 延迟等待事件处理
- ✅ 必须失焦触发验证

### 3. 下拉框需要 mousedown

```javascript
match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
await delay(50);
match.click();
```

**为什么**：Ant Design 1.x 的下拉框监听 `mousedown` 事件来确定选择意图。

### 4. 三级匹配策略

```javascript
// 1. 精确匹配
let match = options.find(opt => opt.textContent.trim() === targetText);

// 2. 包含匹配（选项包含目标）
if (!match) {
  match = options.find(opt => opt.textContent.trim().includes(targetText));
}

// 3. 被包含匹配（目标包含选项）
if (!match) {
  match = options.find(opt => targetText.includes(opt.textContent.trim()));
}
```

---

## 填写优先级

所有填写方法现在采用三层优先级：

```javascript
// 1. 优先：AntD1Filler（针对 Ant Design 1.x）
if (window.AntD1Filler && window.AntD1Filler.fillInput(input, value)) {
  return;
}

// 2. 其次：ReactFiller（针对新版 React）
if (window.ReactFiller && window.ReactFiller.fillInput(input, value)) {
  return;
}

// 3. 回退：原生方法
nativeSetter.call(input, value);
input.dispatchEvent(new Event('input', { bubbles: true }));
```

**优势**：
- ✅ 兼容 Ant Design 1.x 和新版本
- ✅ 自动选择最合适的方法
- ✅ 降级保证基本可用

---

## 调试增强

### 详细的控制台日志

**混合控件组**：
```
[MixedGroup] bookingControls.advanceBooking - DOM控件: ["inputNumber", "timePicker"]
[MixedGroup] bookingControls.advanceBooking - 数据parts: [{"type":"inputNumber","value":2},{"type":"timePicker","value":"18:00"}]
[MixedGroup] bookingControls.advanceBooking - 尝试匹配: ctrl=inputNumber, part=inputNumber
[MixedGroup] bookingControls.advanceBooking - 填写inputNumber: 2
[MixedGroup] bookingControls.advanceBooking - inputNumber AntD1填写成功
[MixedGroup] bookingControls.advanceBooking - 尝试匹配: ctrl=timePicker, part=timePicker
[MixedGroup] bookingControls.advanceBooking - 填写timePicker: 18:00
[MixedGroup] bookingControls.advanceBooking - timePicker AntD1填写完成, 当前值: 18:00
[MixedGroup] bookingControls.advanceBooking - 填写完成，处理了 2/2 个值
```

**普通下拉框**：
```
[PlainSelect] 填写下拉框: 普通话
[AntD1] 可用选项: ["中文", "英语", "日语", "韩语", "普通话", "粵語"]
[AntD1] 匹配到: 普通话
[PlainSelect] AntD1填写成功
```

**搜索下拉框**：
```
[SearchSelect] 填写搜索框: 第比利斯
[AntD1] 搜索输入: 第比利斯
[AntD1] 搜索结果: ["格鲁吉亚-第比利斯", "第比利斯", "阿塞拜疆-第比利斯"]
[AntD1] 搜索匹配到: 格鲁吉亚-第比利斯
[SearchSelect] AntD1填写成功
```

---

## 新增文件

- ✅ `content/antd1-filler.js` - Ant Design 1.x 专用填写器

## 修改文件

- ✅ `manifest.json` - 添加 `antd1-filler.js`（放在最前面）
- ✅ `content/form-filler.js` - 所有填写方法改为三层优先级

## 加载顺序

```json
{
  "js": [
    "content/safe-storage.js",
    "content/antd1-filler.js",      // ← 第一优先级
    "content/react-filler.js",      // ← 第二优先级
    "content/page-detector.js",
    "content/form-extractor.js",
    "content/form-filler.js",        // ← 使用上面两个
    ...
  ]
}
```

---

## 测试方法

### 1. 浏览器控制台测试

```javascript
// 测试时间选择器
const timePicker = document.querySelector('.ant-time-picker-input');
await AntD1Filler.fillTimePicker(timePicker, '18:00');
console.log('填写后的值:', timePicker.value);

// 测试下拉框
const select = document.querySelector('.ant-select');
await AntD1Filler.fillSelect(select, '普通话');

// 测试搜索框
const searchInput = document.querySelector('#gatherCity');
await AntD1Filler.fillSearchSelect(searchInput, '第比利斯');
```

### 2. 完整流程测试

1. 重新加载扩展
2. 导入测试数据
3. 点击"确认填写"
4. 观察控制台日志
5. 检查填写结果

---

## 预期效果

### 提前预订
- ✅ 天数：`2`
- ✅ 时间：`18:00`
- ✅ 日志显示：`timePicker AntD1填写完成, 当前值: 18:00`

### 服务语言
- ✅ 选中：`普通话`
- ✅ 日志显示：`精确匹配: 普通话`

### 集合城市/目的城市
- ✅ 搜索：`第比利斯`
- ✅ 选中：`格鲁吉亚-第比利斯`（包含关键词的第一个选项）
- ✅ 日志显示：`搜索匹配到: 格鲁吉亚-第比利斯`

### 产品线
- ✅ 值为 `null` 时显示为空白
- ✅ 不会显示字符串 `"null"`

---

## 已知限制

1. **搜索框匹配策略**
   - 只匹配第一个包含关键词的选项
   - 如果期望选择更具体的选项，需要输入更完整的关键词

2. **延迟时间**
   - 为了兼容性，添加了多个延迟
   - 填写速度可能较慢（每个控件约 100-500ms）

3. **Ant Design 版本**
   - 仅针对 1.x 版本优化
   - 其他版本可能需要调整

---

## 故障排除

### 时间控件填写失败

**检查**：
```javascript
const timePicker = document.querySelector('.ant-time-picker-input');
console.log('填写前:', timePicker.value);
await AntD1Filler.fillTimePicker(timePicker, '18:00');
console.log('填写后:', timePicker.value);
```

**可能原因**：
- 延迟时间不够
- 需要更多事件触发

### 下拉框匹配失败

**检查日志**：
```
[AntD1] 可用选项: [...]
[AntD1] 未匹配到: xxx
```

**可能原因**：
- 目标文本与选项文本不匹配
- 需要调整匹配策略

---

*针对 Ant Design 1.0.16 的专用填写方案，通过简化的事件序列和特定的延迟时间，确保在老版本组件上的填写成功率。*
