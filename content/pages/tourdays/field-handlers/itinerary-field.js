/**
 * itineraryField FieldHandler — tourdays 页面专属字段（阶段 C 全 role 填充）
 *
 * 通过 FieldTypeRegistry.registerScoped('itineraryField', handler) 注册。
 * 统一 type 为 itineraryField，按 field.meta.role 分发到各控件设值函数。
 *
 * 阶段 D 补卡已在 fillAll 前批量完成（panel.js 调 tourdaysAdapter.ensureAllStructure），
 * 本 handler 只负责定位 + 填充，不触发补卡（决议 2A 时序契约）。
 *
 * 设值函数尽量复用 FormFiller 既有能力（_fillInputNumber/_fillPlainSelectByElement/
 * _fillSearchSelect 等），通过 ctx 注入，避免重写一遍。
 */

const itineraryFieldHandler = {
  type: 'itineraryField',

  /**
   * detect：本类型由 tourdaysAdapter.extract 直接产生字段，
   * 不参与 form-extractor 通用 _extractFormItem 的遍历。
   * @returns {boolean} 始终 false
   */
  detect() {
    return false;
  },

  /**
   * 填充单个行程字段（按 meta.role 分发）
   *
   * @param {object} field - 含 meta { dayIndex, role, cardKind, occurrenceIndex, itemIndex, isDayTitle }
   * @param {object} ctx - FillContext { AntD1Filler, ReactFiller, delay, ... }
   */
  async fill(field, ctx) {
    const adapter = (typeof window !== 'undefined' && window.tourdaysAdapter) || null;
    if (!adapter) {
      throw new Error('tourdaysAdapter 未加载');
    }

    const meta = field.meta || {};
    const role = meta.role;
    const value = adapter.normalizeImportValue(meta, field.value, field.label);

    // 定位目标：部分字段的控件是条件渲染的（如集合卡片勾选"接机/站"后才出现
    // 接机/站地址/用车类型/可服务时间段）。前面字段填完后这些控件可能尚未渲染，
    // 故 findElementByMeta 返回 null 时按指数退避重试几次。
    const delay = (ctx && ctx.delay) || ((ms) => new Promise(r => setTimeout(r, ms)));
    let target = adapter.findElementByMeta(meta, field.label);
    if (!target) {
      for (const wait of [300, 600, 1000]) {
        await delay(wait);
        target = adapter.findElementByMeta(meta, field.label);
        if (target) break;
      }
    }
    if (!target) {
      throw new Error(`未找到行程描述目标: ${describeMeta(meta)}`);
    }

    const filler = window.FormFiller || null;

    switch (role) {
      case 'title':
      case 'note':
        fillTextarea(target, value);
        return;
      case 'text':
        await fillTextField(target, normalizeTourdaysDisplayValue(adapter, meta, value, field.label), ctx, delay, meta, field.label);
        return;
      case 'number':
        await fillNumber(target, value, ctx);
        return;
      case 'numberGroup':
        await fillNumberGroup(target, value, ctx, delay);
        return;
      case 'radio':
        fillRadio(target, value);
        return;
      case 'radioTime':
        await fillRadioTime(target, value, filler, delay);
        return;
      case 'checkbox':
        fillCheckbox(target, value);
        return;
      case 'select':
        await fillSelect(target, normalizeTourdaysDisplayValue(adapter, meta, value, field.label), filler, delay);
        return;
      case 'searchSelect':
        await fillSearchSelect(target, normalizeTourdaysDisplayValue(adapter, meta, value, field.label), filler, delay);
        return;
      default:
        throw new Error(`不支持的 role: ${role}`);
    }
  }
};

/**
 * 生成 meta 的可读描述（用于错误信息）
 */
function describeMeta(meta) {
  if (!meta) return '(无 meta)';
  if (meta.isDayTitle || meta.role === 'title') {
    return `第${meta.dayIndex + 1}天 标题`;
  }
  const kind = meta.cardKind || '?';
  const occ = (meta.occurrenceIndex ?? 0) + 1;
  const role = meta.role || '?';
  return `第${meta.dayIndex + 1}天 ${kind} ${occ} ${role}`;
}

// ====== 各 role 设值函数 ======

/**
 * 用 React 原生 setter 设 textarea 值并触发 input/change/blur
 */
function fillTextarea(textarea, value) {
  if (!textarea) throw new Error('textarea 目标为空');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(textarea, String(value ?? ''));
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
  textarea.dispatchEvent(new Event('blur', { bubbles: true }));
  console.log('[itineraryField] textarea 已填入:', String(value ?? '').slice(0, 60));
}

function normalizeTourdaysDisplayValue(adapter, meta, value, fieldLabel) {
  if (!adapter || typeof adapter.normalizeImportValue !== 'function') return value;
  return adapter.normalizeImportValue(meta, value, fieldLabel);
}

/**
 * 填单行 input：优先 AntD1Filler/ReactFiller，兜底原生 setter
 * target 为 input 元素
 */
async function fillTextField(input, value, ctx, delay, meta, fieldLabel) {
  const label = String(fieldLabel || '');
  if (meta && meta.cardKind === 'assembly' && /接机\/站地址|接機\/站地址/.test(label)) {
    const picked = await fillPickerPopupInput(input, value, delay);
    if (picked) return;
  }
  await fillInput(input, value, ctx);
}

async function fillPickerPopupInput(input, value, delay) {
  if (!input) return false;
  input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  input.click();
  const wait = delay || ((ms) => new Promise(r => setTimeout(r, ms)));
  await wait(300);

  const popupInput = findPopupSearchInput(input);
  if (!popupInput) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(popupInput, String(value ?? ''));
  popupInput.dispatchEvent(new Event('input', { bubbles: true }));
  popupInput.dispatchEvent(new Event('change', { bubbles: true }));

  const option = await waitForMatchingOption(String(value ?? ''), wait);
  if (!option) return false;
  option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  option.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  option.click();
  await wait(200);

  const okBtn = Array.from(document.querySelectorAll('.ant-modal .ant-btn-primary, .ant-modal-wrap .ant-btn-primary, .ant-popover .ant-btn-primary'))
    .find(btn => /确定|確認|确认|OK/i.test(btn.textContent || ''));
  if (okBtn) okBtn.click();
  await wait(200);
  return true;
}

function findPopupSearchInput(originInput) {
  const candidates = Array.from(document.querySelectorAll('.ant-modal input, .ant-modal-wrap input, .ant-popover input, .ant-select-dropdown input'))
    .filter(input => input !== originInput && !input.disabled && input.type !== 'hidden');
  return candidates.find(input => input.classList.contains('ant-select-search__field') || input.classList.contains('ant-input')) || null;
}

async function fillInput(input, value, ctx) {
  if (!input) throw new Error('input 目标为空');
  const finalValue = (value === null || value === undefined) ? '' : String(value);

  // ReactFiller 优先（直接调 onChange 更新 React 状态）
  let reactOk = false;
  try { if (ctx && ctx.ReactFiller && ctx.ReactFiller.fillInput(input, finalValue)) reactOk = true; } catch (e) {}

  // 始终用原生 setter + input/change/blur，确保 DOM 值写入并触发 React onChange
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, finalValue);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));

  if (!reactOk) {
    try { if (ctx && ctx.AntD1Filler) ctx.AntD1Filler.fillInput(input, finalValue); } catch (e) {}
  }
  console.log('[itineraryField] input 已填入:', finalValue);
}

/**
 * 填 ant-input-number：优先 ReactFiller/AntD1Filler，兜底原生 setter
 * target 为 .ant-input-number-input 或 input
 */
async function fillNumber(input, value, ctx) {
  if (!input) throw new Error('number 目标为空');
  if (value === null || value === undefined || value === '') return;
  fillSingleInputNumber(input, value, ctx);
  console.log('[itineraryField] number 已填入:', value);
}

/**
 * 填成组 inputNumber（如 行驶时间/活动时长/用餐时长）
 * value: { values: number[], separators: string[] }
 * target 为 form-item（含多个 .ant-input-number-input）
 *
 * 每个 input 走 fillSingleInputNumber（ReactFiller 预热 + 原生 setter + input/change/blur），
 * 确保 React 受控的 ant-input-number 状态正确更新。
 */
async function fillNumberGroup(formItem, value, ctx, delay) {
  if (!formItem) throw new Error('numberGroup 目标为空');
  const inputs = formItem.querySelectorAll('.ant-input-number-input');
  if (inputs.length === 0) throw new Error('numberGroup 内未找到 inputNumber 控件');

  const values = (value && Array.isArray(value.values)) ? value.values : [];

  for (let i = 0; i < inputs.length; i++) {
    const v = i < values.length ? values[i] : null;
    if (v === null || v === undefined || v === '') continue;
    fillSingleInputNumber(inputs[i], v, ctx);
    if (delay) await delay(80);
  }
  console.log('[itineraryField] numberGroup 已填入:', values);
}

/**
 * 填单个 ant-input-number
 * ant-input-number 的内部 input 是 React 受控组件，React 监听根节点的合成 onChange。
 * 用原生 setter 设值 + input/change/blur 事件序列即可触发 React onChange 更新状态。
 * 先尝试 ReactFiller（直接调 onChange）做预热，再用原生 setter 兜底确保 DOM 值写入。
 */
function fillSingleInputNumber(input, value, ctx) {
  // 1. 优先 ReactFiller（直接调组件 onChange，更新 React 状态）
  let reactOk = false;
  try {
    if (ctx && ctx.ReactFiller && ctx.ReactFiller.fillInputNumber(input, value)) reactOk = true;
  } catch (e) { /* 静默 */ }

  // 2. 原生 setter + input/change/blur（确保 DOM value 写入并触发 React onChange）
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, String(value));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));

  // 3. ReactFiller 没成功时，尝试 AntD1Filler
  if (!reactOk) {
    try {
      if (ctx && ctx.AntD1Filler) ctx.AntD1Filler.fillInputNumber(input, value);
    } catch (e) { /* 静默 */ }
  }
  return true;
}

/**
 * 填 radio：在 form-item 内找 input[type=radio][value=field.value] 并点击
 * 单选只点击一个；value 为选中项的内部码（字符串）
 */
function fillRadio(formItem, value) {
  if (!formItem) throw new Error('radio 目标为空');
  const targetValue = String(value ?? '');
  if (!targetValue) throw new Error('radio 值为空');

  const radios = formItem.querySelectorAll('input[type="radio"]');
  if (radios.length === 0) throw new Error('radio 选项不存在');

  const target = Array.from(radios).find(r => String(r.value) === targetValue);
  if (!target) {
    // 兜底：按 radio 文案包含匹配（value 跨版本可能不一致）
    const byText = Array.from(radios).find(r => {
      const txt = r.closest('label')?.textContent || '';
      return txt.includes(targetValue);
    });
    if (!byText) throw new Error(`radio 选项不存在: ${targetValue}`);
    if (!byText.checked) {
      byText.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      byText.click();
    }
    return;
  }
  if (!target.checked) {
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    target.click();
  }
  console.log('[itineraryField] radio 已选:', targetValue);
}

/**
 * 填 radio + 条件 select 复合控件（tourdays"时间"字段）
 * value: { radio: '选中值', time: ['时','分'] }
 * target 为 form-item。先选 radio，若为具体时间(value=-1)则等待两个 select 渲染后按文本填入。
 */
async function fillRadioTime(formItem, value, filler, delay) {
  if (!formItem) throw new Error('radioTime 目标为空');
  const radioVal = value && value.radio !== undefined ? String(value.radio) : '';
  const timeVals = (value && Array.isArray(value.time)) ? value.time : [];

  // 1. 选 radio
  if (radioVal) {
    const radios = formItem.querySelectorAll('input[type="radio"]');
    const target = Array.from(radios).find(r => String(r.value) === radioVal);
    if (target) {
      if (!target.checked) {
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        target.click();
      }
    } else {
      console.warn(`[itineraryField] radioTime radio 选项不存在: ${radioVal}`);
    }
  }

  // 2. 仅当选具体时间(value=-1)且有时分值时才填 select
  if (radioVal !== '-1' || timeVals.length === 0) {
    console.log('[itineraryField] radioTime 已选 radio:', radioVal);
    return;
  }

  // 选具体时间后 select 可能异步渲染，等待并填入
  if (delay) await delay(500);
  // 退避等待 select 出现（最多 2s）
  let selects = formItem.querySelectorAll('.ant-select');
  let waited = 0;
  while (selects.length < timeVals.length && waited < 2000) {
    await (delay ? delay(200) : new Promise(r => setTimeout(r, 200)));
    selects = formItem.querySelectorAll('.ant-select');
    waited += 200;
  }

  if (selects.length === 0) {
    console.warn('[itineraryField] radioTime 未找到时/分 select');
    return;
  }

  // 按 DOM 顺序逐个填时分（复用 FormFiller._fillPlainSelectByElement 按文本匹配）
  for (let i = 0; i < selects.length && i < timeVals.length; i++) {
    const txt = String(timeVals[i] ?? '').trim();
    if (!txt) continue;
    try {
      if (filler && typeof filler._fillPlainSelectByElement === 'function') {
        await filler._fillPlainSelectByElement(selects[i], txt);
      } else {
        console.warn('[itineraryField] radioTime 填 select 缺 FormFiller._fillPlainSelectByElement');
      }
    } catch (e) {
      console.warn(`[itineraryField] radioTime 时/分[${i}] 填入失败: ${e.message}`);
    }
    if (delay) await delay(150);
  }
  console.log('[itineraryField] radioTime 已选 radio:', radioVal, 'time:', timeVals);
}

/**
 * 填 checkbox：value 为数组，逐个找 input[type=checkbox][value=v] 并点击
 * 保守不取消目标页已选但源未选的项
 */
function fillCheckbox(formItem, value) {
  if (!formItem) throw new Error('checkbox 目标为空');
  const values = Array.isArray(value) ? value.map(String) : [];

  for (const v of values) {
    // 直接遍历匹配 value，避免 CSS.escape 在非浏览器/旧环境不可用
    const allCb = Array.from(formItem.querySelectorAll('input[type="checkbox"]'));
    let cb = allCb.find(c => String(c.value) === v);
    if (!cb) {
      // 兜底：文案包含
      cb = allCb.find(c => {
        const txt = c.closest('label')?.textContent || '';
        return txt.includes(v);
      });
    }
    if (!cb) {
      console.warn(`[itineraryField] checkbox 选项不存在: ${v}，跳过`);
      continue;
    }
    if (!cb.checked) cb.click();
  }
  console.log('[itineraryField] checkbox 已选:', values);
}

/**
 * 填普通下拉框（景点类型/住宿类型/餐饮类型...）
 * target 为 .ant-select 元素；复用 FormFiller._fillPlainSelectByElement 做文本匹配（含简繁归一）
 */
async function fillSelect(selectEl, value, filler, delay) {
  if (!selectEl) throw new Error('select 目标为空');
  const text = typeof value === 'object' ? (value && value.text) : String(value ?? '');
  if (!text) return;

  if (isComboboxSelect(selectEl)) {
    const clicked = await fillComboboxAndPickOption(selectEl, text, delay);
    if (clicked) {
      console.log('[itineraryField] combobox select 已选:', text);
      return;
    }
  }

  if (filler && typeof filler._fillPlainSelectByElement === 'function') {
    await filler._fillPlainSelectByElement(selectEl, text);
    console.log('[itineraryField] select 已选:', text);
    return;
  }

  const clicked = await fillComboboxAndPickOption(selectEl, text, delay);
  if (clicked) {
    console.log('[itineraryField] select(兜底) 已选:', text);
    return;
  }
  throw new Error('FormFiller._fillPlainSelectByElement 不可用，无法填 select');
}

function isComboboxSelect(selectEl) {
  return !!(selectEl && (
    selectEl.classList?.contains('ant-select-combobox') ||
    selectEl.classList?.contains('ant-select-auto-complete') ||
    selectEl.querySelector('input.ant-select-search__field, input.ant-input')
  ));
}

async function fillComboboxAndPickOption(selectEl, text, delay) {
  const input = selectEl.querySelector('input.ant-select-search__field, input.ant-input');
  const trigger = selectEl.querySelector('.ant-select-selection, .ant-select-selector') || selectEl;
  if (!input && !trigger) return false;

  trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  trigger.click();
  if (delay) await delay(100);

  if (input) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, String(text));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const option = await waitForMatchingOption(text, delay);
  if (!option) return false;
  option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  option.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  option.click();
  if (delay) await delay(100);
  return true;
}

async function waitForMatchingOption(text, delay) {
  const wait = delay || ((ms) => new Promise(r => setTimeout(r, ms)));
  for (let i = 0; i < 12; i++) {
    const options = Array.from(document.querySelectorAll([
      '.ant-select-dropdown-menu-item:not(.ant-select-dropdown-menu-item-disabled)',
      '.ant-select-item-option:not(.ant-select-item-option-disabled)'
    ].join(',')));
    const match = options.find(opt => optionTextMatches(opt.textContent || '', text));
    if (match) return match;
    await wait(150);
  }
  return null;
}

function optionTextMatches(optionText, targetText) {
  const normalize = text => String(text || '')
    .replace(/\s+/g, '')
    .replace(/[國国]/g, '国')
    .replace(/[際际]/g, '际')
    .replace(/[機机]/g, '机')
    .replace(/[場场]/g, '场')
    .replace(/[車车]/g, '车')
    .replace(/[門门]/g, '门')
    .replace(/[點点]/g, '点')
    .replace(/[觀观]/g, '观')
    .replace(/[無无]/g, '无')
    .replace(/[類类]/g, '类')
    .replace(/[聖圣]/g, '圣')
    .replace(/[魯鲁]/g, '鲁')
    .replace(/[舊旧]/g, '旧')
    .replace(/[費费]/g, '费');
  const option = normalize(optionText);
  const target = normalize(targetText);
  return option === target || option.includes(target) || target.includes(option);
}

/**
 * 填搜索下拉框（用餐地点/景点项目/酒店名称）
 * target 为 .ant-select 元素；优先取内部 search input 的 id 调 _fillSearchSelect
 * 匹配失败标 failed 不阻塞（由 _fillField try-catch 记入 results）
 */
async function fillSearchSelect(selectEl, value, filler, delay) {
  if (!selectEl) throw new Error('searchSelect 目标为空');
  const text = typeof value === 'object' ? (value && value.text) : String(value ?? '');
  if (!text) return;

  const comboboxPicked = await fillComboboxAndPickOption(selectEl, text, delay);
  if (comboboxPicked) {
    console.log('[itineraryField] searchSelect(combobox) 已选:', text);
    return;
  }

  if (!filler) throw new Error('FormFiller 不可用，无法填 searchSelect');

  const searchInput = selectEl.querySelector('input.ant-select-search__field[id]');
  if (searchInput && searchInput.id && typeof filler._fillSearchSelect === 'function') {
    await filler._fillSearchSelect(searchInput.id, { text });
    console.log('[itineraryField] searchSelect 已填:', text);
    return;
  }

  // 兜底：当作普通 select 按文本匹配
  if (typeof filler._fillPlainSelectByElement === 'function') {
    await filler._fillPlainSelectByElement(selectEl, text);
    console.log('[itineraryField] searchSelect(兜底) 已选:', text);
    return;
  }
  throw new Error(`searchSelect 未匹配选项: ${text}`);
}

if (typeof window !== 'undefined') {
  window.itineraryFieldHandler = itineraryFieldHandler;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = itineraryFieldHandler;
}
