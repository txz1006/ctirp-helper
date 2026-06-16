# 产品数据迁移助手 - Chrome Extension

## 会话背景

### 项目起源

将携程国内版VBK后台的产品数据迁移到Trip.com国际版VBK后台。两个系统在同一个域名 `vbooking.ctrip.com` 下，表单结构大体相似但有差异。

### 方案演进

1. **纯API方案（已验证，有瓶颈）**：逆向了两端API，成功完成单条产品迁移（国内1022512228→国际74214286），但遇到**ID体系不匹配**问题——国内版和国际版的城市ID、路线ID不同，国际版字典搜索API未逆向成功（所有搜索API返回403），导致 `routeName`、`routeMainTitle`、`departureCities` 等字段无法通过纯API正确写入。
2. **浏览器插件方案（当前方向）**：在表单层面做导出/导入，让前端组件自己处理ID映射，绕开后端ID不匹配问题。

### API逆向验证结果摘要

| API | 用途 | 状态 |
|-----|------|------|
| `saveSaleControlInfo` | 国际版创建新产品 | ✅ 已验证 |
| `getProductBaseInfo` | 国际版读取产品详情 | ✅ 已验证 |
| `saveProductBaseInfo` | 国际版保存产品基础信息 | ✅ 已验证（round-trip模式） |
| `getResourceInfoList.json` | 国际版产品列表 | ✅ 已验证 |
| 国内版SSR提取 | 国内版读取产品数据 | ✅ 已验证（`__INITIAL_STATE__`） |
| 国际版字典搜索API | 查城市/路线ID | ❌ 403，路径未找到 |

### 已验证的迁移数据（产品74214286）

通过API成功写入的字段：productId、travelDays/Nights、mainName、name、destinationInfo、operationNote、destinationCityID/CountryId（用国内版ID，系统自动关联中文名）

未能通过API正确写入的字段：routeName（由routeId控制）、routeMainTitle（同上）、departureCities（cityId不匹配）、scenicSpots（routeId=0时被清空）

### 关键技术发现

- 国际版API为round-trip模式：`getProductBaseInfo`的响应结构即`saveProductBaseInfo`的请求体结构
- Cookie认证（JSESSIONID + vbkticket），有效期约30分钟
- `routeId`控制路线名称，改文本无效，需换ID
- `destinationCityID`改ID后系统自动关联对应城市名
- 中文写入国际版英文平台会显示乱码（`?????????????`），所有文本必须翻译为英文
- PowerShell的`ConvertTo-Json`会改变数据类型，需用字符串替换构造请求体

### 详细API文档

完整的API调用逻辑、字段映射规则、已知问题等见 `d:\newcapec\ai-code\vtrip\migration-discussion.md` 第七章。

### 插件需求文档

见 `d:\newcapec\ai-code\vtrip\extension\PRD.md`。

---

## 术语表

| 术语 | 英文 | 含义 |
|------|------|------|
| 国内版 | Domestic VBK | 携程国内版VBK后台，数据源，SSR渲染 |
| 国际版 | International VBK | Trip.com国际版VBK后台，写入目标，JSON API |
| 导出模式 | Export Mode | 插件在国内版页面上运行，提取表单数据 |
| 导入模式 | Import Mode | 插件在国际版页面上运行，填入表单数据 |
| Tab | Tab | 后台产品编辑页的页签（基础信息、行程、价格等） |
| DOM填写 | DOM Fill | 通过操作DOM元素模拟用户输入来填写表单 |
| API兜底 | API Fallback | 对复杂交互字段，直接调用后端API写入 |

## 核心概念

- **产品**：一条完整的旅游产品，数据分散在多个Tab中
- **表单数据**：当前Tab页面上用户可见的输入框、下拉框、文本域的值（DOM层面）
- **导出数据**：从国内版表单提取的结构化JSON，保留层级关系
- **转换规则**：将国内版数据映射为国际版格式的规则集（预置规则+大模型翻译）
- **字段分类**：简单字段（普通输入框/文本域）vs 复杂字段（弹窗搜索选择等）
