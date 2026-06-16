/**
 * 导入逻辑 - 国际版页面表单数据导入
 */

const ImportHandler = {
  /**
   * 解析导入的JSON数据
   * @param {string} jsonText
   * @returns {object} 解析结果
   */
  parseInput(jsonText) {
    try {
      const data = JSON.parse(jsonText);
      if (!data.version || !data.data) {
        return { success: false, error: '数据格式不正确，缺少version或data字段' };
      }

      // 递归处理所有字段值，将 null 转换为空字符串
      this._convertNullToEmpty(data);

      return { success: true, data };
    } catch (e) {
      return { success: false, error: `JSON解析失败: ${e.message}` };
    }
  },

  /**
   * 递归将对象中的所有 null 值转换为空字符串
   * 同时将语言相关字段转换为繁体
   * @param {object} obj
   * @param {Array<string>} keyPath - 键路径，用于判断是否是语言字段
   */
  _convertNullToEmpty(obj, keyPath = []) {
    if (obj === null || obj === undefined) return;

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        if (item === null) {
          obj[index] = '';
        } else if (typeof item === 'object') {
          this._convertNullToEmpty(item, keyPath);
        }
      });
    } else if (typeof obj === 'object') {
      for (const key in obj) {
        if (obj[key] === null) {
          obj[key] = '';
        } else if (typeof obj[key] === 'string') {
          // 检查整个路径中是否包含语言相关的键
          const pathIncludesLanguage = keyPath.some(k =>
            k.toLowerCase().includes('language') ||
            k.toLowerCase().includes('语言') ||
            k === 'serviceLanguages'
          );

          // 如果当前key是text，且路径中有语言字段，则转换为繁体
          if (key === 'text' && pathIncludesLanguage) {
            console.log(`[Import] 转换语言字段 (路径: ${keyPath.join('.')}): "${obj[key]}" → "${this._toTraditional(obj[key])}"`);
            obj[key] = this._toTraditional(obj[key]);
          }
        } else if (typeof obj[key] === 'object') {
          // 递归处理，添加当前key到路径
          this._convertNullToEmpty(obj[key], [...keyPath, key]);
        }
      }
    }
  },

  /**
   * 简体转繁体（语言相关）
   */
  _toTraditional(text) {
    const map = {
      // 完整词组优先
      '普通话': '普通話',
      '粤语': '粵語',
      '英语': '英語',
      '泰语': '泰語',
      '越南语': '越南語',
      '日语': '日語',
      '韩语': '韓語',
      '当地语言': '當地語言',
      '西班牙语': '西班牙語',

      // 单字
      '语': '語',
      '当': '當'
    };

    let result = text;
    // 先整词替换
    for (const [s, t] of Object.entries(map)) {
      if (s.length > 1 && result.includes(s)) {
        result = result.replace(new RegExp(s, 'g'), t);
      }
    }
    // 再单字替换
    for (const [s, t] of Object.entries(map)) {
      if (s.length === 1) {
        result = result.replace(new RegExp(s, 'g'), t);
      }
    }
    return result;
  },

  /**
   * 执行转换（预置规则 + 大模型翻译）
   * @param {object} sourceData - 导出的原始数据
   * @returns {Promise<object>} 转换后的数据
   */
  async transform(sourceData) {
    const transformed = JSON.parse(JSON.stringify(sourceData));

    // 1. 应用预置转换规则
    for (const [groupName, groupData] of Object.entries(transformed.data)) {
      for (const [fieldLabel, fieldData] of Object.entries(groupData)) {
        if (fieldData && typeof fieldData === 'object' && fieldData.fieldType) {
          transformed.data[groupName][fieldLabel] = await this._applyRules(fieldData);
        }
      }
    }

    // 2. 大模型翻译自由文本字段
    const translationFields = this._collectTranslationFields(transformed.data);
    if (translationFields.length > 0) {
      const translations = await this._translateFields(translationFields);
      this._applyTranslations(transformed.data, translations);
    }

    return transformed;
  },

  /**
   * 应用预置规则到单个字段
   * @param {object} fieldData
   * @returns {object}
   */
  async _applyRules(fieldData) {
    const { domKey, fieldType, value } = fieldData;

    // 数字输入框：直接复制
    if (fieldType === 'inputNumber') {
      return { ...fieldData, source: 'auto' };
    }

    // 成组数字输入框：直接复制
    if (fieldType === 'inputNumberGroup') {
      return { ...fieldData, source: 'auto' };
    }

    // 混合控件组：数值直接复制，文本部分需翻译
    if (fieldType === 'mixedGroup') {
      const parts = value.parts || [];
      const needsTranslation = parts.some(p =>
        (p.type === 'select' || p.type === 'searchSelect') && p.text && /[\u4e00-\u9fa5]/.test(p.text)
      );
      return { ...fieldData, source: needsTranslation ? 'needsTranslation' : 'auto' };
    }

    // 成组普通下拉框：直接复制
    if (fieldType === 'selectGroup') {
      return { ...fieldData, source: 'auto' };
    }

    // 自定义展示组件：需翻译
    if (fieldType === 'customDisplay') {
      return { ...fieldData, source: 'needsTranslation' };
    }

    // 成组搜索下拉框：直接复制
    if (fieldType === 'searchSelectGroup') {
      return { ...fieldData, source: 'auto' };
    }

    // 直接复制：数值型字段
    if (fieldType === 'input' && typeof value === 'number') {
      return { ...fieldData, source: 'auto' };
    }

    // 搜索下拉框：保留text，标记需翻译
    if (fieldType === 'searchSelect' && value && value.text) {
      return { ...fieldData, source: 'auto' };
    }

    // 多选搜索下拉框：保留text数组，标记需翻译
    if (fieldType === 'multiSearchSelect' && value && value.text) {
      return { ...fieldData, source: 'auto' };
    }

    // 普通下拉框：保留text，标记需映射
    if (fieldType === 'select' && value && value.text) {
      return { ...fieldData, source: 'auto' };
    }

    // 文本字段：标记需翻译
    if ((fieldType === 'input' || fieldType === 'textarea') && typeof value === 'string' && value) {
      return { ...fieldData, source: 'needsTranslation' };
    }

    return { ...fieldData, source: 'auto' };
  },

  /**
   * 收集需要翻译的字段
   * @param {object} data
   * @returns {Array}
   */
  _collectTranslationFields(data) {
    const fields = [];
    for (const [groupName, groupData] of Object.entries(data)) {
      for (const [fieldLabel, fieldData] of Object.entries(groupData)) {
        if (!fieldData) continue;

        if (fieldData.source === 'needsTranslation') {
          // 混合控件组：提取需要翻译的select文本
          if (fieldData.fieldType === 'mixedGroup' && fieldData.value && fieldData.value.parts) {
            fieldData.value.parts.forEach((part, idx) => {
              if ((part.type === 'select' || part.type === 'searchSelect') && part.text && /[\u4e00-\u9fa5]/.test(part.text)) {
                fields.push({
                  group: groupName,
                  label: `${fieldLabel}[${idx}]`,
                  domKey: `${fieldData.domKey}__part__${idx}`,
                  text: part.text,
                  isMixedGroupPart: true,
                  parentDomKey: fieldData.domKey,
                  partIndex: idx
                });
              }
            });
            continue;
          }

          // 自定义展示组件
          if (fieldData.fieldType === 'customDisplay') {
            const textToTranslate = typeof fieldData.value === 'object'
              ? (fieldData.value.title || JSON.stringify(fieldData.value))
              : String(fieldData.value);
            fields.push({
              group: groupName,
              label: fieldLabel,
              domKey: fieldData.domKey,
              text: textToTranslate
            });
            continue;
          }

          fields.push({
            group: groupName,
            label: fieldLabel,
            domKey: fieldData.domKey,
            text: fieldData.value
          });
        }

        // 搜索下拉框的text也需要翻译
        if (fieldData.fieldType === 'searchSelect' && fieldData.value && fieldData.value.text) {
          fields.push({
            group: groupName,
            label: fieldLabel,
            domKey: fieldData.domKey,
            text: fieldData.value.text,
            isSearchText: true
          });
        }
        // 成组搜索下拉框中每个item的text需要翻译
        if (fieldData.fieldType === 'searchSelectGroup' && fieldData.value && fieldData.value.items) {
          fieldData.value.items.forEach((item, idx) => {
            if (item.text) {
              fields.push({
                group: groupName,
                label: `${fieldLabel}[${idx}]`,
                domKey: `${item.domKey}`,
                text: item.text,
                isSearchText: true,
                isGroupItem: true,
                parentDomKey: fieldData.domKey,
                index: idx
              });
            }
          });
        }
        // 多选搜索下拉框的每个text也需要翻译
        if (fieldData.fieldType === 'multiSearchSelect' && fieldData.value && Array.isArray(fieldData.value.text)) {
          fieldData.value.text.forEach((t, idx) => {
            fields.push({
              group: groupName,
              label: `${fieldLabel}[${idx}]`,
              domKey: `${fieldData.domKey}__${idx}`,
              text: t,
              isMultiSearchText: true,
              parentDomKey: fieldData.domKey,
              index: idx
            });
          });
        }
      }
    }
    return fields;
  },

  /**
   * 调用大模型翻译
   * @param {Array} fields
   * @returns {Promise<object>}
   */
  async _translateFields(fields) {
    const config = await SafeStorage.get(['apiKey', 'apiEndpoint', 'apiType']);

    if (!config.apiKey) {
      // 无API Key，回退为原文
      const fallback = {};
      fields.forEach(f => { fallback[f.domKey] = { translated: f.text, failed: true }; });
      return fallback;
    }

    try {
      const fieldMap = {};
      fields.forEach(f => { fieldMap[f.domKey] = f.text; });

      const prompt = `你是一个旅游行业翻译专家，将中文旅游产品信息翻译为英文。
保持专业术语的准确性，如"私家团"翻译为"Private Tour"。
保持格式不变，只翻译文本内容。
请严格按以下JSON格式返回翻译结果，不要添加任何其他内容：

{
${fields.map(f => `  "${f.domKey}": "翻译后的文本"`).join(',\n')}
}

需要翻译的字段：
${fields.map(f => `- ${f.domKey}：${f.text}`).join('\n')}`;

      const response = await this._callLLM(config, prompt);
      const translations = JSON.parse(response);
      return translations;
    } catch (e) {
      // 翻译失败，回退为原文
      const fallback = {};
      fields.forEach(f => { fallback[f.domKey] = { translated: f.text, failed: true, error: e.message }; });
      return fallback;
    }
  },

  /**
   * 调用大模型API
   * @param {object} config
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  async _callLLM(config, prompt) {
    const endpoint = config.apiEndpoint || 'https://api.openai.com/v1/chat/completions';
    const apiType = config.apiType || 'openai';

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    };

    let body;
    if (apiType === 'anthropic') {
      headers['x-api-key'] = config.apiKey;
      delete headers['Authorization'];
      body = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      };
    } else {
      body = {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      };
    }

    const resp = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!resp.ok) throw new Error(`API调用失败: ${resp.status}`);

    const result = await resp.json();
    if (apiType === 'anthropic') {
      return result.content[0].text;
    }
    return result.choices[0].message.content;
  },

  /**
   * 将翻译结果应用到数据中
   * @param {object} data
   * @param {object} translations
   */
  _applyTranslations(data, translations) {
    for (const [groupName, groupData] of Object.entries(data)) {
      for (const [fieldLabel, fieldData] of Object.entries(groupData)) {
        if (!fieldData || !fieldData.domKey) continue;

        // 混合控件组：逐part应用翻译
        if (fieldData.fieldType === 'mixedGroup' && fieldData.value && fieldData.value.parts) {
          fieldData.value.parts.forEach((part, idx) => {
            const key = `${fieldData.domKey}__part__${idx}`;
            const translation = translations[key];
            if (!translation) return;
            if (typeof translation === 'object' && translation.failed) return;
            const translatedText = typeof translation === 'string' ? translation : translation.translated;
            if (part.type === 'select' || part.type === 'searchSelect') {
              part.text = translatedText;
            }
          });
          fieldData.source = 'aiTranslation';
          continue;
        }

        // 自定义展示组件
        if (fieldData.fieldType === 'customDisplay') {
          const translation = translations[fieldData.domKey];
          if (translation && !(typeof translation === 'object' && translation.failed)) {
            const translatedText = typeof translation === 'string' ? translation : translation.translated;
            if (typeof fieldData.value === 'object' && fieldData.value.title) {
              fieldData.value.title = translatedText;
            } else {
              fieldData.value = translatedText;
            }
            fieldData.source = 'aiTranslation';
          }
          continue;
        }

        // 成组搜索下拉框：逐项应用翻译
        if (fieldData.fieldType === 'searchSelectGroup' && fieldData.value && fieldData.value.items) {
          fieldData.value.items.forEach((item, idx) => {
            const translation = translations[item.domKey];
            if (!translation) return;
            if (typeof translation === 'object' && translation.failed) return;
            const translatedText = typeof translation === 'string' ? translation : translation.translated;
            item.text = translatedText;
          });
          fieldData.source = 'aiTranslation';
          continue;
        }

        // 多选搜索下拉框：逐项应用翻译
        if (fieldData.fieldType === 'multiSearchSelect' && Array.isArray(fieldData.value.text)) {
          fieldData.value.text = fieldData.value.text.map((t, idx) => {
            const key = `${fieldData.domKey}__${idx}`;
            const translation = translations[key];
            if (!translation) return t;
            if (typeof translation === 'object' && translation.failed) return t;
            return typeof translation === 'string' ? translation : translation.translated;
          });
          fieldData.source = 'aiTranslation';
          continue;
        }

        const translation = translations[fieldData.domKey];
        if (!translation) continue;

        if (typeof translation === 'object' && translation.failed) {
          fieldData.source = 'translationFailed';
          fieldData.error = translation.error;
        } else {
          const translatedText = typeof translation === 'string' ? translation : translation.translated;
          if (fieldData.fieldType === 'searchSelect' && fieldData.value) {
            fieldData.value.text = translatedText;
          } else {
            fieldData.value = translatedText;
          }
          fieldData.source = 'aiTranslation';
        }
      }
    }
  }
};
