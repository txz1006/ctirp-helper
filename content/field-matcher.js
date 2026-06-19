/**
 * 字段匹配引擎 - 智能匹配表单字段
 * 支持多种匹配策略，按优先级自动回退
 *
 * 架构：
 *   - 策略自注册：策略文件通过 registerStrategy() 自动注册
 *   - 渐进式匹配：Exact(100) → Pattern(90) → Semantic(50)
 *   - 智能候选：失败时查找候选项供用户确认
 *   - 置信度评分：集中管理，不重复计算
 */
const FieldMatcher = {
  /**
   * 匹配策略注册表（按优先级排序）
   */
  strategies: [],

  /**
   * 初始化匹配器（已注册的策略会在此处整理）
   * 策略文件在加载时通过 registerStrategy() 自动注册
   */
  init() {
    // 按优先级降序排序
    this.strategies.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    console.log('[FieldMatcher] 已注册策略:', this.strategies.map(s => `${s.name}(${s.priority})`));
  },

  /**
   * 注册匹配策略
   * @param {object} strategy - 策略对象 {name, priority, match()}
   */
  registerStrategy(strategy) {
    if (!strategy || !strategy.name || !strategy.match) {
      console.warn('[FieldMatcher] 无效策略，跳过注册');
      return;
    }

    // 避免重复注册
    if (this.strategies.find(s => s.name === strategy.name)) {
      console.log(`[FieldMatcher] 策略已存在，跳过: ${strategy.name}`);
      return;
    }

    this.strategies.push(strategy);
    console.log(`[FieldMatcher] 注册策略: ${strategy.name} (优先级: ${strategy.priority})`);
  },

  /**
   * 智能匹配字段
   * @param {object} fieldData - 字段数据，包含 matchData
   * @param {boolean} interactive - 是否启用交互确认（默认true）
   * @returns {Promise<object>} {element, strategy, confidence, needsUserConfirmation}
   */
  async smartMatch(fieldData, interactive = true) {
    console.log('[FieldMatcher] 开始智能匹配:', fieldData.label || '字段');

    // 按优先级尝试每种策略
    for (const strategy of this.strategies) {
      try {
        const element = strategy.match(fieldData);

        if (element) {
          const confidence = this._calculateConfidence(strategy, fieldData, element);

          // 低置信度且开启交互模式：寻找候选项并询问用户
          if (interactive && confidence < 70) {
            console.log(`[FieldMatcher] 置信度较低(${confidence}%)，寻找其他候选...`);
            const candidates = this._findCandidates(fieldData);

            if (candidates.length > 1) {
              const confirmed = await window.MatchConfirmationDialog.show(fieldData, candidates);
              if (confirmed) {
                return {
                  element: confirmed,
                  strategy: 'userConfirmed',
                  confidence: 100,
                  needsUserConfirmation: false
                };
              }
            }
          }

          return {
            element,
            strategy: strategy.name,
            confidence,
            needsUserConfirmation: false
          };
        }
      } catch (err) {
        console.error(`[FieldMatcher] 策略 ${strategy.name} 执行出错:`, err);
        // 继续尝试下一个策略
      }
    }

    // 所有策略都失败：尝试模糊查找候选
    if (interactive) {
      const candidates = this._findCandidates(fieldData);

      if (candidates.length > 0) {
        const confirmed = await window.MatchConfirmationDialog.show(fieldData, candidates);
        if (confirmed) {
          return {
            element: confirmed,
            strategy: 'userConfirmed',
            confidence: 100,
            needsUserConfirmation: false
          };
        }
      }
    }

    console.warn('[FieldMatcher] 所有策略均失败，需要用户确认');
    return {
      element: null,
      strategy: null,
      confidence: 0,
      needsUserConfirmation: true
    };
  },

  /**
   * 计算匹配置信度
   * @param {object} strategy - 使用的策略
   * @param {object} fieldData - 字段数据
   * @param {HTMLElement} element - 匹配到的元素
   * @returns {number} 0-100 的置信度分数
   */
  _calculateConfidence(strategy, fieldData, element) {
    let score = 0;

    // 基础分：策略优先级映射
    if (strategy.priority >= 100) {
      score += 95; // 精确匹配
    } else if (strategy.priority >= 90) {
      score += 85; // 模式匹配
    } else if (strategy.priority >= 50) {
      score += 70; // 语义匹配
    }

    // 值匹配加分
    if (fieldData.value && element.value === fieldData.value) {
      score += 5;
    } else if (fieldData.text && element.textContent && element.textContent.includes(fieldData.text)) {
      score += 3;
    }

    return Math.min(100, score);
  },

  /**
   * 查找可能的候选元素（模糊匹配）
   * 智能限制搜索范围，避免全局扫描
   * @param {object} fieldData
   * @returns {HTMLElement[]} 候选元素数组（最多5个）
   */
  _findCandidates(fieldData) {
    const { fieldType, matchData } = fieldData;

    // 根据字段类型确定选择器
    let selector = '';
    switch (fieldType) {
      case 'input':
        selector = 'input[type="text"], input:not([type])';
        break;
      case 'textarea':
        selector = 'textarea';
        break;
      case 'select':
        selector = '.ant-select';
        break;
      case 'inputNumber':
        selector = '.ant-input-number-input';
        break;
      default:
        return [];
    }

    // 智能限制搜索范围：优先使用语义容器
    let searchScope = null;
    if (matchData?.semantic?.container) {
      searchScope = document.querySelector(matchData.semantic.container);
    }

    // 如果没有语义容器，尝试最近的 .ant-form 或 .content-card
    if (!searchScope) {
      searchScope = document.querySelector('.ant-form') ||
                    document.querySelector('.content-card') ||
                    document.querySelector('#pm_recommend');
    }

    // 兜底：使用 document
    if (!searchScope) {
      searchScope = document;
    }

    const elements = searchScope.querySelectorAll(selector);

    // 按相似度排序
    const scored = Array.from(elements).map(el => ({
      element: el,
      score: this._calculateCandidateScore(el, fieldData)
    }));

    scored.sort((a, b) => b.score - a.score);

    // 只返回有分数的候选（score > 0），最多5个
    return scored
      .filter(item => item.score > 0)
      .slice(0, 5)
      .map(item => ({ element: item.element, score: item.score }));
  },

  /**
   * 计算候选元素的匹配分数
   * @param {HTMLElement} element
   * @param {object} fieldData
   * @returns {number} 分数
   */
  _calculateCandidateScore(element, fieldData) {
    let score = 0;

    // 值匹配（最强信号）
    if (fieldData.value && element.value === fieldData.value) {
      score += 50;
    } else if (fieldData.text && element.textContent && element.textContent.includes(fieldData.text)) {
      score += 30;
    }

    // ID 后缀匹配
    if (fieldData.matchData?.pattern?.suffix && element.id) {
      if (element.id.includes(fieldData.matchData.pattern.suffix)) {
        score += 30;
      }
    }

    // 类型匹配
    if (fieldData.fieldType === 'select' && element.classList.contains('ant-select')) {
      score += 10;
    } else if (fieldData.fieldType === 'textarea' && element.tagName === 'TEXTAREA') {
      score += 10;
    } else if (fieldData.fieldType === 'input' && element.tagName === 'INPUT') {
      score += 10;
    }

    return score;
  },

  /**
   * 从 ID 解析匹配模式（委托给 PatternMatch）
   * @param {string} id - DOM 元素 ID
   * @returns {object|null} {baseName, index, suffix, regionIndex}
   */
  parseId(id) {
    if (window.PatternMatch && window.PatternMatch.parseId) {
      return window.PatternMatch.parseId(id);
    }
    return null;
  }
};

// 导出
if (typeof window !== 'undefined') {
  window.FieldMatcher = FieldMatcher;

  // 延迟初始化，等待策略模块加载
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => FieldMatcher.init());
  } else {
    FieldMatcher.init();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FieldMatcher;
}