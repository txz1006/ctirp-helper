/**
 * baseInfoMerge 页面适配器（产品基础信息）
 * 原逻辑来自 page-adapters.js baseInfoMergeAdapter，原样搬入，仅改为 PageRegistry.register 自注册。
 *
 * 机制 α：urlPattern 匹配后由 PageRegistry.activate() 激活。
 * 版本判断（§5.3 Issue 5）：本适配器同时承担国内提取与国际填充，
 * 内部用 PageDetector.detect() 区分版本走不同分支（当前 extract 逻辑版本无关）。
 */

const baseInfoMergeAdapter = {
  urlPattern: '/ivbk/vendor/baseInfoMerge',

  /** 页面激活时注册专属字段（当前无专属字段，留空） */
  activate() {
    // 如未来出现 baseInfoMerge 专属字段类型：
    // FieldTypeRegistry.registerScoped('xxx', handler)
  },

  /** 清理由 activate 注册的资源（_pageScoped 由 PageRegistry.deactivate 统一清理） */
  deactivate() {
    // 当前无需额外清理
  },

  /**
   * 提取表单数据
   * @returns {object} { version, source, tab, timestamp, data }
   */
  extract() {
    const result = {
      version: '1.0',
      source: PageDetector.detect() === 'domestic' ? 'domestic' : 'international',
      tab: this._detectCurrentTab(),
      timestamp: new Date().toISOString(),
      data: {}
    };

    // 按 content-card 分组提取
    const cards = document.querySelectorAll('.content-card');
    cards.forEach(card => {
      const titleEl = card.querySelector('.content-cardtitle-text');
      const groupName = titleEl ? titleEl.textContent.trim() : '未命名分组';
      const bodyEl = card.querySelector('.content-cardbody');
      if (!bodyEl) return;

      const groupData = FormExtractor._extractGroup(bodyEl);
      if (Object.keys(groupData).length > 0) {
        result.data[groupName] = groupData;
      }
    });

    return result;
  },

  _detectCurrentTab() {
    const activeTab = document.querySelector('.ant-tabs-tab-active');
    return activeTab ? activeTab.textContent.trim() : 'default';
  }
};

// 自注册（脚本加载即注册，依赖 manifest 顺序保证 PageRegistry 先加载）
PageRegistry.register(baseInfoMergeAdapter);
