/**
 * 表单自动填写器 - 将数据填入Ant Design表单
 *
 * 填写策略：DOM模拟（React原生setter + 事件触发）
 * MVP阶段不做API兜底
 */

const FormFiller = {
  /** 填写结果记录 */
  results: [],

  /**
   * 批量填写表单字段
   * @param {object} data - 转换后的字段数据 { groupName: { fieldName: { value, fieldType, ... } } }
   * @returns {Promise<object>} 填写结果汇总
   */
  async fillAll(data) {
    this.results = [];
    const flatFields = this._flattenFields(data);

    for (const field of flatFields) {
      await this._fillField(field);
      // 字段间加小延迟，避免React渲染冲突
      await this._delay(100);
    }

    return {
      total: flatFields.length,
      success: this.results.filter(r => r.status === 'success').length,
      failed: this.results.filter(r => r.status === 'failed').length,
      skipped: this.results.filter(r => r.status === 'skipped').length,
      details: this.results
    };
  },

  /**
   * 将层级数据展平为字段列表
   * @param {object} data
   * @returns {Array}
   */
  _flattenFields(data) {
    const fields = [];
    for (const [groupName, groupData] of Object.entries(data)) {
      for (const [fieldLabel, fieldData] of Object.entries(groupData)) {
        if (fieldData && typeof fieldData === 'object' && fieldData.fieldType) {
          fields.push({
            group: groupName,
            label: fieldLabel,
            ...fieldData
          });
        }
      }
    }
    return fields;
  },

  /**
   * 填写单个字段
   * @param {object} field
   */
  async _fillField(field) {
    const { domKey, fieldType, value } = field;

    if (!domKey) {
      this.results.push({ field: field.label, status: 'skipped', reason: '无domKey' });
      return;
    }

    try {
      switch (fieldType) {
        case 'input':
          this._fillInput(domKey, value);
          this.results.push({ field: field.label, domKey, status: 'success' });
          break;
        case 'inputNumber':
          this._fillInputNumber(domKey, value);
          this.results.push({ field: field.label, domKey, status: 'success' });
          break;
        case 'inputNumberGroup':
          await this._fillInputNumberGroup(domKey, value);
          this.results.push({ field: field.label, domKey, status: 'success' });
          break;
        case 'mixedGroup':
          await this._fillMixedGroup(domKey, value);
          this.results.push({ field: field.label, domKey, status: 'success' });
          break;
        case 'selectGroup':
          await this._fillSelectGroup(domKey, value);
          this.results.push({ field: field.label, domKey, status: 'success' });
          break;
        case 'customDisplay':
          // 自定义展示组件通常只读，跳过自动填写
          this.results.push({ field: field.label, domKey, status: 'skipped', reason: '自定义展示组件，需手动处理' });
          break;
        case 'textarea':
          this._fillTextarea(domKey, value);
          this.results.push({ field: field.label, domKey, status: 'success' });
          break;
        case 'select':
          await this._fillSelect(domKey, value);
          this.results.push({ field: field.label, domKey, status: 'success' });
          break;
        case 'searchSelect':
          await this._fillSearchSelect(domKey, value);
          this.results.push({ field: field.label, domKey, status: 'success' });
          break;
        case 'searchSelectGroup':
          await this._fillSearchSelectGroup(domKey, value);
          this.results.push({ field: field.label, domKey, status: 'success' });
          break;
        case 'multiSearchSelect':
          await this._fillMultiSearchSelect(domKey, value);
          this.results.push({ field: field.label, domKey, status: 'success' });
          break;
        case 'checkbox':
          this._fillCheckbox(domKey, value);
          this.results.push({ field: field.label, domKey, status: 'success' });
          break;
        case 'radio':
          this._fillRadio(domKey, value);
          this.results.push({ field: field.label, domKey, status: 'success' });
          break;
        default:
          this.results.push({ field: field.label, domKey, status: 'skipped', reason: `不支持的字段类型: ${fieldType}` });
      }
    } catch (err) {
      this.results.push({ field: field.label, domKey, status: 'failed', reason: err.message });
    }
  },

  /**
   * 填写普通输入框（React受控组件）
   * @param {string} domKey - 字段ID
   * @param {string|number} value
   */
  _fillInput(domKey, value) {
    // 先尝试通过id找input
    let input = document.querySelector(`input#${CSS.escape(domKey)}`);
    // 再尝试通过label[for]找同行input
    if (!input) {
      const label = document.querySelector(`label[for="${domKey}"]`);
      if (label) {
        const formItem = label.closest('.ant-form-item');
        if (formItem) input = formItem.querySelector('input');
      }
    }
    if (!input) throw new Error(`找不到输入框: ${domKey}`);

    // 将 null 和 undefined 转换为空字符串
    const finalValue = (value === null || value === undefined) ? '' : String(value);

    // 优先使用 AntD1Filler（针对 Ant Design 1.x）
    if (window.AntD1Filler && window.AntD1Filler.fillInput(input, finalValue)) {
      return;
    }

    // 其次使用 ReactFiller（针对 React 新版本）
    if (window.ReactFiller && window.ReactFiller.fillInput(input, finalValue)) {
      return;
    }

    // 回退到原生方法
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeSetter.call(input, finalValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  },

  /**
   * 填写数字输入框（ant-input-number）
   * @param {string} domKey - label[for]值
   * @param {number} value
   */
  _fillInputNumber(domKey, value) {
    const label = document.querySelector(`label[for="${domKey}"]`);
    if (!label) throw new Error(`找不到label: ${domKey}`);

    const formItem = label.closest('.ant-form-item');
    const input = formItem ? formItem.querySelector('.ant-input-number-input') : null;
    if (!input) throw new Error(`找不到数字输入框: ${domKey}`);

    // 优先使用 AntD1Filler
    if (window.AntD1Filler && window.AntD1Filler.fillInputNumber(input, value)) {
      return;
    }

    // 其次使用 ReactFiller
    if (window.ReactFiller && window.ReactFiller.fillInputNumber(input, value)) {
      return;
    }

    // 回退到原生方法
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeSetter.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  },

  /**
   * 填写成组数字输入框（如"X天X晚"、"X到X人"）
   * @param {string} domKey - label[for]值
   * @param {object} value - { values: number[], separators: string[] }
   */
  async _fillInputNumberGroup(domKey, value) {
    const label = document.querySelector(`label[for="${domKey}"]`);
    if (!label) throw new Error(`找不到label: ${domKey}`);

    const formItem = label.closest('.ant-form-item');
    const inputs = formItem ? formItem.querySelectorAll('.ant-input-number-input') : [];
    if (inputs.length === 0) throw new Error(`找不到数字输入框组: ${domKey}`);

    const values = value.values || [];
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;

    for (let i = 0; i < inputs.length; i++) {
      const val = i < values.length ? values[i] : '';
      if (val === null || val === undefined) continue;

      nativeSetter.call(inputs[i], String(val));
      inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[i].dispatchEvent(new Event('change', { bubbles: true }));
      await this._delay(50);
    }
  },

  /**
   * 填写成组搜索下拉框（如集合城市+目的地城市）
   * @param {string} domKey - label[for]值
   * @param {object} value - { items: [{ domKey, text, ... }] }
   */
  async _fillSearchSelectGroup(domKey, value) {
    const items = value.items || [];
    for (const item of items) {
      if (item.domKey && item.text) {
        await this._fillSearchSelect(item.domKey, item);
        await this._delay(200);
      }
    }
  },

  /**
   * 填写混合控件组（如提前预订=select+inputNumber+select）
   * 按parts顺序找到DOM中对应控件并填写
   * @param {string} domKey - label[for]值
   * @param {object} value - { parts: [{type, value|text, ...}] }
   */
  async _fillMixedGroup(domKey, value) {
    const label = document.querySelector(`label[for="${domKey}"]`);
    if (!label) throw new Error(`找不到label: ${domKey}`);

    const formItem = label.closest('.ant-form-item');
    if (!formItem) throw new Error(`找不到form-item: ${domKey}`);

    const parts = value.parts || [];
    const nativeInputSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;

    // 收集DOM中所有控件（按出现顺序）
    const domControls = this._collectDomControls(formItem);
    console.log(`[MixedGroup] ${domKey} - DOM控件:`, domControls.map(c => c.type));

    // 将parts中的值控件（非separator）与DOM控件按顺序匹配
    const valueParts = parts.filter(p => p.type !== 'separator');
    console.log(`[MixedGroup] ${domKey} - 数据parts:`, valueParts.map(p => ({ type: p.type, value: p.value })));

    let partIdx = 0;

    for (const ctrl of domControls) {
      if (partIdx >= valueParts.length) break;
      const part = valueParts[partIdx];

      console.log(`[MixedGroup] ${domKey} - 尝试匹配: ctrl=${ctrl.type}, part=${part.type}`);

      if (ctrl.type === 'inputNumber' && part.type === 'inputNumber') {
        console.log(`[MixedGroup] ${domKey} - 填写inputNumber: ${part.value}`);

        // 直接设置值
        ctrl.element.value = String(part.value);
        console.log(`[MixedGroup] ${domKey} - 设置后的值: ${ctrl.element.value}`);

        // 触发 change 事件
        ctrl.element.dispatchEvent(new Event('change', { bubbles: true }));

        console.log(`[MixedGroup] ${domKey} - inputNumber 填写完成`);
        partIdx++;
      } else if (ctrl.type === 'timePicker' && part.type === 'timePicker') {
        console.log(`[MixedGroup] ${domKey} - 填写timePicker: ${part.value}`);

        // 通过点击时间面板来填写
        await this._fillTimePickerByPanel(ctrl.element, part.value);

        console.log(`[MixedGroup] ${domKey} - timePicker 填写完成, 最终值: ${ctrl.element.value}`);
        partIdx++;
      } else if (ctrl.type === 'select' && (part.type === 'select')) {
        console.log(`[MixedGroup] ${domKey} - 填写select: ${part.text}`);
        await this._fillPlainSelectByElement(ctrl.element, part.text);
        partIdx++;
      } else if (ctrl.type === 'searchSelect' && part.type === 'searchSelect') {
        console.log(`[MixedGroup] ${domKey} - 填写searchSelect: ${part.text}`);
        if (part.domKey) {
          await this._fillSearchSelect(part.domKey, part);
        } else {
          await this._fillPlainSelectByElement(ctrl.element, part.text);
        }
        partIdx++;
      }
      // 注意：不匹配时不增加 partIdx，继续尝试下一个DOM控件

      await this._delay(200);  // 增加控件之间的延迟
    }

    console.log(`[MixedGroup] ${domKey} - 填写完成，处理了 ${partIdx}/${valueParts.length} 个值`);
  },

  /**
   * 通过点击时间面板来填写时间选择器
   * @param {HTMLInputElement} input - 时间选择器输入框
   * @param {string} value - 时间值，格式 HH:mm
   */
  async _fillTimePickerByPanel(input, value) {
    // 解析时间
    const [hour, minute] = value.split(':');
    if (!hour || !minute) {
      throw new Error(`时间格式错误: ${value}`);
    }

    console.log(`[TimePicker] 目标时间: ${hour}:${minute}`);

    // 找到时间选择器容器
    const timePickerWrapper = input.closest('.ant-time-picker');
    if (!timePickerWrapper) {
      throw new Error('找不到时间选择器容器');
    }

    // 找到图标并点击打开面板
    const icon = timePickerWrapper.querySelector('.ant-time-picker-icon');
    if (!icon) {
      throw new Error('找不到时间选择器图标');
    }

    console.log('[TimePicker] 点击图标打开面板');
    icon.click();
    await this._delay(500);

    // 查找时间面板
    const panel = document.querySelector('.ant-time-picker-panel:not(.ant-time-picker-panel-hidden)');
    if (!panel) {
      throw new Error('时间面板未打开');
    }

    console.log('[TimePicker] 面板已打开');

    // 查找小时和分钟选项
    const selects = panel.querySelectorAll('.ant-time-picker-panel-select');
    if (selects.length < 2) {
      throw new Error('找不到小时/分钟选择列表');
    }

    const hourSelect = selects[0];
    const minuteSelect = selects[1];

    // 查找目标小时选项
    const hourOptions = Array.from(hourSelect.querySelectorAll('li'));
    const hourOption = hourOptions.find(li => li.textContent.trim() === hour || li.textContent.trim() === String(parseInt(hour)));

    if (!hourOption) {
      console.error('[TimePicker] 可用小时:', hourOptions.map(li => li.textContent.trim()));
      throw new Error(`找不到小时选项: ${hour}`);
    }

    console.log(`[TimePicker] 点击小时: ${hour}`);
    hourOption.click();
    await this._delay(200);

    // 查找目标分钟选项
    const minuteOptions = Array.from(minuteSelect.querySelectorAll('li'));
    const minuteOption = minuteOptions.find(li => li.textContent.trim() === minute || li.textContent.trim() === String(parseInt(minute)));

    if (!minuteOption) {
      console.error('[TimePicker] 可用分钟:', minuteOptions.map(li => li.textContent.trim()));
      throw new Error(`找不到分钟选项: ${minute}`);
    }

    console.log(`[TimePicker] 点击分钟: ${minute}`);
    minuteOption.click();
    await this._delay(300);

    // 关闭面板（点击输入框外部或按ESC）
    document.body.click();
    await this._delay(200);

    console.log(`[TimePicker] 填写完成`);
  },

  /**
   * 收集form-item中所有控件（按DOM顺序）
   * @param {HTMLElement} formItem
   * @returns {Array} [{type, element, domKey?}]
   */
  _collectDomControls(formItem) {
    const controls = [];
    const children = formItem.querySelector('.ant-form-item-children') || formItem.querySelector('.ant-form-item-control');

    if (!children) return controls;

    const walk = (container) => {
      for (const node of container.childNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE || !node.classList) continue;

        // 跳过隐藏控件
        if (this._isHidden(node)) continue;

        if (node.classList.contains('ant-input-number')) {
          const input = node.querySelector('.ant-input-number-input');
          if (input) controls.push({ type: 'inputNumber', element: input });
        } else if (node.classList.contains('ant-time-picker')) {
          const input = node.querySelector('.ant-time-picker-input');
          if (input) controls.push({ type: 'timePicker', element: input });
        } else if (node.classList.contains('ant-select')) {
          // 跳过带有 nodisplay 类的 select（可能是隐藏的时区选择器）
          if (node.classList.contains('nodisplay')) {
            console.log('[CollectControls] 跳过隐藏的 select');
            continue;
          }

          const searchInput = node.querySelector('input.ant-select-search__field[id]');
          if (searchInput) {
            controls.push({ type: 'searchSelect', element: node, domKey: searchInput.id });
          } else {
            controls.push({ type: 'select', element: node });
          }
        } else if (node.childNodes.length > 0) {
          walk(node);
        }
      }
    };

    walk(children);
    return controls;
  },

  /**
   * 通过元素引用填写普通下拉框
   * @param {HTMLElement} selectEl - .ant-select元素
   * @param {string} text - 目标文本
   */
  async _fillPlainSelectByElement(selectEl, text) {
    if (!text) return;

    console.log(`[PlainSelect] 填写下拉框: ${text}`);

    // 优先使用 AntD1Filler
    if (window.AntD1Filler) {
      const success = await window.AntD1Filler.fillSelect(selectEl, text);
      if (success) {
        console.log(`[PlainSelect] AntD1填写成功`);
        return;
      }
    }

    // 其次使用 ReactFiller
    if (window.ReactFiller) {
      const success = await window.ReactFiller.fillSelect(selectEl, text);
      if (success) {
        console.log(`[PlainSelect] React填写成功`);
        return;
      }
    }

    // 回退到原生方法
    const selection = selectEl.querySelector('.ant-select-selection');
    if (selection) selection.click();
    await this._delay(500);

    const dropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    if (!dropdown) throw new Error('下拉菜单未展开');

    const options = dropdown.querySelectorAll('.ant-select-dropdown-menu-item');
    console.log(`[PlainSelect] 找到 ${options.length} 个选项`);

    const targetText = this._normalizeText(text);

    // 1. 优先精确匹配
    let match = Array.from(options).find(opt => {
      const optText = this._normalizeText(opt.textContent);
      return optText === targetText;
    });

    if (match) {
      console.log(`[PlainSelect] 精确匹配: ${match.textContent.trim()}`);
    } else {
      // 2. 模糊匹配
      match = Array.from(options).find(opt => {
        const optText = this._normalizeText(opt.textContent);
        return optText.includes(targetText) || targetText.includes(optText);
      });
      if (match) {
        console.log(`[PlainSelect] 模糊匹配: ${match.textContent.trim()}`);
      }
    }

    if (match) {
      match.click();
      await this._delay(200);
      console.log(`[PlainSelect] 点击完成`);
    } else {
      // 关闭下拉框
      selection.click();
      console.error(`[PlainSelect] 未找到匹配项: ${text}`);
      console.error(`[PlainSelect] 可选项:`, Array.from(options).map(o => o.textContent.trim()));
      throw new Error(`未找到匹配项: ${text}`);
    }
  },

  /**
   * 填写成组普通下拉框（如儿童年龄=select(最小)+select(最大)）
   * @param {string} domKey - label[for]值
   * @param {object} value - { values: string[], separators: string[] }
   */
  async _fillSelectGroup(domKey, value) {
    const label = document.querySelector(`label[for="${domKey}"]`);
    if (!label) throw new Error(`找不到label: ${domKey}`);

    const formItem = label.closest('.ant-form-item');
    if (!formItem) throw new Error(`找不到form-item: ${domKey}`);

    // 只选择可见的普通下拉框（非搜索下拉框）
    const plainSelects = Array.from(formItem.querySelectorAll('.ant-select')).filter(sel => {
      if (this._isHidden(sel)) return false;
      return !sel.querySelector('input.ant-select-search__field[id]');
    });

    const values = value.values || [];

    for (let i = 0; i < plainSelects.length && i < values.length; i++) {
      await this._fillPlainSelectByElement(plainSelects[i], values[i]);
      await this._delay(200);
    }
  },

  /**
   * 填写文本域
   * @param {string} domKey
   * @param {string} value
   */
  _fillTextarea(domKey, value) {
    let textarea = document.querySelector(`textarea#${CSS.escape(domKey)}`);
    if (!textarea) {
      const label = document.querySelector(`label[for="${domKey}"]`);
      if (label) {
        const formItem = label.closest('.ant-form-item');
        if (formItem) textarea = formItem.querySelector('textarea');
      }
    }
    if (!textarea) throw new Error(`找不到文本域: ${domKey}`);

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    ).set;
    nativeSetter.call(textarea, String(value));
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  },

  /**
   * 填写普通下拉框
   * @param {string} domKey
   * @param {object} value - { text: string }
   */
  async _fillSelect(domKey, value) {
    const label = document.querySelector(`label[for="${domKey}"]`);
    if (!label) throw new Error(`找不到label: ${domKey}`);

    const formItem = label.closest('.ant-form-item');
    const selectEl = formItem ? formItem.querySelector('.ant-select') : null;
    if (!selectEl) throw new Error(`找不到下拉框: ${domKey}`);

    // 点击展开
    selectEl.querySelector('.ant-select-selection').click();
    await this._delay(300);

    // 查找匹配项并点击
    const text = typeof value === 'object' ? value.text : String(value);
    const dropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    if (!dropdown) throw new Error('下拉菜单未展开');

    const options = dropdown.querySelectorAll('.ant-select-dropdown-menu-item');
    const match = Array.from(options).find(opt => opt.textContent.trim() === text);
    if (!match) throw new Error(`未找到匹配项: ${text}`);

    match.click();
  },

  /**
   * 填写搜索下拉框
   * @param {string} domKey
   * @param {object} value - { text: string }
   */
  async _fillSearchSelect(domKey, value) {
    const text = typeof value === 'object' ? value.text : String(value);
    const searchInput = document.querySelector(`input#${CSS.escape(domKey)}`);
    if (!searchInput) throw new Error(`找不到搜索输入框: ${domKey}`);

    console.log(`[SearchSelect] 填写搜索框: ${text}`);

    // 优先使用 AntD1Filler
    if (window.AntD1Filler) {
      const success = await window.AntD1Filler.fillSearchSelect(searchInput, text);
      if (success) {
        console.log(`[SearchSelect] AntD1填写成功`);
        return;
      }
    }

    // 其次使用 ReactFiller
    if (window.ReactFiller) {
      const success = await window.ReactFiller.fillSearchSelect(searchInput, text);
      if (success) {
        console.log(`[SearchSelect] React填写成功`);
        return;
      }
    }

    // 回退到原生方法
    const selectEl = searchInput.closest('.ant-select');
    if (!selectEl) throw new Error(`找不到搜索下拉框: ${domKey}`);

    const clearBtn = selectEl.querySelector('.ant-select-selection__clear');
    if (clearBtn) {
      clearBtn.click();
      await this._delay(200);
    }

    selectEl.querySelector('.ant-select-selection').click();
    await this._delay(200);

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeSetter.call(searchInput, text);
    this._dispatchInputEvents(searchInput);

    const result = await this._waitForSearchResult(text, 5000);
    if (!result) {
      this.results[this.results.length - 1] = {
        ...this.results[this.results.length - 1],
        status: 'skipped',
        reason: `搜索无匹配项: ${text}`
      };
      return;
    }

    this._clickOption(result);
    await this._delay(300);

    if (!this._isSearchSelectSelected(selectEl, text)) {
      throw new Error(`搜索选项未成功选中: ${text}`);
    }
  },

  /**
   * 填写多选搜索下拉框
   * @param {string} domKey
   * @param {object} value - { text: string[] } 多个选项的文本数组
   */
  async _fillMultiSearchSelect(domKey, value) {
    const texts = Array.isArray(value.text) ? value.text : [String(value.text || '')];
    const searchInput = document.querySelector(`input#${CSS.escape(domKey)}`);
    if (!searchInput) throw new Error(`找不到多选搜索输入框: ${domKey}`);

    const selectEl = searchInput.closest('.ant-select');
    if (!selectEl) throw new Error(`找不到多选搜索下拉框: ${domKey}`);

    // 先清除所有已选项
    const clearBtn = selectEl.querySelector('.ant-select-selection__clear');
    if (clearBtn) {
      clearBtn.click();
      await this._delay(200);
    }

    // 逐个搜索并选择
    for (const text of texts) {
      if (!text) continue;

      // 聚焦并输入搜索文本
      selectEl.querySelector('.ant-select-selection').click();
      await this._delay(200);

      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      nativeSetter.call(searchInput, text);
      this._dispatchInputEvents(searchInput);

      // 等待搜索结果
      const result = await this._waitForSearchResult(text, 5000);
      if (result) {
        this._clickOption(result);
        await this._delay(300);
      }
    }
  },

  /**
   * 等待搜索结果出现
   * @param {string} text
   * @param {number} timeout
   * @returns {Promise<HTMLElement|null>}
   */
  async _waitForSearchResult(text, timeout = 5000) {
    const startTime = Date.now();
    const targetText = this._normalizeText(text);

    while (Date.now() - startTime < timeout) {
      await this._delay(200);
      const options = this._getVisibleSelectOptions();
      if (options.length === 0) continue;

      // 策略：只要选项包含搜索文本，就选择它（更宽松的匹配）
      const match = options.find(opt => {
        const optionText = this._normalizeText(opt.textContent);
        return optionText.includes(targetText);
      });

      if (match) return match;
    }
    return null;
  },

  /**
   * 获取当前可见且可点击的下拉选项
   * @returns {HTMLElement[]}
   */
  _getVisibleSelectOptions() {
    const dropdowns = Array.from(document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)'));
    return dropdowns.flatMap(dropdown => {
      if (dropdown.getClientRects().length === 0) return [];
      return Array.from(dropdown.querySelectorAll('.ant-select-dropdown-menu-item'))
        .filter(opt => opt.getClientRects().length > 0)
        .filter(opt => !opt.classList.contains('ant-select-dropdown-menu-item-disabled'));
    });
  },

  /**
   * 触发React/AntD更稳定识别的输入事件序列
   * @param {HTMLInputElement} input
   */
  _dispatchInputEvents(input) {
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  },

  /**
   * 使用完整鼠标事件序列点击下拉选项
   * @param {HTMLElement} option
   */
  _clickOption(option) {
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    option.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    option.click();
  },

  /**
   * 判断搜索下拉框是否已经选中目标文本
   * @param {HTMLElement} selectEl
   * @param {string} text
   * @returns {boolean}
   */
  _isSearchSelectSelected(selectEl, text) {
    const targetText = this._normalizeText(text);
    const selectedText = this._normalizeText(
      selectEl.querySelector('.ant-select-selection-selected-value')?.textContent ||
      selectEl.querySelector('.ant-select-selection__choice__content')?.textContent ||
      ''
    );
    if (!selectedText) return false;
    return selectedText === targetText || selectedText.includes(targetText) || targetText.includes(selectedText);
  },

  /**
   * 文本标准化，去除多余空白
   * @param {string} text
   * @returns {string}
   */
  _normalizeText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  },

  /**
   * 填写复选框
   * @param {string} domKey
   * @param {boolean} value
   */
  _fillCheckbox(domKey, value) {
    const label = document.querySelector(`label[for="${domKey}"]`);
    if (!label) throw new Error(`找不到label: ${domKey}`);

    const formItem = label.closest('.ant-form-item');
    const checkbox = formItem ? formItem.querySelector('input[type="checkbox"]') : null;
    if (!checkbox) throw new Error(`找不到复选框: ${domKey}`);

    if (checkbox.checked !== value) {
      checkbox.click();
    }
  },

  /**
   * 填写单选框
   * @param {string} domKey
   * @param {string|number|boolean} value
   */
  _fillRadio(domKey, value) {
    const label = document.querySelector(`label[for="${domKey}"]`);
    if (!label) throw new Error(`找不到label: ${domKey}`);

    const formItem = label.closest('.ant-form-item');
    const radios = formItem ? formItem.querySelectorAll('input[type="radio"]') : [];
    if (radios.length === 0) throw new Error(`找不到单选框: ${domKey}`);

    const targetValue = typeof value === 'object' && value !== null ? String(value.value ?? value.text ?? '') : String(value);
    const target = Array.from(radios).find(radio => {
      const radioText = radio.closest('label')?.textContent.trim() || '';
      return String(radio.value) === targetValue || radioText === targetValue || radioText.includes(targetValue);
    });

    if (!target) throw new Error(`未找到匹配单选项: ${targetValue}`);
    if (!target.checked) target.click();
  },

  /**
   * 回读验证：填写后自动提取表单值与预期对比
   * @param {object} expectedData - 预期字段数据
   * @returns {object} 匹配报告
   */
  verify(expectedData) {
    const actualData = FormExtractor.extract();
    const report = { matched: [], mismatched: [], skipped: [] };
    const expectedFields = expectedData && expectedData.data ? expectedData.data : expectedData;

    const flatExpected = this._flattenFields(expectedFields);
    for (const field of flatExpected) {
      const actual = this._findActualValue(actualData, field.domKey);
      if (actual === undefined) {
        report.skipped.push({ field: field.label, domKey: field.domKey, reason: '字段未找到' });
      } else if (this._valuesMatch(actual, field.value)) {
        report.matched.push(field.domKey);
      } else {
        report.mismatched.push({
          field: field.label,
          domKey: field.domKey,
          expected: field.value,
          actual: actual,
          expectedDisplay: this._formatValueForDisplay(field.value),
          actualDisplay: this._formatValueForDisplay(actual)
        });
      }
    }

    return report;
  },

  /**
   * 在提取数据中查找对应字段的实际值
   */
  _findActualValue(extractedData, domKey) {
    for (const group of Object.values(extractedData.data)) {
      for (const field of Object.values(group)) {
        if (field && typeof field === 'object' && field.domKey === domKey) {
          return field.value;
        }
      }
    }
    return undefined;
  },

  /**
   * 将字段值格式化为可读文本
   * @param {*} value
   * @returns {string}
   */
  _formatValueForDisplay(value) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map(v => this._formatValueForDisplay(v)).join(', ');
    if (typeof value !== 'object') return String(value);

    if (value.text !== undefined) {
      return Array.isArray(value.text) ? value.text.join(', ') : String(value.text);
    }
    if (value.values && value.separators) {
      // 使用 separators 拼接 values
      const vals = value.values;
      const seps = value.separators;
      let display = '';
      vals.forEach((v, i) => {
        display += (v !== null && v !== undefined ? v : '');
        if (i < seps.length) display += seps[i];
      });
      return display;
    }
    if (value.values) return value.values.join(' - ');
    if (value.items) return value.items.map(item => this._formatValueForDisplay(item)).join(', ');
    if (value.parts) {
      return value.parts.map(part => {
        if (part.type === 'separator') return part.text || '';
        if (part.type === 'inputNumber') return part.value ?? '';
        if (part.type === 'timePicker') return part.value ?? '';
        if (part.type === 'select' || part.type === 'searchSelect') return part.text || '';
        return this._formatValueForDisplay(part.value ?? part.text ?? '');
      }).join(' ').replace(/\s+/g, ' ').trim();
    }
    if (value.title) return String(value.title);
    return JSON.stringify(value);
  },

  /**
   * 比较两个值是否匹配
   */
  _valuesMatch(actual, expected) {
    if (actual === expected) return true;

    const actualDisplay = this._formatValueForDisplay(actual);
    const expectedDisplay = this._formatValueForDisplay(expected);
    if (actualDisplay === expectedDisplay) return true;

    const normalize = value => String(value).replace(/\s+/g, '').trim();
    return normalize(actualDisplay) === normalize(expectedDisplay);
  },

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * 判断元素是否隐藏
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  _isHidden(element) {
    // 检查 nodisplay 类
    if (element.classList && element.classList.contains('nodisplay')) return true;

    // 检查 display: none 样式
    const style = window.getComputedStyle(element);
    if (style.display === 'none') return true;

    // 检查 visibility: hidden
    if (style.visibility === 'hidden') return true;

    return false;
  }
};
