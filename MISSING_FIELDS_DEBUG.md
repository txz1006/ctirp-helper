# 地接社和紧急联系人字段说明

> 创建时间：2026-06-15
> 字段类型：multiSearchSelect、radio

---

## 字段概览

### 1. 地接社名称
- **Label**: `地接社名称`
- **DomKey**: `bookingControls.localInfoIds`
- **FieldType**: `multiSearchSelect`
- **控件**: 多选搜索下拉框
- **HTML特征**: `.ant-select-selection--multiple`

### 2. 对客展示紧急联系人
- **Label**: `对客展示紧急联系人`
- **DomKey**: `bookingControls.isPublicEmergencyContact`
- **FieldType**: `radio`
- **控件**: 单选按钮组
- **HTML特征**: `.ant-radio-group`

---

## 提取逻辑

### 地接社名称（multiSearchSelect）

**当前实现**：`_extractMultiSearchSelectValue()`

```javascript
_extractMultiSearchSelectValue(controlWrapper) {
  const searchInput = controlWrapper.querySelector('input.ant-select-search__field[id]');
  const id = searchInput ? searchInput.id : '';

  // 提取所有已选项
  const choices = controlWrapper.querySelectorAll('.ant-select-selection__choice');
  const selectedItems = Array.from(choices).map(choice => {
    const content = choice.querySelector('.ant-select-selection__choice__content');
    return {
      text: choice.getAttribute('title') || (content ? content.textContent.trim() : ''),
    };
  });

  return {
    text: selectedItems.map(item => item.text),
    id: id,
    fieldType: 'multiSearchSelect'
  };
}
```

**预期导出数据**：
```json
{
  "地接社名称": {
    "domKey": "bookingControls.localInfoIds",
    "label": "地接社名称",
    "fieldType": "multiSearchSelect",
    "value": {
      "text": ["阅遍文化旅游(北京)有限公司成都分公司"],
      "id": "bookingControls.localInfoIds"
    }
  }
}
```

---

### 对客展示紧急联系人（radio）

**当前实现**：`_extractRadioValue()`

```javascript
_extractRadioValue(controlWrapper) {
  const radio = controlWrapper.querySelector('input[type="radio"]:checked');
  return radio ? radio.value : null;
}
```

**预期导出数据**：
```json
{
  "对客展示紧急联系人": {
    "domKey": "bookingControls.isPublicEmergencyContact",
    "label": "对客展示紧急联系人",
    "fieldType": "radio",
    "value": "T"
  }
}
```

---

## 可能的问题

### 1. Label 文本提取

**问题**：label 内包含 `<span>` 或图标元素

```html
<!-- 地接社名称 -->
<label for="bookingControls.localInfoIds">
  <span>地接社名称<i class="info-circle">ℹ️</i></span>
</label>
```

**影响**：`labelEl.textContent.trim()` 会提取为 `"地接社名称ℹ️"`

**解决方案**：
```javascript
// 方案1：优先提取 title 属性
const labelText = labelEl.getAttribute('title') || labelEl.textContent.trim();

// 方案2：只提取文本节点
const labelText = Array.from(labelEl.childNodes)
  .filter(node => node.nodeType === Node.TEXT_NODE)
  .map(node => node.textContent.trim())
  .join(' ') || labelEl.textContent.trim();
```

### 2. 多列布局（ant-col-12）

**问题**：地接社名称使用了 `ant-col-12`（半宽布局）

```html
<div class="ant-col ant-col-12 ant-form-item-label">
  <label>地接社名称</label>
</div>
```

**影响**：当前提取逻辑查找 `.ant-form-item` 应该能覆盖

**验证**：检查 `_extractGroup()` 中的选择器：
```javascript
const formItems = bodyEl.querySelectorAll('.ant-row.ant-form-item.mb16, .ant-row.ant-form-item');
```

### 3. Radio Group ID 匹配

**问题**：label 的 `for` 属性指向 `ant-radio-group` 的 `id`

```html
<label for="bookingControls.isPublicEmergencyContact">...</label>
<div class="ant-radio-group" id="bookingControls.isPublicEmergencyContact">
  <label class="ant-radio-wrapper">
    <input type="radio" value="T" checked="">
  </label>
</div>
```

**影响**：`_detectFieldType()` 通过查找 `input[type="radio"]` 应该能识别

---

## 调试步骤

### 1. 检查字段是否被提取

在浏览器控制台运行：
```javascript
const data = FormExtractor.extract();
console.log('导出数据:', data);
console.log('基础信息字段:', Object.keys(data.data['基础信息'] || {}));
console.log('预订设置字段:', Object.keys(data.data['预订设置'] || {}));
```

### 2. 手动测试单个字段

```javascript
// 测试地接社名称
const item1 = document.querySelector('label[for="bookingControls.localInfoIds"]').closest('.ant-form-item');
const field1 = FormExtractor._extractFormItem(item1);
console.log('地接社名称:', field1);

// 测试紧急联系人
const item2 = document.querySelector('label[for="bookingControls.isPublicEmergencyContact"]').closest('.ant-form-item');
const field2 = FormExtractor._extractFormItem(item2);
console.log('紧急联系人:', field2);
```

### 3. 检查控件类型识别

```javascript
const item = document.querySelector('label[for="bookingControls.localInfoIds"]').closest('.ant-form-item');
const controlWrapper = item.querySelector('.ant-form-item-control');
const fieldType = FormExtractor._detectFieldType(controlWrapper);
console.log('地接社名称控件类型:', fieldType);
```

---

## 导入行为

### 地接社名称（multiSearchSelect）

**填写方法**：`FormFiller._fillMultiSearchSelect()`

```javascript
async _fillMultiSearchSelect(domKey, value) {
  const texts = Array.isArray(value.text) ? value.text : [String(value.text || '')];
  const searchInput = document.querySelector(`input#${CSS.escape(domKey)}`);
  
  // 先清除所有已选项
  const clearBtn = selectEl.querySelector('.ant-select-selection__clear');
  if (clearBtn) clearBtn.click();
  
  // 逐个搜索并选择
  for (const text of texts) {
    // 输入搜索文本
    nativeSetter.call(searchInput, text);
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    // 等待搜索结果
    const result = await this._waitForSearchResult(text, 5000);
    if (result) this._clickOption(result);
  }
}
```

### 对客展示紧急联系人（radio）

**填写方法**：`FormFiller._fillRadio()`

```javascript
_fillRadio(domKey, value) {
  const label = document.querySelector(`label[for="${domKey}"]`);
  const formItem = label.closest('.ant-form-item');
  const radios = formItem.querySelectorAll('input[type="radio"]');
  
  const targetValue = String(value);
  const target = Array.from(radios).find(radio => {
    const radioText = radio.closest('label')?.textContent.trim() || '';
    return String(radio.value) === targetValue || radioText === targetValue;
  });
  
  if (target && !target.checked) target.click();
}
```

---

## 测试文件

已创建以下测试文件：

1. **`test-missing-fields.html`** - 完整HTML结构测试
2. **`test-debug-extraction.html`** - 调试版本，手动触发提取并显示结果

### 使用方法

1. 在 Chrome 中打开测试文件
2. 确保插件已加载
3. 点击"导出产品数据"或"手动测试提取"按钮
4. 检查导出的 JSON 或调试输出

---

## 修复建议

如果字段确实未被提取，可能需要：

### 1. 优化 Label 文本提取

```javascript
_extractFormItem(item) {
  const labelEl = item.querySelector('.ant-form-item-label label');
  if (!labelEl) return null;

  // 优先使用 title 属性，避免提取到图标文本
  const labelText = labelEl.getAttribute('title') || 
                    labelEl.textContent.trim().replace(/ℹ️/g, '').trim();
  
  // ...
}
```

### 2. 增强字段匹配

确保 `_extractGroup()` 能覆盖所有布局：

```javascript
// 支持 ant-col-12 等多列布局
const formItems = bodyEl.querySelectorAll('.ant-row.ant-form-item');
```

### 3. 添加日志

在 `_extractFormItem()` 中添加调试日志：

```javascript
_extractFormItem(item) {
  const labelEl = item.querySelector('.ant-form-item-label label');
  if (!labelEl) return null;

  const labelText = labelEl.textContent.trim();
  const fieldType = this._detectFieldType(controlWrapper);
  
  console.log(`[提取] ${labelText} - 类型: ${fieldType}`);
  
  // ...
}
```

---

*这两个字段理论上应该被现有代码正确提取，如果未提取，请使用调试文件定位问题所在。*
