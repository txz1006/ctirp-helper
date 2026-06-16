# 目的地信息提取功能说明

> 添加时间：2026-06-15
> 功能：自动提取产品标题作为目的地信息字段

---

## 需求背景

在导出产品数据时，需要额外提取页面顶部的产品完整标题（contentcard-desc-title），作为"目的地信息"字段包含在导出数据中。

**HTML 结构**：
```html
<div class="contentcard-desc-title">
  <span data-lcpignore="true" style="margin-right: 16px;">
    格鲁吉亚+亚美尼亚10日9晚私家团·=定制线路·不含酒店=英文司机+中文管家| 24h接送机+独立成团 | 孤独星球封面*四驱车登山*酒庄品酒*诺亚方舟停靠地*高加索蓝眼泪
  </span>
  <i aria-label="图标: info-circle" class="anticon anticon-info-circle">...</i>
</div>
```

**目标**：
- Label: `目的地信息`
- DomKey: `baseInfo.destinationInfo`
- FieldType: `input`
- Value: span 标签内的完整文本内容

---

## 实现方案

### 1. 提取逻辑（form-extractor.js）

**位置**：`_extractGroup()` 方法中，在提取表单字段和特殊区域后

**新增方法**：`_extractDestinationInfo()`

```javascript
/**
 * 提取目的地信息（contentcard-desc-title）
 * @param {HTMLElement} bodyEl - content-cardbody元素
 * @returns {object|null}
 */
_extractDestinationInfo(bodyEl) {
  // 查找 contentcard-desc-title 元素
  const titleEl = bodyEl.querySelector('.contentcard-desc-title span[data-lcpignore="true"]');
  if (!titleEl) return null;

  const text = titleEl.textContent.trim();
  if (!text) return null;

  return {
    domKey: 'baseInfo.destinationInfo',
    label: '目的地信息',
    value: text,
    fieldType: 'input'
  };
}
```

**调用位置**：
```javascript
_extractGroup(bodyEl) {
  const groupData = {};

  // ... 提取表单字段 ...
  // ... 提取国家景区 ...

  // 提取目的地信息
  const destinationInfo = this._extractDestinationInfo(bodyEl);
  if (destinationInfo) {
    groupData['目的地信息'] = destinationInfo;
  }

  return groupData;
}
```

---

## 数据结构

### 导出 JSON 示例

```json
{
  "version": "1.0",
  "source": "domestic",
  "tab": "基础信息",
  "timestamp": "2026-06-15T10:30:00.000Z",
  "data": {
    "基础信息": {
      "目的地信息": {
        "domKey": "baseInfo.destinationInfo",
        "label": "目的地信息",
        "value": "格鲁吉亚+亚美尼亚10日9晚私家团·=定制线路·不含酒店=英文司机+中文管家| 24h接送机+独立成团 | 孤独星球封面*四驱车登山*酒庄品酒*诺亚方舟停靠地*高加索蓝眼泪",
        "fieldType": "input"
      },
      "产品名称": {
        "domKey": "baseInfo.productName",
        "label": "产品名称",
        "value": "格鲁吉亚+亚美尼亚10日9晚私家团",
        "fieldType": "input"
      },
      "产品类型": {
        "domKey": "baseInfo.tourType",
        "label": "产品类型",
        "value": { "text": "私家团", "fieldType": "select" },
        "fieldType": "select"
      }
    }
  }
}
```

---

## 导入行为

### 字段类型：input

目的地信息字段类型为 `input`，在导入时会：

1. **转换预览阶段**：
   - 检测为中文内容，标记为"待翻译"
   - 如果配置了翻译 API，调用大模型翻译为英文
   - 翻译失败时保留原文并标记

2. **匹配预览阶段**：
   - 尝试在国际版页面查找 `label="目的地信息"` 或 `domKey="baseInfo.destinationInfo"` 的输入框
   - 如果未找到，显示为"未匹配字段"，可手动选择控件绑定
   - 如果找到，显示为"已匹配字段"，可重新选择

3. **确认填写阶段**：
   - 使用 `FormFiller._fillInput()` 方法填写
   - 如果勾选了"过滤"，跳过填写
   - 如果设置了"默认值"，使用默认值填写

4. **回读验证阶段**：
   - 对比填写后的实际值与期望值
   - 高亮显示差异

---

## 特殊处理

### 1. 选择器优先级

```javascript
// 优先选择带 data-lcpignore 的 span
.contentcard-desc-title span[data-lcpignore="true"]
```

这样可以避免提取到右侧的图标元素。

### 2. 容错处理

- 如果 `.contentcard-desc-title` 不存在，返回 `null`，不影响其他字段提取
- 如果 span 文本为空，返回 `null`
- 只在"基础信息"分组中添加此字段

### 3. 跨 Tab 提取

目的地信息通常只在"基础信息" Tab 中出现，如果切换到其他 Tab（如"预订设置"、"服务信息"），此字段不会被提取。

---

## 测试验证

### 测试页面

已创建 `test-destination-info.html`，包含：
- contentcard-desc-title 结构
- 基础信息分组
- 普通表单字段（产品名称、产品类型）

### 测试步骤

1. 在 Chrome 中打开 `test-destination-info.html`
2. 确保插件已加载
3. 点击"导出产品数据"按钮
4. 检查导出的 JSON：
   ```json
   {
     "data": {
       "基础信息": {
         "目的地信息": {
           "domKey": "baseInfo.destinationInfo",
           "label": "目的地信息",
           "value": "格鲁吉亚+亚美尼亚10日9晚私家团·=定制线路·不含酒店=英文司机+中文管家| 24h接送机+独立成团 | 孤独星球封面*四驱车登山*酒庄品酒*诺亚方舟停靠地*高加索蓝眼泪",
           "fieldType": "input"
         },
         "产品名称": { ... },
         "产品类型": { ... }
       }
     }
   }
   ```

5. 切换到国际版页面，点击"导入产品数据"
6. 粘贴导出的 JSON，点击"解析并转换"
7. 检查"转换预览"中"目的地信息"字段：
   - ✅ 显示来源标签：`AI翻译` 或 `待翻译`
   - ✅ 显示翻译后的英文内容（如果配置了 API）

8. 点击"匹配预览"：
   - 如果页面有对应输入框，显示为"已匹配"
   - 如果没有，显示为"未匹配"，可手动选择控件

9. 点击"确认填写"，检查回读验证结果

---

## 兼容性

### 向后兼容

- ✅ 旧数据中没有"目的地信息"字段时，导入仍正常工作
- ✅ 如果页面不存在 `.contentcard-desc-title`，此字段不会出现在导出数据中
- ✅ 不影响其他字段的提取和填写

### 数据格式

- ✅ 与普通 input 字段格式一致，无需特殊处理
- ✅ 支持翻译、过滤、默认值等所有标准功能

---

## 注意事项

1. **长文本处理**
   - 产品标题可能很长（200+ 字符）
   - 翻译时需确保 API 支持长文本
   - 导入时目标输入框需支持长文本

2. **特殊字符**
   - 标题中可能包含特殊字符（`*`、`|`、`·` 等）
   - 需确保 JSON 序列化正确
   - 翻译时保留格式标记

3. **多语言**
   - 国内版：中文标题
   - 国际版：英文标题
   - 建议配置翻译 API 自动转换

---

## 修改的文件

- ✅ `content/form-extractor.js`
  - `_extractGroup()` - 调用目的地信息提取
  - `_extractDestinationInfo()` - 新增方法

- ✅ `test-destination-info.html` - 新增测试页面

---

## 后续建议

1. **智能识别**
   - 如果国际版页面没有对应输入框，可考虑将目的地信息填入"产品名称"字段
   - 或在导入时提供"跳过此字段"选项

2. **格式优化**
   - 翻译时可要求 AI 优化格式，如将 `·` 转换为 `•`
   - 将中文标点转换为英文标点

3. **预处理**
   - 在导入前可提供"编辑"功能，手动修改长文本
   - 支持拆分为多个字段（产品名称、亮点、特色等）

---

*本次改造确保产品完整标题能够被正确提取和导入，为数据迁移提供更完整的信息。*
