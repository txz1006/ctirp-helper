# 携程数据迁移助手 - 重构方案

> 目标：从单页面工具升级为通用的携程VBK后台数据迁移助手

---

## 一、核心能力升级

### 1.1 通用表单提取/填写引擎

**现状**：
- 代码写死在产品详情页面
- page-detector.js 硬编码判断 URL
- form-extractor.js 和 form-filler.js 与具体字段耦合

**目标**：
- 自动识别任何页面的 Ant Design 表单
- 通用的提取和填写逻辑
- 支持用户自定义字段映射规则

**架构设计**：

```
content/
├── core/
│   ├── universal-detector.js      # 通用页面检测
│   ├── universal-extractor.js     # 通用表单提取引擎
│   ├── universal-filler.js        # 通用表单填写引擎
│   └── field-analyzer.js          # 字段类型自动识别
│
├── adapters/                       # 页面适配器
│   ├── product-detail.js          # 产品详情页（现有逻辑）
│   ├── product-list.js            # 产品列表页
│   ├── supplier-info.js           # 供应商信息页
│   └── adapter-registry.js        # 适配器注册表
│
├── templates/
│   ├── template-manager.js        # 模版管理
│   └── template-storage.js        # 模版存储
│
└── features/
    ├── image-downloader.js        # 图片批量下载
    └── feature-registry.js        # 功能注册表
```

---

## 二、通用表单引擎设计

### 2.1 自动字段识别

```javascript
// field-analyzer.js
const FieldAnalyzer = {
  /**
   * 分析 form-item，自动识别字段类型
   */
  analyzeField(formItem) {
    const label = this.extractLabel(formItem);
    const domKey = this.extractDomKey(formItem);
    const control = this.detectControl(formItem);

    return {
      label,           // 字段名
      domKey,          // DOM 标识
      fieldType,       // input/select/timePicker/etc
      controlType,     // Ant Design 组件类型
      isRequired,      // 是否必填
      value: null      // 当前值
    };
  },

  detectControl(formItem) {
    // 检测控件类型
    if (formItem.querySelector('.ant-input')) return 'input';
    if (formItem.querySelector('.ant-select')) return 'select';
    if (formItem.querySelector('.ant-time-picker')) return 'timePicker';
    if (formItem.querySelector('.ant-input-number')) return 'inputNumber';
    // ... 更多类型
  }
};
```

### 2.2 页面适配器模式

```javascript
// adapters/adapter-registry.js
const AdapterRegistry = {
  adapters: new Map(),

  /**
   * 注册页面适配器
   */
  register(pattern, adapter) {
    this.adapters.set(pattern, adapter);
  },

  /**
   * 查找匹配的适配器
   */
  findAdapter(url) {
    for (const [pattern, adapter] of this.adapters) {
      if (this.matchPattern(pattern, url)) {
        return adapter;
      }
    }
    return null; // 使用默认通用适配器
  },

  matchPattern(pattern, url) {
    if (typeof pattern === 'string') {
      return url.includes(pattern);
    }
    if (pattern instanceof RegExp) {
      return pattern.test(url);
    }
    if (typeof pattern === 'function') {
      return pattern(url);
    }
    return false;
  }
};

// 注册产品详情页适配器
AdapterRegistry.register(
  /\/vendor\/baseInfoMerge\?producttype=/,
  ProductDetailAdapter
);
```

### 2.3 适配器接口

```javascript
// adapters/product-detail.js
const ProductDetailAdapter = {
  name: '产品详情页',

  /**
   * 页面特定的字段提取规则
   */
  extractFields(doc = document) {
    // 可以使用通用引擎
    const fields = UniversalExtractor.extractAll(doc);

    // 或者自定义特殊逻辑
    return this.customizeFields(fields);
  },

  /**
   * 自定义字段映射
   */
  customizeFields(fields) {
    // 处理特殊字段
    fields.forEach(field => {
      if (field.label === '提前预订') {
        field.fieldType = 'mixedGroup'; // 自定义类型
      }
    });
    return fields;
  },

  /**
   * 页面特定的填写规则
   */
  async fillFields(data) {
    // 使用通用填写引擎
    return UniversalFiller.fillAll(data);
  }
};
```

---

## 三、模版系统设计

### 3.1 模版管理器

```javascript
// templates/template-manager.js
const TemplateManager = {
  /**
   * 保存当前页面数据为模版
   */
  async saveAsTemplate(name, description) {
    // 1. 提取当前页面数据
    const data = await this.extractCurrentPage();

    // 2. 创建模版
    const template = {
      id: this.generateId(),
      name,
      description,
      pageType: this.detectPageType(),
      url: window.location.href,
      data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 3. 存储
    await TemplateStorage.save(template);

    return template;
  },

  /**
   * 加载模版并填写到当前页面
   */
  async applyTemplate(templateId) {
    // 1. 读取模版
    const template = await TemplateStorage.get(templateId);

    // 2. 检查页面类型是否匹配
    if (!this.isPageCompatible(template)) {
      throw new Error('模版与当前页面类型不匹配');
    }

    // 3. 填写数据
    await UniversalFiller.fillAll(template.data);
  },

  /**
   * 列出所有模版
   */
  async listTemplates(pageType = null) {
    const templates = await TemplateStorage.getAll();

    if (pageType) {
      return templates.filter(t => t.pageType === pageType);
    }

    return templates;
  }
};
```

### 3.2 模版存储

```javascript
// templates/template-storage.js
const TemplateStorage = {
  STORAGE_KEY: 'ctrip_templates',

  async save(template) {
    const templates = await this.getAll();
    
    // 查找是否已存在
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

  async getAll() {
    const result = await chrome.storage.local.get(this.STORAGE_KEY);
    return result[this.STORAGE_KEY] || [];
  },

  async get(id) {
    const templates = await this.getAll();
    return templates.find(t => t.id === id);
  },

  async delete(id) {
    const templates = await this.getAll();
    const filtered = templates.filter(t => t.id !== id);
    await chrome.storage.local.set({
      [this.STORAGE_KEY]: filtered
    });
  }
};
```

### 3.3 UI 界面更新

```javascript
// 面板增加模版管理区域
<div class="panel-section">
  <h3>模版管理</h3>
  
  <!-- 保存为模版 -->
  <div class="action-group">
    <button id="saveAsTemplate">💾 保存为模版</button>
  </div>

  <!-- 模版列表 -->
  <div class="template-list">
    <!-- 动态生成 -->
    <div class="template-item">
      <span class="template-name">产品模版1</span>
      <button class="apply-btn">应用</button>
      <button class="delete-btn">删除</button>
    </div>
  </div>
</div>
```

---

## 四、功能注册表系统

```javascript
// features/feature-registry.js
const FeatureRegistry = {
  features: new Map(),

  /**
   * 注册功能
   */
  register(id, feature) {
    this.features.set(id, {
      id,
      name: feature.name,
      icon: feature.icon,
      description: feature.description,
      pageTypes: feature.pageTypes || ['*'], // 适用页面
      execute: feature.execute,
      isAvailable: feature.isAvailable || (() => true)
    });
  },

  /**
   * 获取当前页面可用的功能
   */
  getAvailableFeatures(pageType) {
    const features = [];
    
    for (const [id, feature] of this.features) {
      // 检查页面类型
      const matchesPage = feature.pageTypes.includes('*') ||
                          feature.pageTypes.includes(pageType);
      
      // 检查是否可用
      if (matchesPage && feature.isAvailable()) {
        features.push(feature);
      }
    }

    return features;
  }
};

// 注册图片下载功能
FeatureRegistry.register('downloadImages', {
  name: '下载图片',
  icon: '🖼️',
  description: '批量下载当前页面的所有图片',
  pageTypes: ['product-detail', 'product-list'],
  
  isAvailable() {
    // 检查页面是否有图片
    return document.querySelectorAll('img').length > 0;
  },

  async execute() {
    await ImageDownloader.downloadAllImages();
  }
});
```

---

## 五、重构步骤

### 阶段1：核心引擎重构（优先）
1. ✅ 创建 `universal-extractor.js` - 通用提取引擎
2. ✅ 创建 `universal-filler.js` - 通用填写引擎
3. ✅ 创建 `field-analyzer.js` - 字段类型识别
4. ✅ 迁移现有逻辑到 `product-detail.js` 适配器

### 阶段2：模版系统（高优先级）
1. ✅ 创建 `template-manager.js`
2. ✅ 创建 `template-storage.js`
3. ✅ 更新 UI 界面
4. ✅ 添加保存/应用/删除模版功能

### 阶段3：功能扩展（中优先级）
1. ✅ 创建功能注册表
2. ✅ 实现图片下载功能
3. ✅ UI 支持动态功能列表

### 阶段4：多页面支持（低优先级）
1. 添加更多页面适配器
2. 优化通用引擎

---

## 六、manifest.json 更新

```json
{
  "name": "携程数据迁移助手",
  "description": "携程VBK后台数据迁移、模版管理、批量操作工具",
  "version": "2.0.0",
  
  "permissions": [
    "storage",           // 存储模版
    "downloads",         // 下载图片
    "activeTab",
    "scripting"
  ],

  "content_scripts": [{
    "matches": ["https://vbooking.ctrip.com/*"],
    "js": [
      // 核心引擎
      "content/core/field-analyzer.js",
      "content/core/universal-extractor.js",
      "content/core/universal-filler.js",
      
      // 适配器
      "content/adapters/adapter-registry.js",
      "content/adapters/product-detail.js",
      
      // 模版
      "content/templates/template-storage.js",
      "content/templates/template-manager.js",
      
      // 功能
      "content/features/feature-registry.js",
      "content/features/image-downloader.js",
      
      // 现有文件
      "content/safe-storage.js",
      "content/antd1-filler.js",
      "content/form-filler.js",
      "content/export.js",
      "content/import.js",
      "content/panel.js",
      "content/main.js"
    ]
  }]
}
```

---

## 七、用户体验优化

### 7.1 面板UI重新设计

```
┌─────────────────────────────────────┐
│ 🚀 携程数据迁移助手                   │
├─────────────────────────────────────┤
│ 📄 当前页面：产品详情页                │
│                                      │
│ ⚡ 快速操作                           │
│  [📤 导出数据] [📥 导入数据]          │
│                                      │
│ 💾 模版管理                           │
│  [💾 保存为模版]                     │
│                                      │
│  模版列表 (3个)                       │
│  ┌──────────────────────────────┐  │
│  │ 📋 基础产品模版                │  │
│  │    [✓ 应用] [🗑️ 删除]        │  │
│  ├──────────────────────────────┤  │
│  │ 📋 豪华团队游模版              │  │
│  │    [✓ 应用] [🗑️ 删除]        │  │
│  └──────────────────────────────┘  │
│                                      │
│ 🔧 更多功能                           │
│  [🖼️ 下载图片]                       │
│  [📊 数据统计]                       │
└─────────────────────────────────────┘
```

### 7.2 模版对话框

```
┌─────────────────────────────────────┐
│ 💾 保存为模版                         │
├─────────────────────────────────────┤
│ 模版名称：                            │
│  [________________]                  │
│                                      │
│ 描述（可选）：                        │
│  [_______________________________]  │
│  [_______________________________]  │
│                                      │
│ 包含字段：                            │
│  ☑ 基础信息 (12个字段)               │
│  ☑ 预订控制 (8个字段)                │
│  ☑ 服务信息 (5个字段)                │
│                                      │
│      [取消]    [💾 保存]             │
└─────────────────────────────────────┘
```

---

## 八、兼容性考虑

### 8.1 向后兼容

- 保留现有的导出/导入功能
- 旧的导出JSON可以自动识别为"临时模版"
- 用户无感知升级

### 8.2 渐进式迁移

```javascript
// main.js 初始化逻辑
async function initialize() {
  // 1. 检测页面类型
  const pageType = UniversalDetector.detect();
  
  // 2. 查找适配器
  const adapter = AdapterRegistry.findAdapter(window.location.href);
  
  if (adapter) {
    // 使用适配器（新架构）
    console.log('使用适配器:', adapter.name);
  } else {
    // 回退到通用引擎
    console.log('使用通用引擎');
  }
  
  // 3. 初始化UI
  await PanelUI.initialize(pageType);
}
```

---

## 九、开发优先级

### 高优先级（1-2周）
1. ✅ 模版系统（最有用，立即可用）
2. ✅ UI 重新设计
3. ✅ 重命名为"携程数据迁移助手"

### 中优先级（2-4周）
1. 通用表单引擎（复杂，但长期价值高）
2. 适配器系统
3. 图片下载功能

### 低优先级（长期）
1. 更多页面支持
2. 数据统计功能
3. 导出格式优化（Excel等）

---

## 十、技术债务清理

1. ✅ 删除硬编码的页面检测逻辑
2. ✅ 统一繁简体转换（移到工具类）
3. ✅ 优化延迟和重试机制
4. ✅ 增加错误日志收集
5. ✅ 添加单元测试

---

*这是一个从单一功能工具到通用数据迁移助手的完整重构方案。*
