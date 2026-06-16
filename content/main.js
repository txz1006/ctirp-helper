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
    const footer = document.querySelector('.maincontent-bottomfooter > div');
    if (footer) {
      _retryCount = 0;
      if (type === 'export') {
        _injectExportButton(footer);
      } else {
        _injectImportButton(footer);
      }
      return;
    }

    // footer未找到，启动重试
    if (_retryCount >= MAX_RETRIES) return;

    if (!_retryTimer) {
      _retryTimer = setInterval(() => {
        _retryCount++;
        const f = document.querySelector('.maincontent-bottomfooter > div');
        if (f) {
          clearInterval(_retryTimer);
          _retryTimer = null;
          _retryCount = 0;
          if (type === 'export') {
            _injectExportButton(f);
          } else {
            _injectImportButton(f);
          }
        } else if (_retryCount >= MAX_RETRIES) {
          clearInterval(_retryTimer);
          _retryTimer = null;
        }
      }, RETRY_INTERVAL);
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
    btn.innerHTML = '<span>导出数据</span>';
    btn.addEventListener('click', _handleExport);

    footer.appendChild(btn);
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

    const importBtn = document.getElementById('vtrip-import-btn');
    if (importBtn) importBtn.remove();

    ImportPanel.destroy();
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
})();
