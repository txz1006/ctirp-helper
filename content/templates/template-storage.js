/**
 * Template Storage Module
 *
 * 负责模版数据的持久化存储（基于 chrome.storage.local）
 * 不包含业务逻辑，只负责 CRUD 操作
 */

const TemplateStorage = {
  STORAGE_KEY: 'ctrip_templates',
  MAX_TEMPLATES: 25,

  /**
   * 获取所有模版
   * @returns {Promise<Array>} 模版数组
   */
  async getAll() {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      return result[this.STORAGE_KEY] || [];
    } catch (error) {
      console.error('[TemplateStorage] 获取模版失败:', error);
      throw new Error('获取模版失败，请稍后重试');
    }
  },

  /**
   * 获取单个模版
   * @param {string} id - 模版 ID
   * @returns {Promise<Object|null>} 模版对象，不存在时返回 null
   */
  async get(id) {
    const templates = await this.getAll();
    return templates.find(t => t.id === id) || null;
  },

  /**
   * 保存模版（新增或更新）
   * @param {Object} template - 模版对象
   * @returns {Promise<void>}
   * @throws {Error} 达到数量限制或名称重复时抛出错误
   */
  async save(template) {
    const templates = await this.getAll();

    // 检查是否是更新操作
    const existingIndex = templates.findIndex(t => t.id === template.id);
    const isUpdate = existingIndex >= 0;

    // 新增时检查数量限制
    if (!isUpdate && templates.length >= this.MAX_TEMPLATES) {
      throw new Error(`最多只能保存 ${this.MAX_TEMPLATES} 个模版，请删除一些旧模版后重试`);
    }

    // 检查名称重复（排除自己）
    const duplicateName = templates.some(t =>
      t.name === template.name && t.id !== template.id
    );
    if (duplicateName) {
      throw new Error('模版名称已存在，请使用不同的名称');
    }

    // 验证模版结构
    this._validateTemplate(template);

    // 保存或更新
    if (isUpdate) {
      templates[existingIndex] = template;
      console.log('[TemplateStorage] 更新模版:', template.id, template.name);
    } else {
      templates.push(template);
      console.log('[TemplateStorage] 新增模版:', template.id, template.name);
    }

    try {
      await chrome.storage.local.set({
        [this.STORAGE_KEY]: templates
      });
    } catch (error) {
      console.error('[TemplateStorage] 保存失败:', error);
      throw new Error('保存失败，请稍后重试');
    }
  },

  /**
   * 删除模版
   * @param {string} id - 模版 ID
   * @returns {Promise<void>}
   */
  async delete(id) {
    const templates = await this.getAll();
    const filtered = templates.filter(t => t.id !== id);

    if (filtered.length === templates.length) {
      console.warn('[TemplateStorage] 模版不存在:', id);
      return; // 不抛错，幂等操作
    }

    try {
      await chrome.storage.local.set({
        [this.STORAGE_KEY]: filtered
      });
      console.log('[TemplateStorage] 删除模版:', id);
    } catch (error) {
      console.error('[TemplateStorage] 删除失败:', error);
      throw new Error('删除失败，请稍后重试');
    }
  },

  /**
   * 按更新时间倒序排列模版
   * @param {Array} templates - 模版数组
   * @returns {Array} 排序后的数组（不修改原数组）
   */
  sortByUpdatedAt(templates) {
    return [...templates].sort((a, b) =>
      new Date(b.updatedAt) - new Date(a.updatedAt)
    );
  },

  /**
   * 验证模版对象结构
   * @private
   * @param {Object} template - 待验证的模版对象
   * @throws {Error} 验证失败时抛出错误
   */
  _validateTemplate(template) {
    const required = ['id', 'name', 'pageType', 'data', 'createdAt', 'updatedAt'];
    const missing = required.filter(field => !template[field]);

    if (missing.length > 0) {
      throw new Error(`模版缺少必填字段: ${missing.join(', ')}`);
    }

    if (template.name.length > 50) {
      throw new Error('模版名称长度不能超过 50 个字符');
    }

    if (template.description && template.description.length > 200) {
      throw new Error('模版描述长度不能超过 200 个字符');
    }

    // 验证时间戳格式（ISO 8601）
    if (isNaN(new Date(template.createdAt).getTime())) {
      throw new Error('createdAt 时间格式无效');
    }
    if (isNaN(new Date(template.updatedAt).getTime())) {
      throw new Error('updatedAt 时间格式无效');
    }
  }
};

// 暴露到全局
window.TemplateStorage = TemplateStorage;
