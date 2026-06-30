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
   * @param {function} onProgress - 进度回调函数 (current, total, lastResult)
   * @returns {Promise<object>} 填写结果汇总
   */
  async fillAll(data, onProgress) {
    this.results = [];
    const flatFields = this._flattenFields(data);
    const total = flatFields.length;

    for (let i = 0; i < flatFields.length; i++) {
      const field = flatFields[i];
      await this._fillField(field);

      // 调用进度回调
      if (onProgress) {
        onProgress(i + 1, total, this.results[this.results.length - 1]);
      }

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
   * 填写单个字段（v0.3.0：使用智能匹配引擎；阶段2：Registry 增量通道）
   * @param {object} field
   */
  async _fillField(field) {
    const { fieldType, value } = field;

    // 【新 · 阶段2】Registry 增量通道：已注册类型走 handler.fill，老 switch 冻结（§5.2）
    // 老的 15 种类型未注册 → resolve 返回 null → 落到下面老路径，行为零变化
    const handler = window.FieldTypeRegistry && FieldTypeRegistry.resolve(fieldType);
    if (handler) {
      try {
        await handler.fill(field, this._buildContext());
        this.results.push({ field: field.label, status: 'success', strategy: 'registry' });
      } catch (err) {
        this.results.push({ field: field.label, status: 'failed', reason: err.message });
      }
      return;
    }

    // 【老 · 冻结】以下 switch / if 分支不再新增类型，新类型一律走 Registry

    // 复合字段：推荐理由（需特殊处理子字段匹配）
    if (fieldType === 'recommendReason') {
      try {
        await this._fillRecommendReason(field);
        this.results.push({ field: field.label, status: 'success' });
      } catch (err) {
        this.results.push({ field: field.label, status: 'failed', reason: err.message });
      }
      return;
    }

    // 富文本编辑器：特殊处理
    if (fieldType === 'richText') {
      try {
        const domKey = field.domKey || 'ueditor_0';
        this._fillRichText(domKey, value);
        this.results.push({ field: field.label, status: 'success' });
      } catch (err) {
        this.results.push({ field: field.label, status: 'failed', reason: err.message });
      }
      return;
    }

    // 自定义展示组件：只读，跳过
    if (fieldType === 'customDisplay') {
      this.results.push({ field: field.label, status: 'skipped', reason: '自定义展示组件，需手动处理' });
      return;
    }

    // 原产品信息页的复合字段：保持旧版“行级定位”语义，不先匹配到单个 DOM 元素。
    // 这些字段的 domKey 是 label[for] / form-item 锚点，代表一整行多个控件。
    const rowLevelTypes = ['inputNumberGroup', 'mixedGroup', 'selectGroup', 'searchSelectGroup'];
    if (rowLevelTypes.includes(fieldType)) {
      try {
        const domKey = field.domKey;
        if (!domKey) {
          this.results.push({ field: field.label, status: 'skipped', reason: '复合字段无domKey' });
          return;
        }

        switch (fieldType) {
          case 'inputNumberGroup':
            await this._fillInputNumberGroup(domKey, value);
            break;
          case 'mixedGroup':
            await this._fillMixedGroup(domKey, value);
            break;
          case 'selectGroup':
            await this._fillSelectGroup(domKey, value);
            break;
          case 'searchSelectGroup':
            await this._fillSearchSelectGroup(domKey, value);
            break;
        }

        this.results.push({ field: field.label, domKey, status: 'success', strategy: 'rowLevelLegacy' });
      } catch (err) {
        this.results.push({ field: field.label, domKey: field.domKey, status: 'failed', reason: err.message });
      }
      return;
    }

    // 单控件字段：使用智能匹配引擎
    try {
      const match = await this._smartMatchField(field);

      if (!match.element) {
        if (match.needsUserConfirmation) {
          this.results.push({ field: field.label, status: 'skipped', reason: '用户跳过' });
        } else {
          this.results.push({ field: field.label, status: 'failed', reason: '未找到匹配元素' });
        }
        return;
      }

      // 获取匹配到的元素 ID
      const matchedDomKey = match.element.id || field.domKey;
      if (!matchedDomKey) {
        this.results.push({ field: field.label, status: 'skipped', reason: '匹配元素无ID' });
        return;
      }

      // 根据字段类型执行填充
      switch (fieldType) {
        case 'input':
          this._fillInput(matchedDomKey, value);
          break;
        case 'textarea':
          this._fillTextarea(matchedDomKey, value);
          break;
        case 'select':
          await this._fillSelect(matchedDomKey, value);
          break;
        case 'inputNumber':
          this._fillInputNumber(matchedDomKey, value);
          break;
        case 'inputNumberGroup':
          await this._fillInputNumberGroup(matchedDomKey, value);
          break;
        case 'mixedGroup':
          await this._fillMixedGroup(matchedDomKey, value);
          break;
        case 'selectGroup':
          await this._fillSelectGroup(matchedDomKey, value);
          break;
        case 'searchSelect':
          await this._fillSearchSelect(matchedDomKey, value);
          break;
        case 'searchSelectGroup':
          await this._fillSearchSelectGroup(matchedDomKey, value);
          break;
        case 'multiSearchSelect':
          await this._fillMultiSearchSelect(matchedDomKey, value);
          break;
        case 'checkbox':
          this._fillCheckbox(matchedDomKey, value);
          break;
        case 'radio':
          this._fillRadio(matchedDomKey, value);
          break;
        default:
          this.results.push({ field: field.label, status: 'skipped', reason: `不支持的字段类型: ${fieldType}` });
          return;
      }

      this.results.push({
        field: field.label,
        status: 'success',
        strategy: match.strategy,
        confidence: match.confidence
      });

    } catch (err) {
      this.results.push({ field: field.label, status: 'failed', reason: err.message });
    }
  },

  /**
   * 使用智能匹配引擎查找字段元素
   * 优先使用 FieldMatcher（v0.3.0+），不可用时回退到 domKey 查找
   * @param {object} field
   * @returns {Promise<object>} {element, strategy, confidence, needsUserConfirmation}
   */
  async _smartMatchField(field) {
    // 优先使用 FieldMatcher（v0.3.0 智能匹配）
    if (window.FieldMatcher && field.matchData) {
      console.log('[FormFiller] 智能匹配:', field.label);
      return await window.FieldMatcher.smartMatch(field, true);
    }

    // 回退到传统 domKey 查找（兼容旧版导出数据）
    if (field.domKey) {
      const element = document.getElementById(field.domKey);
      if (element) {
        console.log('[FormFiller] 传统匹配:', field.domKey);
        return {
          element,
          strategy: 'legacy',
          confidence: 95,
          needsUserConfirmation: false
        };
      }
    }

    return {
      element: null,
      strategy: null,
      confidence: 0,
      needsUserConfirmation: false
    };
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

    // 回退到原生方法：兼容 AntD 1.x (.ant-select-selection) 与新版 (.ant-select-selector)
    const selection = selectEl.querySelector('.ant-select-selection, .ant-select-selector');
    if (!selection) throw new Error('找不到下拉框触发区域');

    selection.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    selection.click();
    await this._delay(500);

    const dropdown = Array.from(document.querySelectorAll('.ant-select-dropdown'))
      .find(el => !el.classList.contains('ant-select-dropdown-hidden') && el.offsetParent !== null);
    if (!dropdown) throw new Error('下拉菜单未展开');

    const options = dropdown.querySelectorAll([
      '.ant-select-dropdown-menu-item:not(.ant-select-dropdown-menu-item-disabled)',
      '.ant-select-item-option:not(.ant-select-item-option-disabled)'
    ].join(','));
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
      match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await this._delay(50);
      match.click();
      await this._delay(300);
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
    const text = typeof value === 'object' ? value.text : String(value);

    // 优先通过 domKey 找到 select 内部 input，再定位最近的 .ant-select。
    // productImageText 推荐理由的 label 没有 for 属性，只能走这条路径。
    const input = document.querySelector(`input#${CSS.escape(domKey)}`);
    let selectEl = input ? input.closest('.ant-select') : null;

    // 兼容原有 baseInfoMerge：通过 label[for] 找同一 form-item 的 select。
    if (!selectEl) {
      const label = document.querySelector(`label[for="${domKey}"]`);
      const formItem = label ? label.closest('.ant-form-item') : null;
      selectEl = formItem ? formItem.querySelector('.ant-select') : null;
    }

    if (!selectEl) throw new Error(`找不到下拉框: ${domKey}`);
    await this._fillPlainSelectByElement(selectEl, text);
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
      const actual = this._findActualValue(actualData, field.domKey, field);
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
  _findActualValue(extractedData, domKey, expectedField) {
    for (const group of Object.values(extractedData.data)) {
      for (const field of Object.values(group)) {
        if (field && typeof field === 'object' && field.domKey === domKey) {
          return field.value;
        }
      }
    }

    if (expectedField?.fieldType !== 'itineraryField') {
      return undefined;
    }

    const meta = expectedField?.meta;
    const label = expectedField?.label || expectedField?.fieldLabel || '';
    if (!meta || !label || !window.tourdaysAdapter || typeof window.tourdaysAdapter.findValueByMeta !== 'function') {
      return undefined;
    }

    const fallback = window.tourdaysAdapter.findValueByMeta(meta, label);
    return fallback === undefined ? undefined : fallback;
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
    if (normalize(actualDisplay) === normalize(expectedDisplay)) return true;

    const normalizeZh = value => normalize(value)
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
      .replace(/[費费]/g, '费')
      .replace(/[亞亚]/g, '亚');
    return normalizeZh(actualDisplay) === normalizeZh(expectedDisplay);
  },

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * 构建 FillContext 注入给 Registry 注册的 handler（§5.1 Issue 6）
   * handler.fill 通过 ctx 复用现有能力，不重写匹配/填充逻辑。
   * @returns {object}
   */
  _buildContext() {
    return {
      FieldMatcher: window.FieldMatcher,
      AntD1Filler: window.AntD1Filler,
      ReactFiller: window.ReactFiller,
      delay: (ms) => this._delay(ms),
      smartMatchField: (field) => this._smartMatchField(field),
      results: this.results
    };
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
  },

  /**
   * 填写推荐理由（productImageText 页面）
   * @param {object} field - 包含 category 和 description 的字段对象
   */
  async _fillRecommendReason(field) {
    console.log('[FormFiller] 填写推荐理由:', field);

    const { category, description, matchData } = field;

    // 填充分类下拉框（使用智能匹配）；text 为空表示该子项被忽略，跳过
    if (category && category.text) {
      try {
        const categoryMatch = await this._smartMatchSubField(category, matchData, 'category');
        if (categoryMatch) {
          const selectEl = categoryMatch.classList?.contains('ant-select')
            ? categoryMatch
            : categoryMatch.closest?.('.ant-select');
          if (selectEl) {
            await this._fillPlainSelectByElement(selectEl, category.text);
          } else if (categoryMatch.id) {
            await this._fillSelect(categoryMatch.id, { text: category.text });
          } else {
            throw new Error('分类匹配元素不是下拉框且没有ID');
          }
          console.log('[FormFiller] 分类填写成功:', category.text);
        } else {
          console.warn('[FormFiller] 分类字段匹配失败，跳过');
        }
      } catch (e) {
        console.error('[FormFiller] 分类填写失败:', e);
      }
    }

    // 填充描述文本域（使用智能匹配）
    if (description && description.value) {
      try {
        const descMatch = await this._smartMatchSubField(description, matchData, 'description');
        if (descMatch) {
          this._fillTextarea(descMatch.id, description.value);
          console.log('[FormFiller] 描述填写成功');
        } else {
          console.warn('[FormFiller] 描述字段匹配失败，跳过');
        }
      } catch (e) {
        console.error('[FormFiller] 描述填写失败:', e);
      }
    }
  },

  /**
   * 为复合字段的子字段进行智能匹配
   * @param {object} subField - 子字段数据
   * @param {object} parentMatchData - 父字段的 matchData
   * @param {string} role - 'category' | 'description'
   * @returns {Promise<HTMLElement|null>} 匹配到的元素
   */
  async _smartMatchSubField(subField, parentMatchData, role) {
    // 构建子字段的 matchData
    const subMatchData = parentMatchData ? {
      exact: { domKey: parentMatchData.exact?.[role + 'DomKey'] },
      pattern: parentMatchData.pattern?.[role],
      semantic: {
        container: parentMatchData.semantic?.container,
        label: parentMatchData.semantic?.label,
        index: parentMatchData.semantic?.index,
        relativeSelector: role === 'category'
          ? parentMatchData.semantic?.categorySelector
          : parentMatchData.semantic?.descriptionSelector
      }
    } : null;

    const fieldData = {
      ...subField,
      matchData: subMatchData
    };

    // 使用智能匹配
    const match = await this._smartMatchField(fieldData);

    return match.element || null;
  },

  /**
   * 规范化富文本中所有 <img> 的 imageid 属性，统一固定为 41973044。
   * 实现已抽出到 services/sanitizers.js 的 Sanitizers.normalizeImageId（阶段3）。
   * 本方法保留为转发，维持原有方法签名向后兼容。
   * @param {string} html
   * @returns {string}
   */
  _normalizeRichTextImageId(html) {
    return window.Sanitizers ? Sanitizers.normalizeImageId(html) : (html || '');
  },

  /**
   * 填写富文本编辑器（UEditor）
   *
   * 关键问题：content script 运行在隔离世界，window.UE 不是页面的 UE 实例；
   * 直接写 iframe body 的 innerHTML 只更新显示，不更新 UEditor 数据模型，
   * 保存时页面调用 editor.getContent() / 同步 textarea 读到的仍是空内容。
   *
   * 正确做法：注入脚本到页面主世界，调用真正的 UE 实例 setContent() + sync()，
   * 让 UEditor 数据模型和隐藏同步 textarea 一并更新，保存才能写入数据库。
   *
   * @param {string} domKey - iframe 的 id（如 ueditor_0）
   * @param {string} htmlContent - HTML 内容
   */
  _fillRichText(domKey, htmlContent) {
    console.log('[FormFiller] 填写富文本:', domKey, '内容长度:', htmlContent ? htmlContent.length : 0);

    // 规范化富文本中的图片 imageid：统一固定为 41973044 再写入页面
    const finalHtml = this._normalizeRichTextImageId(htmlContent || '');

    // 1. 注入主世界脚本，调用页面真正的 UEditor 实例 API
    const injected = this._fillRichTextViaPageUE(domKey, finalHtml);
    if (injected) {
      console.log('[FormFiller] 已注入主世界脚本调用 UEditor API');
    }

    // 2. 同时写 iframe DOM 作为显示兜底（不影响数据模型，仅保证可见）
    const editorIframe = document.querySelector(`#${CSS.escape(domKey)}`);
    if (!editorIframe) {
      console.error('[FormFiller] 未找到富文本编辑器 iframe:', domKey);
      if (!injected) throw new Error(`未找到富文本编辑器: ${domKey}`);
      return;
    }

    try {
      const iframeDoc = editorIframe.contentDocument || editorIframe.contentWindow.document;
      const bodyContent = iframeDoc.body;
      if (bodyContent) {
        bodyContent.innerHTML = finalHtml;
        bodyContent.dispatchEvent(new Event('input', { bubbles: true }));
        bodyContent.dispatchEvent(new Event('blur', { bubbles: true }));
        console.log('[FormFiller] 富文本 iframe 显示同步完成');
      }
    } catch (e) {
      // iframe 跨域或访问失败时不阻塞，主世界注入是主路径
      console.warn('[FormFiller] iframe 显示同步失败（不影响保存）:', e.message);
    }
  },

  /**
   * 通过注入主世界脚本调用页面的 UEditor 实例 API。
   * 解决 content script 隔离世界无法访问页面 window.UE 的问题。
   *
   * 实现：注入 web_accessible_resources 中的 page-ue-bridge.js 到主世界，
   * 通过 payload 节点传递 { iframeId, html }，由桥接脚本调用
   * editor.setContent() + editor.sync()，更新数据模型和隐藏同步 textarea。
   *
   * @param {string} domKey - iframe id
   * @param {string} html - HTML 内容
   * @returns {boolean} 是否成功注入脚本
   */
  _fillRichTextViaPageUE(domKey, html) {
    try {
      if (!chrome?.runtime?.getURL) {
        console.warn('[FormFiller] 无法获取扩展资源 URL，跳过主世界注入');
        return false;
      }

      // 用 data 节点传递内容，避免把含大量引号的 HTML 拼进脚本字符串
      const payloadId = `vtrip-ue-payload-${Date.now()}`;
      const payload = document.createElement('script');
      payload.type = 'application/json';
      payload.id = payloadId;
      payload.textContent = JSON.stringify({ iframeId: domKey, html });
      (document.head || document.documentElement).appendChild(payload);

      // 注入外部脚本到主世界（不受页面 inline CSP 限制）
      const bridge = document.createElement('script');
      bridge.src = chrome.runtime.getURL('content/page-ue-bridge.js');
      bridge.setAttribute('data-payload-id', payloadId);
      bridge.onload = () => {
        bridge.remove();
        payload.remove();
      };
      bridge.onerror = () => {
        console.error('[FormFiller] 桥接脚本加载失败');
        bridge.remove();
        payload.remove();
      };
      (document.head || document.documentElement).appendChild(bridge);
      return true;
    } catch (e) {
      console.error('[FormFiller] 注入 UEditor 脚本失败:', e);
      return false;
    }
  }
};

// 导出到全局，供 tourdays itineraryField handler 等（通过 window.FormFiller）复用
// _fillPlainSelectByElement / _fillSearchSelect 等方法
if (typeof window !== 'undefined') {
  window.FormFiller = FormFiller;
}
