# VBK 产品数据迁移插件 — 项目总结

> 生成时间：2026-06-14
> 用途：携程国内版 VBK 后台产品数据 → Trip.com 国际版 VBK 后台一键迁移

---

## 1. 项目目标

开发 Chrome 浏览器插件，实现：
- **一键导出**：从携程国内版 VBK 后台提取产品表单数据
- **一键导入**：将数据自动填入 Trip.com 国际版 VBK 后台对应表单
- **人工审核**：导入前提供预览、匹配、编辑、验证环节，确认后保存

两个系统共用域名 `vbooking.ctrip.com`，表单结构大体相似但字段、语言、选项值存在差异。

---

## 2. 文件结构

```
extension/
├── manifest.json                    # Chrome Extension 清单（v3）
├── icons/                           # 16/48/128px PNG 图标
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── background/
│   └── service-worker.js            # Service Worker：配置持久化、消息转发
├── content/                         # Content Scripts（核心逻辑）
│   ├── main.js                      # 入口：页面识别、注入面板、事件绑定
│   ├── page-detector.js             # 页面自动识别（国内版/国际版/模式切换）
│   ├── export.js                    # 导出逻辑：调用 FormExtractor，输出 JSON
│   ├── import.js                    # 导入逻辑：数据转换、翻译字段收集、回写
│   ├── form-extractor.js            # 表单数据提取（支持多种 AntD 控件类型）
│   ├── form-filler.js               # 表单自动填写（React 16 受控组件兼容）
│   ├── panel.js                     # 导入浮层面板 UI（5 步流程）
│   └── injected-styles.css          # 面板及页面叠加标签样式
├── popup/                           # 插件图标点击弹窗
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── rules/                           # 数据转换规则
│   ├── base-info.js                 # 基础信息 Tab 预置规则
│   └── field-mappings.json          # 字段映射配置
├── CONTEXT.md                       # 项目上下文与技术决策
├── PRD.md                           # 产品需求文档
└── PROJECT_SUMMARY.md               # 本文档
```

---

## 3. 核心功能与关键实现

### 3.1 页面识别（`page-detector.js`）
- 基于 label 文本语言特征自动识别国内版（中文）/国际版（英文）
- 支持用户在浮层面板手动切换模式

### 3.2 数据提取（`form-extractor.js`）
支持的 Ant Design 控件类型：

| 类型 | 说明 |
|------|------|
| `text` | 普通输入框 input |
| `textarea` | 文本域 |
| `select` | 普通下拉框 |
| `searchSelect` | 可输入搜索下拉框（单选） |
| `multiSearchSelect` | 可输入搜索下拉框（多选） |
| `inputNumber` | 数字输入框 |
| `inputNumberGroup` | 多个数字输入框成组（如 X天X晚） |
| `selectGroup` | 多个普通下拉框成组（如 儿童年龄 X到X周岁） |
| `mixedGroup` | 混合控件组（如 提前预订 = select + inputNumber + timePicker） |
| `customDisplay` | 自定义展示组件（如 工作时间，无标准表单控件） |
| `radio` | 单选按钮组 |
| `checkbox` | 复选框 |

提取策略以 DOM 值为主，React Fiber 数据为辅，确保能拿到搜索下拉框等字段的显示文本。

### 3.3 表单填写（`form-filler.js`）
- 使用原生 `Object.getOwnPropertyDescriptor(..., 'value').set` + 事件触发模拟用户输入
- 兼容 React 16 受控组件
- 搜索下拉框支持：输入后稳定等待选项出现 → 精确匹配 → mousedown+mouseup+click 触发选择 → 回读验证是否选中
- 成组数据按 parts 顺序逐个填写
- 填写后自动回读验证，生成对比报告

### 3.4 数据转换（`import.js`）
- 预置规则处理结构化字段（如行程天数、儿童年龄、提前预订等）
- 自由文本字段通过大模型批量翻译（一次请求打包所有待翻译字段）
- 翻译失败时保留原文并标记

### 3.5 导入面板 5 步流程（`panel.js`）

```
输入 JSON  →  转换预览  →  匹配预览  →  确认填写  →  回读验证
```

**转换预览**：
- 展示所有导入字段及数据来源标签（自动转换 / AI翻译 / 待翻译 / 默认值）
- 每个字段支持：
  - **过滤**（勾选后不使用 JSON 原值）
  - **默认值**（JSON 为空或被过滤时，使用默认值填写）
- 过滤/默认值设置自动保存到 `chrome.storage.local`，key 为 `页面URL + 当前Tab`

**匹配预览**：
- 优先展示**未匹配字段**（导入数据在页面上找不到对应控件），可直接点击“选择控件”手动绑定
- 展示**无数据源字段**（页面控件在导入数据中不存在）
- **已匹配字段**折叠在底部，可展开后点击“重新选择”修改绑定
- 页面控件左上角叠加绿色小标签，显示将要填入的值

**确认填写**：应用过滤/默认值规则，逐个字段自动填写，实时显示进度。

**回读验证**：对比填写后的实际页面值与期望值，高亮差异。

### 3.6 配置持久化（`background/service-worker.js`）
- 使用 `chrome.storage.local` 存储用户配置
- `chrome.runtime.onInstalled` 仅初始化未设置的配置项，不覆盖已有值
- 避免浏览器刷新后配置丢失

---

## 4. 已解决的关键问题

| 问题 | 解决方案 |
|------|---------|
| ant-input-number 未导出 | 新增 `inputNumber` 类型识别和提取/填写方法 |
| 双列布局嵌套 form-item 提取不全 | 去掉 `:scope >` 限制，支持深层查找 |
| 多选搜索下拉框只取第一个 | 新增 `multiSearchSelect` 类型，提取所有已选项并支持批量填写 |
| 行程天数等成组数据只取第一个值 | 新增 `inputNumberGroup` / `selectGroup` / `mixedGroup` / `customDisplay` 类型 |
| Tab 信息提取不可靠 | 改为从 `<div role="tab" aria-selected="true" class="ant-tabs-tab-active">` 获取 |
| 插件配置刷新后重置 | `onInstalled` 仅初始化未设置的 key，不覆盖已有值 |
| 搜索下拉框填写偶发不选中 | 稳定等待可见选项 → 精确匹配 → 完整鼠标事件链点击 → 回读验证 |
| 导入面板遮挡右侧表单 | 改为右上角浮窗 + 支持头部拖拽 |
| 回读验证显示 `[object Object]` | 复杂类型（select/searchSelect/group 等）生成 `expectedDisplay/actualDisplay` 可读文本 |
| 匹配成功字段无法重新绑定 | 已匹配字段也支持“重新选择”按钮，反复修改绑定 |

---

## 5. 使用说明

### 5.1 安装
1. 打开 Chrome 扩展管理页 `chrome://extensions/`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”，选择 `extension/` 目录

### 5.2 导出（国内版）
1. 进入携程国内版 VBK 后台产品编辑页
2. 页面底部自动出现“导出产品数据”按钮
3. 点击导出，JSON 数据复制到剪贴板（同时提供文件下载兜底）

### 5.3 导入（国际版）
1. 进入 Trip.com 国际版 VBK 后台产品编辑页
2. 点击底部“导入产品数据”按钮，打开浮层面板
3. **输入**：粘贴导出的 JSON，点击“解析并转换”
4. **转换预览**：检查字段过滤和默认值设置，确认后点击“匹配预览”
5. **匹配预览**：
   - 优先处理未匹配字段，点击“选择控件”手动绑定页面表单
   - 如需调整已匹配字段，展开底部“已匹配字段”面板，点击“重新选择”
   - 确认无误后点击“确认填写”
6. **回读验证**：检查填写结果与实际页面值的差异，确认后保存

### 5.4 配置 LLM 翻译
1. 点击浏览器工具栏插件图标，打开 popup
2. 选择 API 类型（OpenAI / 自定义），填写 API Key 和 Endpoint
3. 保存后会持久化到浏览器本地存储

---

## 6. 技术栈

- Chrome Extension Manifest V3
- Vanilla JavaScript（无框架）
- 页面技术栈：React 16.14.0 + Ant Design 3.x
- 数据传递：剪贴板为主，文件下载兜底
- 本地存储：`chrome.storage.local`

---

## 7. 后续迭代建议（可选）

- 支持更多 AntD 组件类型（如 DatePicker、Cascader 等）
- 添加字段级历史记录，方便回溯多次导入的差异
- 支持多 Tab 批量导入/导出
- 面板位置记忆（拖拽后记住位置）

---

*本文档由 handoff 生成，用于后续会话快速恢复上下文。*
