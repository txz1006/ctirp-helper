/**
 * ID 模式匹配策略 - 通过 ID 命名模式跨版本匹配
 * 优先级：90
 * 适用场景：跨版本导入（国内版 ↔ 国际版）
 */
const PatternMatch = {
  name: 'patternMatch',
  priority: 90,

  /**
   * ID 命名模式库
   * 按优先级排列，从最常见到最不常见
   */
  patterns: [
    // 国内版：{baseName}_{index}_{suffix}
    {
      name: 'domestic',
      template: '{baseName}_{index}_{suffix}',

      /**
       * 构建国内版 ID
       * @param {string} baseName - 基础名称（如 pmRcmdItems）
       * @param {number} index - 索引
       * @param {string} suffix - 后缀（如 pmRcmdCategoryId）
       * @param {number} regionIndex - 区域索引（国内版忽略）
       * @returns {string} 完整 ID
       */
      build: (baseName, index, suffix, regionIndex = 0) => {
        return `${baseName}_${index}_${suffix}`;
      },

      /**
       * 从国内版 ID 解析组成部分
       * @param {string} id - DOM ID
       * @returns {object|null} {baseName, index, suffix, regionIndex: 0}
       */
      parse: (id) => {
        // 匹配格式：pmRcmdItems_0_pmRcmdCategoryId
        const match = id.match(/^([a-zA-Z]+)_(\d+)_([a-zA-Z]+)$/);
        if (match) {
          return {
            baseName: match[1],
            index: parseInt(match[2], 10),
            suffix: match[3],
            regionIndex: 0
          };
        }
        return null;
      }
    },

    // 国际版通用：{baseName.replace('Items', 'RegionGroups')}_0_items_{index}_{suffix}
    {
      name: 'international-default',
      template: '{regionBase}_0_items_{index}_{suffix}',

      /**
       * 构建国际版默认区域 ID
       * @param {string} baseName - 基础名称（如 pmRcmdItems）
       * @param {number} index - 索引
       * @param {string} suffix - 后缀
       * @param {number} regionIndex - 区域索引（默认0）
       * @returns {string} 完整 ID
       */
      build: (baseName, index, suffix, regionIndex = 0) => {
        const regionBase = baseName.replace(/Items$/, 'RegionGroups');
        return `${regionBase}_0_items_${index}_${suffix}`;
      },

      /**
       * 从国际版默认区域 ID 解析组成部分
       * @param {string} id - DOM ID
       * @returns {object|null} {baseName, index, suffix, regionIndex: 0}
       */
      parse: (id) => {
        // 匹配格式：pmRcmdRegionGroups_0_items_2_pmRcmdCategoryId
        const match = id.match(/^([a-zA-Z]+)_0_items_(\d+)_([a-zA-Z]+)$/);
        if (match) {
          const regionBase = match[1];
          // 只处理以 RegionGroups 结尾的情况
          if (!regionBase.endsWith('RegionGroups')) {
            return null;
          }
          const baseName = regionBase.replace(/RegionGroups$/, 'Items');
          return {
            baseName: baseName,
            index: parseInt(match[2], 10),
            suffix: match[3],
            regionIndex: 0
          };
        }
        return null;
      }
    },

    // 国际版其他区域：{baseName.replace('Items', 'RegionGroups')}_{regionIndex}_items_{index}_{suffix}
    {
      name: 'international-region',
      template: '{regionBase}_{regionIndex}_items_{index}_{suffix}',

      /**
       * 构建国际版指定区域 ID
       * @param {string} baseName - 基础名称（如 pmRcmdItems）
       * @param {number} index - 索引
       * @param {string} suffix - 后缀
       * @param {number} regionIndex - 区域索引（1-9）
       * @returns {string} 完整 ID
       */
      build: (baseName, index, suffix, regionIndex = 1) => {
        const regionBase = baseName.replace(/Items$/, 'RegionGroups');
        return `${regionBase}_${regionIndex}_items_${index}_${suffix}`;
      },

      /**
       * 从国际版指定区域 ID 解析组成部分
       * @param {string} id - DOM ID
       * @returns {object|null} {baseName, index, suffix, regionIndex}
       */
      parse: (id) => {
        // 匹配格式：pmRcmdRegionGroups_3_items_5_rcmdDesc
        const match = id.match(/^([a-zA-Z]+)_(\d+)_items_(\d+)_([a-zA-Z]+)$/);
        if (match) {
          const regionBase = match[1];
          // 只处理以 RegionGroups 结尾的情况
          if (!regionBase.endsWith('RegionGroups')) {
            return null;
          }
          const baseName = regionBase.replace(/RegionGroups$/, 'Items');
          const regionIndex = parseInt(match[2], 10);

          // 排除 regionIndex=0 的情况（由 international-default 处理）
          if (regionIndex === 0) {
            return null;
          }

          return {
            baseName: baseName,
            index: parseInt(match[3], 10),
            suffix: match[4],
            regionIndex: regionIndex
          };
        }
        return null;
      }
    }
  ],

  /**
   * 尝试通过 ID 模式匹配元素
   * @param {object} fieldData - 包含 matchData.pattern: {baseName, index, suffix, regionIndex?}
   * @returns {HTMLElement|null}
   */
  match(fieldData) {
    try {
      // 验证输入
      if (!fieldData?.matchData?.pattern) {
        return null;
      }

      const { baseName, index, suffix, regionIndex } = fieldData.matchData.pattern;

      if (!baseName || index === undefined || !suffix) {
        console.warn('[PatternMatch] 缺少必需字段: baseName/index/suffix');
        return null;
      }

      // 策略1：优先使用 fieldData 中提供的 regionIndex
      if (regionIndex !== undefined && regionIndex !== null) {
        // 直接使用指定的 regionIndex 构建 ID
        for (const pattern of this.patterns) {
          const candidateId = pattern.build(baseName, index, suffix, regionIndex);
          const element = document.getElementById(candidateId);

          if (element) {
            console.log(`[PatternMatch] ✓ 匹配成功（使用指定 regionIndex=${regionIndex}）: ${pattern.name} → ${candidateId}`);
            return element;
          }
        }

        console.log(`[PatternMatch] 使用指定 regionIndex=${regionIndex} 未找到元素，继续尝试其他模式...`);
      }

      // 策略2：按优先级尝试各种模式（不传 regionIndex，使用默认值）
      for (const pattern of this.patterns) {
        const candidateId = pattern.build(baseName, index, suffix);
        const element = document.getElementById(candidateId);

        if (element) {
          console.log(`[PatternMatch] ✓ 匹配成功: ${pattern.name} → ${candidateId}`);
          return element;
        }
      }

      // 策略3：循环尝试所有区域索引（1-9）
      const regionPattern = this.patterns.find(p => p.name === 'international-region');
      if (regionPattern) {
        for (let ri = 1; ri < 10; ri++) {
          const candidateId = regionPattern.build(baseName, index, suffix, ri);
          const element = document.getElementById(candidateId);

          if (element) {
            console.log(`[PatternMatch] ✓ 匹配成功（循环区域索引）: region-${ri} → ${candidateId}`);
            return element;
          }
        }
      }

      console.log(`[PatternMatch] ✗ 所有模式均未匹配: ${baseName}_*_${suffix}`);
      return null;

    } catch (err) {
      // 捕获异常，防止向外传播
      console.error(`[PatternMatch] 异常:`, err);
      return null;
    }
  },

  /**
   * 从 ID 字符串解析模式信息（供导出时使用）
   * 作为单一真相源，供 page-adapters.js 复用
   *
   * @param {string} id - DOM ID
   * @returns {object|null} {baseName, index, suffix, regionIndex}
   */
  parseId(id) {
    try {
      if (!id || typeof id !== 'string') {
        return null;
      }

      // 按优先级尝试各种模式的解析器
      for (const pattern of this.patterns) {
        const result = pattern.parse(id);
        if (result) {
          return result;
        }
      }

      // 所有模式都不匹配
      return null;

    } catch (err) {
      console.error(`[PatternMatch] parseId 异常:`, err);
      return null;
    }
  }
};

// 导出供其他模块使用
if (typeof window !== 'undefined') {
  window.PatternMatch = PatternMatch;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PatternMatch;
}

// 自注册到 FieldMatcher（如果存在）
if (typeof window !== 'undefined') {
  const autoRegister = () => {
    if (window.FieldMatcher && typeof window.FieldMatcher.registerStrategy === 'function') {
      window.FieldMatcher.registerStrategy(PatternMatch);
      console.log('[PatternMatch] 已自动注册到 FieldMatcher');
    }
  };

  // 延迟注册，等待 FieldMatcher 加载
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoRegister);
  } else {
    // DOM 已加载，延迟执行等待其他模块
    setTimeout(autoRegister, 100);
  }
}
