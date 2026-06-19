/**
 * 精确匹配策略 - 通过 domKey (DOM ID) 直接查找元素
 * 优先级：100（最高）
 * 适用场景：同版本内的导入（ID 未变化）
 */
const ExactMatch = {
  name: 'exactMatch',
  priority: 100,

  /**
   * 尝试通过精确的 domKey 匹配元素
   * @param {object} fieldData - 字段数据，包含 matchData.exact.domKey
   * @returns {HTMLElement|null} 匹配的 DOM 元素，失败返回 null
   */
  match(fieldData) {
    try {
      // Validate input
      if (!fieldData?.matchData?.exact?.domKey) {
        return null;
      }

      const domKey = fieldData.matchData.exact.domKey;

      // 尝试直接通过 ID 查找
      const element = document.getElementById(domKey);

      if (element) {
        console.log(`[ExactMatch] ✓ 找到元素: ${domKey}`);
        return element;
      }

      console.log(`[ExactMatch] ✗ 未找到元素: ${domKey}`);
      return null;
    } catch (err) {
      // 捕获异常，防止向外传播
      console.error(`[ExactMatch] 异常:`, err);
      return null;
    }
  }
};

// 导出供其他模块使用
if (typeof window !== 'undefined') {
  window.ExactMatch = ExactMatch;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExactMatch;
}

// 自注册到 FieldMatcher（如果存在）
if (typeof window !== 'undefined' && window.FieldMatcher) {
  window.FieldMatcher.registerStrategy(ExactMatch);
  console.log('[ExactMatch] 已自动注册到 FieldMatcher');
}
