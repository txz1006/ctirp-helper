/**
 * PageRegistry — 页面适配器注册表 + 机制 α（D5）
 *
 * 机制 α：URL 激活，单页面单适配器。任何时刻只有一个页面的专属字段在
 * FieldTypeRegistry._pageScoped 表里 → 物理保证隔离，新页面不可能影响老页面。
 *
 * 三触发点（§5.3 Issue 3）：
 *   1. main.js 初始化
 *   2. 导出/导入按钮点击前
 *   3. SPA URL 变化（main.js MutationObserver 扩展，见 TODOS.md）
 *
 * 适配器契约：{ urlPattern, activate(), deactivate(), extract(), extractFieldMap() }
 * 适配器与版本关系（§5.3 Issue 5）：PageRegistry 只按 URL 选适配器，
 * 适配器内部用 PageDetector.detect() 判版本走不同分支。
 */

const PageRegistry = {
  _adapters: [],
  _active: null,

  /**
   * 注册适配器（脚本加载即注册，依赖 manifest 顺序保证本文件先于适配器加载）
   * @param {object} adapter - { urlPattern, activate, deactivate, extract, extractFieldMap }
   */
  register(adapter) {
    this._adapters.push(adapter);
  },

  /**
   * 按 URL 选适配器（替代原 PageAdapters.detectAdapter）
   * @param {string} [url] - 默认 location.href
   * @returns {object|null}
   */
  detect(url) {
    const target = url || (typeof location !== 'undefined' ? location.href : '');
    return this._adapters.find(a => target.includes(a.urlPattern)) || null;
  },

  /**
   * 激活当前 URL 命中的适配器（状态机 registered→active）
   * 幂等：命中当前已激活适配器则直接返回，不重复激活/卸载。
   * @param {string} [url]
   * @returns {object|null} 激活的适配器，无命中返回 null
   */
  activate(url) {
    const adapter = this.detect(url);
    if (!adapter) return null;
    if (this._active === adapter) return adapter;

    // 先卸载上一个（active→inactive），保证任一时刻只有一个激活
    this.deactivate();

    // 激活新适配器：注册其专属字段到 FieldTypeRegistry._pageScoped
    if (typeof adapter.activate === 'function') {
      adapter.activate();
    }
    this._active = adapter;
    return adapter;
  },

  /**
   * 卸载当前激活适配器（active→inactive）
   * 清空页面专属字段，由 FieldTypeRegistry.clearScoped 统一清理。
   */
  deactivate() {
    if (!this._active) return;
    if (typeof this._active.deactivate === 'function') {
      this._active.deactivate();
    }
    FieldTypeRegistry.clearScoped();
    this._active = null;
  }
};

if (typeof window !== 'undefined') { window.PageRegistry = PageRegistry; }
if (typeof module !== 'undefined' && module.exports) { module.exports = PageRegistry; }
