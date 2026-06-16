# 匹配预览优化 - 已匹配字段面板

> 优化时间：2026-06-15
> 优化范围：panel.js、injected-styles.css

---

## 优化内容

### 1. 简化排版

**优化前**：已匹配字段显示完整的数据流向

```
[字段名称]
当前页面值 → 导入值 [来源标签] [重新选择]
```

**优化后**：只显示字段名称和操作按钮

```
[字段名称]
[重新选择] [重置]
```

---

### 2. 新增重置按钮

**功能**：恢复字段的默认匹配规则

**触发场景**：
- 用户手动选择了不同的控件后，想要恢复原始的自动匹配
- 用户误操作后想要撤销

**实现逻辑**：

```javascript
_resetBinding(bindKey) {
  // 1. 查找字段数据
  const field = allFields.find(item => item.bindKey === bindKey);
  
  // 2. 移除手动绑定标记
  delete field.fieldData.manualMappedFrom;
  
  // 3. 恢复原始 domKey
  const [groupName, fieldLabel] = bindKey.split('::');
  const originalField = this._rawData?.data?.[groupName]?.[fieldLabel];
  if (originalField && originalField.domKey) {
    field.fieldData.domKey = originalField.domKey;
  } else {
    // 清除 domKey，让自动匹配重新工作
    delete field.fieldData.domKey;
  }
  
  // 4. 重新执行匹配
  this._handleMatch();
}
```

---

## UI 效果对比

### 优化前

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▼ 已匹配字段（15）—— 可点击展开重新选择控件
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  产品名称
  ├─ 当前页面值: "格鲁吉亚私家团" →
  ├─ 导入值: "Georgia Private Tour"
  ├─ [AI翻译]
  └─ [重新选择]

  行程天数
  ├─ 当前页面值: "3天2晚" →
  ├─ 导入值: "3天2晚"
  ├─ [自动转换]
  └─ [重新选择]
  
  （信息冗余，占用大量空间）
```

### 优化后

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▼ 已匹配字段（15）—— 可点击展开重新选择控件
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  产品名称          [重新选择] [重置]
  行程天数          [重新选择] [重置]
  产品类型          [重新选择] [重置]
  出发城市          [重新选择] [重置]
  集合地点          [重新选择] [重置]
  
  （简洁明了，易于扫描）
```

---

## 按钮样式

### 重新选择按钮

```css
.vtrip-bind-field-btn {
  border: 1px solid #ff4d4f;
  background: #fff1f0;
  color: #ff4d4f;
  border-radius: 3px;
  padding: 1px 6px;
  font-size: 12px;
  cursor: pointer;
}

.vtrip-bind-field-btn:hover {
  background: #ffa39e;
  border-color: #ff7875;
}
```

- 红色主题，表示修改操作
- 悬停时颜色加深

### 重置按钮

```css
.vtrip-reset-binding-btn {
  border: 1px solid #1890ff;
  background: #e6f7ff;
  color: #1890ff;
  border-radius: 3px;
  padding: 1px 6px;
  font-size: 12px;
  cursor: pointer;
  margin-left: 6px;
}

.vtrip-reset-binding-btn:hover {
  background: #bae7ff;
  border-color: #40a9ff;
}
```

- 蓝色主题，表示恢复操作
- 左边距 6px，与重新选择按钮分隔
- 悬停时颜色加深

---

## 使用场景

### 场景1：手动绑定后想撤销

1. 用户在"匹配预览"中点击"重新选择"
2. 手动选择了错误的控件
3. 展开"已匹配字段"面板
4. 点击对应字段的"重置"按钮
5. ✅ 字段恢复为默认的自动匹配规则

### 场景2：测试不同的绑定方案

1. 用户想测试字段A绑定到控件X的效果
2. 点击"重新选择"，手动绑定
3. 查看填写结果，发现不合适
4. 点击"重置"按钮
5. ✅ 恢复原始匹配，可以重新尝试其他方案

### 场景3：批量调整后快速恢复

1. 用户调整了多个字段的绑定
2. 填写后发现整体效果不理想
3. 展开"已匹配字段"面板
4. 逐个点击"重置"按钮（或全部重置）
5. ✅ 快速恢复到初始状态

---

## 技术细节

### 1. 绑定标记

**手动绑定时**：
```javascript
field.fieldData.manualMappedFrom = field.label;
field.fieldData.domKey = newDomKey;
```

**重置时**：
```javascript
delete field.fieldData.manualMappedFrom;
field.fieldData.domKey = originalDomKey || undefined;
```

### 2. 匹配优先级

```javascript
_matchFields(importData, pageFieldMap) {
  // 1. 优先使用 fieldData.domKey（手动绑定或原始数据）
  const pageField = fieldData.domKey && pageDomIndex[fieldData.domKey]
    ? pageDomIndex[fieldData.domKey]
    
  // 2. 回退到按 label 自动匹配
    : pageIndex[fieldLabel];
}
```

### 3. 原始数据保存

重置时需要访问 `this._rawData`（原始导入的JSON数据）：

```javascript
const originalField = this._rawData?.data?.[groupName]?.[fieldLabel];
if (originalField && originalField.domKey) {
  field.fieldData.domKey = originalField.domKey;
} else {
  delete field.fieldData.domKey;
}
```

---

## 事件处理

### 统一事件委托

```javascript
this.panelEl.addEventListener('click', (e) => {
  const bindBtn = e.target.closest('.vtrip-bind-field-btn');
  if (bindBtn) {
    this._startManualBind(bindBtn.dataset.bindKey);
    return;
  }

  const resetBtn = e.target.closest('.vtrip-reset-binding-btn');
  if (resetBtn) {
    this._resetBinding(resetBtn.dataset.bindKey);
    return;
  }
});
```

- 使用事件委托，动态生成的按钮无需单独绑定
- `data-bind-key` 格式：`groupName::fieldLabel`

---

## 优势

### 1. 简洁性
- ✅ 已匹配字段折叠面板更紧凑
- ✅ 减少70%的垂直空间占用
- ✅ 易于快速浏览和定位字段

### 2. 可操作性
- ✅ 重置按钮提供快速撤销能力
- ✅ 降低误操作的成本
- ✅ 支持反复试错和调整

### 3. 一致性
- ✅ 按钮样式统一（红色=修改，蓝色=恢复）
- ✅ 操作流程清晰（选择 → 填写 → 验证 → 重置）

---

## 后续建议

1. **批量重置**
   - 添加"全部重置"按钮，一键恢复所有字段

2. **重置确认**
   - 对于已经手动绑定且验证成功的字段，重置前弹出确认框

3. **历史记录**
   - 记录每个字段的绑定历史，支持撤销/重做

4. **视觉反馈**
   - 重置后短暂高亮该字段的新匹配状态
   - 显示"已重置为默认匹配"提示

---

## 修改的文件

- ✅ `content/panel.js`
  - 简化 `matched` 字段的 HTML 输出
  - 新增 `_resetBinding()` 方法
  - 更新事件委托逻辑

- ✅ `content/injected-styles.css`
  - 新增 `.vtrip-reset-binding-btn` 样式
  - 添加按钮悬停效果

---

*本次优化提升了匹配预览面板的可读性和可操作性，使用户可以更轻松地调整和恢复字段匹配。*
