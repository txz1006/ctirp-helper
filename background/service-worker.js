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
  console.log('[Background] 收到消息:', message.type, sender);

  if (message.type === 'getPageInfo') {
    sendResponse({
      url: sender.tab?.url,
      title: sender.tab?.title
    });
    return true;
  }

  // LLM API 代理请求（解决 CORS 问题）
  if (message.type === 'llmApiRequest') {
    console.log('[Background] 处理 llmApiRequest');
    handleLLMApiRequest(message.payload)
      .then(result => {
        console.log('[Background] API 成功，返回结果');
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        console.error('[Background] API 失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开启以支持异步响应
  }

  return true;
});

/**
 * 处理 LLM API 请求（绕过 CORS）
 * @param {Object} payload - { config, prompt }
 * @returns {Promise<string>} 改写后的文本
 */
async function handleLLMApiRequest(payload) {
  const { config, prompt } = payload;

  console.log('[Background] 代理 LLM API 请求:', {
    baseUrl: config.baseUrl,
    model: config.model,
    apiKey: config.apiKey ? `${config.apiKey.substring(0, 8)}...` : '(空)'
  });

  try {
    // 确保 baseUrl 以 /chat/completions 结尾（如果没有则添加）
    let apiUrl = config.baseUrl;
    if (!apiUrl.endsWith('/chat/completions')) {
      apiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions';
    }

    console.log('[Background] 请求 URL:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    console.log('[Background] 响应状态:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Background] 错误响应:', errorText);
      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { message: errorText };
      }
      throw new Error(error.error?.message || error.message || `API 错误: ${response.status}`);
    }

    const data = await response.json();
    console.log('[Background] 响应数据（完整）:', JSON.stringify(data, null, 2));

    // 兼容两种格式：
    // 1. 标准 OpenAI 格式: {choices: [...]}
    // 2. 包裹格式（如 cline.bot）: {data: {choices: [...]}, success: true}
    const actualData = data.data || data;

    console.log('[Background] 响应结构检查:', {
      hasDataWrapper: !!data.data,
      hasChoices: !!actualData.choices,
      choicesLength: actualData.choices?.length,
      firstChoice: actualData.choices?.[0],
      message: actualData.choices?.[0]?.message,
      content: actualData.choices?.[0]?.message?.content,
      contentLength: actualData.choices?.[0]?.message?.content?.length
    });

    const rewritten = actualData.choices?.[0]?.message?.content?.trim();

    if (!rewritten) {
      console.error('[Background] 无法提取内容');
      console.error('[Background] 完整响应对象:', data);
      console.error('[Background] 实际数据:', actualData);
      console.error('[Background] 响应 JSON 字符串:', JSON.stringify(data));
      throw new Error('API 返回空内容');
    }

    console.log('[Background] LLM API 请求成功，内容长度:', rewritten.length);
    return rewritten;

  } catch (error) {
    console.error('[Background] LLM API 调用失败:', error);
    throw error;
  }
}
