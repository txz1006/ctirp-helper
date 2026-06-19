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

    return transformed;
  },

  /**
   * 应用预置规则到单个字段
   * @param {object} fieldData
   * @returns {object}
   */
  async _applyRules(fieldData) {
    const { domKey, fieldType, value } = fieldData;

    // 推荐理由（productImageText 页面）
    if (fieldType === 'recommendReason') {
      return { ...fieldData, source: 'auto' };
    }

    // 富文本编辑器（productImageText 页面）
    if (fieldType === 'richText') {
      return { ...fieldData, source: 'auto' };
    }

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
  }
};
