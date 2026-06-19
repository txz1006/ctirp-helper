/**
 * Template Management Panel
 *
 * 模版管理面板 - 列表、预览、编辑、删除
 */

const TemplateManagementPanel = {
  panelElement: null,

  /**
   * 显示模版管理面板
   */
  async show() {
    if (this.panelElement) {
      // 面板已存在，刷新列表
      await this._refreshList();
      return;
    }

    // 创建面板
    this.panelElement = this._createPanel();
    document.body.appendChild(this.panelElement);

    // 加载模版列表
    await this._loadTemplates();

    // 绑定事件
    this._bindEvents();
  },

  /**
   * 关闭面板
   */
  close() {
    if (this.panelElement) {
      this.panelElement.remove();
      this.panelElement = null;
    }
  },

  /**
   * 创建面板 DOM
   * @private
   */
  _createPanel() {
    const panel = document.createElement('div');
    panel.id = 'template-management-panel';
    panel.innerHTML = `
      <div class="template-panel-header">
        <h3>📋 模版管理 <span id="template-count-badge">(0/25)</span></h3>
        <button class="template-panel-close" id="close-template-panel">✕</button>
      </div>
      <div class="template-panel-body">
        <div id="template-list-container">
          <div class="template-loading">加载中...</div>
        </div>
      </div>
    `;
    return panel;
  },

  /**
   * 绑定事件
   * @private
   */
  _bindEvents() {
    // 关闭按钮
    const closeBtn = this.panelElement.querySelector('#close-template-panel');
    closeBtn.addEventListener('click', () => this.close());

    // ESC 键关闭
    const handleEsc = (e) => {
      if (e.key === 'Escape' && this.panelElement) {
        this.close();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  },

  /**
   * 加载模版列表
   * @private
   */
  async _loadTemplates() {
    const container = this.panelElement.querySelector('#template-list-container');

    try {
      const templates = await TemplateManager.getAllSorted();

      // 更新数量徽章
      const badge = this.panelElement.querySelector('#template-count-badge');
      badge.textContent = `(${templates.length}/25)`;

      if (templates.length === 0) {
        container.innerHTML = this._renderEmptyState();
      } else {
        container.innerHTML = templates.map(tpl => this._renderTemplateCard(tpl)).join('');
        this._bindCardEvents();
      }
    } catch (error) {
      console.error('[TemplateManagementPanel] 加载模版失败:', error);
      container.innerHTML = `
        <div class="template-error">
          ⚠️ 加载失败：${error.message}
        </div>
      `;
    }
  },

  /**
   * 刷新列表
   * @private
   */
  async _refreshList() {
    await this._loadTemplates();
  },

  /**
   * 渲染空状态
   * @private
   */
  _renderEmptyState() {
    return `
      <div class="template-empty-state">
        <div class="empty-icon">📦</div>
        <div class="empty-text">暂无模版</div>
        <div class="empty-hint">点击页面底部的"💾 保存为模版"按钮创建第一个模版</div>
      </div>
    `;
  },

  /**
   * 渲染模版卡片
   * @private
   */
  _renderTemplateCard(template) {
    const fieldCount = TemplateManager.countFields(template);
    const updatedDate = new Date(template.updatedAt).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    return `
      <div class="template-card" data-id="${template.id}">
        <div class="template-card-header">
          <div class="template-card-title">📦 ${this._escapeHtml(template.name)}</div>
        </div>
        <div class="template-card-body">
          ${template.description ? `<div class="template-card-desc">${this._escapeHtml(template.description)}</div>` : ''}
          <div class="template-card-meta">
            <span>更新时间：${updatedDate}</span>
            <span>包含 ${fieldCount} 个字段</span>
          </div>
        </div>
        <div class="template-card-actions">
          <button class="template-action-btn preview-btn" data-id="${template.id}">
            👁 预览
          </button>
          <button class="template-action-btn edit-btn" data-id="${template.id}">
            ✏️ 编辑
          </button>
          <button class="template-action-btn delete-btn" data-id="${template.id}">
            🗑️ 删除
          </button>
        </div>
      </div>
    `;
  },

  /**
   * 绑定卡片事件
   * @private
   */
  _bindCardEvents() {
    // 预览按钮
    const previewBtns = this.panelElement.querySelectorAll('.preview-btn');
    previewBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        await this._handlePreview(id);
      });
    });

    // 编辑按钮
    const editBtns = this.panelElement.querySelectorAll('.edit-btn');
    editBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        await this._handleEdit(id);
      });
    });

    // 删除按钮
    const deleteBtns = this.panelElement.querySelectorAll('.delete-btn');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        await this._handleDelete(id);
      });
    });
  },

  /**
   * 处理预览
   * @private
   */
  async _handlePreview(id) {
    const template = await TemplateStorage.get(id);
    if (!template) {
      alert('模版不存在，可能已被删除');
      await this._refreshList();
      return;
    }

    if (window.TemplatePreviewDialog) {
      TemplatePreviewDialog.show(template);
    } else {
      alert('预览功能未加载');
    }
  },

  /**
   * 处理编辑
   * @private
   */
  async _handleEdit(id) {
    const template = await TemplateStorage.get(id);
    if (!template) {
      alert('模版不存在，可能已被删除');
      await this._refreshList();
      return;
    }

    if (window.EditTemplateDialog) {
      const result = await EditTemplateDialog.show(template);
      if (result) {
        await this._refreshList();
      }
    } else {
      alert('编辑功能未加载');
    }
  },

  /**
   * 处理删除
   * @private
   */
  async _handleDelete(id) {
    try {
      const deleted = await TemplateManager.deleteTemplate(id);
      if (deleted) {
        // 刷新列表
        await this._refreshList();
        this._showToast('✅ 模版已删除');
      }
    } catch (error) {
      console.error('[TemplateManagementPanel] 删除失败:', error);
      alert(`删除失败：${error.message}`);
    }
  },

  /**
   * 显示提示
   * @private
   */
  _showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'template-toast success';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
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
window.TemplateManagementPanel = TemplateManagementPanel;
