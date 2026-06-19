# 模版系统功能设计文档

> Feature: Template System for Form Data Reuse
> Version: 1.0
> Date: 2026-06-15
> Status: Approved

---

## 1. 功能概述

### 1.1 目标

为携程数据迁移助手添加**模版系统**，允许用户保存和复用表单数据，提升重复填写效率。

### 1.2 核心价值

- **场景1**：新建多个相似产品时，快速应用已保存的基础配置
- **场景2**：保存常用的产品配置组合（如"豪华团队游"、"经济自由行"）
- **场景3**：作为数据备份，防止误操作丢失填写内容

---

## 2. 用户流程

### 2.1 保存模版

```
触发方式A：页面底部点击 [💾 保存为模版]
触发方式B：导出数据成功后，点击提示框中的 [💾 保存为模版]
    ↓
弹出对话框
    • 模版名称：[产品模版 1]（可修改）
    • 描述：[选填]
    ↓
点击 [💾 保存]
    ↓
    • 检查名称是否重复 → 是：提示修改
    • 检查模版数量 ≥ 25 → 是：提示删除旧模版
    ↓
保存成功，提示："✅ 模版已保存"
```

**数据来源**：调用 `FormExtractor.extract()` 提取当前页面数据

### 2.2 应用模版

```
方式1：导入面板步骤1
    [○ 粘贴 JSON]
    [● 使用已保存的模版]
    [产品模版 1 ▼]  ← 下拉选择
    ↓
方式2：页面底部
    点击 [📋 模版管理] → 在 B 入口选择模版
    ↓
检查 pageType 兼容性
    • 不匹配：弹出确认 "此模版创建于XXX页面，当前是YYY页面，可能不兼容，是否继续？"
    • 用户取消：结束
    • 用户确认：继续
    ↓
加载模版数据，进入导入流程
    → 转换预览（可以调整过滤/默认值）
    → 匹配预览
    → 确认填写
    → 回读验证
```

### 2.3 管理模版

```
点击 [📋 模版管理]
    ↓
打开模版管理面板（Tab页）
    • 显示模版列表（按更新时间倒序）
    • 每个模版卡片显示：
      - 名称
      - 描述（如有）
      - 创建时间
      - 包含字段数量
    ↓
操作：
    [👁 预览] → 查看模版包含的字段和值（分组折叠展示）
    [✏️ 编辑] → 修改名称和描述
    [🗑️ 删除] → 确认后删除
```

---

## 3. 数据结构

### 3.1 存储位置

`chrome.storage.local` 
- Key: `ctrip_templates`
- Value: 模版数组（最多 25 个）

### 3.2 模版对象结构

```javascript
{
  id: "tpl_1718428800000",           // 时间戳生成
  name: "产品模版 1",                  // 用户输入，不可重复
  description: "豪华团队游基础配置",   // 可选
  pageType: "product-detail",         // 页面类型标识
  data: {                             // 完整的导出JSON
    version: "1.0",
    source: "domestic",
    tab: "基础信息",
    timestamp: "2026-06-15T14:30:00Z",
    data: {
      "基础信息": {
        "产品名称": { ... },
        "产品线": { ... }
      }
    }
  },
  createdAt: "2026-06-15T14:30:00Z",  // ISO 8601
  updatedAt: "2026-06-15T14:30:00Z"   // 编辑时更新
}
```

### 3.3 页面类型标识

当前阶段只有一个：
- `product-detail` - 产品详情页（`/vendor/baseInfoMerge`）

将来扩展：
- `supplier-info` - 供应商信息页
- `product-list` - 产品列表页

---

## 4. 界面设计

### 4.1 页面底部按钮组（新增）

```
原有：[📤 导出数据] [📥 导入数据]

新增：[📤 导出数据] [📥 导入数据] [💾 保存为模版] [📋 模版管理]
```

### 4.2 导出成功提示（新增）

```
┌──────────────────────────────┐
│ ✅ 导出成功！                 │
│ 已复制 25 个字段到剪贴板      │
│                               │
│ 💡 想快速复用？                │
│ [💾 保存为模版]   [关闭]      │
└──────────────────────────────┘
```

### 4.3 保存模版对话框（新增）

```
┌──────────────────────────────┐
│ 💾 保存为模版                 │
├──────────────────────────────┤
│ 模版名称：                     │
│  [产品模版 1____________]     │
│                               │
│ 描述（可选）：                 │
│  [豪华团队游基础配置______]   │
│  [________________________]   │
│                               │
│    [取消]    [💾 保存]        │
└──────────────────────────────┘
```

**验证规则**：
- 名称不能为空
- 名称不能重复
- 名称长度 ≤ 50 字符
- 描述长度 ≤ 200 字符

### 4.4 导入面板步骤1（修改）

```
┌──────────────────────────────┐
│ 步骤1: 选择数据源             │
├──────────────────────────────┤
│ ○ 粘贴 JSON 数据              │
│ ● 使用已保存的模版            │
│                               │
│ 选择模版：                     │
│ [产品模版 1 ▼]                │
│                               │
│ [下一步: 解析并转换]          │
└──────────────────────────────┘
```

**下拉框选项**：
- 显示：模版名称 - 描述（如有）
- 按更新时间倒序排列
- 如果没有模版，显示"暂无模版"并禁用选择

### 4.5 模版管理面板（新增）

```
┌─────────────────────────────────────┐
│ 📋 模版管理                (2/25)    │
├─────────────────────────────────────┤
│ 📦 产品模版 2                        │
│ 描述：豪华团队游基础配置             │
│ 更新时间：2026-06-15 16:30          │
│ 包含 28 个字段                       │
│ [👁 预览] [✏️ 编辑] [🗑️ 删除]      │
├─────────────────────────────────────┤
│ 📦 产品模版 1                        │
│ 更新时间：2026-06-15 14:30          │
│ 包含 25 个字段                       │
│ [👁 预览] [✏️ 编辑] [🗑️ 删除]      │
└─────────────────────────────────────┘
```

右上角显示：`(当前数量/25)`

### 4.6 模版预览对话框（新增）

```
┌─────────────────────────────────────┐
│ 👁 预览：产品模版 1                  │
│                               [关闭] │
├─────────────────────────────────────┤
│ ▶ 📦 基础信息 (12个字段)             │
│                                      │
│ ▼ 📦 预订控制 (8个字段)              │
│   提前预订: 2天, 18:00前可订         │
│   儿童年龄: 2-12周岁                 │
│   最少参团人数: 2人                  │
│   ...                                │
│                                      │
│ ▶ 📦 服务信息 (5个字段)              │
└─────────────────────────────────────┘
```

**交互**：
- 点击分组标题展开/折叠
- 长文本值截断显示（>50字符显示 "...查看全部"）
- 只读，不可编辑

---

## 5. 核心逻辑

### 5.1 模版存储模块（template-storage.js）

```javascript
const TemplateStorage = {
  STORAGE_KEY: 'ctrip_templates',
  MAX_TEMPLATES: 25,

  // 获取所有模版
  async getAll() {
    const result = await chrome.storage.local.get(this.STORAGE_KEY);
    return result[this.STORAGE_KEY] || [];
  },

  // 获取单个模版
  async get(id) {
    const templates = await this.getAll();
    return templates.find(t => t.id === id);
  },

  // 保存模版
  async save(template) {
    const templates = await this.getAll();
    
    // 检查数量限制
    if (templates.length >= this.MAX_TEMPLATES) {
      throw new Error(`最多只能保存${this.MAX_TEMPLATES}个模版`);
    }
    
    // 检查名称重复
    if (templates.some(t => t.name === template.name && t.id !== template.id)) {
      throw new Error('模版名称已存在，请使用不同的名称');
    }
    
    const index = templates.findIndex(t => t.id === template.id);
    if (index >= 0) {
      templates[index] = template;
    } else {
      templates.push(template);
    }
    
    await chrome.storage.local.set({
      [this.STORAGE_KEY]: templates
    });
  },

  // 删除模版
  async delete(id) {
    const templates = await this.getAll();
    const filtered = templates.filter(t => t.id !== id);
    await chrome.storage.local.set({
      [this.STORAGE_KEY]: filtered
    });
  },

  // 按更新时间倒序排列
  sortByUpdatedAt(templates) {
    return templates.sort((a, b) => 
      new Date(b.updatedAt) - new Date(a.updatedAt)
    );
  }
};
```

### 5.2 模版管理模块（template-manager.js）

```javascript
const TemplateManager = {
  // 从当前页面创建模版
  async createFromCurrentPage(name, description = '') {
    const data = FormExtractor.extract();
    const pageType = this._detectPageType();
    
    const template = {
      id: `tpl_${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      pageType,
      data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await TemplateStorage.save(template);
    return template;
  },

  // 生成默认名称
  async generateDefaultName() {
    const templates = await TemplateStorage.getAll();
    const count = templates.length;
    return `产品模版 ${count + 1}`;
  },

  // 应用模版
  async applyTemplate(templateId) {
    const template = await TemplateStorage.get(templateId);
    if (!template) {
      throw new Error('模版不存在');
    }
    
    // 检查页面兼容性
    const currentPageType = this._detectPageType();
    if (template.pageType !== currentPageType) {
      const confirmed = confirm(
        `此模版创建于"${template.pageType}"页面，当前是"${currentPageType}"页面。\n` +
        `可能存在字段不匹配，是否继续？`
      );
      if (!confirmed) return null;
    }
    
    return template.data;
  },

  // 更新模版（只能改名称和描述）
  async updateMetadata(id, name, description) {
    const template = await TemplateStorage.get(id);
    if (!template) {
      throw new Error('模版不存在');
    }
    
    template.name = name.trim();
    template.description = description.trim();
    template.updatedAt = new Date().toISOString();
    
    await TemplateStorage.save(template);
    return template;
  },

  // 删除模版
  async deleteTemplate(id) {
    const template = await TemplateStorage.get(id);
    if (!template) {
      throw new Error('模版不存在');
    }
    
    const confirmed = confirm(`确定要删除模版"${template.name}"吗？`);
    if (!confirmed) return false;
    
    await TemplateStorage.delete(id);
    return true;
  },

  // 检测页面类型
  _detectPageType() {
    if (window.location.href.includes('/vendor/baseInfoMerge')) {
      return 'product-detail';
    }
    return 'unknown';
  }
};
```

---

## 6. 边界情况处理

### 6.1 存储限制

| 情况 | 处理方式 |
|------|---------|
| 模版数量 ≥ 25 | 保存时提示："最多保存25个模版，请删除一些旧模版后重试" |
| chrome.storage 写入失败 | 捕获错误，提示："保存失败，请稍后重试" |

### 6.2 名称验证

| 情况 | 处理方式 |
|------|---------|
| 名称为空 | 禁用保存按钮 |
| 名称重复 | 保存时提示："此名称已存在，请使用不同的名称" |
| 名称过长（>50字符） | 输入框限制 maxlength=50 |

### 6.3 页面兼容性

| 情况 | 处理方式 |
|------|---------|
| pageType 不匹配 | 弹出确认对话框，允许用户选择继续或取消 |
| 模版字段在当前页面不存在 | 在"匹配预览"步骤自然显示为"未匹配字段" |

### 6.4 空状态

| 情况 | 显示内容 |
|------|---------|
| 没有任何模版 | "暂无模版，请先保存一个模版" + [💾 立即创建] 按钮 |
| 搜索/筛选后无结果 | "未找到匹配的模版" |

---

## 7. 技术约束

### 7.1 浏览器兼容性

- **Chrome 88+**（Manifest V3）
- 使用 `chrome.storage.local` API
- 容量限制：5-10MB（实际使用预计 < 2MB）

### 7.2 性能考虑

- 单个模版大小预计：50-200KB
- 25 个模版总计：1.25-5MB
- 读取所有模版：< 100ms（可接受）

### 7.3 不支持的功能（留待将来）

- ❌ 导出模版为文件
- ❌ 从文件导入模版
- ❌ 模版共享/同步
- ❌ 修改模版数据内容
- ❌ 模版版本管理

---

## 8. 测试场景

### 8.1 基础功能

- [ ] 保存模版：从当前页面保存，验证数据完整性
- [ ] 应用模版：选择模版，验证数据正确填入
- [ ] 编辑模版：修改名称和描述，验证更新成功
- [ ] 删除模版：删除后验证不再显示
- [ ] 预览模版：查看字段和值，验证显示正确

### 8.2 边界情况

- [ ] 保存时名称重复：提示错误
- [ ] 保存时达到25个上限：提示删除旧模版
- [ ] 应用时 pageType 不匹配：弹出确认对话框
- [ ] 空模版列表：显示空状态提示
- [ ] 导出成功后保存：验证触发流程

### 8.3 数据一致性

- [ ] 保存后立即查看：验证数据未丢失
- [ ] 刷新页面后查看：验证数据持久化
- [ ] 编辑后时间戳更新：验证 updatedAt 字段
- [ ] 删除后其他模版不受影响：验证隔离性

---

## 9. 开发优先级

### P0（必须）
- ✅ 模版存储模块（template-storage.js）
- ✅ 模版管理模块（template-manager.js）
- ✅ 保存模版对话框 UI
- ✅ 模版管理面板 UI
- ✅ 导入面板步骤1集成模版选择

### P1（重要）
- ✅ 导出成功提示中的保存按钮
- ✅ 页面底部新增按钮
- ✅ 模版预览对话框
- ✅ 编辑模版对话框

### P2（可选）
- ⚪ 模版搜索/筛选功能
- ⚪ 模版使用统计（记录应用次数）
- ⚪ 模版标签分类

---

*本文档定义了模版系统的完整功能规格，作为开发和测试的依据。*
