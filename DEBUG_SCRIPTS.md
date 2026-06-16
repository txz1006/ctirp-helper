# 调试脚本 - 请在浏览器控制台运行

## 1. 检查 React 是否存在
```javascript
// 检查全局 React
console.log('React:', typeof React !== 'undefined' ? React.version : 'Not found');

// 检查某个输入框的 Fiber
const input = document.querySelector('input[type="text"]');
if (input) {
  const keys = Object.keys(input);
  console.log('Input keys:', keys.filter(k => k.includes('react') || k.includes('fiber')));
  
  const fiberKey = keys.find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
  console.log('Fiber key:', fiberKey);
  console.log('Fiber:', input[fiberKey]);
}
```

## 2. 检查时间选择器
```javascript
const timePicker = document.querySelector('.ant-time-picker-input');
if (timePicker) {
  console.log('TimePicker value:', timePicker.value);
  
  // 测试直接赋值
  timePicker.value = '18:00';
  console.log('After set:', timePicker.value);
  
  // 测试触发事件
  timePicker.focus();
  timePicker.dispatchEvent(new Event('input', { bubbles: true }));
  timePicker.dispatchEvent(new Event('change', { bubbles: true }));
  timePicker.blur();
  
  console.log('After events:', timePicker.value);
}
```

## 3. 检查服务语言下拉框
```javascript
// 找到服务语言下拉框
const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent.includes('服务语言'));
console.log('服务语言 label:', label);

if (label) {
  const formItem = label.closest('.ant-form-item');
  const select = formItem.querySelector('.ant-select');
  console.log('Select element:', select);
  
  // 打开下拉框
  select.querySelector('.ant-select-selection').click();
  
  // 等待1秒后检查选项
  setTimeout(() => {
    const dropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    const options = Array.from(dropdown.querySelectorAll('.ant-select-dropdown-menu-item'));
    console.log('Options:', options.map(o => o.textContent.trim()));
  }, 1000);
}
```

## 4. 检查集合城市搜索框
```javascript
const cityInput = document.querySelector('#gatherCity, #assembleCity, input[id*="city" i][id*="gather" i]');
console.log('City input:', cityInput);

if (cityInput) {
  const select = cityInput.closest('.ant-select');
  console.log('City select:', select);
  
  // 输入搜索
  cityInput.value = '第比利斯';
  cityInput.dispatchEvent(new Event('input', { bubbles: true }));
  
  // 等待2秒后检查搜索结果
  setTimeout(() => {
    const dropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    const options = Array.from(dropdown.querySelectorAll('.ant-select-dropdown-menu-item'));
    console.log('Search results:', options.map(o => o.textContent.trim()));
  }, 2000);
}
```

## 5. 检查提前预订字段结构
```javascript
const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent.includes('提前预订'));
if (label) {
  const formItem = label.closest('.ant-form-item');
  const children = formItem.querySelector('.ant-form-item-children');
  
  console.log('提前预订 structure:');
  console.log('- inputNumber:', children.querySelectorAll('.ant-input-number').length);
  console.log('- timePicker:', children.querySelectorAll('.ant-time-picker').length);
  console.log('- select:', children.querySelectorAll('.ant-select').length);
  
  // 列出所有控件
  const controls = [];
  Array.from(children.children).forEach(node => {
    if (node.classList.contains('ant-input-number')) controls.push('inputNumber');
    else if (node.classList.contains('ant-time-picker')) controls.push('timePicker');
    else if (node.classList.contains('ant-select')) controls.push('select');
    else if (node.nodeName === 'SPAN') controls.push(`span: ${node.textContent.trim()}`);
  });
  console.log('Controls order:', controls);
}
```

请运行这些脚本并告诉我结果，我会根据实际情况调整方案。
