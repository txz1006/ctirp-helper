/**
 * 表单数据提取器 - 从Ant Design表单提取结构化数据
 *
 * 提取策略：DOM值为主，React fiber为辅
 * 支持字段类型：input、textarea、普通select、搜索select、级联select、checkbox/radio
 */

const FormExtractor = {
  /**
   * 提取当前页面所有表单数据
   * @returns {object} 层级结构数据
   */
  extract() {
    // 委托 PageRegistry 激活当前 URL 命中的适配器（机制α）
    const adapter = PageRegistry.activate();
    if (adapter && adapter.extract) {
      return adapter.extract();
    }

    // 兜底：使用默认逻辑（baseInfoMerge）
    return this._fallbackExtract();
  },

  /**
   * 默认提取兜底（baseInfoMerge 逻辑）
   * 原原 extract 内联实现，抽出命名以便 Registry 未命中时复用。
   * @returns {object}
   */
  _fallbackExtract() {
    const result = {
      version: '1.0',
      source: PageDetector.detect() === 'domestic' ? 'domestic' : 'international',
      tab: this._detectCurrentTab(),
      timestamp: new Date().toISOString(),
      data: {}
    };

    // 按content-card分组提取
    const cards = document.querySelectorAll('.content-card');
    cards.forEach(card => {
      const titleEl = card.querySelector('.content-cardtitle-text');
      const groupName = titleEl ? titleEl.textContent.trim() : '未命名分组';
      const bodyEl = card.querySelector('.content-cardbody');
      if (!bodyEl) return;

      const groupData = this._extractGroup(bodyEl);
      if (Object.keys(groupData).length > 0) {
        result.data[groupName] = groupData;
      }
    });

    return result;
  },

  /**
   * 提取当前页面字段映射（用于导入匹配预览）
   * 返回每个字段的 label、domKey、fieldType、当前值，按分组组织
   * @returns {object} { groupName: { fieldLabel: { domKey, label, fieldType, currentValue } } }
   */
  extractFieldMap() {
    // 委托 PageRegistry 激活的适配器
    const adapter = PageRegistry.activate();
    if (adapter && adapter.extractFieldMap) {
      return adapter.extractFieldMap();
    }

    // 兜底：使用默认逻辑（baseInfoMerge）
    return this._fallbackExtractFieldMap();
  },

  /**
   * 默认字段映射兜底（baseInfoMerge 逻辑）
   * @returns {object}
   */
  _fallbackExtractFieldMap() {
    const result = {};
    const cards = document.querySelectorAll('.content-card');
    cards.forEach(card => {
      const titleEl = card.querySelector('.content-cardtitle-text');
      const groupName = titleEl ? titleEl.textContent.trim() : '未命名分组';
      const bodyEl = card.querySelector('.content-cardbody');
      if (!bodyEl) return;

      const formItems = bodyEl.querySelectorAll('.ant-row.ant-form-item.mb16, .ant-row.ant-form-item');
      const groupData = {};
      formItems.forEach(item => {
        const field = this._extractFormItem(item);
        if (field) {
          groupData[field.label] = {
            domKey: field.domKey,
            label: field.label,
            fieldType: field.fieldType,
            currentValue: this._getDisplayValue(field)
          };
        }
      });

      if (Object.keys(groupData).length > 0) {
        result[groupName] = groupData;
      }
    });
    return result;
  },

  /**
   * 获取字段的显示值（用于匹配预览）
   * @param {object} field
   * @returns {string}
   */
  _getDisplayValue(field) {
    if (!field || field.value === null || field.value === undefined) return '';
    if (field.fieldType === 'inputNumberGroup' && field.value.values) {
      const vals = field.value.values;
      const seps = field.value.separators || [];
      let display = '';
      vals.forEach((v, i) => {
        display += (v !== null && v !== undefined ? v : '');
        if (i < seps.length) display += seps[i];
      });
      return display;
    }
    if (field.fieldType === 'mixedGroup' && field.value.parts) {
      return field.value.parts.map(p => {
        if (p.type === 'separator') return p.text;
        if (p.type === 'inputNumber') return p.value;
        if (p.type === 'timePicker') return p.value;
        if (p.type === 'select' || p.type === 'searchSelect') return p.text;
        return '';
      }).join(' ');
    }
    if (field.fieldType === 'selectGroup' && field.value.values) {
      const vals = field.value.values;
      const seps = field.value.separators || [];
      let display = '';
      vals.forEach((v, i) => {
        display += (v !== null && v !== undefined ? v : '');
        if (i < seps.length) display += seps[i];
      });
      return display;
    }
    if (field.fieldType === 'customDisplay') {
      if (typeof field.value === 'object' && field.value.title) return field.value.title;
      return String(field.value ?? '');
    }
    if (field.fieldType === 'searchSelectGroup' && field.value.items) {
      return field.value.items.map(item => item.text || '').join(', ');
    }
    if (field.fieldType === 'multiSearchSelect' && Array.isArray(field.value.text)) {
      return field.value.text.join(', ');
    }
    if (field.fieldType === 'searchSelect' && field.value.text) return field.value.text;
    if (field.fieldType === 'select' && field.value.text) return field.value.text;
    if (typeof field.value === 'object') return JSON.stringify(field.value);
    return String(field.value ?? '');
  },

  /**
   * 检测当前Tab名称
   * @returns {string}
   */
  _detectCurrentTab() {
    // 优先从tab标签获取
    const activeTab = document.querySelector('div[role="tab"].ant-tabs-tab-active');
    if (activeTab) return activeTab.textContent.trim();
    // 兜底：从tab面板获取
    const tabBtn = document.querySelector('.ant-tabs-tab-active .ant-tabs-tab-btn');
    if (tabBtn) return tabBtn.textContent.trim();
    return 'unknown';
  },

  /**
   * 提取一个分组内的所有字段
   * @param {HTMLElement} bodyEl - content-cardbody元素
   * @returns {object}
   */
  _extractGroup(bodyEl) {
    const tempData = {};

    // 先提取所有表单行
    const formItems = bodyEl.querySelectorAll('.ant-row.ant-form-item.mb16, .ant-row.ant-form-item');
    formItems.forEach(item => {
      const field = this._extractFormItem(item);
      if (field) {
        tempData[field.label] = field;
      }
    });

    // 提取特殊区域（如国家景区）
    const scenicArea = bodyEl.querySelector('#scenic_area');
    if (scenicArea) {
      tempData['国家景区'] = this._extractScenicArea(scenicArea);
    }

    // 提取目的地信息
    const destinationInfo = this._extractDestinationInfo(bodyEl);

    // 重新组装，确保目的地信息在第一位
    const groupData = {};
    if (destinationInfo) {
      groupData['目的地信息'] = destinationInfo;
    }
    Object.assign(groupData, tempData);

    return groupData;
  },

  /**
   * 提取单个表单行的数据
   * 一个form-item可能包含多个不同类型的输入控件（如select+inputNumber+select）
   * @param {HTMLElement} item - ant-form-item元素
   * @returns {object|null}
   */
  _extractFormItem(item) {
    const labelEl = item.querySelector('.ant-form-item-label label');
    if (!labelEl) return null;

    // 优先使用 title 属性，避免提取到图标等额外文本
    let labelText = labelEl.getAttribute('title') || labelEl.textContent.trim();
    // 清理可能的图标字符
    labelText = labelText.replace(/[ℹ️⚠️✔️]/g, '').trim();

    const labelFor = labelEl.getAttribute('for') || '';
    const controlWrapper = item.querySelector('.ant-form-item-control');

    if (!controlWrapper) return null;

    // 【新 · 阶段2】Registry 增量通道：遍历已注册 handler.detect，命中走 handler.extract（§5.7 Issue 7）
    // 老的 15 种类型无 handler 注册 → handlers() 空或未命中 → 落到下面老识别逻辑，行为零变化
    if (window.FieldTypeRegistry) {
      for (const handler of FieldTypeRegistry.handlers()) {
        if (typeof handler.detect === 'function' && handler.detect(item)) {
          return handler.extract(item);
        }
      }
    }

    // 【老 · 冻结】以下类型识别逻辑不再新增分支，新类型一律 Registry 注册

    // 统计所有控件类型
    const numberInputs = controlWrapper.querySelectorAll('.ant-input-number');
    const allSelects = controlWrapper.querySelectorAll('.ant-select');

    // 区分搜索下拉框和普通下拉框
    const searchSelects = [];
    const plainSelects = [];
    allSelects.forEach(sel => {
      if (sel.querySelector('input.ant-select-search__field[id]')) {
        searchSelects.push(sel);
      } else {
        plainSelects.push(sel);
      }
    });

    const hasInputNumber = numberInputs.length > 0;
    const hasSearchSelect = searchSelects.length > 0;
    const hasPlainSelect = plainSelects.length > 0;
    const typeCount = [hasInputNumber, hasSearchSelect, hasPlainSelect].filter(Boolean).length;

    // 混合控件组：多种不同类型控件在同一行（如提前预订=select+inputNumber+select）
    if (typeCount > 1) {
      return this._extractMixedGroup(labelFor, labelText, controlWrapper);
    }

    // 同类型多控件组
    if (numberInputs.length > 1) {
      return this._extractInputNumberGroup(labelFor, labelText, controlWrapper, numberInputs);
    }
    if (searchSelects.length > 1) {
      return this._extractSearchSelectGroup(labelFor, labelText, controlWrapper,
        controlWrapper.querySelectorAll('input.ant-select-search__field[id]'));
    }
    if (plainSelects.length > 1) {
      return this._extractSelectGroup(labelFor, labelText, controlWrapper, plainSelects);
    }

    // 无标准表单控件：尝试提取自定义展示组件
    if (!hasInputNumber && !hasSearchSelect && !hasPlainSelect) {
      const textarea = controlWrapper.querySelector('textarea');
      const input = controlWrapper.querySelector('input');
      if (!textarea && !input) {
        return this._extractCustomDisplay(labelFor, labelText, controlWrapper);
      }
    }

    // 单控件：使用现有逻辑
    const fieldType = this._detectFieldType(controlWrapper);
    const value = this._extractValue(controlWrapper, fieldType);

    return {
      domKey: labelFor,
      label: labelText,
      value: value,
      fieldType: fieldType
    };
  },

  /**
   * 提取成组数字输入框（如"X天X晚"、"X到X人"）
   * 遍历ant-form-item-children下的所有文本节点和ant-input-number，
   * 按出现顺序记录分隔文本和输入值
   * @param {string} labelFor
   * @param {string} labelText
   * @param {HTMLElement} controlWrapper
   * @param {NodeList} numberInputs
   * @returns {object}
   */
  _extractInputNumberGroup(labelFor, labelText, controlWrapper, numberInputs) {
    const children = controlWrapper.querySelector('.ant-form-item-children') || controlWrapper;
    const parts = [];

    // 遍历children的子节点，提取分隔文本和输入框值
    this._walkChildren(children, parts);

    // 从parts中分离出inputNumber值和分隔文本
    const values = parts.filter(p => p.type === 'inputNumber').map(p => p.value);
    const separators = parts.filter(p => p.type === 'separator').map(p => p.text);

    // 如果walk没提取到有效数据，回退为简单提取
    if (values.length === 0) {
      const fallbackValues = Array.from(numberInputs).map(el => {
        const input = el.querySelector('.ant-input-number-input');
        const val = input ? input.value : '';
        return val !== '' ? Number(val) : null;
      });
      return {
        domKey: labelFor,
        label: labelText,
        value: { values: fallbackValues, separators: [] },
        fieldType: 'inputNumberGroup'
      };
    }

    return {
      domKey: labelFor,
      label: labelText,
      value: { values, separators },
      fieldType: 'inputNumberGroup'
    };
  },

  /**
   * 递归遍历子节点，提取所有控件值和分隔文本
   * 支持：ant-input-number、ant-select（搜索/普通）、ant-time-picker、文本节点
   * @param {HTMLElement} container
   * @param {Array} parts - 累积结果 [{type, value|text, ...}]
   * @param {boolean} skipDescriptions - 是否跳过说明性元素（如 publicTip）
   */
  _walkChildren(container, parts, skipDescriptions = false) {
    const childNodes = container.childNodes;
    for (let i = 0; i < childNodes.length; i++) {
      const node = childNodes[i];

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) {
          parts.push({ type: 'separator', text });
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (!node.classList) continue;

        // 跳过隐藏控件（nodisplay 类或 display: none 样式）
        if (this._isHidden(node)) continue;

        // 跳过说明性元素（如 publicTip、提示文本等）
        if (skipDescriptions && this._isDescriptionElement(node)) continue;

        // ant-input-number
        if (node.classList.contains('ant-input-number')) {
          const input = node.querySelector('.ant-input-number-input');
          const val = input ? input.value : '';
          parts.push({ type: 'inputNumber', value: val !== '' ? Number(val) : null });
        }
        // ant-time-picker
        else if (node.classList.contains('ant-time-picker')) {
          const input = node.querySelector('.ant-time-picker-input');
          const val = input ? input.value : '';
          parts.push({ type: 'timePicker', value: val });
        }
        // ant-select
        else if (node.classList.contains('ant-select')) {
          const searchInput = node.querySelector('input.ant-select-search__field[id]');
          const selected = node.querySelector('.ant-select-selection-selected-value');
          const text = selected ? (selected.getAttribute('title') || selected.textContent.trim()) : '';

          if (searchInput) {
            const fiberData = this._extractFromReactFiber(searchInput);
            parts.push({
              type: 'searchSelect',
              text,
              domKey: searchInput.id,
              ...fiberData
            });
          } else {
            parts.push({ type: 'select', text });
          }
        }
        // 其他元素递归
        else if (node.childNodes.length > 0) {
          this._walkChildren(node, parts, skipDescriptions);
        }
      }
    }
  },

  /**
   * 提取混合控件组（如提前预订=select(时区)+inputNumber(天数)+timePicker(时间点)）
   * 遍历所有子节点，按出现顺序记录每个控件的值和分隔文本
   * 只提取控件及其紧邻的分隔符，跳过末尾的说明性文本（如publicTip）
   * @param {string} labelFor
   * @param {string} labelText
   * @param {HTMLElement} controlWrapper
   * @returns {object}
   */
  _extractMixedGroup(labelFor, labelText, controlWrapper) {
    const children = controlWrapper.querySelector('.ant-form-item-children') || controlWrapper;
    const parts = [];
    this._walkChildren(children, parts, true); // 传入 true 表示启用混合组模式

    // 过滤逻辑：只保留控件及其紧邻的分隔符
    // 规则：遇到最后一个控件后，只保留一个紧邻的 separator，忽略其他所有 separator
    const filtered = [];
    let lastControlIndex = -1;

    // 找到最后一个控件的索引
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i].type !== 'separator') {
        lastControlIndex = i;
        break;
      }
    }

    // 保留到最后一个控件后的第一个 separator
    let separatorsAfterLastControl = 0;
    for (let i = 0; i <= lastControlIndex + 1 && i < parts.length; i++) {
      if (i > lastControlIndex && parts[i].type === 'separator') {
        separatorsAfterLastControl++;
        if (separatorsAfterLastControl > 1) break; // 只保留一个
      }
      filtered.push(parts[i]);
    }

    return {
      domKey: labelFor,
      label: labelText,
      value: { parts: filtered },
      fieldType: 'mixedGroup'
    };
  },

  /**
   * 提取成组普通下拉框（如儿童年龄=select(最小2)+"-"+select(最大12)+"周岁"）
   * 使用 _walkChildren 提取完整结构（包括分隔文本）
   * @param {string} labelFor
   * @param {string} labelText
   * @param {HTMLElement} controlWrapper
   * @param {Array} plainSelects
   * @returns {object}
   */
  _extractSelectGroup(labelFor, labelText, controlWrapper, plainSelects) {
    const children = controlWrapper.querySelector('.ant-form-item-children') || controlWrapper;
    const parts = [];

    // 使用 _walkChildren 提取完整结构
    this._walkChildren(children, parts);

    // 从 parts 中分离出 select 值和分隔文本
    const values = parts.filter(p => p.type === 'select').map(p => p.text);
    const separators = parts.filter(p => p.type === 'separator').map(p => p.text);

    // 如果 walk 没提取到有效数据，回退为简单提取
    if (values.length === 0) {
      const fallbackValues = Array.from(plainSelects).map(sel => {
        const selected = sel.querySelector('.ant-select-selection-selected-value');
        return selected ? (selected.getAttribute('title') || selected.textContent.trim()) : '';
      });
      return {
        domKey: labelFor,
        label: labelText,
        value: { values: fallbackValues, separators: [] },
        fieldType: 'selectGroup'
      };
    }

    return {
      domKey: labelFor,
      label: labelText,
      value: { values, separators },
      fieldType: 'selectGroup'
    };
  },

  /**
   * 提取自定义展示组件（如工作时间，无标准表单控件，只有展示文本）
   * 优先提取标题（h3/h4/h5），其次提取全部文本
   * @param {string} labelFor
   * @param {string} labelText
   * @param {HTMLElement} controlWrapper
   * @returns {object}
   */
  _extractCustomDisplay(labelFor, labelText, controlWrapper) {
    // 优先提取标题
    const heading = controlWrapper.querySelector('h3, h4, h5');
    if (heading) {
      // 同时提取结构化详情
      const details = {};
      const detailRows = controlWrapper.querySelectorAll('[class*="_3yHqm7"]');
      detailRows.forEach(row => {
        const labelDiv = row.querySelector('div:first-child');
        const valueDiv = row.querySelector('div:last-child');
        if (labelDiv && valueDiv) {
          details[labelDiv.textContent.trim().replace(/：$/, '')] = valueDiv.textContent.trim();
        }
      });

      return {
        domKey: labelFor,
        label: labelText,
        value: {
          title: heading.textContent.trim(),
          details
        },
        fieldType: 'customDisplay'
      };
    }

    // 兜底：提取全部文本
    const text = controlWrapper.textContent.trim();
    return {
      domKey: labelFor,
      label: labelText,
      value: text,
      fieldType: 'customDisplay'
    };
  },

  /**
   * 提取成组搜索下拉框（如集合城市+目的地城市在同一行）
   * @param {string} labelFor
   * @param {string} labelText
   * @param {HTMLElement} controlWrapper
   * @param {NodeList} searchInputs
   * @returns {object}
   */
  _extractSearchSelectGroup(labelFor, labelText, controlWrapper, searchInputs) {
    const items = Array.from(searchInputs).map(searchInput => {
      const selectEl = searchInput.closest('.ant-select');
      const selected = selectEl ? selectEl.querySelector('.ant-select-selection-selected-value') : null;
      const fiberData = this._extractFromReactFiber(searchInput);

      return {
        domKey: searchInput.id,
        text: selected ? (selected.getAttribute('title') || selected.textContent.trim()) : '',
        fieldType: 'searchSelect',
        ...fiberData
      };
    });

    return {
      domKey: labelFor,
      label: labelText,
      value: { items },
      fieldType: 'searchSelectGroup'
    };
  },

  /**
   * 检测字段类型
   * @param {HTMLElement} controlWrapper
   * @returns {string}
   */
  _detectFieldType(controlWrapper) {
    // 数字输入框：ant-input-number
    if (controlWrapper.querySelector('.ant-input-number')) return 'inputNumber';

    // 多选搜索下拉框：ant-select-selection--multiple 内有 search input
    const multipleSelect = controlWrapper.querySelector('.ant-select-selection--multiple');
    if (multipleSelect) return 'multiSearchSelect';

    // 搜索下拉框：ant-select-selection--single 内有 search input with id
    const searchInput = controlWrapper.querySelector('input.ant-select-search__field[id]');
    if (searchInput) return 'searchSelect';

    // 普通下拉框：ant-select
    const antSelect = controlWrapper.querySelector('.ant-select');
    if (antSelect) return 'select';

    // 文本域
    if (controlWrapper.querySelector('textarea')) return 'textarea';

    // 复选框/单选框
    if (controlWrapper.querySelector('input[type="checkbox"]')) return 'checkbox';
    if (controlWrapper.querySelector('input[type="radio"]')) return 'radio';

    // 普通输入框
    if (controlWrapper.querySelector('input')) return 'input';

    return 'unknown';
  },

  /**
   * 根据字段类型提取值
   * @param {HTMLElement} controlWrapper
   * @param {string} fieldType
   * @returns {*}
   */
  _extractValue(controlWrapper, fieldType) {
    switch (fieldType) {
      case 'input':
        return this._extractInputValue(controlWrapper);
      case 'inputNumber':
        return this._extractInputNumberValue(controlWrapper);
      case 'textarea':
        return this._extractTextareaValue(controlWrapper);
      case 'select':
        return this._extractSelectValue(controlWrapper);
      case 'searchSelect':
        return this._extractSearchSelectValue(controlWrapper);
      case 'multiSearchSelect':
        return this._extractMultiSearchSelectValue(controlWrapper);
      case 'checkbox':
        return this._extractCheckboxValue(controlWrapper);
      case 'radio':
        return this._extractRadioValue(controlWrapper);
      default:
        return null;
    }
  },

  _extractInputValue(controlWrapper) {
    const input = controlWrapper.querySelector('input');
    if (!input) return null;
    const val = input.value;
    // 数值型字段转数字
    if (input.type === 'number' && val !== '') return Number(val);
    return val;
  },

  /**
   * 提取ant-input-number的值
   * @param {HTMLElement} controlWrapper
   * @returns {number|null}
   */
  _extractInputNumberValue(controlWrapper) {
    const input = controlWrapper.querySelector('.ant-input-number-input');
    if (!input) return null;
    const val = input.value;
    return val !== '' ? Number(val) : null;
  },

  _extractTextareaValue(controlWrapper) {
    const textarea = controlWrapper.querySelector('textarea');
    return textarea ? textarea.value : null;
  },

  _extractSelectValue(controlWrapper) {
    const selected = controlWrapper.querySelector('.ant-select-selection-selected-value');
    if (!selected) return null;
    return {
      text: selected.getAttribute('title') || selected.textContent.trim(),
      fieldType: 'select'
    };
  },

  _extractSearchSelectValue(controlWrapper) {
    const searchInput = controlWrapper.querySelector('input.ant-select-search__field[id]');
    const selected = controlWrapper.querySelector('.ant-select-selection-selected-value');
    const id = searchInput ? searchInput.id : '';

    // 尝试从React fiber获取更多信息
    const fiberData = this._extractFromReactFiber(searchInput);

    return {
      text: selected ? (selected.getAttribute('title') || selected.textContent.trim()) : '',
      id: id,
      fieldType: 'searchSelect',
      ...fiberData
    };
  },

  /**
   * 提取多选搜索下拉框的值
   * DOM结构：li.ant-select-selection__choice 列表，每个choice含 title 和 content
   * @param {HTMLElement} controlWrapper
   * @returns {object}
   */
  _extractMultiSearchSelectValue(controlWrapper) {
    const searchInput = controlWrapper.querySelector('input.ant-select-search__field[id]');
    const id = searchInput ? searchInput.id : '';

    // 提取所有已选项
    const choices = controlWrapper.querySelectorAll('.ant-select-selection__choice');
    const selectedItems = Array.from(choices).map(choice => {
      const content = choice.querySelector('.ant-select-selection__choice__content');
      return {
        text: choice.getAttribute('title') || (content ? content.textContent.trim() : ''),
      };
    });

    // 尝试从React fiber获取value数组
    const fiberData = this._extractFromReactFiber(searchInput);

    return {
      text: selectedItems.map(item => item.text),
      id: id,
      fieldType: 'multiSearchSelect',
      ...fiberData
    };
  },

  _extractCheckboxValue(controlWrapper) {
    const checkbox = controlWrapper.querySelector('input[type="checkbox"]');
    return checkbox ? checkbox.checked : null;
  },

  _extractRadioValue(controlWrapper) {
    const radio = controlWrapper.querySelector('input[type="radio"]:checked');
    return radio ? radio.value : null;
  },

  /**
   * 从React fiber提取额外状态（辅助）
   * @param {HTMLElement} element
   * @returns {object}
   */
  _extractFromReactFiber(element) {
    if (!element) return {};
    try {
      const fiberKey = Object.keys(element).find(k => k.startsWith('__reactInternalInstance$') || k.startsWith('__reactFiber$'));
      if (!fiberKey) return {};

      const fiber = element[fiberKey];
      // 向上遍历找到有stateNode的组件
      let current = fiber;
      while (current) {
        if (current.stateNode && current.stateNode.props) {
          const props = current.stateNode.props;
          return {
            reactValue: props.value || props.defaultValue || undefined
          };
        }
        current = current.return;
      }
    } catch (e) {
      // fiber提取失败不影响主流程
    }
    return {};
  },

  /**
   * 提取国家景区级联选择器数据
   * @param {HTMLElement} scenicArea
   * @returns {object}
   */
  _extractScenicArea(scenicArea) {
    const result = {
      domKey: 'nameAreas.countryScienc',
      label: '国家景区',
      fieldType: 'cascader',
      value: []
    };

    // 提取已选标签
    const tags = scenicArea.querySelectorAll('.ant-tag');
    tags.forEach(tag => {
      result.value.push(tag.textContent.trim());
    });

    return result;
  },

  /**
   * 判断元素是否隐藏
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  _isHidden(element) {
    // 检查 nodisplay 类
    if (element.classList.contains('nodisplay')) return true;

    // 检查 display: none 样式
    const style = window.getComputedStyle(element);
    if (style.display === 'none') return true;

    // 检查 visibility: hidden
    if (style.visibility === 'hidden') return true;

    return false;
  },

  /**
   * 判断元素是否为说明性元素（提示文本、帮助信息等）
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  _isDescriptionElement(element) {
    // 检查常见的说明性类名
    const descriptionClasses = ['publicTip', 'tip', 'hint', 'help', 'description', 'note'];
    for (const cls of descriptionClasses) {
      if (element.classList.contains(cls)) return true;
    }

    // 检查是否为纯文本展示的 div（通常是说明文字）
    // 如果 div 内没有表单控件，且文本较长（>20字符），可能是说明
    if (element.tagName === 'DIV') {
      const hasFormControl = element.querySelector('.ant-input, .ant-select, .ant-input-number, .ant-time-picker, textarea');
      if (!hasFormControl) {
        const text = element.textContent.trim();
        // 长文本且不是简单的分隔符
        if (text.length > 20 && !['天', '晚', '周岁', '前可订', '-'].includes(text)) {
          return true;
        }
      }
    }

    return false;
  },

  /**
   * 提取目的地信息（contentcard-desc-title）
   * @param {HTMLElement} bodyEl - content-cardbody元素
   * @returns {object|null}
   */
  _extractDestinationInfo(bodyEl) {
    // 查找 contentcard-desc-title 元素
    const titleEl = bodyEl.querySelector('.contentcard-desc-title span[data-lcpignore="true"]');
    if (!titleEl) return null;

    let text = titleEl.textContent.trim();
    if (!text) return null;

    // 过滤特殊字符，只保留：中文、英文、数字、空格及指定半角符号
    // 半角符号：· ° % -
    // 移除所有中文符号（包括全角符号）
    text = text.replace(/[^一-龥a-zA-Z0-9·°%\-\s]/g, '');
    text = text.trim();

    if (!text) return null;

    return {
      domKey: 'baseInfo.destinationInfo',
      label: '目的地信息',
      value: text,
      fieldType: 'input'
    };
  }
};

if (typeof window !== 'undefined') { window.FormExtractor = FormExtractor; }
if (typeof module !== 'undefined' && module.exports) { module.exports = FormExtractor; }
