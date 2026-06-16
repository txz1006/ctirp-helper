/**
 * Background Service Worker
 *
 * 职责：管理插件生命周期、跨页面通信
 */

// 安装时仅初始化未设置的项，不覆盖已有值
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get([
    'mode', 'apiKey', 'apiEndpoint', 'apiType', 'lastExport', 'lastImport'
  ]);

  const defaults = {
    mode: 'auto',
    apiKey: '',
    apiEndpoint: '',
    apiType: 'openai',
    lastExport: null,
    lastImport: null
  };

  // 只设置尚未存在的key，不覆盖已有值
  const toSet = {};
  for (const [key, defaultVal] of Object.entries(defaults)) {
    if (stored[key] === undefined) {
      toSet[key] = defaultVal;
    }
  }

  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
  }
});

// 监听来自content script或popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getPageInfo') {
    sendResponse({
      url: sender.tab?.url,
      title: sender.tab?.title
    });
  }
  return true;
});
