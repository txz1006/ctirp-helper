/**
 * productImageText 页面适配器（产品图文）
 * 原逻辑来自 page-adapters.js productImageTextAdapter，原样搬入，仅改为 PageRegistry.register 自注册。
 *
 * 含专属字段：recommendReason（推荐理由分类+描述）、richText（产品特色富文本）。
 * 当前这些专属字段仍由本适配器的 extract/extractFieldMap 直接处理（绞杀法，遵循 §3 D2 不重写）；
 * 未来若要抽为 scoped handler，再经 FieldTypeRegistry.registerScoped 注册。
 */

const productImageTextAdapter = {
  urlPattern: '/product/input/productImageText',

  /** 页面激活时注册专属字段（当前仍由适配器自身处理，留空） */
  activate() {
    // 如未来把 recommendReason/richText 抽为 scoped handler：
    // FieldTypeRegistry.registerScoped('recommendReason', handler)
  },

  deactivate() {
    // 当前无需额外清理
  },

  /**
   * 提取表单数据
   * @returns {object}
   */
  extract() {
    console.log('[PageAdapter] 使用 productImageText 适配器');

    const result = {
      version: '1.0',
      source: PageDetector.detect() === 'domestic' ? 'domestic' : 'international',
      tab: 'productImageText',
      timestamp: new Date().toISOString(),
      data: {}
    };

    // 提取推荐理由
    const recommendData = this._extractRecommendReasons();
    if (Object.keys(recommendData).length > 0) {
      result.data['推荐理由'] = recommendData;
    }

    // 提取产品特色（富文本）
    const featureData = this._extractProductFeature();
    if (Object.keys(featureData).length > 0) {
      result.data['产品特色'] = featureData;
    }

    return result;
  },

  /**
   * 提取字段映射（用于导入匹配）
   */
  extractFieldMap() {
    console.log('[PageAdapter] 提取字段映射（productImageText）');
    const result = {};

    const recommendMap = this._extractRecommendReasonsFieldMap();
    if (Object.keys(recommendMap).length > 0) {
      result['推荐理由'] = recommendMap;
    }

    const featureMap = this._extractProductFeatureFieldMap();
    if (Object.keys(featureMap).length > 0) {
      result['产品特色'] = featureMap;
    }

    console.log('[PageAdapter] 字段映射提取完成:', result);
    return result;
  },

  /**
   * 提取推荐理由
   */
  _extractRecommendReasons() {
    console.log('[PageAdapter] 开始提取推荐理由');
    const data = {};
    const container = document.querySelector('#pm_recommend');

    if (!container) {
      console.warn('[PageAdapter] 未找到 #pm_recommend 容器');
      return data;
    }

    console.log('[PageAdapter] 找到推荐理由容器:', container);

    // 查找所有推荐理由行
    const formItems = container.querySelectorAll('.ant-form-item');
    console.log('[PageAdapter] 找到表单项数量:', formItems.length);

    formItems.forEach((item, index) => {
      const label = item.querySelector('.ant-form-item-label label');
      if (!label) return;

      const labelText = label.textContent.trim();
      const fieldKey = `推荐理由_${index}`;

      // 提取分类下拉框
      const categorySelect = item.querySelector('.ant-select');
      let categoryValue = '';
      let categoryText = '';
      if (categorySelect) {
        const selectedItem = categorySelect.querySelector('.ant-select-selection-item');
        categoryText = selectedItem ? selectedItem.textContent.trim() : '';
        const input = categorySelect.querySelector('input[id*="pmRcmdCategoryId"]');
        categoryValue = input ? input.id : '';
      }

      // 提取文本域
      const textarea = item.querySelector('textarea[id*="rcmdDesc"]');
      const textValue = textarea ? textarea.value : '';
      const textDomKey = textarea ? textarea.id : '';

      console.log(`[PageAdapter] 字段 ${index}:`, {
        labelText,
        categoryText,
        textValue: textValue.substring(0, 50) + '...'
      });

      if (textValue || categoryText) {
        // 使用 PatternMatch.parseId() 解析 ID 模式信息
        const categoryParsed = PatternMatch.parseId(categoryValue);
        const descriptionParsed = PatternMatch.parseId(textDomKey);

        // 构建 matchData，供导入时 FieldMatcher 使用
        const matchData = {
          // 精确匹配：直接通过 DOM ID 查找
          exact: {
            categoryDomKey: categoryValue,
            descriptionDomKey: textDomKey
          },
          // 模式匹配：通过 ID 命名模式跨版本匹配
          pattern: {
            category: categoryParsed ? {
              baseName: categoryParsed.baseName,
              index: categoryParsed.index,
              suffix: categoryParsed.suffix,
              regionIndex: categoryParsed.regionIndex
            } : null,
            description: descriptionParsed ? {
              baseName: descriptionParsed.baseName,
              index: descriptionParsed.index,
              suffix: descriptionParsed.suffix,
              regionIndex: descriptionParsed.regionIndex
            } : null
          },
          // 语义匹配：通过容器+标签+索引兜底匹配
          semantic: {
            container: '#pm_recommend',
            label: labelText,
            index: index,
            categorySelector: '.ant-select',
            descriptionSelector: 'textarea[id*="rcmdDesc"]'
          }
        };

        data[fieldKey] = {
          label: labelText,
          category: {
            domKey: categoryValue,
            text: categoryText,
            fieldType: 'select'
          },
          description: {
            domKey: textDomKey,
            value: textValue,
            fieldType: 'textarea'
          },
          fieldType: 'recommendReason',
          matchData: matchData
        };
      }
    });

    console.log('[PageAdapter] 推荐理由提取完成，字段数:', Object.keys(data).length);
    return data;
  },

  /**
   * 提取产品特色（UEditor 富文本）
   */
  _extractProductFeature() {
    console.log('[PageAdapter] 开始提取产品特色');
    const data = {};

    // 查找 UEditor iframe
    const editorIframe = document.querySelector('#ueditor_0');
    if (!editorIframe) {
      console.warn('[PageAdapter] 未找到 UEditor iframe #ueditor_0');
      return data;
    }

    console.log('[PageAdapter] 找到 UEditor iframe');

    try {
      const iframeDoc = editorIframe.contentDocument || editorIframe.contentWindow.document;
      const bodyContent = iframeDoc.body;

      if (bodyContent) {
        // 提取 HTML 内容
        const htmlContent = bodyContent.innerHTML;
        // 提取纯文本
        const textContent = bodyContent.innerText || bodyContent.textContent;

        console.log('[PageAdapter] 产品特色内容长度:', htmlContent.length, '字符');

        data['产品特色'] = {
          label: '产品特色',
          domKey: 'ueditor_0',
          value: htmlContent,
          textValue: textContent,
          fieldType: 'richText'
        };
      } else {
        console.warn('[PageAdapter] iframe body 为空');
      }
    } catch (e) {
      console.error('[PageAdapter] 提取 UEditor 内容失败:', e);
    }

    console.log('[PageAdapter] 产品特色提取完成');
    return data;
  },

  /**
   * matched 列表字段名，用于匹配预览
   */
  _extractRecommendReasonsFieldMap() {
    const data = {};
    const container = document.querySelector('#pm_recommend');
    if (!container) return data;

    const formItems = container.querySelectorAll('.ant-form-item');
    let recommendIndex = 0;

    formItems.forEach(item => {
      const label = item.querySelector('.ant-form-item-label label');
      if (!label) return;

      const labelText = label.getAttribute('title') || label.textContent.trim();
      const textarea = item.querySelector('textarea[id*="rcmdDesc"]');
      const categoryInput = item.querySelector('input[id*="pmRcmdCategoryId"]');

      // 只统计真正的推荐理由行；不要让隐藏的区域选择等表单项影响索引
      if (labelText !== '推荐理由' || (!textarea && !categoryInput)) return;

      const fieldKey = `推荐理由_${recommendIndex}`;
      recommendIndex++;

      // 获取当前值：兼容有值和空 placeholder 的 select
      const textValue = textarea ? textarea.value : '';
      const categorySelect = item.querySelector('.ant-select .ant-select-selection-item, .ant-select .ant-select-selection-placeholder');
      const categoryText = categorySelect ? categorySelect.textContent.trim() : '';

      data[fieldKey] = {
        // 使用 textarea 或 category input 的 ID 作为页面定位锚点，供匹配预览叠加标签使用
        domKey: textarea ? textarea.id : (categoryInput ? categoryInput.id : ''),
        label: labelText,
        fieldType: 'recommendReason',
        currentValue: `${categoryText}: ${textValue.substring(0, 50)}${textValue.length > 50 ? '...' : ''}`
      };
    });

    return data;
  },

  /**
   * 提取产品特色字段映射（用于导入匹配）
   */
  _extractProductFeatureFieldMap() {
    const data = {};

    const editorIframe = document.querySelector('#ueditor_0');
    if (!editorIframe) return data;

    // 只要富文本 iframe 存在，就应进入匹配预览。
    // iframe 内容读取失败只影响 currentValue 展示，不代表页面没有可填写目标；
    // 实际填写还会通过 page-ue-bridge.js 调用主世界 UEditor API。
    let textContent = '';
    try {
      const iframeDoc = editorIframe.contentDocument || editorIframe.contentWindow.document;
      const bodyContent = iframeDoc.body;
      if (bodyContent) {
        textContent = bodyContent.innerText || bodyContent.textContent || '';
      }
    } catch (e) {
      console.warn('[PageAdapter] 读取产品特色当前值失败，仅跳过 currentValue 展示:', e);
    }

    data['产品特色'] = {
      domKey: 'ueditor_0',
      label: '产品特色',
      fieldType: 'richText',
      currentValue: textContent.substring(0, 100) + (textContent.length > 100 ? '...' : '')
    };

    return data;
  }
};

// 自注册（脚本加载即注册，依赖 manifest 顺序保证 PageRegistry 先加载）
PageRegistry.register(productImageTextAdapter);
