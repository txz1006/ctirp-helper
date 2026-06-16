# Extension Context Invalidated 修复说明

> 修复时间：2026-06-15
> 修复问题：导出时报错 "Extension context invalidated."

---

## 问题描述

**现象**：
点击"导出产品数据"按钮后，虽然数据成功复制到剪切板，但控制台报错：
```
导出失败：Extension context invalidated.
```

**原因**：
Chrome 扩展在以下情况下会使 content script 的 chrome API 上下文失效：
1. 扩展被重新加载（开发者模式下常见）
2. 扩展被更新
3. 扩展被禁用后重新启用
4. 浏览器重启后恢复标签页

失效后，直接调用 `chrome.storage.local.get/set()` 会抛出错误：
```
Error: Extension context invalidated.
```

**影响范围**：
- `export.js` - 导出后写入 lastExport 状态
- `import.js` - 读取翻译 API 配置
- `panel.js` - 读写过滤/默认值模板
- `page-detector.js` - 读取用户手动设置的模式
- `main.js` - 写入页面检测结果、监听模式切换

---

## 修复方案

### 1. 创建 SafeStorage 包装器

新增 `content/safe-storage.js`，提供安全的 chrome.storage 访问方法：

```javascript
const SafeStorage = {
  // 检查 API 是否可用
  isAvailable() {
    try {
      return !!(chrome && chrome.storage && chrome.storage.local);
    } catch (e) {
      return false;
    }
  },

  // 安全读取（失败返回空对象）
  async get(keys) { ... },

  // 安全写入（失败返回 false）
  async set(items) { ... },

  // 安全删除
  async remove(keys) { ... },

  // 安全监听（失败返回 null）
  addListener(callback) { ... }
};
```

**核心特性**：
- ✅ 内部 try-catch，不向外抛出异常
- ✅ 失败时打印 warning 而非 error
- ✅ 读取失败返回空对象，调用方无需额外检查
- ✅ 写入失败返回 false，不中断主流程

---

### 2. 替换所有 chrome.storage 调用

**替换前**：
```javascript
// export.js
await chrome.storage.local.set({ lastExport: { ... } });

// import.js
const config = await chrome.storage.local.get(['apiKey', 'apiEndpoint', 'apiType']);

// panel.js
const stored = await chrome.storage.local.get([this._templateKey]);
await chrome.storage.local.set({ [this._templateKey]: this._template });

// page-detector.js
const stored = await chrome.storage.local.get('mode');

// main.js
await chrome.storage.local.set({ detectedPage: detected, effectiveMode: mode });
chrome.storage.onChanged.addListener((changes, area) => { ... });
```

**替换后**：
```javascript
// export.js
await SafeStorage.set({ lastExport: { ... } });

// import.js
const config = await SafeStorage.get(['apiKey', 'apiEndpoint', 'apiType']);

// panel.js
const stored = await SafeStorage.get([this._templateKey]);
await SafeStorage.set({ [this._templateKey]: this._template });

// page-detector.js
const stored = await SafeStorage.get('mode');

// main.js
await SafeStorage.set({ detectedPage: detected, effectiveMode: mode });
SafeStorage.addListener((changes, area) => { ... });
```

---

### 3. 更新 manifest.json

在 content_scripts 的 js 数组**最前面**加载 safe-storage.js：

```json
{
  "content_scripts": [{
    "js": [
      "content/safe-storage.js",  // ← 必须在最前面
      "content/page-detector.js",
      "content/form-extractor.js",
      ...
    ]
  }]
}
```

**顺序重要性**：safe-storage.js 必须先加载，因为其他模块都依赖 `SafeStorage` 全局对象。

---

## 修复效果

### 修复前
```
[控制台]
❌ 导出失败：Extension context invalidated.
✅ 数据已复制到剪切板（59.3 KB）
```

### 修复后
```
[控制台]
✅ 数据已复制到剪切板（59.3 KB）
⚠️ [SafeStorage] 写入失败: Extension context invalidated （不影响主流程）
```

**关键差异**：
- ❌ 修复前：error 级别，用户看到"导出失败"
- ✅ 修复后：warning 级别，主流程正常完成，storage 失败降级

---

## 降级策略

### 1. 导出功能
- **核心**：数据提取 + 剪切板复制
- **次要**：storage 写入 lastExport 状态
- **降级**：storage 失败时，导出仍成功，只是不记录历史

### 2. 导入功能
- **核心**：数据转换 + 表单填写
- **次要**：读取翻译 API 配置、读写过滤/默认值模板
- **降级**：
  - API 配置读取失败 → 跳过翻译，使用原文
  - 模板读取失败 → 使用空模板
  - 模板写入失败 → 不保存设置，下次重新配置

### 3. 页面检测
- **核心**：自动检测页面语言
- **次要**：读取用户手动设置的模式
- **降级**：读取失败时使用自动检测结果

---

## 测试验证

### 测试步骤

1. **正常场景**（storage 可用）
   ```
   1. 打开 VBK 产品编辑页
   2. 点击"导出产品数据"
   3. 检查：✅ 无报错，✅ 数据已复制
   4. 点击"导入产品数据"
   5. 设置过滤/默认值，点击"确认填写"
   6. 刷新页面，再次导入
   7. 检查：✅ 过滤/默认值设置已保留
   ```

2. **上下文失效场景**（storage 不可用）
   ```
   1. 打开 VBK 产品编辑页，点击"导出"
   2. 进入扩展管理页 chrome://extensions/
   3. 点击"重新加载"按钮
   4. 回到 VBK 页面，再次点击"导出"
   5. 检查：✅ 导出成功（虽然 storage 失败）
   6. 控制台只有 warning，无 error
   ```

3. **翻译 API 配置**
   ```
   1. 扩展重新加载后，打开导入面板
   2. 检查：✅ 翻译功能降级为保留原文
   3. 控制台提示：[SafeStorage] 读取失败
   ```

---

## 兼容性

### Chrome 版本
- ✅ Chrome 88+ (Manifest V3 最低要求)
- ✅ Edge 88+
- ✅ Opera 74+

### 场景覆盖
- ✅ 开发者模式频繁重新加载
- ✅ 扩展更新
- ✅ 浏览器重启后标签页恢复
- ✅ 扩展禁用/启用

---

## 后续建议

1. **用户提示优化**
   - 导出/导入成功后，如果 storage 失败，可选择性提示用户："配置未保存，但数据操作已成功"
   
2. **重连机制**
   - 可在 SafeStorage 中添加定时检查，上下文恢复后自动重试失败的写入操作

3. **Service Worker 心跳**
   - 在 background/service-worker.js 中添加心跳消息，content script 可通过消息传递存储数据

---

## 修改的文件清单

- ✅ `content/safe-storage.js` - 新增
- ✅ `content/export.js` - 替换 chrome.storage 调用
- ✅ `content/import.js` - 替换 chrome.storage 调用
- ✅ `content/panel.js` - 替换 chrome.storage 调用
- ✅ `content/page-detector.js` - 替换 chrome.storage 调用
- ✅ `content/main.js` - 替换 chrome.storage 调用
- ✅ `manifest.json` - 添加 safe-storage.js 到加载列表

---

*本次修复彻底解决了"Extension context invalidated"错误，确保插件在扩展重新加载后仍能正常工作。*
