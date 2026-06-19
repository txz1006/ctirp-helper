/**
 * 语义匹配策略 - 通过容器、标签、索引和相对选择器匹配
 * 优先级：50
 * 适用场景：DOM 结构变化但语义不变时的兜底方案
 *
 * 关键特性：
 * - 支持模糊匹配：精确匹配 > 包含匹配 > 前缀匹配 > 编辑距离匹配
 * - 内部异常处理：所有错误捕获并返回 null
 * - 自注册到 FieldMatcher
 */
const SemanticMatch = {
  name: 'semanticMatch',
  priority: 50,

  /**
   * 通过语义信息匹配元素
   * @param {object} fieldData - 包含 matchData.semantic
   * @returns {HTMLElement|null}
   */
  match(fieldData) {
    try {
      // 验证输入
      if (!fieldData?.matchData?.semantic) {
        return null;
      }

      const { container, label, index, relativeSelector } = fieldData.matchData.semantic;

      if (!container || !label || index === undefined || !relativeSelector) {
        console.warn('[SemanticMatch] 缺少必需字段');
        return null;
      }

      // 1. 定位容器
      const containerEl = document.querySelector(container);
      if (!containerEl) {
        console.log(`[SemanticMatch] ✗ 容器未找到: ${container}`);
        return null;
      }

      // 2. 在容器内查找所有匹配 label 的 form-item（支持模糊匹配）
      const formItems = this._findFormItemsByLabel(containerEl, label);

      if (formItems.length === 0) {
        console.log(`[SemanticMatch] ✗ 未找到 label="${label}" 的表单项`);
        return null;
      }

      // 3. 选择第 N 个（按索引）
      const targetItem = formItems[index];
      if (!targetItem) {
        console.log(`[SemanticMatch] ✗ 索引超出范围: ${index}/${formItems.length}`);
        return null;
      }

      // 4. 在该 form-item 内用相对选择器查找目标元素
      const element = targetItem.querySelector(relativeSelector);

      if (element) {
        console.log(`[SemanticMatch] ✓ 匹配成功: ${container} > ${label}[${index}] > ${relativeSelector}`);
        return element;
      }

      console.log(`[SemanticMatch] ✗ 相对选择器未匹配: ${relativeSelector}`);
      return null;

    } catch (err) {
      // 捕获异常，防止向外传播
      console.error(`[SemanticMatch] 异常:`, err);
      return null;
    }
  },

  /**
   * 在容器内查找所有匹配指定 label 的 form-item
   * 支持模糊匹配，优先级：精确 > 包含 > 前缀 > 编辑距离
   *
   * @param {HTMLElement} container
   * @param {string} labelText
   * @returns {HTMLElement[]} form-item 元素数组
   */
  _findFormItemsByLabel(container, labelText) {
    const exactMatches = [];    // 精确匹配
    const containsMatches = [];  // 包含匹配
    const prefixMatches = [];    // 前缀匹配
    const editDistanceMatches = []; // 编辑距离匹配

    const allFormItems = container.querySelectorAll('.ant-form-item');

    allFormItems.forEach(item => {
      const label = item.querySelector('label[title]');
      if (!label) {
        return;
      }

      const actualLabelText = label.getAttribute('title');
      const matchResult = this._fuzzyMatchLabel(labelText, actualLabelText);

      if (matchResult.type === 'exact') {
        exactMatches.push(item);
      } else if (matchResult.type === 'contains') {
        containsMatches.push(item);
      } else if (matchResult.type === 'prefix') {
        prefixMatches.push(item);
      } else if (matchResult.type === 'editDistance') {
        editDistanceMatches.push({ item, distance: matchResult.distance });
      }
    });

    // 按优先级返回结果
    if (exactMatches.length > 0) {
      return exactMatches;
    }

    if (containsMatches.length > 0) {
      console.log(`[SemanticMatch] 使用包含匹配: "${labelText}"`);
      return containsMatches;
    }

    if (prefixMatches.length > 0) {
      console.log(`[SemanticMatch] 使用前缀匹配: "${labelText}"`);
      return prefixMatches;
    }

    if (editDistanceMatches.length > 0) {
      // 按编辑距离排序（最小的在前）
      editDistanceMatches.sort((a, b) => a.distance - b.distance);
      console.log(`[SemanticMatch] 使用编辑距离匹配: "${labelText}" (距离=${editDistanceMatches[0].distance})`);
      return editDistanceMatches.map(m => m.item);
    }

    return [];
  },

  /**
   * 模糊匹配 label 文本
   *
   * @param {string} searchLabel - 搜索的 label（来自导出数据）
   * @param {string} actualLabel - 实际页面中的 label
   * @returns {object} { type: 'exact'|'contains'|'prefix'|'editDistance'|'none', distance?: number }
   */
  _fuzzyMatchLabel(searchLabel, actualLabel) {
    if (!searchLabel || !actualLabel) {
      return { type: 'none' };
    }

    // 1. 精确匹配
    if (searchLabel === actualLabel) {
      return { type: 'exact' };
    }

    // 2. 包含匹配（双向）
    if (actualLabel.includes(searchLabel) || searchLabel.includes(actualLabel)) {
      return { type: 'contains' };
    }

    // 3. 前缀匹配
    if (actualLabel.startsWith(searchLabel) || searchLabel.startsWith(actualLabel)) {
      return { type: 'prefix' };
    }

    // 4. 编辑距离匹配（< 3）
    const distance = this._levenshteinDistance(searchLabel, actualLabel);
    if (distance < 3) {
      return { type: 'editDistance', distance };
    }

    return { type: 'none' };
  },

  /**
   * 计算两个字符串的 Levenshtein 编辑距离
   * 用于相似度匹配
   *
   * @param {string} str1
   * @param {string} str2
   * @returns {number} 编辑距离
   */
  _levenshteinDistance(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;

    // 创建二维数组
    const dp = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

    // 初始化第一行和第一列
    for (let i = 0; i <= len1; i++) {
      dp[i][0] = i;
    }
    for (let j = 0; j <= len2; j++) {
      dp[0][j] = j;
    }

    // 动态规划计算编辑距离
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,      // 删除
            dp[i][j - 1] + 1,      // 插入
            dp[i - 1][j - 1] + 1   // 替换
          );
        }
      }
    }

    return dp[len1][len2];
  }
};

// 导出供其他模块使用
if (typeof window !== 'undefined') {
  window.SemanticMatch = SemanticMatch;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SemanticMatch;
}

// 自注册到 FieldMatcher（如果存在）
if (typeof window !== 'undefined') {
  const autoRegister = () => {
    if (window.FieldMatcher && typeof window.FieldMatcher.registerStrategy === 'function') {
      window.FieldMatcher.registerStrategy(SemanticMatch);
      console.log('[SemanticMatch] 已自动注册到 FieldMatcher');
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
