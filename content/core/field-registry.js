/**
 * FieldTypeRegistry — 字段类型增量通道（D3）
 *
 * 老的 15 种字段类型仍走 form-filler 的 switch / form-extractor 的识别逻辑（冻结，不再加 case/分支）。
 * 新字段类型通过 registerGlobal/registerScoped 注册，由 form-filler._fillField 与
 * form-extractor._extractFormItem 在老逻辑之前查询（绞杀法增量通道，§5.1/§5.2/§5.7）。
 *
 * 语义 B（D4）：registerScoped 禁止与全局同名，避免页面专属字段隐式污染全局表。
 */

const FieldTypeRegistry = {
  _global: new Map(),       // 通用字段处理器（跨页面）
  _pageScoped: new Map(),   // 当前激活页面的专属字段处理器（机制α 保证唯一）

  /**
   * 注册通用字段处理器（新类型入口）
   * 老的 15 种类型不注册，仍走 form-filler 的 switch。
   * @param {string} type
   * @param {object} handler - FieldHandler 契约见 ARCHITECTURE_REFACTOR.md §5.1
   */
  registerGlobal(type, handler) {
    if (this._global.has(type)) {
      throw new Error(`字段类型已注册: ${type}`);
    }
    this._global.set(type, handler);
  },

  /**
   * 注册页面专属字段处理器
   * 语义 B：禁止与全局同名，杜绝隐式污染。
   * 仅当前激活页面的 scoped handler 会在表里（机制α 隔离保证）。
   * @param {string} type
   * @param {object} handler
   */
  registerScoped(type, handler) {
    if (this._global.has(type)) {
      throw new Error(`页面专属字段 "${type}" 与全局字段同名，请改用全局不存在的新名（语义B）`);
    }
    this._pageScoped.set(type, handler);
  },

  /**
   * 解析某类型的 handler（scoped 优先于 global）
   * @param {string} type
   * @returns {object|null}
   */
  resolve(type) {
    return this._pageScoped.get(type) || this._global.get(type) || null;
  },

  /**
   * 供 _extractFormItem 遍历所有已注册 handler 调 detect（§5.7 Issue 7）
   * 顺序：scoped（当前页面专属）在前，global 在后。
   * @returns {object[]}
   */
  handlers() {
    return [...this._pageScoped.values(), ...this._global.values()];
  },

  /**
   * 清空当前页面专属 handler（由 PageRegistry.deactivate 统一调用，机制α）
   */
  clearScoped() {
    this._pageScoped.clear();
  }
};

if (typeof window !== 'undefined') { window.FieldTypeRegistry = FieldTypeRegistry; }
if (typeof module !== 'undefined' && module.exports) { module.exports = FieldTypeRegistry; }
