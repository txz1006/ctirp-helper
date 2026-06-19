/**
 * 字段匹配确认对话框
 * 当自动匹配失败或置信度低时，展示候选项供用户选择
 *
 * 职责：仅负责 UI 展示和用户交互，不重复计算候选分数
 * 候选项由 FieldMatcher 传入，包含 {element, score}
 */
const MatchConfirmationDialog = {
  /**
   * 显示匹配确认对话框
   * @param {object} fieldData - 字段数据
   * @param {Array<{element: HTMLElement, score: number}>} candidates - 候选列表
   * @returns {Promise<HTMLElement|null>} 用户选择的元素，或 null（跳过）
   */
  show(fieldData, candidates = []) {
    return new Promise((resolve) => {
      const fieldLabel = fieldData.label || '未命名字段';

      // 查找最高分候选
      const maxScore = candidates.length > 0
        ? Math.max(...candidates.map(c => c.score))
        : 0;

      // 创建遮罩层
      const overlay = document.createElement('div');
      overlay.id = 'match-confirmation-overlay';
      overlay.style.cssText = [
        'position: fixed',
        'top: 0',
        'left: 0',
        'right: 0',
        'bottom: 0',
        'background: rgba(0, 0, 0, 0.5)',
        'z-index: 999999',
        'display: flex',
        'align-items: center',
        'justify-content: center'
      ].join(';');

      // 创建对话框
      const dialog = document.createElement('div');
      dialog.style.cssText = [
        'background: white',
        'border-radius: 8px',
        'padding: 24px',
        'max-width: 620px',
        'max-height: 80vh',
        'overflow-y: auto',
        'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15)',
        'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ].join(';');

      dialog.innerHTML = [
        '<div style="margin-bottom: 16px;">',
          '<h3 style="margin: 0 0 8px 0; font-size: 18px; display: flex; align-items: center; gap: 8px;">',
            '<span>⚠️</span>',
            '<span>字段匹配确认</span>',
          '</h3>',
          '<p style="margin: 0; color: #666; font-size: 14px;">',
            '字段 <strong style="color: #333;">' + this._escapeHtml(fieldLabel) + '</strong>',
            '（类型: ' + this._escapeHtml(fieldData.fieldType || '未知') + '）',
            candidates.length > 0
              ? ' 找到 <strong>' + candidates.length + '</strong> 个候选，请选择：'
              : ' 未找到自动匹配',
          '</p>',
        '</div>',
        '<div id="candidates-list" style="margin-bottom: 16px;">',
          candidates.length > 0
            ? this._renderCandidates(candidates, maxScore)
            : this._renderNoCandidates(),
        '</div>',
        '<div style="display: flex; gap: 8px; justify-content: flex-end;">',
          '<button id="btn-skip-field" style="padding: 8px 16px; border: 1px solid #d9d9d9; background: white; border-radius: 4px; cursor: pointer; font-size: 14px;">',
            '跳过此字段',
          '</button>',
          '<button id="btn-confirm-field" style="padding: 8px 16px; border: none; background: #1890ff; color: white; border-radius: 4px; cursor: pointer; font-size: 14px;">',
            '确认选择',
          '</button>',
        '</div>'
      ].join('');

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // 状态管理
      let selectedElement = null;

      // 默认选中最高分且 >= 80 分的候选
      if (candidates.length > 0) {
        const bestCandidate = candidates.reduce((best, curr) =>
          curr.score > best.score ? curr : best
        , candidates[0]);
        if (bestCandidate.score >= 80) {
          selectedElement = bestCandidate.element;
        }
      }

      // 绑定事件：候选项点击
      dialog.querySelectorAll('.candidate-item').forEach((item, index) => {
        item.addEventListener('click', () => {
          // 移除其他选中状态
          dialog.querySelectorAll('.candidate-item').forEach(el => {
            el.style.border = '1px solid #d9d9d9';
            el.style.background = 'white';
            const radio = el.querySelector('input[type="radio"]');
            if (radio) radio.checked = false;
          });

          // 设置选中状态
          item.style.border = '2px solid #1890ff';
          item.style.background = '#e6f7ff';
          const radio = item.querySelector('input[type="radio"]');
          if (radio) radio.checked = true;
          selectedElement = candidates[index].element;
        });
      });

      // 绑定事件：确认按钮
      dialog.querySelector('#btn-confirm-field').addEventListener('click', () => {
        this._cleanup(overlay);
        resolve(selectedElement);
      });

      // 绑定事件：跳过按钮
      dialog.querySelector('#btn-skip-field').addEventListener('click', () => {
        this._cleanup(overlay);
        resolve(null);
      });

      // 点击遮罩层关闭（跳过）
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this._cleanup(overlay);
          resolve(null);
        }
      });

      // ESC 键关闭
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          this._cleanup(overlay);
          document.removeEventListener('keydown', escHandler);
          resolve(null);
        }
      };
      document.addEventListener('keydown', escHandler);
    });
  },

  /**
   * 渲染候选项列表
   * @param {Array<{element: HTMLElement, score: number}>} candidates
   * @param {number} maxScore - 最高分
   * @returns {string} HTML
   */
  _renderCandidates(candidates, maxScore) {
    return candidates.map((candidate, index) => {
      const element = candidate.element;
      const score = candidate.score;
      const isRecommended = score >= 80 && score === maxScore;

      return [
        '<div class="candidate-item" style="',
          'padding: 12px;',
          'border: ' + (isRecommended ? '2px solid #1890ff' : '1px solid #d9d9d9') + ';',
          'border-radius: 4px;',
          'margin-bottom: 8px;',
          'cursor: pointer;',
          'transition: all 0.2s;',
          'background: ' + (isRecommended ? '#e6f7ff' : 'white') + ';',
        '">',
          '<div style="display: flex; align-items: flex-start; gap: 8px;">',
            '<input type="radio" name="candidate" ' + (isRecommended ? 'checked' : '') + ' style="margin: 3px 0 0 0;">',
            '<div style="flex: 1; min-width: 0;">',
              '<div style="font-weight: 500; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">',
                '<span>候选 ' + (index + 1) + '</span>',
                isRecommended ? '<span style="color: #1890ff; font-size: 13px;">⭐ 推荐</span>' : '',
                '<span style="color: #999; font-size: 12px; font-weight: 400;">置信度: ' + score + '%</span>',
              '</div>',
              '<div style="font-size: 12px; color: #666;">',
                '<div style="margin-bottom: 2px;">',
                  'ID: <code style="background: #f5f5f5; padding: 1px 4px; border-radius: 2px;">' + this._escapeHtml(element.id || '(无ID)') + '</code>',
                '</div>',
                '<div style="margin-bottom: 2px;">',
                  '当前值: ' + this._escapeHtml(this._getElementPreview(element)),
                '</div>',
                '<div>',
                  '标签: <code style="background: #f5f5f5; padding: 1px 4px; border-radius: 2px;">' + this._escapeHtml(element.tagName.toLowerCase()) + '</code>',
                  ' · 类型: <code style="background: #f5f5f5; padding: 1px 4px; border-radius: 2px;">' + this._escapeHtml(element.type || element.className.substring(0, 30)) + '</code>',
                '</div>',
              '</div>',
            '</div>',
          '</div>',
        '</div>'
      ].join('');
    }).join('');
  },

  /**
   * 渲染"未找到候选"提示
   * @returns {string} HTML
   */
  _renderNoCandidates() {
    return [
      '<div style="padding: 32px 24px; text-align: center; color: #999;">',
        '<div style="font-size: 48px; margin-bottom: 12px;">🔍</div>',
        '<div style="font-size: 15px; margin-bottom: 8px;">未找到匹配的元素</div>',
        '<div style="font-size: 12px;">请手动填写此字段，或点击"跳过"继续下一个字段</div>',
      '</div>'
    ].join('');
  },

  /**
   * 获取元素值预览
   * @param {HTMLElement} element
   * @returns {string}
   */
  _getElementPreview(element) {
    if (element.value && element.value.trim()) {
      const val = element.value.trim();
      return val.substring(0, 40) + (val.length > 40 ? '...' : '');
    }
    if (element.textContent && element.textContent.trim()) {
      const text = element.textContent.trim();
      return text.substring(0, 40) + (text.length > 40 ? '...' : '');
    }
    return '(空)';
  },

  /**
   * HTML 转义
   * @param {string} str
   * @returns {string}
   */
  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },

  /**
   * 清理 DOM
   * @param {HTMLElement} overlay
   */
  _cleanup(overlay) {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }
};

// 导出
if (typeof window !== 'undefined') {
  window.MatchConfirmationDialog = MatchConfirmationDialog;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MatchConfirmationDialog;
}
