/**
 * Template Preview Dialog
 *
 * 模版预览对话框 - 显示模版包含的所有字段和值
 */

const TemplatePreviewDialog = {
  /**
   * 显示预览对话框
   * @param {Object} template - 模版对象
   */
  show(template) {
    // 创建对话框
    const dialog = this._createDialog(template);
    document.body.appendChild(dialog);

    // 绑定事件
    this._bindEvents(dialog);
  },

  /**
   * 创建对话框 DOM
   * @private
   */
  _createDialog(template) {
    const overlay = document.createElement('div');
    overlay.id = 'template-preview-overlay';
    overlay.className = 'template-preview-overlay';

    const fieldCount = TemplateManager.countFields(template);
    const groupsHtml = this._renderGroups(template);

    overlay.innerHTML = `
      <div class="template-preview-dialog">
        <div class="dialog-header">
          <h3>👁 预览：${this._escapeHtml(template.name)}</h3>
          <button class="dialog-close-btn" id="close-preview-btn">✕</button>
        </div>
        <div class="dialog-body">
          <div class="template-preview-meta">
            <div class="preview-meta-item">
              📦 共 ${fieldCount} 个字段
            </div>
            ${template.description ? `
              <div class="preview-meta-item">
                📝 ${this._escapeHtml(template.description)}
              </div>
            ` : ''}
          </div>
          <div class="template-preview-groups">
            ${groupsHtml}
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-secondary" id="close-preview-footer-btn">关闭</button>
        </div>
      </div>
    `;

    return overlay;
  },

  /**
   * 渲染分组
   * @private
   */
  _renderGroups(template) {
    if (!template.data || !template.data.data) {
      return '<div class="preview-empty">无数据</div>';
    }

    const groups = template.data.data;
    const groupNames = Object.keys(groups);

    if (groupNames.length === 0) {
      return '<div class="preview-empty">无数据</div>';
    }

    return groupNames.map((groupName, index) => {
      const fields = groups[groupName];
      const fieldCount = Object.keys(fields).length;
      const isOpen = index === 0; // 默认展开第一个分组

      return `
        <details class="preview-group" ${isOpen ? 'open' : ''}>
          <summary class="preview-group-header">
            <span class="group-icon">📦</span>
            <span class="group-name">${this._escapeHtml(groupName)}</span>
            <span class="group-count">(${fieldCount}个字段)</span>
          </summary>
          <div class="preview-group-body">
            ${this._renderFields(fields)}
          </div>
        </details>
      `;
    }).join('');
  },

  /**
   * 渲染字段列表
   * @private
   */
  _renderFields(fields) {
    const fieldNames = Object.keys(fields);

    if (fieldNames.length === 0) {
      return '<div class="preview-empty">无字段</div>';
    }

    return fieldNames.map(fieldName => {
      const field = fields[fieldName];
      return `
        <div class="preview-field-row">
          <div class="preview-field-label">${this._escapeHtml(fieldName)}</div>
          <div class="preview-field-value">${this._renderFieldValue(field)}</div>
        </div>
      `;
    }).join('');
  },

  /**
   * 渲染字段值
   * @private
   */
  _renderFieldValue(field) {
    if (!field || !field.value) {
      return '<span class="preview-empty-value">（空）</span>';
    }

    const value = field.value;

    // 处理不同类型的值
    if (typeof value === 'string') {
      return this._truncateText(value, 100);
    }

    if (Array.isArray(value)) {
      return value.map(v => this._truncateText(String(v), 50)).join(', ');
    }

    if (typeof value === 'object') {
      // 处理复杂对象（如 mixedGroup）
      return this._renderComplexValue(value);
    }

    return this._truncateText(String(value), 100);
  },

  /**
   * 渲染复杂值（对象）
   * @private
   */
  _renderComplexValue(obj) {
    const keys = Object.keys(obj);
    if (keys.length === 0) return '（空）';

    return keys.map(key => {
      const val = obj[key];
      if (val && typeof val === 'object' && val.text) {
        return `${key}: ${this._escapeHtml(val.text)}`;
      }
      return `${key}: ${this._escapeHtml(String(val))}`;
    }).join(', ');
  },

  /**
   * 截断长文本
   * @private
   */
  _truncateText(text, maxLength) {
    const escaped = this._escapeHtml(text);
    if (escaped.length <= maxLength) {
      return escaped;
    }
    return escaped.substring(0, maxLength) + '<span class="text-truncated">...</span>';
  },

  /**
   * 绑定事件
   * @private
   */
  _bindEvents(dialog) {
    const closeBtn = dialog.querySelector('#close-preview-btn');
    const footerCloseBtn = dialog.querySelector('#close-preview-footer-btn');

    // 关闭按钮
    const closeDialog = () => {
      dialog.classList.add('fade-out');
      setTimeout(() => dialog.remove(), 200);
    };

    closeBtn.addEventListener('click', closeDialog);
    footerCloseBtn.addEventListener('click', closeDialog);

    // ESC 键关闭
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        closeDialog();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);

    // 点击遮罩关闭
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        closeDialog();
      }
    });
  },

  /**
   * HTML 转义
   * @private
   */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// 暴露到全局
window.TemplatePreviewDialog = TemplatePreviewDialog;
