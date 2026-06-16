/**
 * Popup逻辑 - 设置 + 状态概览
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 加载当前设置
  const stored = await chrome.storage.local.get([
    'mode', 'apiKey', 'apiEndpoint', 'apiType',
    'detectedPage', 'effectiveMode', 'lastExport', 'lastImport'
  ]);

  // 模式切换
  const modeRadios = document.querySelectorAll('input[name="mode"]');
  const currentMode = stored.mode || 'auto';
  modeRadios.forEach(radio => {
    radio.checked = radio.value === currentMode;
    radio.addEventListener('change', () => {
      chrome.storage.local.set({ mode: radio.value });
    });
  });

  // 页面状态
  const detectedPage = stored.detectedPage || 'unknown';
  const effectiveMode = stored.effectiveMode || 'unknown';
  document.getElementById('detected-page').textContent = _modeLabel(detectedPage);
  document.getElementById('effective-mode').textContent = _modeLabel(effectiveMode);

  // 最近操作
  if (stored.lastExport) {
    const e = stored.lastExport;
    document.getElementById('last-export').textContent =
      `${e.tab || '--'} | ${e.sizeKB || '--'}KB | ${e.clipboardSuccess ? '剪切板' : '文件'}`;
  }
  if (stored.lastImport) {
    document.getElementById('last-import').textContent =
      stored.lastImport.timestamp ? new Date(stored.lastImport.timestamp).toLocaleString() : '--';
  }

  // API配置
  document.getElementById('api-type').value = stored.apiType || 'openai';
  document.getElementById('api-key').value = stored.apiKey || '';
  document.getElementById('api-endpoint').value = stored.apiEndpoint || '';

  // 保存配置
  document.getElementById('save-config-btn').addEventListener('click', async () => {
    const btn = document.getElementById('save-config-btn');
    await chrome.storage.local.set({
      apiType: document.getElementById('api-type').value,
      apiKey: document.getElementById('api-key').value,
      apiEndpoint: document.getElementById('api-endpoint').value
    });
    btn.textContent = '已保存';
    btn.classList.add('saved');
    setTimeout(() => {
      btn.textContent = '保存配置';
      btn.classList.remove('saved');
    }, 1500);
  });

  // 监听storage变化更新状态
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.detectedPage) {
      document.getElementById('detected-page').textContent = _modeLabel(changes.detectedPage.newValue);
    }
    if (changes.effectiveMode) {
      document.getElementById('effective-mode').textContent = _modeLabel(changes.effectiveMode.newValue);
    }
  });
});

function _modeLabel(mode) {
  switch (mode) {
    case 'domestic': return '国内版（导出）';
    case 'international': return '国际版（导入）';
    case 'auto': return '自动检测';
    default: return '未知';
  }
}
