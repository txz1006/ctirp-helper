/**
 * Edit Template Dialog
 *
 * 编辑模版对话框 - 只能修改名称和描述
 */

const EditTemplateDialog = {
  /**
   * 显示编辑模版对话框
   * @param {Object} template - 待编辑的模版对象
   * @returns {Promise<boolean>} 是否保存成功
   */
  async show(template) {
    return new Promise((resolve) => {
      // 创建对话框 HTML
      const dialog = this._createDialog(template);
      document.body.appendChild(dialog);

      // 绑定事件
      this._bindEvents(dialog, template, resolve);

      // 聚焦到名称输入框
      const nameInput = dialog.querySelector('#edit-template-name-input');
      nameInput.focus();
      nameInput.select();
    });
  },

  /**
   * 创建对话框 DOM
   * @private
   */
  _createDialog(template) {
    const overlay = document.createElement('div');
    overlay.id = 'edit-template-overlay';
    overlay.innerHTML = `
      <div class="save-template-dialog">
        <div class="dialog-header">
          <h3>✏️ 编辑模版</h3>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label for="edit-template-name-input">模版名称 <span class="required">*</span></label>
            <input
              type="text"
              id="edit-template-name-input"
              class="template-input"
              value="${this._escapeHtml(template.name)}"
              maxlength="50"
              placeholder="请输入模版名称"
            />
            <div class="input-hint">最多 50 个字符</div>
          </div>
          <div class="form-group">
            <label for="edit-template-desc-input">描述（可选）</label>
            <textarea
              id="edit-template-desc-input"
              class="template-textarea"
              maxlength="200"
              rows="3"
              placeholder="描述此模版的用途或特点"
            >${this._escapeHtml(template.description || '')}</textarea>
            <div class="input-hint">最多 200 个字符</div>
          </div>
          <div class="error-message" id="edit-error-message"></div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-secondary" id="cancel-edit-btn">取消</button>
          <button class="btn btn-primary" id="confirm-edit-btn">💾 保存</button>
        </div>
      </div>
    `;
    return overlay;
  },

  /**
   * 绑定事件
   * @private
   */
  _bindEvents(dialog, template, resolve) {
    const nameInput = dialog.querySelector('#edit-template-name-input');
    const descInput = dialog.querySelector('#edit-template-desc-input');
    const cancelBtn = dialog.querySelector('#cancel-edit-btn');
    const confirmBtn = dialog.querySelector('#confirm-edit-btn');
    const errorMsg = dialog.querySelector('#edit-error-message');

    // 验证名称并控制保存按钮状态
    const validateName = () => {
      const name = nameInput.value.trim();
      if (!name) {
        confirmBtn.disabled = true;
        confirmBtn.classList.add('disabled');
      } else {
        confirmBtn.disabled = false;
        confirmBtn.classList.remove('disabled');
      }
      // 清除错误提示
      errorMsg.textContent = '';
      errorMsg.style.display = 'none';
    };

    // 名称输入时验证
    nameInput.addEventListener('input', validateName);

    // 初始验证
    validateName();

    // 取消按钮
    cancelBtn.addEventListener('click', () => {
      this._closeDialog(dialog);
      resolve(false);
    });

    // 保存按钮
    confirmBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      const description = descInput.value.trim();

      if (!name) {
        this._showError(errorMsg, '请输入模版名称');
        return;
      }

      // 禁用按钮，显示加载状态
      confirmBtn.disabled = true;
      confirmBtn.textContent = '保存中...';

      try {
        // 调用 TemplateManager 更新元数据
        await TemplateManager.updateMetadata(template.id, name, description);

        // 成功提示
        this._showSuccess('✅ 模版已更新');

        // 关闭对话框
        this._closeDialog(dialog);
        resolve(true);

      } catch (error) {
        console.error('[EditTemplateDialog] 保存失败:', error);
        this._showError(errorMsg, error.message || '保存失败，请稍后重试');

        // 恢复按钮状态
        confirmBtn.disabled = false;
        confirmBtn.textContent = '💾 保存';
      }
    });

    // ESC 键关闭
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        this._closeDialog(dialog);
        resolve(false);
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);

    // 点击遮罩关闭
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        this._closeDialog(dialog);
        resolve(false);
      }
    });

    // Enter 键保存（仅在名称输入框中）
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !confirmBtn.disabled) {
        confirmBtn.click();
      }
    });
  },

  /**
   * 显示错误信息
   * @private
   */
  _showError(errorElement, message) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
  },

  /**
   * 显示成功提示
   * @private
   */
  _showSuccess(message) {
    const toast = document.createElement('div');
    toast.className = 'template-toast success';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3000);
  },

  /**
   * 关闭对话框
   * @private
   */
  _closeDialog(dialog) {
    dialog.classList.add('fade-out');
    setTimeout(() => {
      dialog.remove();
    }, 200);
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
window.EditTemplateDialog = EditTemplateDialog;
