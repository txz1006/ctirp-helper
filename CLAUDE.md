# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

携程数据迁移助手 (Ctrip Helper) - Chrome Extension for migrating product data between Ctrip VBK backends (domestic ↔ international versions).

**Core capabilities:**
- Extract form data from Ant Design forms (export as JSON)
- Import and auto-fill form data with field matching and validation
- Template system for saving and reusing form configurations (max 25 templates)
- Support for Ant Design 1.x components (used by the legacy VBK system)
- Simplified Chinese ↔ Traditional Chinese automatic conversion for language fields

**Current status:** v0.3.0 (smart field matching engine)
**Previous:** v0.2.0 (template system implemented)

## Architecture

### Content Script Loading Order (Critical)

Scripts load in sequence (defined in `manifest.json`). Order matters for dependencies:

```javascript
1. safe-storage.js                    // Storage utilities
2. field-matcher.js                   // Smart matching engine core (loaded before strategies)
3. match-strategies/exact-match.js    // Self-registers to FieldMatcher
4. match-strategies/pattern-match.js  // Self-registers to FieldMatcher
5. match-strategies/semantic-match.js // Self-registers to FieldMatcher
6. ui/match-confirmation-dialog.js    // Interactive candidate selection dialog
7. antd1-filler.js                    // Ant Design 1.x specific form filler
8. react-filler.js                    // React Fiber-based form filler (fallback)
9. page-detector.js                   // Detect domestic vs international version
10. page-adapters.js                  // Page-specific extraction/fill logic
11. form-extractor.js                 // Extract form data to JSON
12. form-filler.js                    // Fill forms from JSON (uses FieldMatcher)
13. templates/template-storage.js     // Template storage layer (chrome.storage.local)
14. templates/template-manager.js     // Template business logic
15. templates/save-template-dialog.js // Save template dialog UI
16. templates/edit-template-dialog.js // Edit template dialog UI
17. templates/template-preview-dialog.js    // Preview template dialog UI
18. templates/template-management-panel.js  // Template management panel UI
19. ai-rewrite-dialog.js              // AI rewrite dialog
20. export.js                         // Export flow orchestration
21. import.js                         // Import flow orchestration (data transformation)
22. panel.js                          // UI panel for import workflow
23. main.js                           // Entry point, initializes everything
```

### Field Matching Engine (v0.3.0)

**Three-tier matching strategy:**
1. **ExactMatch** (Priority 100): Direct ID lookup via `domKey` — works within same page version
2. **PatternMatch** (Priority 90): Cross-version ID pattern matching using ID naming conventions
   - Domestic: `pmRcmdItems_{index}_{suffix}`
   - International: `pmRcmdRegionGroups_{regionIndex}_items_{index}_{suffix}`
3. **SemanticMatch** (Priority 50): Container + label + index + relative selector — works when DOM structure is same but IDs differ. Supports fuzzy label matching (exact → contains → prefix).

**Export data structure (v0.3.0):**
```json
{
  "推荐理由_0": {
    "matchData": {
      "exact": { "categoryDomKey": "pmRcmdItems_0_pmRcmdCategoryId", "descriptionDomKey": "pmRcmdItems_0_rcmdDesc" },
      "pattern": { "category": {"baseName":"pmRcmdItems","index":0,"suffix":"pmRcmdCategoryId","regionIndex":0}, ... },
      "semantic": { "container": "#pm_recommend", "label": "推荐理由", "index": 0, "categorySelector": ".ant-select", "descriptionSelector": "textarea[id*=\"rcmdDesc\"]" }
    },
    "category": { "text": "缤纷景点", "fieldType": "select" },
    "description": { "value": "...", "fieldType": "textarea" }
  }
}
```

**Interactive confirmation:**
When all strategies fail or confidence < 70%, MatchConfirmationDialog shows ranked candidates for user selection.

**Extending with new strategies:**
1. Create `content/match-strategies/your-strategy.js` with `{name, priority, match(fieldData)}`
2. Add `window.YourStrategy = YourStrategy` and auto-register via `FieldMatcher.registerStrategy()`
3. Add to manifest.json content_scripts before `field-matcher.js`
4. Export with relevant matchData in page-adapters.js

### Core Modules

**Template System** (`content/templates/`):
- `template-storage.js`: CRUD operations on chrome.storage.local (max 25 templates)
- `template-manager.js`: Business logic - create from page, apply, update metadata, delete
- `save-template-dialog.js`: Save dialog with name validation and duplicate checking
- `edit-template-dialog.js`: Edit template name and description (data unchanged)
- `template-preview-dialog.js`: Preview template fields grouped by form sections
- `template-management-panel.js`: List/preview/edit/delete templates, sorted by update time

Template structure:
```javascript
{
  id: 'tpl_1718428800000',        // timestamp-based ID
  name: '产品模版 1',               // unique name (max 50 chars)
  description: '豪华团队游',       // optional (max 200 chars)
  pageType: 'product-detail',     // page type for compatibility check
  data: { /* full export JSON */ },
  createdAt: '2026-06-15T14:30:00Z',
  updatedAt: '2026-06-15T14:30:00Z'  // updates on metadata edit
}
```

**Form Extraction** (`form-extractor.js`):
- Extracts data from `.content-card` groups
- Supports 15+ Ant Design field types (input, select, timePicker, inputNumberGroup, mixedGroup, etc.)
- Strategy: DOM values first, React Fiber as fallback
- Returns hierarchical structure: `{ version, source, tab, timestamp, data: { groupName: { fieldLabel: fieldData } } }`

**Form Filling** (`form-filler.js`):
- Uses native property setters + event dispatch to bypass React
- Three-tier strategy: AntD1Filler → ReactFiller → native fallback
- Special handling:
  - Time picker: clicks panel UI instead of setting value directly
  - Search selects: input → wait for results → click option
  - Mixed groups: fills controls in DOM order, skipping hidden elements

**Field Type System** (defined in `form-extractor.js`):
- `input`, `textarea` - Standard text inputs
- `select`, `searchSelect`, `multiSearchSelect` - Dropdowns
- `inputNumber`, `inputNumberGroup` - Numeric inputs (single or grouped)
- `mixedGroup` - Composite controls (e.g., "2 days, 18:00 advance booking")
- `selectGroup` - Multiple related selects (e.g., child age range)
- `customDisplay` - Read-only custom components (skipped in auto-fill)

**Ant Design 1.x Adapter** (`antd1-filler.js`):
- Specialized for Ant Design 1.0.16 (2016 version used by VBK)
- Key methods:
  - `fillSelect()`: Input text → blur (not click dropdown)
  - `fillTimePicker()`: Clicks time panel hours/minutes
  - `fillSearchSelect()`: Input → wait 8s → select first match
  - `toSimplified()` / `toTraditional()`: Language conversion

**Import Transformation** (`import.js`):
- `parseInput()`: Parse JSON + convert null → empty string + language fields (simplified → traditional)
- `_convertNullToEmpty()`: Recursive null handler with keyPath tracking for language fields
- `_toTraditional()`: Whole-word first, then character-by-character conversion

## Development

### Testing the Extension

```bash
# No build required - load directly in Chrome
# 1. Navigate to chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" → select extension/ directory
```

### Debugging

All major operations log to console with prefixes:
- `[MixedGroup]` - Mixed control group filling
- `[TimePicker]` - Time picker operations
- `[AntD1]` - Ant Design 1.x filler
- `[Import]` - Import data transformation
- `[PlainSelect]` - Dropdown filling
- `[SearchSelect]` - Search dropdown filling

### Common Issues

**Time picker fills but value disappears:**
- Must click panel UI, not set value directly
- See `_fillTimePickerByPanel()` in `form-filler.js`

**Service language dropdown fails:**
- Language fields are auto-converted simplified → traditional during import
- See `_convertNullToEmpty()` in `import.js` with keyPath tracking

**Hidden controls cause wrong order:**
- `.nodisplay` selects (timezone selectors) are skipped
- See `_collectDomControls()` in `form-filler.js`

**Search results don't appear:**
- 8 second timeout with 200ms polling
- Selects first option containing search text
- See `waitForSearchResult()` in `antd1-filler.js`

## Key Technical Decisions

**Why Ant Design 1.x specific filler?**
- VBK uses ancient Ant Design 1.0.16 (2016)
- No React Fiber, different event handling
- Cannot use modern React techniques

**Why DOM-based instead of React state?**
- More reliable across different React/AntD versions
- Direct DOM manipulation + events mimics user interaction
- React Fiber approach fails on older versions

**Why simplified→traditional conversion at import time?**
- VBK displays traditional Chinese in dropdowns
- Converting during import ensures exact match
- Path-based detection identifies language fields anywhere in JSON structure

**Why click time panel instead of setting value?**
- Direct value setting gets cleared by Ant Design internal logic
- Clicking mimics real user behavior and triggers all proper handlers

## Development Guide

**必读：** [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md) — 业务开发规范手册，包含：
- 核心架构原则（页面适配器隔离、字段类型两分法）
- 新增页面/字段开发流程
- 7 个常见陷阱与解决方案
- 字段类型注册表
- 代码约定（日志前缀、错误处理、DOM 操作）
- 测试与回归检查清单

**所有开发者在提交代码前必须阅读并遵循该手册。**

## Planned Refactor (v2.0)

See `REFACTOR_PLAN.md` for complete design. Key goals:

1. ~~**Template system** (highest priority) - Save/apply form data templates~~ ✅ **Completed in v0.2.0**
2. **Universal form engine** - Support any page with Ant Design forms
3. **Adapter pattern** - Page-specific logic in adapters, generic engine reusable
4. **Feature registry** - Pluggable features (image download, data stats, etc.)

## Template System (v0.2.0)

**User flows:**
- Save: Fill form → click "💾 保存为模版" → enter name/description → saved to chrome.storage.local
- Apply: Import panel → select "使用已保存的模版" → choose template → auto-fills form
- Manage: Click "📋 模版管理" → list templates → preview/edit/delete

**Key features:**
- Max 25 templates per user
- Page type compatibility check (warns if applying template to different page type)
- Duplicate name validation
- Metadata-only edits (name/description) preserve original data
- Templates sorted by update time (newest first)

**Storage:**
- Key: `ctrip_templates` in chrome.storage.local
- Size limit: 5-10MB (actual usage ~1-5MB for 25 templates)
- Read performance: <100ms for all templates
- Write performance: <500ms per template

**Testing:**
- Automated tests: `test/template-system-test.js` (7 test cases)
- Manual tests: `docs/TEMPLATE_SYSTEM_TEST.md` (40+ test scenarios)
- Performance benchmarks included

## File Organization

```
extension/
├── content/
│   ├── match-strategies/            # Field matching strategies (v0.3.0)
│   │   ├── exact-match.js           # Exact ID match (priority 100)
│   │   ├── pattern-match.js         # Cross-version pattern match (priority 90)
│   │   └── semantic-match.js        # Semantic fallback (priority 50)
│   ├── ui/
│   │   └── match-confirmation-dialog.js  # Interactive candidate dialog
│   ├── templates/                   # Template system (v0.2.0)
│   │   ├── template-storage.js      # Storage layer (chrome.storage.local)
│   │   ├── template-manager.js      # Business logic layer
│   │   ├── save-template-dialog.js  # Save dialog component
│   │   ├── edit-template-dialog.js  # Edit dialog component
│   │   ├── template-preview-dialog.js     # Preview dialog component
│   │   └── template-management-panel.js   # Management panel component
│   ├── main.js              # Entry point
│   ├── field-matcher.js     # Smart matching engine core (v0.3.0)
│   ├── page-detector.js     # Detects domestic/international
│   ├── page-adapters.js     # Page-specific adapters
│   ├── export.js            # Export orchestration
│   ├── import.js            # Import orchestration + data transform
│   ├── form-extractor.js    # Extract form → JSON (with matchData)
│   ├── form-filler.js       # Fill form from JSON (uses FieldMatcher)
│   ├── antd1-filler.js      # Ant Design 1.x adapter (primary)
│   ├── react-filler.js      # React Fiber adapter (fallback)
│   ├── panel.js             # Import UI panel
│   ├── ai-rewrite-dialog.js # AI rewrite dialog
│   ├── page-ue-bridge.js    # UEditor main-world bridge (web_accessible_resource)
│   └── safe-storage.js      # Chrome storage wrapper
├── test/
│   ├── template-system-test.js        # Template system integration tests
│   ├── field-matcher-test.js          # Field matcher unit tests
│   └── e2e-matching-test.md           # E2E test checklist
├── docs/
│   ├── TEMPLATE_SYSTEM_SPEC.md        # Template system specification
│   ├── TEMPLATE_SYSTEM_CHECKLIST.md   # Development checklist
│   └── TEMPLATE_SYSTEM_TEST.md        # Test documentation
├── plans/
│   └── 2026-06-17-smart-field-matching-complete.md  # Implementation plan
├── background/
│   └── service-worker.js    # Persist config
├── popup/                   # Extension popup UI
├── manifest.json            # Extension config (Manifest V3)
└── *.md                     # Documentation (fixes, plans, context)
```

## Working with Field Types

When adding support for new field types:

1. **Detection** in `form-extractor.js`:
   - Add type detection in `_detectFieldType()`
   - Implement value extraction in `_extractFormItem()`
   
2. **Filling** in `form-filler.js`:
   - Add case in `_fillField()` switch
   - Implement filling method `_fill[TypeName]()`
   
3. **Ant Design 1.x support** in `antd1-filler.js`:
   - Add method if special handling needed
   - Update `form-filler.js` to call it

## Language Conversion

Simplified/Traditional Chinese mappings in:
- `import.js`: `_toTraditional()` - used during import
- `antd1-filler.js`: `toSimplified()` / `toTraditional()` - used during filling

Add new mappings to both files. Whole-word mappings take precedence over single characters.
