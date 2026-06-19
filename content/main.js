/**
 * 主入口 - Content Script初始化
 *
 * 职责：
 * 1. 检测页面类型
 * 2. 根据模式注入对应按钮
 * 3. 绑定按钮事件
 */

(async function () {
  'use strict';

  const mode = await PageDetector.getEffectiveMode();
  const detected = PageDetector.detect();

  // 更新状态到storage
  await SafeStorage.set({ detectedPage: detected, effectiveMode: mode });

  // 监听storage变化（用户切换模式时重新初始化）
  SafeStorage.addListener((changes, area) => {
    if (area === 'local' && changes.mode) {
      PageDetector.invalidateCache();
      _init();
    }
  });

  /** 按钮注入重试相关 */
  let _retryTimer = null;
  const MAX_RETRIES = 20;       // 最多重试20次
  const RETRY_INTERVAL = 1500;  // 每1.5秒重试一次
  let _retryCount = 0;

  async function _init() {
    const currentMode = await PageDetector.getEffectiveMode();

    // 移除旧按钮
    _removeInjectedButtons();

    // 清除旧的重试定时器
    if (_retryTimer) {
      clearInterval(_retryTimer);
      _retryTimer = null;
    }
    _retryCount = 0;

    if (currentMode === 'domestic') {
      _tryInjectButton('export');
    } else if (currentMode === 'international') {
      _tryInjectButton('import');
    }
  }

  /**
   * 尝试注入按钮，如果footer未渲染则定时重试
   * @param {'export'|'import'} type
   */
  function _tryInjectButton(type) {
    // 统一使用浮动按钮容器，确保所有页面体验一致
    console.log('[Main] 使用浮动按钮容器');
    _createFloatingButtonContainer(type);
  }

  /**
   * 创建浮动按钮容器（当找不到标准 footer 时）
   * @param {'export'|'import'} type
   */
  function _createFloatingButtonContainer(type) {
    // 移除旧的浮动容器
    const oldContainer = document.getElementById('vtrip-floating-buttons');
    if (oldContainer) oldContainer.remove();

    const container = document.createElement('div');
    container.id = 'vtrip-floating-buttons';
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      z-index: 9999;
      display: flex;
      gap: 8px;
      background: rgba(255, 255, 255, 0.95);
      padding: 12px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    `;

    document.body.appendChild(container);

    if (type === 'export') {
      _injectExportButton(container);
    } else {
      _injectImportButton(container);
    }
  }

  /**
   * 注入导出按钮到操作栏
   */
  function _injectExportButton(footer) {
    if (document.getElementById('vtrip-export-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'vtrip-export-btn';
    btn.type = 'button';
    btn.className = 'ant-btn ant-btn-primary';
    btn.style.cssText = 'background-color: #ff6600; margin-left: 8px; border-color: #ff6600;';
    btn.innerHTML = '<span>📤 导出数据</span>';
    btn.addEventListener('click', _handleExport);

    // 保存为模版按钮
    const saveBtn = document.createElement('button');
    saveBtn.id = 'vtrip-save-template-btn';
    saveBtn.type = 'button';
    saveBtn.className = 'ant-btn';
    saveBtn.style.cssText = 'background-color: #fff; margin-left: 8px; border-color: #d9d9d9; color: #333;';
    saveBtn.innerHTML = '<span>💾 保存为模版</span>';
    saveBtn.addEventListener('click', _handleSaveTemplate);

    // 模版管理按钮
    const manageBtn = document.createElement('button');
    manageBtn.id = 'vtrip-manage-template-btn';
    manageBtn.type = 'button';
    manageBtn.className = 'ant-btn';
    manageBtn.style.cssText = 'background-color: #fff; margin-left: 8px; border-color: #d9d9d9; color: #333;';
    manageBtn.innerHTML = '<span>📋 模版管理</span>';
    manageBtn.addEventListener('click', _handleManageTemplates);

    footer.appendChild(btn);
    footer.appendChild(saveBtn);
    footer.appendChild(manageBtn);
  }

  /**
   * 注入导入按钮到操作栏
   */
  function _injectImportButton(footer) {
    if (document.getElementById('vtrip-import-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'vtrip-import-btn';
    btn.type = 'button';
    btn.className = 'ant-btn ant-btn-primary';
    btn.style.cssText = 'background-color: #00b38a; margin-left: 8px; border-color: #00b38a;';
    btn.innerHTML = '<span>导入数据</span>';
    btn.addEventListener('click', _handleImport);

    footer.appendChild(btn);
  }

  /**
   * 移除已注入的按钮
   */
  function _removeInjectedButtons() {
    const exportBtn = document.getElementById('vtrip-export-btn');
    if (exportBtn) exportBtn.remove();

    const saveBtn = document.getElementById('vtrip-save-template-btn');
    if (saveBtn) saveBtn.remove();

    const manageBtn = document.getElementById('vtrip-manage-template-btn');
    if (manageBtn) manageBtn.remove();

    const importBtn = document.getElementById('vtrip-import-btn');
    if (importBtn) importBtn.remove();

    // 移除浮动按钮容器
    const floatingContainer = document.getElementById('vtrip-floating-buttons');
    if (floatingContainer) floatingContainer.remove();

    ImportPanel.destroy();

    if (window.TemplateManagementPanel) {
      TemplateManagementPanel.close();
    }
  }

  /**
   * 处理导出点击
   */
  async function _handleExport() {
    const btn = document.getElementById('vtrip-export-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span>导出中...</span>';
    btn.disabled = true;

    const result = await ExportHandler.execute();

    btn.innerHTML = originalText;
    btn.disabled = false;

    if (result.success) {
      const method = result.clipboardSuccess ? '已复制到剪切板' : '已下载JSON文件';
      _showNotification(`导出成功！${method}（${result.sizeKB}KB，${result.fieldCount}个字段）`);
    } else {
      _showNotification(`导出失败：${result.error}`, 'error');
    }
  }

  /**
   * 处理导入点击
   */
  function _handleImport() {
    ImportPanel.show();
  }

  /**
   * 处理保存模版点击
   */
  async function _handleSaveTemplate() {
    if (!window.SaveTemplateDialog) {
      _showNotification('模版功能未加载，请刷新页面后重试', 'error');
      return;
    }

    try {
      const result = await SaveTemplateDialog.show();
      if (result) {
        // 用户保存成功（已在对话框中显示提示）
        console.log('[Main] 模版保存成功:', result);
      }
    } catch (error) {
      console.error('[Main] 保存模版失败:', error);
      _showNotification(`保存失败：${error.message}`, 'error');
    }
  }

  /**
   * 处理模版管理点击
   */
  function _handleManageTemplates() {
    if (!window.TemplateManagementPanel) {
      _showNotification('模版管理功能未加载，请刷新页面后重试', 'error');
      return;
    }

    TemplateManagementPanel.show();
  }

  /**
   * 显示通知提示
   * @param {string} message
   * @param {'success'|'error'} type
   */
  function _showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `vtrip-notification vtrip-notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    // 动画显示
    requestAnimationFrame(() => {
      notification.classList.add('vtrip-notification-show');
    });

    // 3秒后消失
    setTimeout(() => {
      notification.classList.remove('vtrip-notification-show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // 初始化
  _init();

  // 添加 DOM 变化监听，应对 SPA 页面动态渲染
  let observerDebounceTimer = null;
  const observer = new MutationObserver((mutations) => {
    // 防抖，避免频繁触发
    if (observerDebounceTimer) return;

    observerDebounceTimer = setTimeout(async () => {
      observerDebounceTimer = null;

      // 检查按钮是否还在页面上
      const currentMode = await PageDetector.getEffectiveMode();
      const btnId = currentMode === 'domestic' ? 'vtrip-export-btn' : 'vtrip-import-btn';
      const existingBtn = document.getElementById(btnId);

      if (!existingBtn) {
        console.log('[Main] 检测到按钮丢失，尝试重新注入');
        _retryCount = 0;
        if (currentMode === 'domestic') {
          _tryInjectButton('export');
        } else if (currentMode === 'international') {
          _tryInjectButton('import');
        }
      }
    }, 2000); // 2秒防抖
  });

  // 监听 body 的子树变化
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
