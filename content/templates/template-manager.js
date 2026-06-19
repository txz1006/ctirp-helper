/**
 * Template Manager Module
 *
 * 模版业务逻辑层，负责模版的创建、应用、更新、删除等高级操作
 * 依赖：TemplateStorage（存储层）、FormExtractor（表单提取）
 */

const TemplateManager = {
  /**
   * 从当前页面创建模版
   * @param {string} name - 模版名称
   * @param {string} description - 模版描述（可选）
   * @returns {Promise<Object>} 创建的模版对象
   */
  async createFromCurrentPage(name, description = '') {
    // 检查依赖
    if (!window.FormExtractor) {
      throw new Error('FormExtractor 模块未加载');
    }

    // 提取表单数据
    let data;
    try {
      data = FormExtractor.extract();
    } catch (error) {
      console.error('[TemplateManager] 提取表单数据失败:', error);
      throw new Error('提取表单数据失败，请确保页面已加载完成');
    }

    // 检测页面类型
    const pageType = this._detectPageType();

    // 构建模版对象
    const template = {
      id: `tpl_${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      pageType,
      data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 保存到存储
    await TemplateStorage.save(template);

    console.log('[TemplateManager] 创建模版成功:', template.id, template.name);
    return template;
  },

  /**
   * 生成默认模版名称
   * @returns {Promise<string>} 默认名称（如 "产品模版 1"）
   */
  async generateDefaultName() {
    const templates = await TemplateStorage.getAll();
    const count = templates.length;
    return `产品模版 ${count + 1}`;
  },

  /**
   * 应用模版
   * @param {string} templateId - 模版 ID
   * @returns {Promise<Object|null>} 模版数据对象，用户取消时返回 null
   */
  async applyTemplate(templateId) {
    // 获取模版
    const template = await TemplateStorage.get(templateId);
    if (!template) {
      throw new Error('模版不存在，可能已被删除');
    }

    // 检查页面兼容性
    const currentPageType = this._detectPageType();
    if (template.pageType !== currentPageType) {
      const pageTypeNames = {
        'product-detail': '产品详情页',
        'unknown': '未知页面'
      };

      const templatePageName = pageTypeNames[template.pageType] || template.pageType;
      const currentPageName = pageTypeNames[currentPageType] || currentPageType;

      const confirmed = confirm(
        `⚠️ 页面类型不匹配\n\n` +
        `模版创建于：${templatePageName}\n` +
        `当前页面是：${currentPageName}\n\n` +
        `可能存在字段不匹配，是否继续？`
      );

      if (!confirmed) {
        console.log('[TemplateManager] 用户取消应用模版');
        return null;
      }
    }

    console.log('[TemplateManager] 应用模版:', template.id, template.name);
    return template.data;
  },

  /**
   * 更新模版元数据（只能修改名称和描述）
   * @param {string} id - 模版 ID
   * @param {string} name - 新名称
   * @param {string} description - 新描述
   * @returns {Promise<Object>} 更新后的模版对象
   */
  async updateMetadata(id, name, description) {
    const template = await TemplateStorage.get(id);
    if (!template) {
      throw new Error('模版不存在，可能已被删除');
    }

    // 只更新元数据，保留原有数据和创建时间
    template.name = name.trim();
    template.description = description.trim();
    template.updatedAt = new Date().toISOString();

    await TemplateStorage.save(template);

    console.log('[TemplateManager] 更新模版元数据:', id, name);
    return template;
  },

  /**
   * 删除模版（带确认）
   * @param {string} id - 模版 ID
   * @returns {Promise<boolean>} 是否删除成功（用户取消时返回 false）
   */
  async deleteTemplate(id) {
    const template = await TemplateStorage.get(id);
    if (!template) {
      throw new Error('模版不存在，可能已被删除');
    }

    // 确认删除
    const confirmed = confirm(
      `🗑️ 确认删除\n\n` +
      `模版名称：${template.name}\n` +
      `${template.description ? '描述：' + template.description + '\n' : ''}` +
      `\n此操作不可撤销，确定要删除吗？`
    );

    if (!confirmed) {
      console.log('[TemplateManager] 用户取消删除');
      return false;
    }

    await TemplateStorage.delete(id);

    console.log('[TemplateManager] 删除模版:', id, template.name);
    return true;
  },

  /**
   * 获取所有模版（按更新时间倒序）
   * @returns {Promise<Array>} 排序后的模版数组
   */
  async getAllSorted() {
    const templates = await TemplateStorage.getAll();
    return TemplateStorage.sortByUpdatedAt(templates);
  },

  /**
   * 统计模版中的字段数量
   * @param {Object} template - 模版对象
   * @returns {number} 字段总数
   */
  countFields(template) {
    if (!template || !template.data || !template.data.data) {
      return 0;
    }

    let count = 0;
    const groups = template.data.data;

    for (const groupName in groups) {
      const fields = groups[groupName];
      count += Object.keys(fields).length;
    }

    return count;
  },

  /**
   * 检测当前页面类型
   * @private
   * @returns {string} 页面类型标识
   */
  _detectPageType() {
    const url = window.location.href;

    if (url.includes('/vendor/baseInfoMerge')) {
      return 'product-detail';
    }

    // 将来扩展其他页面类型
    // if (url.includes('/supplier')) return 'supplier-info';

    return 'unknown';
  }
};

// 暴露到全局
window.TemplateManager = TemplateManager;
