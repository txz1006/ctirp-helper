/**
 * Popup逻辑 - 设置 + 状态概览
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 加载当前设置
  const stored = await chrome.storage.local.get([
    'mode', 'llmConfig',
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

  // LLM 配置
  const llmConfig = stored.llmConfig || {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
  };
  document.getElementById('llm-api-key').value = llmConfig.apiKey || '';
  document.getElementById('llm-base-url').value = llmConfig.baseUrl || 'https://api.openai.com/v1';
  document.getElementById('llm-model').value = llmConfig.model || 'gpt-4o-mini';

  // 保存 LLM 配置
  document.getElementById('save-llm-config-btn').addEventListener('click', async () => {
    const btn = document.getElementById('save-llm-config-btn');
    const statusEl = document.getElementById('llm-config-status');

    const config = {
      apiKey: document.getElementById('llm-api-key').value.trim(),
      baseUrl: document.getElementById('llm-base-url').value.trim(),
      model: document.getElementById('llm-model').value.trim()
    };

    console.log('[Popup] 准备保存配置:', {
      ...config,
      apiKey: config.apiKey ? `${config.apiKey.substring(0, 8)}...` : '(空)'
    });

    // 验证
    if (!config.apiKey) {
      statusEl.textContent = '❌ 请输入 API Key';
      statusEl.style.display = 'block';
      statusEl.style.color = '#ff4d4f';
      return;
    }

    if (!config.baseUrl) {
      statusEl.textContent = '❌ 请输入 Base URL';
      statusEl.style.display = 'block';
      statusEl.style.color = '#ff4d4f';
      return;
    }

    if (!config.model) {
      statusEl.textContent = '❌ 请输入模型名称';
      statusEl.style.display = 'block';
      statusEl.style.color = '#ff4d4f';
      return;
    }

    await chrome.storage.local.set({ llmConfig: config });
    console.log('[Popup] 配置已保存到 chrome.storage.local');

    btn.textContent = '✅ 已保存';
    btn.classList.add('saved');
    statusEl.textContent = '✅ 配置已保存';
    statusEl.style.display = 'block';
    statusEl.style.color = '#52c41a';

    setTimeout(() => {
      btn.textContent = '保存配置';
      btn.classList.remove('saved');
      statusEl.style.display = 'none';
    }, 2000);
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
