/**
 * tourdays (行程描述) 页面适配器
 *
 * 负责：
 * - 识别 URL: /ivbk/vendor/tourdays
 * - 导出：按天解析标题 + 每张卡片全部 form-item（A2 全字段导出）
 * - 字段映射：为匹配预览提供页面字段
 * - 激活 scoped handler（阶段 C：全 role 填充）
 * - 导入前补齐卡片结构（阶段 D）
 *
 * 卡片结构观察（真实样本）：
 * - day 容器：#td-day-wrap-{dayIndex}
 * - 天标题：[class*="pml-day-titleform"] 内 1 个 textarea
 * - card-list：[class*="td-day-card-list"]，add-box 与 card 严格交替：
 *     add-box(0), card(1), add-box(2), card(3), ...
 * - 卡片类型：图标容器 class tripDescribe__Icon{Type}（交通/酒店/景点/餐饮/其他），
 *     餐饮另用 span.tripDescribe__icon-meal；集合/解散无图标 → 用卡片标题文本兜底
 * - form-item 嵌套：行驶时间/用餐时长/活动时长 等分组控件内含子 form-item，
 *     必须只取顶层 form-item（否则重复计数）
 */

const TOURDAYS_TO_TRADITIONAL_PHRASES = {
  '含成人儿童首道门票': '已含成人及小童大門門票',
  '已含成人儿童门票': '已含成人及小童門票',
  '含成人首道门票': '已含成人大門門票',
  '已含成人门票': '已含成人門票',
  '不含门票': '不含門票',
  '无需门票': '無需門票',
  '国际机场': '國際機場',
  '火车站': '火車站',
  '景点类型': '景點類型',
  '地点': '地點',
  '格鲁吉亚': '格魯吉亞',
  '免费': '免費',
  '旧提比里斯': '舊提比里斯',
  '圣三一': '聖三一',
  '车观': '乘車',
  '船观': '乘船',
  '外观': '外觀'
};

const TOURDAYS_TO_TRADITIONAL_CHARS = {
  国: '國', 际: '際', 机: '機', 场: '場', 车: '車', 门: '門', 点: '點', 观: '觀',
  无: '無', 类: '類', 儿: '兒', 童: '童', 火: '火', 站: '站', 飞: '飛', 船: '船',
  圣: '聖', 鲁: '魯', 吉: '吉', 旧: '舊', 费: '費'
};

const TOURDAYS_TO_SIMPLIFIED_PHRASES = Object.fromEntries(
  Object.entries(TOURDAYS_TO_TRADITIONAL_PHRASES).map(([s, t]) => [t, s])
);
const TOURDAYS_TO_SIMPLIFIED_CHARS = Object.fromEntries(
  Object.entries(TOURDAYS_TO_TRADITIONAL_CHARS).map(([s, t]) => [t, s])
);

const tourdaysAdapter = {
  urlPattern: '/ivbk/vendor/tourdays',

  /**
   * 卡片类型 → 国际页"加号"项目按钮的后缀名（与 project-select-{name} 对应）
   * 见 TOURDAYS_ADAPTER_PLAN.md §6.2
   */
  CARD_KIND_TO_ADD_BUTTON: {
    meal: '餐饮',
    hotel: '酒店',
    scenic: '景点',
    shopping: '购物',
    freeActivity: '自由活动',
    traffic: '交通',
    other: '其他',
    assembly: '集合',
    dismiss: '解散',
    flight: '机票',
    train: '火车',
    ship: '船',
    intermodal: '联运'
  },

  /**
   * 卡片类型 → 展示标签（简体，用于字段 label）
   */
  KIND_LABEL: {
    meal: '餐饮',
    hotel: '酒店',
    scenic: '景点',
    shopping: '购物',
    freeActivity: '自由活动',
    traffic: '交通',
    other: '其他',
    assembly: '集合',
    dismiss: '解散',
    flight: '机票',
    train: '火车',
    ship: '船',
    intermodal: '联运',
    dayTitle: '标题'
  },

  /**
   * 页面激活时调用
   * 注册 scoped handler，让 form-filler 走 Registry 增量通道填写 itineraryField
   */
  activate() {
    console.log('[tourdaysAdapter] activate');
    if (typeof window !== 'undefined' && window.FieldTypeRegistry && window.itineraryFieldHandler) {
      try {
        FieldTypeRegistry.registerScoped('itineraryField', itineraryFieldHandler);
        console.log('[tourdaysAdapter] 已注册 itineraryField handler');
      } catch (e) {
        console.warn('[tourdaysAdapter] handler 注册失败:', e.message);
      }
    }
  },

  /**
   * 页面失活时调用
   * _pageScoped 由 PageRegistry.deactivate 统一清理
   */
  deactivate() {
    console.log('[tourdaysAdapter] deactivate');
  },

  /**
   * 导出国内版行程描述（A2 全字段导出）
   *
   * 遍历每天的天标题 + 每张卡片顶层 form-item，统一调
   * FormExtractor._extractFormItem 提取，再包装为 itineraryField + meta。
   *
   * @returns {Object} 导出 JSON
   */
  extract() {
    console.log('[tourdaysAdapter] extract start');

    const result = {
      version: '1.0',
      source: window.PageDetector?.detect() === 'domestic' ? 'domestic' : 'international',
      tab: 'tourdays',
      timestamp: new Date().toISOString(),
      data: {}
    };

    const days = this._parseDays();
    console.log('[tourdaysAdapter] parsed days:', days.length);

    days.forEach((dayData) => {
      const dayLabel = `第${dayData.dayIndex + 1}天`;
      result.data[dayLabel] = {};

      // 天标题
      if (dayData.title && dayData.title.value) {
        const field = this._wrapItineraryField({
          label: `${dayLabel} 标题`,
          domKey: `tourdays.day${dayData.dayIndex}.title`,
          value: dayData.title.value,
          meta: {
            dayIndex: dayData.dayIndex,
            role: 'title',
            cardKind: 'dayTitle',
            occurrenceIndex: 0,
            itemIndex: 0,
            isDayTitle: true
          }
        });
        result.data[dayLabel][field.label] = field;
      }

      // 卡片全部 form-item
      dayData.cards.forEach(card => {
        // 同卡内同 label 字段（如集合卡多套子表单都有"用车类型""可服务时间段"）需用 moduleBlock 去重
        const dupLabels = this._duplicateLabels(card.items);
        card.items.forEach(item => {
          const field = this._buildCardItemField(dayLabel, dayData.dayIndex, card, item, dupLabels);
          if (field) result.data[dayLabel][field.label] = field;
        });
      });
    });

    const totalFields = Object.values(result.data).reduce((s, g) => s + Object.keys(g).length, 0);
    console.log('[tourdaysAdapter] extract done, fields:', totalFields);
    return result;
  },

  /**
   * 把单个卡片 form-item 包装为 itineraryField 字段
   * 映射 _extractFormItem 返回的 fieldType → meta.role，并按 §5.4 过滤空值
   *
   * @param {object} dupLabels - 同卡内重复 label 集合（需用 moduleBlock 去重）
   * @returns {object|null} 过滤掉空值时返回 null
   */
  _buildCardItemField(dayLabel, dayIndex, card, item, dupLabels) {
    const role = this._fieldTypeToRole(item.fieldType, item);
    if (!role) return null;

    const value = this._normalizeFieldValue(role, item.value);
    if (this._isEmptyValue(role, value)) return null;

    const domKey = `tourdays.day${dayIndex}.${card.cardKind}.${card.occurrenceIndex}.${role}.${item.itemIndex}`;

    // 同卡内 label 重复时，用 moduleBlock 作前缀去重（如"接机/站 用车类型""上门接 用车类型"）
    let itemLabel = item.label;
    if (dupLabels && dupLabels.has(item.label) && item.moduleBlock) {
      itemLabel = `${item.moduleBlock} ${item.label}`;
    }

    return this._wrapItineraryField({
      label: `${dayLabel} ${card.kindLabel} ${card.occurrenceIndex + 1} ${itemLabel}`,
      domKey,
      value,
      meta: {
        dayIndex,
        role,
        cardKind: card.cardKind,
        cardKindSource: card.kindSource,
        occurrenceIndex: card.occurrenceIndex,
        itemIndex: item.itemIndex,
        moduleBlock: item.moduleBlock || '',
        fieldType: item.fieldType, // 保留原始类型，便于回读验证与精准定位
        isDayTitle: false
      }
    });
  },

  /**
   * 统计卡片内重复的 label（出现 ≥2 次），返回 Set
   */
  _duplicateLabels(items) {
    const counts = {};
    items.forEach(it => { counts[it.label] = (counts[it.label] || 0) + 1; });
    const dup = new Set();
    for (const [label, c] of Object.entries(counts)) {
      if (c >= 2) dup.add(label);
    }
    return dup;
  },

  /**
   * _extractFormItem 的 fieldType → itineraryField role
   * - textarea → note（卡片补充说明）/ title 由调用方单独处理
   * - input → text
   * - inputNumber → number
   * - inputNumberGroup → numberGroup
   * - radio → radio
   * - checkbox → checkbox
   * - select → select
   * - searchSelect → searchSelect
   * - selectGroup/searchSelectGroup/mixedGroup → 不导出（复合控件按子项展开过载，暂不支持自动填写）
   *
   * @returns {string|null} role，无法映射返回 null
   */
  _fieldTypeToRole(fieldType) {
    const map = {
      textarea: 'note',
      input: 'text',
      inputNumber: 'number',
      inputNumberGroup: 'numberGroup',
      radio: 'radio',
      radioTime: 'radioTime',
      checkbox: 'checkbox',
      select: 'select',
      searchSelect: 'searchSelect'
    };
    return map[fieldType] || null;
  },

  /**
   * 归一化字段值结构，使其与 FormFiller 已有填充逻辑契约一致
   * - select/searchSelect：保留 { text }
   * - inputNumberGroup：保留 { values, separators }
   * - radio：取选中项 value（字符串）
   * - checkbox：取选中项 value 数组
   * - 其余：原值
   */
  _normalizeFieldValue(role, value) {
    if (value === null || value === undefined) return value;
    switch (role) {
      case 'select':
      case 'searchSelect':
        return typeof value === 'object' ? value : { text: String(value ?? '') };
      case 'numberGroup':
        return value && typeof value === 'object' ? value : { values: [], separators: [] };
      case 'radio':
        return value === null || value === undefined ? null : String(value);
      case 'radioTime':
        if (value && typeof value === 'object') {
          return {
            radio: value.radio === null || value.radio === undefined ? null : String(value.radio),
            time: Array.isArray(value.time) ? value.time.map(t => t === null || t === undefined ? '' : String(t)) : []
          };
        }
        return { radio: null, time: [] };
      case 'checkbox':
        // value 已是选中项 value 数组（_parseCardItems 内覆盖提取）；
        // 兜底兼容 _extractFormItem 的布尔值：true 仅表示首项选中但无 value，无法还原选中项，按空处理
        if (Array.isArray(value)) return value.map(String);
        return [];
      default:
        return value;
    }
  },

  /**
   * §5.4 空值过滤
   * - note/title：空字符串不导出
   * - text/number：空值不导出
   * - radio：无选中不导出
   * - checkbox：空数组不导出
   * - select/searchSelect：text 为空不导出
   * - numberGroup：values 全空不导出
   */
  _isEmptyValue(role, value) {
    if (value === null || value === undefined || value === '') return true;
    switch (role) {
      case 'radio':
        return value === null || value === undefined || value === '';
      case 'radioTime':
        // radio 为空 → 视为空（无选中）；radio 非空就导出（即使具体时间无时分）
        return !value || value.radio === null || value.radio === undefined || value.radio === '';
      case 'checkbox':
        return !Array.isArray(value) || value.length === 0;
      case 'select':
      case 'searchSelect':
        return !value || !value.text || !String(value.text).trim();
      case 'numberGroup': {
        const vals = value && value.values ? value.values : [];
        return vals.every(v => v === null || v === undefined || v === '');
      }
      default:
        return value === null || value === undefined || String(value).trim() === '';
    }
  },

  /**
   * 包装 itineraryField 字段对象（统一 fieldType）
   */
  _wrapItineraryField({ label, domKey, value, meta }) {
    return { label, domKey, value, fieldType: 'itineraryField', meta };
  },

  /**
   * 提取字段映射（用于匹配预览）
   * 与导出共用 day/card 解析，但不要求值非空（预览需展示空字段对齐）
   *
   * @returns {Object} fieldMap { fieldLabel: { domKey, label, fieldType, currentValue } }
   */
  extractFieldMap() {
    console.log('[tourdaysAdapter] extractFieldMap start');

    const fieldMap = {};
    const days = this._parseDays();

    days.forEach((dayData) => {
      const dayLabel = `第${dayData.dayIndex + 1}天`;

      // 天标题
      if (dayData.title) {
        const label = `${dayLabel} 标题`;
        fieldMap[label] = {
          domKey: `tourdays.day${dayData.dayIndex}.title`,
          label,
          fieldType: 'itineraryField',
          currentValue: dayData.title.value || ''
        };
      }

      // 卡片 form-item（不要求值非空，预览展示对齐用）
      dayData.cards.forEach(card => {
        card.items.forEach(item => {
          const role = this._fieldTypeToRole(item.fieldType, item);
          if (!role) return;
          const label = `${dayLabel} ${card.kindLabel} ${card.occurrenceIndex + 1} ${item.label}`;
          fieldMap[label] = {
            domKey: `tourdays.day${dayData.dayIndex}.${card.cardKind}.${card.occurrenceIndex}.${role}.${item.itemIndex}`,
            label,
            fieldType: 'itineraryField',
            currentValue: this._getDisplayText(item.value)
          };
        });
      });
    });

    console.log('[tourdaysAdapter] extractFieldMap done, fields:', Object.keys(fieldMap).length);
    return fieldMap;
  },

  /**
   * 取字段的展示文本（用于匹配预览 currentValue）
   */
  _getDisplayText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      if (value.radio !== undefined) {
        // radioTime: { radio, time }
        const radioTxt = value.radio ?? '';
        const timeTxt = (Array.isArray(value.time) ? value.time : []).join(':');
        return radioTxt === '-1' ? (timeTxt || '具体时间') : radioTxt;
      }
      if (Array.isArray(value.text)) return value.text.join(', ');
      if (value.text) return value.text;
      if (value.values !== undefined) {
        const vals = Array.isArray(value.values) ? value.values : [value.values];
        return vals.map(v => {
          if (v === null || v === undefined) return '';
          return typeof v === 'object' ? this._getDisplayText(v) : String(v);
        }).join('/');
      }
      if (Array.isArray(value)) return value.join(',');
      return JSON.stringify(value);
    }
    return String(value);
  },

  /**
   * 解析所有天的数据
   *
   * @returns {Array<Object>} dayData[]
   */
  _parseDays() {
    const dayWraps = document.querySelectorAll('[id^="td-day-wrap-"]');
    const days = [];

    dayWraps.forEach(dayEl => {
      const dayIndex = parseInt(dayEl.id.replace('td-day-wrap-', ''), 10);
      if (Number.isNaN(dayIndex)) return;
      days.push({
        dayIndex,
        title: this._parseDayTitle(dayEl),
        cards: this._parseDayCards(dayEl, dayIndex)
      });
    });

    return days;
  },

  /**
   * 解析一天的标题
   *
   * @param {HTMLElement} dayEl
   * @returns {Object|null} {value, textarea}
   */
  _parseDayTitle(dayEl) {
    // 优先：[class*="pml-day-titleform"] textarea
    let textarea = dayEl.querySelector('[class*="pml-day-titleform"] textarea');

    // 兜底：label 为"标题"的 textarea
    if (!textarea) {
      const items = this._topLevelFormItems(dayEl);
      for (const item of items) {
        const label = item.querySelector('.ant-form-item-label label');
        if (label && this._cleanText(label.textContent).includes('标题')) {
          textarea = item.querySelector('textarea');
          if (textarea) break;
        }
      }
    }

    if (!textarea) return null;

    return {
      value: this._cleanText(textarea.value || textarea.textContent),
      textarea
    };
  },

  /**
   * 解析一天的所有卡片（含全部顶层 form-item）
   *
   * @param {HTMLElement} dayEl
   * @param {number} dayIndex
   * @returns {Array<Object>} cards
   */
  _parseDayCards(dayEl, dayIndex) {
    const cardEls = Array.from(dayEl.querySelectorAll('[class*="td-day-card--"]'))
      .filter(el => !el.className.includes('td-day-card-list'));

    const cards = [];
    const kindCounts = {};

    cardEls.forEach(cardEl => {
      const cardKind = this._inferCardKind(cardEl);
      const occurrenceIndex = kindCounts[cardKind] || 0;
      kindCounts[cardKind] = occurrenceIndex + 1;

      const items = this._parseCardItems(cardEl);

      cards.push({
        cardKind,
        kindSource: this._getKindLabel(cardKind),
        kindLabel: this._getKindLabel(cardKind),
        occurrenceIndex,
        items,
        element: cardEl
      });
    });

    return cards;
  },

  /**
   * 解析卡片内的顶层 form-item（避开分组控件内嵌套子项导致的重复计数）
   *
   * 同时跟踪 module-title 区块标题（如集合卡"设置接机/站""设置集合点""设置上门接范围"），
   * 记录每个 form-item 所属区块名 moduleBlock，用于多套子表单同名字段去重。
   *
   * @param {HTMLElement} cardEl
   * @returns {Array<Object>} [{itemIndex, label, moduleBlock, fieldType, value, element}]
   */
  _parseCardItems(cardEl) {
    const items = this._topLevelFormItems(cardEl);
    // 预扫 body 内 module-title 与 form-item 的 DOM 顺序，建立 item→moduleBlock 映射
    const itemModuleMap = this._mapItemToModule(cardEl, items);

    const result = [];

    items.forEach((item, idx) => {
      const labelEl = item.querySelector('.ant-form-item-label label');
      if (!labelEl) return;

      // 复用通用提取器，保持 value 结构与现有 15 种字段类型一致
      const extracted = window.FormExtractor ? window.FormExtractor._extractFormItem(item) : null;
      if (!extracted) return;

      let labelText = labelEl.getAttribute('title') || labelEl.textContent || '';
      labelText = this._cleanText(labelText).replace(/[ℹ️⚠️✔️]/g, '').trim();
      if (!labelText) labelText = '(未命名)';

      // radio/checkbox：_extractFormItem 只返回首个 checked 状态，不足以表达多选；
      // 这里覆盖提取：radio 取选中项 value，checkbox 取选中项 value 数组（决议 3A）
      let fieldType = extracted.fieldType;
      let value = extracted.value;

      // tourdays 专属：radio + 条件 select 复合控件（如"时间"：不限/全天/上午/下午/晚上/具体时间，
      // 选具体时间 value=-1 时展开两个 select 时/分）。_extractFormItem 会误判成 selectGroup。
      // 检测：form-item 含 radio-group 且其中有 value=-1（具体时间）radio，且带 select → 提取为 radioTime。
      const radioTime = this._tryExtractRadioTime(item);
      if (radioTime) {
        fieldType = 'radioTime';
        value = radioTime;
      } else {
        const combobox = this._tryExtractComboboxSearchSelect(item);
        if (combobox) {
          fieldType = 'searchSelect';
          value = combobox;
        } else if (fieldType === 'radio') {
          value = this._extractRadioCheckedValue(item);
        } else if (fieldType === 'checkbox') {
          fieldType = 'checkbox';
          value = this._extractCheckboxCheckedValues(item);
        }
      }

      result.push({
        itemIndex: idx,
        label: labelText,
        moduleBlock: itemModuleMap.get(item) || '',
        fieldType,
        value,
        element: item
      });
    });

    return result;
  },

  /**
   * 取 form-item 内选中 radio 的 value（无选中返回 null）
   */
  _extractRadioCheckedValue(itemEl) {
    const checked = itemEl.querySelector('input[type="radio"]:checked');
    return checked ? checked.value : null;
  },

  /**
   * 取 form-item 内所有选中 checkbox 的 value 数组（无选中返回空数组）
   */
  _extractCheckboxCheckedValues(itemEl) {
    const checked = itemEl.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checked).map(c => c.value);
  },

  _tryExtractComboboxSearchSelect(itemEl) {
    const selectEl = itemEl.querySelector('.ant-select-combobox, .ant-select-auto-complete');
    if (!selectEl) return null;
    const input = selectEl.querySelector('input.ant-select-search__field, input.ant-input');
    if (!input) return null;
    const text = (input.value || selectEl.querySelector('.ant-select-search__field__mirror')?.textContent || '').trim();
    if (!text) return null;
    return {
      text,
      id: input.id || '',
      fieldType: 'searchSelect'
    };
  },

  /**
   * 提取 radio + 条件 select 复合控件（tourdays"时间"字段）
   *
   * 结构：radio-group（N/D/M/A/E/-1），选 -1（具体时间）时展开 select 时/分。
   * 不是所有 radio 都带 select——仅当 form-item 含 radio-group 且其中存在
   * value=-1 的 radio，并附带 select 时才视为 radioTime。
   *
   * @returns {object|null} { radio: '选中值', time: ['时','分'] }；非此结构返回 null
   */
  _tryExtractRadioTime(itemEl) {
    const cw = itemEl.querySelector('.ant-form-item-control');
    if (!cw) return null;
    const radioGroup = cw.querySelector('.ant-radio-group');
    if (!radioGroup) return null;
    const radios = radioGroup.querySelectorAll('input[type="radio"]');
    if (radios.length === 0) return null;
    // 必须含 value=-1（具体时间）radio 才是这种复合控件
    const hasSpecific = Array.from(radios).some(r => r.value === '-1');
    if (!hasSpecific) return null;

    const checked = radioGroup.querySelector('input[type="radio"]:checked');
    const radioVal = checked ? checked.value : null;

    // 取附带 select 的值（时/分），按 DOM 顺序取搜索式 select 的已选文本或输入值
    const selects = cw.querySelectorAll('.ant-select');
    const time = Array.from(selects).map(sel => {
      const selected = sel.querySelector('.ant-select-selection-selected-value');
      if (selected) return selected.getAttribute('title') || selected.textContent.trim();
      // 兜底：搜索框的输入值
      const searchInput = sel.querySelector('input.ant-select-search__field');
      return searchInput ? searchInput.value : '';
    });

    return { radio: radioVal, time };
  },

  /**
   * 取容器的顶层 form-item（不在另一个 form-item 内部）
   * 避免 inputNumberGroup 等分组控件内的子 form-item 被重复计入。
   *
   * @param {HTMLElement} container
   * @returns {HTMLElement[]}
   */
  _topLevelFormItems(container) {
    const all = container.querySelectorAll('.ant-form-item');
    const top = [];
    all.forEach(el => {
      if (!el.parentElement || !el.parentElement.closest('.ant-form-item')) {
        top.push(el);
      }
    });
    return top;
  },

  /**
   * 建立 顶层 form-item → module-title 区块名 映射
   *
   * 集合卡等多套子表单用 module-title 分隔（如"设置接机/站""设置集合点""设置上门接范围"），
   * module-title 不包裹 form-item，只是 DOM 顺序上的标题文字。按 DOM 顺序遍历 body，
   * 遇到 module-title 更新当前区块名，遇到顶层 form-item 记入映射。
   *
   * @param {HTMLElement} cardEl
   * @param {HTMLElement[]} topItems 顶层 form-item 列表
   * @returns {Map<HTMLElement, string>}
   */
  _mapItemToModule(cardEl, topItems) {
    const map = new Map();
    const bd = cardEl.querySelector('[class*="td-day-card-bd"]') || cardEl;
    if (!bd || topItems.length === 0) return map;
    const topSet = new Set(topItems);

    // 深度优先按 DOM 顺序遍历，维护"当前 module-title"，遇到顶层 form-item 记入映射。
    // module-title 一旦出现，其后续兄弟（及后续遍历到的）form-item 都归该区块，直到下一个 module-title。
    const walk = (node, curMod) => {
      let mod = curMod;
      if (node.nodeType === Node.ELEMENT_NODE) {
        const cls = node.className;
        if (typeof cls === 'string' && cls.includes('td-card-module-title')) {
          mod = this._cleanText(node.textContent);
        } else if (topSet.has(node)) {
          map.set(node, mod);
        }
      }
      if (node.childNodes) {
        for (const child of node.childNodes) {
          mod = walk(child, mod); // 用更新后的 mod 继续遍历后续兄弟
        }
      }
      return mod;
    };
    walk(bd, '');
    return map;
  },

  /**
   * 推断卡片类型
   *
   * 优先级（基于真实样本验证）：
   * 1. 图标容器 class tripDescribe__Icon{Type}（交通/酒店/景点/其他/...）
   * 2. 图标 span class tripDescribe__icon-meal（餐饮，单独形态）
   * 3. 卡片标题文本（集合/解散 无图标，按标题兜底）
   * 4. 关键词兜底 → other
   *
   * @param {HTMLElement} cardEl
   * @returns {string} cardKind
   */
  _inferCardKind(cardEl) {
    const iconCont = cardEl.querySelector('[class*="card-title-icon"]');

    // 1. Icon{Type} 形态
    if (iconCont) {
      const m = iconCont.className.match(/tripDescribe__Icon([A-Za-z]+)/);
      if (m) {
        const iconKind = this._iconClassToKind(m[1]);
        if (iconKind) return iconKind;
      }
      // 2. icon-meal span（餐饮）
      if (iconCont.querySelector('[class*="icon-meal"]')) return 'meal';
    }

    // 3. 卡片标题文本兜底
    const titleText = this._readCardTitle(cardEl);
    const kindByTitle = this._titleToKind(titleText);
    if (kindByTitle) return kindByTitle;

    // 4. 关键词兜底
    const text = this._cleanText(cardEl.textContent);
    if (/住宿类型|酒店来源|酒店名称|含早|更换酒店/.test(text)) return 'hotel';
    if (/景点类型|景点项目|门票|无需门票|外观|入内/.test(text)) return 'scenic';
    if (/餐饮类型|用餐地点|用餐时长|成人是否含餐|儿童是否含餐/.test(text)) return 'meal';
    if (/行驶距离|行驶时间|用车|专车|接机|接站|送机|送站/.test(text)) return 'traffic';

    return 'other';
  },

  /**
   * Icon 类名后缀 → cardKind
   */
  _iconClassToKind(suffix) {
    const map = {
      Traffic: 'traffic',
      Hotel: 'hotel',
      Scene: 'scenic',
      Scenic: 'scenic',
      Meal: 'meal',
      Shopping: 'shopping',
      Free: 'freeActivity',
      Flight: 'flight',
      Train: 'train',
      Ship: 'ship',
      Intermodal: 'intermodal',
      Other: 'other',
      Assembly: 'assembly',
      Dismiss: 'dismiss'
    };
    return map[suffix] || null;
  },

  /**
   * 读取卡片标题文本（card-title-flex 区域可见文字）
   * 用 [class*="card-title-flex"] 精确定位标题文字容器，避免误命中
   * card-title-icon（图标容器，无文本）或 card-title（外层包裹）。
   * 兜底用 [class*="card-title--"]，取其内文本。
   */
  _readCardTitle(cardEl) {
    let titleEl = cardEl.querySelector('[class*="card-title-flex"]');
    if (!titleEl || !this._cleanText(titleEl.textContent)) {
      // 兜底：card-title-- 系列，跳过图标容器（card-title-icon）
      const cands = cardEl.querySelectorAll('[class*="card-title--"]');
      for (const c of cands) {
        if (c.className.includes('card-title-icon')) continue;
        const t = this._cleanText(c.textContent);
        if (t) { titleEl = c; break; }
      }
    }
    if (!titleEl) return '';
    const text = titleEl.textContent || '';
    return this._cleanText(text).split(/\s+/)[0] || '';
  },

  /**
   * 标题文本 → cardKind（简繁兼容）
   */
  _titleToKind(title) {
    if (!title) return null;
    const t = this._cleanText(title);
    const map = {
      餐饮: 'meal', 餐飲: 'meal',
      酒店: 'hotel',
      景点: 'scenic', 景點: 'scenic',
      购物: 'shopping', 購物: 'shopping',
      自由活动: 'freeActivity', 自由活動: 'freeActivity',
      交通: 'traffic',
      其他: 'other', 其他: 'other',
      集合: 'assembly', 集結: 'assembly', 集结: 'assembly',
      解散: 'dismiss', 解散: 'dismiss',
      机票: 'flight', 航班: 'flight', 機票: 'flight',
      火车: 'train', 火車: 'train',
      船: 'ship',
      联运: 'intermodal', 聯運: 'intermodal'
    };
    return map[t] || null;
  },

  /**
   * 获取卡片类型的展示标签
   */
  _getKindLabel(cardKind) {
    return this.KIND_LABEL[cardKind] || cardKind;
  },

  /**
   * 获取卡片类型对应的国际页"加号"按钮后缀名
   */
  _getAddButtonName(cardKind) {
    return this.CARD_KIND_TO_ADD_BUTTON[cardKind] || null;
  },

  /**
   * 清理文本
   */
  _cleanText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  },

  _toTraditionalText(text) {
    return this._convertByMaps(text, TOURDAYS_TO_TRADITIONAL_PHRASES, TOURDAYS_TO_TRADITIONAL_CHARS);
  },

  _toSimplifiedText(text) {
    return this._convertByMaps(text, TOURDAYS_TO_SIMPLIFIED_PHRASES, TOURDAYS_TO_SIMPLIFIED_CHARS);
  },

  _convertByMaps(text, phrases, chars) {
    let result = String(text ?? '');
    const phraseEntries = Object.entries(phrases).sort((a, b) => b[0].length - a[0].length);
    phraseEntries.forEach(([from, to]) => {
      if (result.includes(from)) result = result.split(from).join(to);
    });
    for (const [from, to] of Object.entries(chars)) {
      result = result.split(from).join(to);
    }
    return result;
  },

  normalizeImportValue(meta, value, fieldLabel) {
    if (!meta) return value;
    const itemLabel = this._extractItemLabelFromFieldLabel(fieldLabel, meta);
    const shouldTraditionalize = meta.role === 'text' || meta.role === 'select' || meta.role === 'searchSelect';
    if (!shouldTraditionalize) return value;

    const normalizeText = (text) => {
      if (!text) return text;
      if (meta.cardKind === 'assembly' && /接机\/站地址|接機\/站地址/.test(itemLabel || '')) {
        return this._toTraditionalText(text);
      }
      if (meta.cardKind === 'scenic' && /景点类型|景點類型|地点|地點/.test(itemLabel || '')) {
        return this._toTraditionalText(text);
      }
      return text;
    };

    if ((meta.role === 'select' || meta.role === 'searchSelect') && value && typeof value === 'object') {
      return { ...value, text: normalizeText(value.text) };
    }
    if (typeof value === 'string') return normalizeText(value);
    return value;
  },

  // ====== 阶段 C：填充阶段定位 ======

  /**
   * 根据 meta 定位目标控件（供 itineraryField handler 使用）
   *
   * @param {object} meta - { dayIndex, role, cardKind, occurrenceIndex, itemIndex, isDayTitle }
   * @returns {HTMLElement|null} 目标主控件或 form-item
   */
  findElementByMeta(meta, fieldLabel) {
    if (!meta) return null;

    const dayEl = document.getElementById(`td-day-wrap-${meta.dayIndex}`);
    if (!dayEl) return null;

    // 天标题
    if (meta.isDayTitle || meta.role === 'title') {
      const titleData = this._parseDayTitle(dayEl);
      return titleData ? titleData.textarea : null;
    }

    const card = this._findCardByMeta(dayEl, meta);
    if (!card) return null;

    const item = this._findCardItemByMeta(card, meta, fieldLabel);
    if (!item) return null;

    return this._getMainControl(item.element, meta.role) || item.element;
  },

  findValueByMeta(meta, fieldLabel) {
    if (!meta) return undefined;
    const target = this.findElementByMeta(meta, fieldLabel);
    if (!target) return undefined;
    if (meta.role === 'title' || meta.role === 'note' || meta.role === 'text' || meta.role === 'number') {
      return target.value;
    }
    if (meta.role === 'select' || meta.role === 'searchSelect') {
      const selected = target.querySelector('.ant-select-selection-selected-value');
      const text = selected
        ? (selected.getAttribute('title') || selected.textContent.trim())
        : (target.querySelector('input.ant-select-search__field, input.ant-input')?.value || '');
      return text ? { text } : undefined;
    }
    if (meta.role === 'numberGroup') {
      const itemEl = target.closest?.('.ant-form-item') || target;
      const item = this._parseSingleCardItem(itemEl);
      return item ? this._normalizeFieldValue('numberGroup', item.value) : undefined;
    }
    if (meta.role === 'radioTime') {
      const itemEl = target.closest?.('.ant-form-item') || target;
      const item = this._parseSingleCardItem(itemEl);
      return item ? this._normalizeFieldValue('radioTime', item.value) : undefined;
    }
    if (meta.role === 'radio') {
      const checked = target.querySelector('input[type="radio"]:checked');
      return checked ? checked.value : undefined;
    }
    if (meta.role === 'checkbox') {
      return Array.from(target.querySelectorAll('input[type="checkbox"]:checked')).map(c => c.value);
    }
    return undefined;
  },

  _findCardByMeta(dayEl, meta) {
    const dayData = this._parseDayCards(dayEl, meta.dayIndex);
    return dayData.find(c =>
      c.cardKind === meta.cardKind && c.occurrenceIndex === meta.occurrenceIndex
    ) || null;
  },

  _findCardItemByMeta(card, meta, fieldLabel) {
    const items = this._parseCardItems(card.element);
    const byIndex = items[meta.itemIndex];
    if (byIndex && this._itemMatchesMeta(byIndex, meta, fieldLabel)) return byIndex;

    const itemLabel = this._extractItemLabelFromFieldLabel(fieldLabel, meta);
    if (itemLabel) {
      const byLabel = items.find(item => this._itemLabelMatches(item, itemLabel, meta));
      if (byLabel) return byLabel;
    }

    return byIndex || null;
  },

  _parseSingleCardItem(itemEl) {
    const card = itemEl.closest('[class*="td-day-card--"]') || itemEl;
    return this._parseCardItems(card).find(item => item.element === itemEl) || null;
  },

  _itemMatchesMeta(item, meta, fieldLabel) {
    if (!item) return false;
    const role = this._fieldTypeToRole(item.fieldType, item);
    if (!this._rolesCompatible(role, meta.role)) return false;
    const itemLabel = this._extractItemLabelFromFieldLabel(fieldLabel, meta);
    return !itemLabel || this._itemLabelMatches(item, itemLabel, meta);
  },

  _rolesCompatible(actualRole, expectedRole) {
    if (actualRole === expectedRole) return true;
    const selectRoles = new Set(['select', 'searchSelect']);
    return selectRoles.has(actualRole) && selectRoles.has(expectedRole);
  },

  _itemLabelMatches(item, expectedLabel, meta) {
    const actual = this._normalizeLabelForMatch(item.label);
    const expected = this._normalizeLabelForMatch(expectedLabel);
    if (!expected) return false;
    if (actual === expected) return true;

    const modulePrefix = this._normalizeLabelForMatch(item.moduleBlock || '');
    const withModule = this._normalizeLabelForMatch(`${item.moduleBlock || ''} ${item.label}`);
    if (withModule === expected) return true;
    if (modulePrefix && expected.endsWith(actual) && expected.includes(modulePrefix)) return true;
    return false;
  },

  _extractItemLabelFromFieldLabel(fieldLabel, meta) {
    if (!fieldLabel || !meta || meta.isDayTitle) return '';
    const dayLabel = `第${meta.dayIndex + 1}天`;
    const kindLabel = this._getKindLabel(meta.cardKind);
    const prefix = `${dayLabel} ${kindLabel} ${meta.occurrenceIndex + 1} `;
    if (fieldLabel.startsWith(prefix)) return fieldLabel.slice(prefix.length).trim();
    const parts = fieldLabel.split(' ');
    return parts.length > 3 ? parts.slice(3).join(' ').trim() : '';
  },

  _normalizeLabelForMatch(label) {
    const text = this._cleanText(label).replace(/[ℹ️⚠️✔️]/g, '').trim();
    return this._toSimplifiedText(text).replace(/\s+/g, '');
  },

  /**
   * 从 form-item 取主控件（按 role）
   * @returns {HTMLElement|null}
   */
  _getMainControl(itemEl, role) {
    const cw = itemEl.querySelector('.ant-form-item-control');
    if (!cw) return null;
    switch (role) {
      case 'note':
        return cw.querySelector('textarea');
      case 'text':
        return cw.querySelector('input:not([type="radio"]):not([type="checkbox"])');
      case 'number': {
        const num = cw.querySelector('.ant-input-number-input');
        return num || cw.querySelector('input');
      }
      case 'radio':
        // 返回 form-item，handler 在其内按 value 找目标 radio
        return itemEl;
      case 'radioTime':
        // radio + 条件 select 复合控件，返回 form-item，handler 内取 radio-group + select
        return itemEl;
      case 'checkbox':
        return itemEl;
      case 'select':
      case 'searchSelect': {
        const sel = cw.querySelector('.ant-select');
        return sel || cw;
      }
      default:
        return itemEl;
    }
  },

  /**
   * 向后兼容：旧名 findTextareaByMeta（阶段 C 早期 handler 用过）
   * 现已统一为 findElementByMeta，保留转发避免外部引用断裂。
   */
  findTextareaByMeta(meta) {
    if (!meta) return null;
    const el = this.findElementByMeta(meta);
    if (el && el.tagName === 'TEXTAREA') return el;
    // title/note role 期望 textarea
    if (meta.role === 'title' || meta.role === 'note') {
      const dayEl = document.getElementById(`td-day-wrap-${meta.dayIndex}`);
      if (!dayEl) return null;
      if (meta.isDayTitle || meta.role === 'title') {
        const titleData = this._parseDayTitle(dayEl);
        return titleData ? titleData.textarea : null;
      }
      const dayData = this._parseDayCards(dayEl, meta.dayIndex);
      const card = dayData.find(c => c.cardKind === meta.cardKind && c.occurrenceIndex === meta.occurrenceIndex);
      if (!card) return null;
      const items = this._parseCardItems(card.element);
      const item = items[meta.itemIndex];
      return item ? (item.element.querySelector('textarea')) : null;
    }
    return null;
  },

  // ====== 阶段 D：导入前补齐卡片 ======

  /**
   * 导入前批量补齐所有天的卡片结构（按国内导出序列对齐）
   * 在 panel.js 确认填写后、fillAll 逐字段填充前调用（决议 2A 时序）
   *
   * @param {object} importData - { data: { '第N天': { fieldLabel: { meta } } } }
   * @param {function} onProgress - (msg) 进度回调
   */
  async ensureAllStructure(importData, onProgress) {
    if (!importData || !importData.data) return;

    // 逐天汇总目标卡片序列（保留 DOM 导出顺序），并补齐
    for (const [dayLabel, dayData] of Object.entries(importData.data)) {
      const dayIndex = this._dayLabelToIndex(dayLabel);
      if (dayIndex === null) continue;
      const sourceCards = this._summarizeSourceCards(dayData);
      if (!sourceCards.length) continue;
      if (onProgress) onProgress(`正在补齐第${dayIndex + 1}天卡片...`);
      await this._ensureDayStructure(dayIndex, sourceCards, onProgress);
    }
  },

  /**
   * 导入填写后清理多余的默认模板卡片
   *
   * 国际版每天默认会预置若干空模板卡片（如餐饮×3+酒店×1），补齐+填写后，
   * 超出国内源序列同类型卡片数量的多余卡片若仍为空（无任何已填值），
   * 点击其"删除"按钮移除，避免残留多余空卡。
   *
   * 调用时机：fillAll 完成后（panel.js 验证前）。
   * 安全策略：只删"超出源序列该类型数量"且"无已填内容"的卡片，有内容的保留。
   *
   * @param {object} importData - { data: { '第N天': { fieldLabel: { meta } } } }
   * @param {function} onProgress
   */
  async cleanupExcessCards(importData, onProgress) {
    if (!importData || !importData.data) return;

    for (const [dayLabel, dayData] of Object.entries(importData.data)) {
      const dayIndex = this._dayLabelToIndex(dayLabel);
      if (dayIndex === null) continue;
      const dayEl = document.getElementById(`td-day-wrap-${dayIndex}`);
      if (!dayEl) continue;

      // 源序列每类型期望数量
      const expected = {};
      for (const src of this._summarizeSourceCards(dayData)) {
        expected[src.cardKind] = (expected[src.cardKind] || 0) + 1;
      }

      // 当前页每类型卡片按 DOM 顺序分组
      const cards = this._parseIntlDayCards(dayEl);
      const byKind = {};
      cards.forEach(c => {
        if (!byKind[c.cardKind]) byKind[c.cardKind] = [];
        byKind[c.cardKind].push(c.element);
      });

      // 对每类型，超出期望数量且为空的卡片删除
      for (const [kind, els] of Object.entries(byKind)) {
        const keep = expected[kind] || 0;
        if (els.length <= keep) continue;
        // 超出的尾部卡片，逐个检查是否为空再删
        const excess = els.slice(keep);
        for (const cardEl of excess) {
          if (this._isCardEmpty(cardEl)) {
            if (onProgress) onProgress(`正在删除第${dayIndex + 1}天多余的空${this._getKindLabel(kind)}卡片...`);
            await this._deleteCard(cardEl);
          }
        }
      }
    }
  },

  /**
   * 判断一张卡片是否为空（无任何已填值的控件）
   * 用于决定多余模板卡片是否可安全删除。
   */
  _isCardEmpty(cardEl) {
    // textarea 有值 → 非空
    const tas = cardEl.querySelectorAll('textarea');
    for (const ta of tas) {
      if ((ta.value || '').trim()) return false;
    }
    // input/inputNumber 有值 → 非空
    const inputs = cardEl.querySelectorAll('input.ant-input-number-input, input.ant-input:not([type="radio"]):not([type="checkbox"]):not([class*="ant-select-search__field"])');
    for (const inp of inputs) {
      if ((inp.value || '').trim()) return false;
    }
    // radio/checkbox 有选中 → 非空
    if (cardEl.querySelector('input[type="radio"]:checked, input[type="checkbox"]:checked')) return false;
    // select 有选中值 → 非空
    if (cardEl.querySelector('.ant-select-selection-selected-value')) {
      const sel = cardEl.querySelector('.ant-select-selection-selected-value');
      if ((sel.getAttribute('title') || sel.textContent || '').trim()) return false;
    }
    return true;
  },

  /**
   * 点击卡片右上角"删除"按钮删除该卡片
   * 删除按钮：.tripDescribe__hd-action-btn 文案含"删除"（简体）/ 刪除（繁体）
   *
   * 真实页面点删除可能弹 AntD 确认框（Modal.confirm / Popconfirm），需再点一次
   * "确定"按钮才真正删除。点击删除后等待确认框出现并点确认，再等卡片数量 -1。
   */
  async _deleteCard(cardEl) {
    const dayEl = cardEl.closest('[id^="td-day-wrap-"]');
    const actions = cardEl.querySelectorAll('[class*="hd-action-btn"]');
    let delBtn = null;
    for (const btn of actions) {
      if (/删除|刪除/.test(btn.textContent)) { delBtn = btn; break; }
    }
    if (!delBtn) {
      console.warn('[tourdaysAdapter] 未找到卡片删除按钮');
      return false;
    }

    const before = this._countAllCards(dayEl);

    // 1. 点击删除按钮
    delBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    delBtn.click();
    await this._delay(300);

    // 2. 若弹出确认框，点击"确定"
    await this._confirmDeleteIfPresent();

    // 3. 等待卡片数量 -1
    const start = Date.now();
    while (Date.now() - start < 4000) {
      if (this._countAllCards(dayEl) < before) return true;
      // 确认框可能延迟弹出，再试一次
      await this._confirmDeleteIfPresent();
      await this._delay(200);
    }
    return false;
  },

  /**
   * 检测并点击删除确认框的"确定"按钮
   * 兼容 AntD Modal.confirm（.ant-modal .ant-btn-primary）与 Popconfirm。
   */
  async _confirmDeleteIfPresent() {
    // Modal.confirm：.ant-modal-confirm + .ant-btn-primary（确定）
    const modals = document.querySelectorAll('.ant-modal-confirm:not([style*="display: none"]), .ant-modal-wrap:not([style*="display: none"])');
    for (const modal of modals) {
      const okBtn = modal.querySelector('.ant-btn-primary, .ant-btn-ok, [class*="ant-popover"] .ant-btn-primary');
      if (okBtn) {
        // 仅当文案是确定/确认/OK 时点击，避免误点其他 primary 按钮
        const txt = (okBtn.textContent || '').trim();
        if (/确定|確認|确认|OK|ok/i.test(txt)) {
          okBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          okBtn.click();
          await this._delay(200);
          return;
        }
      }
    }
    // Popconfirm
    const popBtn = document.querySelector('.ant-popover-buttons .ant-btn-primary, .ant-popconfirm .ant-btn-primary');
    if (popBtn) {
      popBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      popBtn.click();
      await this._delay(200);
    }
  },

  _countAllCards(dayEl) {
    if (!dayEl) return 0;
    return dayEl.querySelectorAll('[class*="td-day-card--"]:not([class*="td-day-card-list"])').length;
  },

  /**
   * 从导入数据汇总某天的目标卡片序列（保留 DOM 导出顺序，用于顺序补齐）
   *
   * 导出 data['第N天'] 的字段键按卡片在页面中的 DOM 顺序插入（见 extract），
   * 因此按 Object.keys 遍历即可还原 [餐饮, 景点, 景点, 交通, 餐饮, 餐饮] 这种交错序列。
   * 同一 (cardKind, occurrenceIndex) 的多个字段只产生一个序列项（去重）。
   *
   * @param {object} dayData - 导入数据某天分组
   * @returns {Array<{cardKind, occurrenceIndex}>}
   */
  _summarizeSourceCards(dayData) {
    const seen = new Set();
    const result = [];
    for (const field of Object.values(dayData)) {
      if (!field || !field.meta) continue;
      const m = field.meta;
      if (m.isDayTitle || m.role === 'title') continue;
      const key = `${m.cardKind}:${m.occurrenceIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ cardKind: m.cardKind, occurrenceIndex: m.occurrenceIndex });
    }
    return result;
  },

  /**
   * 把整个导入数据按"天 → 有序卡片序列"汇总（保留出现顺序，用于顺序补齐）
   * 仅供调试/外部调用；ensureAllStructure 走 _summarizeSourceCards 逐天路径。
   *
   * @param {object} data - importData.data
   * @returns {Object} { dayIndex: [{cardKind, occurrenceIndex}] }
   */
  _summarizeAllDays(data) {
    const result = {};
    for (const [dayLabel, dayData] of Object.entries(data)) {
      const dayIndex = this._dayLabelToIndex(dayLabel);
      if (dayIndex === null) continue;
      result[dayIndex] = this._summarizeSourceCards(dayData);
    }
    return result;
  },

  _dayLabelToIndex(label) {
    const m = /^第(\d+)天$/.exec(label || '');
    return m ? parseInt(m[1], 10) - 1 : null;
  },

  /**
   * 补齐单天卡片结构（顺序补齐，决议 1A）
   *
   * 国际页 card-list 是 add-box 与 card 严格交替的结构：
   *   add-box(0), card(0), add-box(1), card(1), ..., add-box(n)
   * 每个 add-box 内含全部 13 种 project-select 按钮，点击某按钮会在该 add-box 位置
   * 之前（即该 add-box 后、下一张 card 前）插入一张对应类型的新卡片（用户确认的真实交互）。
   *
   * 对齐策略（按国内序列逐个推进，维护"已对齐到的卡片下标 intlCursor"）：
   *   - 国内第 i 张卡片若是 src.cardKind#src.occurrenceIndex，
   *     扫描国际页从 intlCursor 起的卡片，找第一张同 cardKind 的；
   *     命中 → 复用（occurrenceIndex 由位置决定），intlCursor 前进到它之后；
   *     未命中 → 在 intlCursor 对应的 add-box（= intlCursor，因 add-box 在卡片之前）
   *              点击 project-select-{type} 插入新卡片，等待渲染后 intlCursor 前进。
   *   - 国际页多余卡片保留不动（不删除）。
   *
   * 注：补卡为 DOM 异步操作，每插一张等待卡片渲染后再继续，避免 add-box 顺序错位。
   * jsdom 无法模拟点击后 React 渲染，完整流程靠浏览器手动回归。
   *
   * @param {number} dayIndex
   * @param {Array<{cardKind, occurrenceIndex}>} sourceSeq
   * @param {function} onProgress
   */
  async _ensureDayStructure(dayIndex, sourceSeq, onProgress) {
    const dayEl = document.getElementById(`td-day-wrap-${dayIndex}`);
    if (!dayEl) return;

    // 国际页卡片游标（指向下一张待对齐的国际卡片下标）
    let intlCursor = 0;

    for (let i = 0; i < sourceSeq.length; i++) {
      const src = sourceSeq[i];

      // 扫描国际页从 intlCursor 起的卡片，找第一张同 cardKind 的复用
      const intlCards = this._parseIntlDayCards(dayEl);
      let reused = -1;
      for (let j = intlCursor; j < intlCards.length; j++) {
        if (intlCards[j].cardKind === src.cardKind) {
          reused = j;
          break;
        }
      }

      if (reused >= 0) {
        // 复用已有卡片，游标前进到其后
        intlCursor = reused + 1;
        continue;
      }

      // 缺失 → 在 intlCursor 对应的 add-box 位置插入新卡片
      const added = await this._addCardAt(dayEl, intlCursor, src.cardKind);
      if (!added) {
        console.warn(`[tourdaysAdapter] 补卡失败: 第${dayIndex + 1}天 ${src.cardKind}#${src.occurrenceIndex} (位置${intlCursor})`);
        // 不阻塞，游标不前进，继续后续卡片
      } else {
        // 插入后新增卡片占据 intlCursor 位置，原 intlCursor 卡片后移，游标前进一位
        intlCursor += 1;
      }
    }
  },

  /**
   * 解析国际页某天的卡片序列（cardKind + 顺序位置，不按类型分 occurrenceIndex）
   * @param {HTMLElement} dayEl
   * @returns {Array<{cardKind, element}>}
   */
  _parseIntlDayCards(dayEl) {
    const cardEls = Array.from(dayEl.querySelectorAll('[class*="td-day-card--"]'))
      .filter(el => !el.className.includes('td-day-card-list'));
    return cardEls.map(el => ({
      cardKind: this._inferCardKind(el),
      element: el
    }));
  },

  /**
   * 解析国际页某天的某 cardKind + occurrenceIndex 卡片是否存在
   * @returns {HTMLElement|null}
   */
  _parseIntlCard(dayIndex, cardKind, occurrenceIndex) {
    const dayEl = document.getElementById(`td-day-wrap-${dayIndex}`);
    if (!dayEl) return null;
    const cards = this._parseDayCards(dayEl, dayIndex);
    const card = cards.find(c => c.cardKind === cardKind && c.occurrenceIndex === occurrenceIndex);
    return card ? card.element : null;
  },

  /**
   * 在国际页某 day 的指定位置插入一张 cardKind 卡片
   *
   * 真实交互（用户确认）：card-list 内 add-box 与 card 严格交替，
   * 第 position 个 add-box（0-indexed，位于 card position 之前）内含全部
   * project-select 按钮，点击 [id$="project-select-{name}"] 即在该位置插入新卡片。
   * 不需要先点加号——项目按钮始终存在于 DOM 中，直接点击即可触发 React onClick。
   *
   * @param {HTMLElement} dayEl
   * @param {number} position add-box 下标（= 该位置卡片之前的 add-box）
   * @param {string} cardKind
   * @returns {Promise<boolean>} 是否成功（卡片数量 +1）
   */
  async _addCardAt(dayEl, position, cardKind) {
    const list = dayEl.querySelector('[class*="td-day-card-list"]');
    if (!list) return false;

    // card-list 直接子元素的 add-box 序列（add-box 始终在对应卡片之前）
    const addBoxes = Array.from(list.querySelectorAll(':scope > [class*="td-add-box"]'));
    if (position >= addBoxes.length) {
      console.warn(`[tourdaysAdapter] add-box 不足: 需 ${position + 1} 个，仅 ${addBoxes.length} 个（位置${position}）`);
      return false;
    }
    const addBox = addBoxes[position];

    const buttonName = this._getAddButtonName(cardKind);
    if (!buttonName) {
      console.warn(`[tourdaysAdapter] 未知卡片类型，无补卡按钮: ${cardKind}`);
      return false;
    }

    // 限定在当前 add-box 内查找，避免重复 id 误选其他 add-box 的同类型按钮
    const itemBtn = addBox.querySelector(`[id$="project-select-${buttonName}"]`);
    if (!itemBtn) {
      console.warn(`[tourdaysAdapter] add-box 内未找到项目按钮: project-select-${buttonName}`);
      return false;
    }

    const beforeCount = this._countCardsByKind(dayEl, cardKind);

    // 直接点击项目按钮触发 React onClick（用户确认：项目按钮始终在 DOM 中，
    // 直接点击即在当前位置插入对应类型卡片，无需先点加号展开菜单）
    this._clickAddItemButton(itemBtn);

    // 等待该类型卡片数量 +1（条件等待，不用固定 sleep）
    let ok = await this._waitForCardCount(dayEl, cardKind, beforeCount + 1, 5000);

    // 兜底：若直接点击未生效（菜单可能默认折叠，需先点加号展开），点击加号后再点项目按钮
    if (!ok) {
      const plusBtn = addBox.querySelector('[class*="add-plus-btn"]');
      if (plusBtn) {
        console.log(`[tourdaysAdapter] 直接点击未生效，尝试先展开菜单: ${cardKind}（位置${position}）`);
        plusBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        plusBtn.click();
        await this._delay(400);
        this._clickAddItemButton(itemBtn);
        ok = await this._waitForCardCount(dayEl, cardKind, beforeCount + 1, 5000);
      }
    }

    if (!ok) {
      console.warn(`[tourdaysAdapter] 新增卡片超时: ${cardKind}（位置${position}）`);
    }
    return ok;
  },

  /**
   * 触发项目按钮点击的完整鼠标事件序列（兼容 React 事件代理）
   */
  _clickAddItemButton(itemBtn) {
    itemBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    itemBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    itemBtn.click();
  },

  /**
   * 统计某 day 内某 cardKind 卡片数量
   */
  _countCardsByKind(dayEl, cardKind) {
    const cards = Array.from(dayEl.querySelectorAll('[class*="td-day-card--"]'))
      .filter(el => !el.className.includes('td-day-card-list'));
    return cards.filter(c => this._inferCardKind(c) === cardKind).length;
  },

  /**
   * 条件等待某 day 内某 cardKind 卡片数量达到目标（不用固定 sleep）
   */
  async _waitForCardCount(dayEl, cardKind, target, timeout) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (this._countCardsByKind(dayEl, cardKind) >= target) return true;
      await this._delay(150);
    }
    return false;
  },

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

// 自注册到 PageRegistry
if (typeof window !== 'undefined' && window.PageRegistry) {
  window.PageRegistry.register(tourdaysAdapter);
}

// 导出供测试
if (typeof window !== 'undefined') {
  window.tourdaysAdapter = tourdaysAdapter;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = tourdaysAdapter;
}
