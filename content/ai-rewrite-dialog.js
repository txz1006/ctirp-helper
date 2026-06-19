/**
 * AI Rewrite Dialog
 *
 * AI 改写对话框 - 使用 LLM 改写选中的字段内容
 */

const AIRewriteDialog = {
  /**
   * 显示 AI 改写对话框
   * @param {Array} fields - 需要改写的字段列表 [{key, label, value}]
   * @returns {Promise<Object|null>} 改写后的结果 {language, rewrittenFields} 或 null（取消）
   */
  async show(fields) {
    if (!fields || fields.length === 0) {
      alert('请先勾选需要 AI 改写的字段');
      return null;
    }

    // 加载 LLM 配置
    const config = await this._loadLLMConfig();

    return new Promise((resolve) => {
      const dialog = this._createDialog(fields, config);
      document.body.appendChild(dialog);
      this._bindEvents(dialog, fields, config, resolve);
    });
  },

  /**
   * 加载 LLM 配置
   * @private
   */
  async _loadLLMConfig() {
    const stored = await SafeStorage.get(['llmConfig']);
    console.log('[AIRewriteDialog] 加载的配置:', stored);
    const config = stored.llmConfig || {
      provider: 'openai',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini'
    };
    console.log('[AIRewriteDialog] 最终配置:', config);
    return config;
  },

  /**
   * 保存 LLM 配置
   * @private
   */
  async _saveLLMConfig(config) {
    await SafeStorage.set({ llmConfig: config });
  },

  /**
   * 创建对话框 DOM
   * @private
   */
  _createDialog(fields, config) {
    const hasConfig = config && config.apiKey;
    const overlay = document.createElement('div');
    overlay.id = 'ai-rewrite-overlay';
    overlay.innerHTML = `
      <div class="ai-rewrite-dialog">
        <div class="dialog-header">
          <h3>🤖 AI 改写</h3>
        </div>
        <div class="dialog-body">
          <div class="ai-rewrite-info">
            <div class="info-item">
              <span class="info-label">待改写字段：</span>
              <span class="info-value">${fields.length} 个</span>
            </div>
            <div class="info-item">
              <span class="info-label">预计时间：</span>
              <span class="info-value">约 ${Math.ceil(fields.length * 3)} 秒</span>
            </div>
          </div>

          <div class="ai-rewrite-fields">
            <div class="fields-title">待改写字段：</div>
            <div class="fields-list">
              ${fields.map(f => `<div class="field-item">• ${this._escapeHtml(f.label)}</div>`).join('')}
            </div>
          </div>

          <div class="form-group">
            <label>改写语言：</label>
            <div class="ai-language-selector">
              <label class="ai-radio-option">
                <input type="radio" name="ai-language" value="zh-TW" checked>
                <span>繁体中文</span>
              </label>
              <label class="ai-radio-option">
                <input type="radio" name="ai-language" value="en">
                <span>英语</span>
              </label>
            </div>
          </div>

          ${!hasConfig ? `
          <div class="ai-rewrite-notice">
            ⚠️ 尚未配置 LLM API
            <div style="margin-top: 8px;">
              请先在扩展图标的弹出面板中配置 API Key、Base URL 和模型。
            </div>
          </div>
          ` : ''}

          <div class="error-message" id="ai-rewrite-error" style="display:none"></div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-secondary" id="cancel-ai-rewrite-btn">取消</button>
          <button class="btn btn-primary" id="confirm-ai-rewrite-btn" ${!hasConfig ? 'disabled' : ''}>🤖 开始改写</button>
        </div>
      </div>
    `;
    return overlay;
  },

  /**
   * 绑定事件
   * @private
   */
  _bindEvents(dialog, fields, config, resolve) {
    const cancelBtn = dialog.querySelector('#cancel-ai-rewrite-btn');
    const confirmBtn = dialog.querySelector('#confirm-ai-rewrite-btn');
    const errorMsg = dialog.querySelector('#ai-rewrite-error');

    // 取消按钮
    cancelBtn.addEventListener('click', () => {
      this._closeDialog(dialog);
      resolve(null);
    });

    // 开始改写按钮
    confirmBtn.addEventListener('click', async () => {
      const language = dialog.querySelector('input[name="ai-language"]:checked').value;

      // 验证配置
      if (!config.apiKey) {
        this._showError(errorMsg, '请先在扩展弹出面板中配置 API Key');
        return;
      }

      // 禁用按钮
      confirmBtn.disabled = true;
      confirmBtn.textContent = '改写中...';
      cancelBtn.disabled = true;
      errorMsg.style.display = 'none'; // 清空之前的错误信息

      try {
        // 调用 AI 批量改写
        const rewrittenFields = await this._rewriteFields(fields, language, config, (progress) => {
          if (progress === 0) {
            confirmBtn.textContent = '正在改写...';
          } else {
            confirmBtn.textContent = '改写完成！';
          }
        });

        // 成功
        this._showSuccess('✅ AI 改写完成');
        this._closeDialog(dialog);
        resolve({ language, rewrittenFields });

      } catch (error) {
        console.error('[AIRewriteDialog] 改写失败:', error);
        this._showError(errorMsg, error.message || '改写失败，请稍后重试');

        // 恢复按钮（失败时不关闭弹窗）
        confirmBtn.disabled = false;
        confirmBtn.textContent = '🤖 重试改写';
        cancelBtn.disabled = false;
      }
    });

    // ESC 键关闭
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        this._closeDialog(dialog);
        resolve(null);
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);

    // 点击遮罩关闭
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        this._closeDialog(dialog);
        resolve(null);
      }
    });
  },

  /**
   * 调用 AI 一次性改写所有字段
   * @private
   */
  async _rewriteFields(fields, language, config, onProgress) {
    const targetLang = language === 'zh-TW' ? '繁体中文' : '英语';

    // 构建批量改写提示词（明确分离标签和值）
    const fieldList = fields.map((f, idx) =>
      `字段${idx}: "${f.value}"`
    ).join('\n');

    const prompt = `你是一个${targetLang}翻译助手。请${targetLang === '繁体中文' ? '将简体中文转换为繁体中文（只做字符转换，不要意译）' : '将中文翻译为英文'}。

输入的字段值：
${fieldList}

转换规则：
1. ${targetLang === '繁体中文' ? '只做简体→繁体的字符转换（例如：国家 → 國家，亚洲 → 亞洲）' : '翻译为简洁的英文'}
2. ${targetLang === '繁体中文' ? '不要意译地名（格鲁吉亚 → 格魯吉亞，不是 喬治亞）' : ''}
3. 如果包含英文，保持英文不变
4. 国际版字符限制：只允许中文、英文、数字及指定符号。请删除 emoji、箭头、大于号等不符合规则的字符。
5. 允许的全角符号：，、：（）「」『』《》＋＆｜／—～；
6. 允许的半角符号：· . ° % , -
7. 可将常见半角符号转换为允许的全角符号，例如 : → ：，/ → ／，~ → ～，| → ｜

输出格式：
- 必须是纯 JSON 对象
- 不要包含任何其他文字（不要markdown、不要说明）
- key 是 "field_0", "field_1", "field_2"...
- value 是转换后的文本（只有值，没有任何标签前缀）

示例：
输入: 字段0: "格鲁吉亚-第比利斯"
输出: {"field_0": "格魯吉亞-第比利斯"}

错误示例（不要这样）：
{"field_0": "集合城市：格魯吉亞-第比利斯"}  ❌ 不要加标签

现在请输出 JSON：`;

    onProgress(0);

    try {
      console.log('[AIRewriteDialog] 批量改写字段:', fields.length);

      // 通过 background script 代理请求（解决 CORS 问题）
      const response = await chrome.runtime.sendMessage({
        type: 'llmApiRequest',
        payload: { config, prompt }
      });

      if (!response) {
        throw new Error('Background script 无响应，请检查扩展是否正常运行');
      }

      if (!response.success) {
        throw new Error(response.error || 'API 请求失败');
      }

      // 解析 JSON 响应（处理可能的 markdown 代码块包裹）
      let rewrittenData;
      try {
        let jsonText = response.data.trim();

        // 移除可能的 markdown 代码块标记
        if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
        }

        rewrittenData = JSON.parse(jsonText);
        console.log('[AIRewriteDialog] 解析成功，字段数:', Object.keys(rewrittenData).length);
      } catch (e) {
        console.error('[AIRewriteDialog] JSON 解析失败');
        console.error('[AIRewriteDialog] 原始响应:', response.data);
        console.error('[AIRewriteDialog] 解析错误:', e.message);
        throw new Error(`API 返回格式错误：${e.message}`);
      }

      // 映射回结果对象，并在本地执行一次国际版字符规则清洗，避免模型输出非法字符
      const results = {};
      fields.forEach((field, idx) => {
        const key = `field_${idx}`;
        const rewrittenValue = rewrittenData[key] || field.value; // 如果没有改写结果，保留原值
        results[field.key] = this._sanitizeForInternationalRules(rewrittenValue);
      });

      onProgress(fields.length);
      console.log('[AIRewriteDialog] 批量改写成功');
      return results;

    } catch (error) {
      console.error('[AIRewriteDialog] 批量改写失败:', error);
      throw error;
    }
  },

  /**
   * 按国际版推荐理由规则清洗文本。
   * 允许：中文、英文、数字、空白换行，以及指定全角/半角符号。
   * @param {string} text
   * @returns {string}
   * @private
   */
  _sanitizeForInternationalRules(text) {
    if (!text) return '';

    const mapped = String(text)
      .replace(/:/g, '：')
      .replace(/\(/g, '（')
      .replace(/\)/g, '）')
      .replace(/\+/g, '＋')
      .replace(/&/g, '＆')
      .replace(/\|/g, '｜')
      .replace(/\//g, '／')
      .replace(/~/g, '～')
      .replace(/;/g, '；')
      .replace(/[>＞]+/g, '—')
      .replace(/[<＜]+/g, '');

    // 允许字符：CJK、英文、数字、空白，以及用户指定符号。
    return mapped
      .replace(/[^一-鿿A-Za-z0-9\s，、：（）「」『』《》＋＆｜／—～；·.°%,-]/g, '')
      .replace(/[ \t]+/g, ' ')
      .trim();
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
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  /**
   * 关闭对话框
   * @private
   */
  _closeDialog(dialog) {
    dialog.classList.add('fade-out');
    setTimeout(() => dialog.remove(), 200);
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
window.AIRewriteDialog = AIRewriteDialog;
