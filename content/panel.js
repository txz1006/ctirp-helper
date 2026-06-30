/**
 * 导入浮层面板 - 页面内浮层UI
 *
 * 形态：固定在页面右侧的浮层div
 * 功能：数据输入、转换预览、确认填写、进度展示、回读验证
 */

const ImportPanel = {
  /** 面板DOM元素 */
  panelEl: null,
  /** 当前状态 */
  state: 'input', // input | preview | match | filling | verify
  /** 最近一次匹配结果 */
  _lastMatchResult: null,
  /** 正在手动绑定的未匹配字段 */
  _bindingField: null,
  /** 当前页面+Tab对应的本地模板 */
  _template: { filters: {}, defaults: {}, aiEnabled: {} },
  /** 当前模板存储key */
  _templateKey: '',

  /**
   * 创建并显示面板
   */
  show() {
    if (this.panelEl) {
      this.panelEl.style.display = 'flex';
      return;
    }

    this.panelEl = document.createElement('div');
    this.panelEl.id = 'vtrip-import-panel';
    this.panelEl.innerHTML = this._renderHTML();
    document.body.appendChild(this.panelEl);
    this._bindEvents();
    this._bindDrag();
  },

  /**
   * 隐藏面板
   */
  hide() {
    this._clearOverlayLabels();
    this._bindingField = null;
    document.body.classList.remove('vtrip-binding-mode');
    if (this.panelEl) {
      this.panelEl.style.display = 'none';
    }
  },

  /**
   * 销毁面板
   */
  destroy() {
    this._clearOverlayLabels();
    this._bindingField = null;
    document.body.classList.remove('vtrip-binding-mode');
    if (this.panelEl) {
      this.panelEl.remove();
      this.panelEl = null;
    }
  },

  /**
   * 渲染面板HTML
   * @returns {string}
   */
  _renderHTML() {
    return `
      <div class="vtrip-panel-header">
        <span class="vtrip-panel-title">导入面板</span>
        <button class="vtrip-panel-close" title="关闭">&times;</button>
      </div>
      <div class="vtrip-panel-body">
        <!-- 输入区 -->
        <div class="vtrip-panel-section vtrip-section-input">
          <!-- 数据源选择 -->
          <div class="vtrip-source-selector">
            <label class="vtrip-radio-option">
              <input type="radio" name="data-source" value="json" checked>
              <span>粘贴 JSON 数据</span>
            </label>
            <label class="vtrip-radio-option">
              <input type="radio" name="data-source" value="template">
              <span>使用已保存的模版</span>
            </label>
          </div>

          <!-- JSON 输入区 -->
          <div id="vtrip-json-input-area">
            <div class="vtrip-panel-actions">
              <button class="vtrip-btn vtrip-btn-secondary" id="vtrip-paste-btn">粘贴JSON</button>
              <label class="vtrip-btn vtrip-btn-secondary" id="vtrip-upload-btn">
                上传文件
                <input type="file" accept=".json" id="vtrip-file-input" style="display:none">
              </label>
            </div>
            <textarea class="vtrip-panel-textarea" id="vtrip-json-input" placeholder="在此粘贴导出的JSON数据..."></textarea>
          </div>

          <!-- 模版选择区 -->
          <div id="vtrip-template-select-area" style="display:none">
            <div class="vtrip-template-select-wrapper">
              <label for="vtrip-template-select">选择模版：</label>
              <select id="vtrip-template-select" class="vtrip-template-select">
                <option value="">加载中...</option>
              </select>
            </div>
            <div id="vtrip-template-preview-hint" class="vtrip-input-hint"></div>
          </div>

          <button class="vtrip-btn vtrip-btn-primary" id="vtrip-transform-btn" disabled>下一步：解析并转换</button>
        </div>

        <!-- 预览区 -->
        <div class="vtrip-panel-section vtrip-section-preview" style="display:none">
          <div class="vtrip-section-title">转换结果预览</div>
          <div class="vtrip-preview-list" id="vtrip-preview-list"></div>
          <div class="vtrip-panel-actions">
            <button class="vtrip-btn vtrip-btn-secondary" id="vtrip-ai-rewrite-btn" style="margin-right: auto;">🤖 AI 改写</button>
            <button class="vtrip-btn vtrip-btn-secondary" id="vtrip-back-btn">上一步</button>
            <button class="vtrip-btn vtrip-btn-primary" id="vtrip-match-btn">匹配预览</button>
          </div>
        </div>

        <!-- 匹配预览区 -->
        <div class="vtrip-panel-section vtrip-section-match" style="display:none">
          <div class="vtrip-section-title">字段匹配预览</div>
          <div class="vtrip-match-summary" id="vtrip-match-summary"></div>
          <div class="vtrip-match-list" id="vtrip-match-list"></div>
          <div class="vtrip-panel-actions">
            <button class="vtrip-btn vtrip-btn-secondary" id="vtrip-back-preview-btn">上一步</button>
            <button class="vtrip-btn vtrip-btn-primary" id="vtrip-confirm-btn">确认填写</button>
          </div>
        </div>

        <!-- 填写进度区 -->
        <div class="vtrip-panel-section vtrip-section-filling" style="display:none">
          <div class="vtrip-section-title">填写进度</div>
          <div class="vtrip-progress-bar">
            <div class="vtrip-progress-fill" id="vtrip-progress-fill"></div>
          </div>
          <div class="vtrip-progress-text" id="vtrip-progress-text">0/0</div>
          <div class="vtrip-result-list" id="vtrip-result-list"></div>
        </div>

        <!-- 验证区 -->
        <div class="vtrip-panel-section vtrip-section-verify" style="display:none">
          <div class="vtrip-section-title">回读验证</div>
          <div class="vtrip-verify-summary" id="vtrip-verify-summary"></div>
          <div class="vtrip-verify-details" id="vtrip-verify-details"></div>
          <div class="vtrip-panel-actions">
            <button class="vtrip-btn vtrip-btn-secondary" id="vtrip-back-match-btn">上一步</button>
            <button class="vtrip-btn vtrip-btn-primary" id="vtrip-reimport-btn">重新导入</button>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * 绑定面板拖拽，避免遮挡页面右侧表单控件
   */
  _bindDrag() {
    const header = this.panelEl.querySelector('.vtrip-panel-header');
    if (!header) return;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.vtrip-panel-close')) return;
      dragging = true;
      const rect = this.panelEl.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      this.panelEl.style.right = 'auto';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const maxLeft = window.innerWidth - this.panelEl.offsetWidth;
      const maxTop = window.innerHeight - this.panelEl.offsetHeight;
      const left = Math.max(0, Math.min(maxLeft, startLeft + e.clientX - startX));
      const top = Math.max(0, Math.min(maxTop, startTop + e.clientY - startY));
      this.panelEl.style.left = `${left}px`;
      this.panelEl.style.top = `${top}px`;
    });

    document.addEventListener('mouseup', () => {
      dragging = false;
    });
  },

  /**
   * 绑定事件
   */
  _bindEvents() {
    // 关闭按钮
    this.panelEl.querySelector('.vtrip-panel-close').addEventListener('click', () => this.hide());

    // 数据源选择
    const jsonRadio = this.panelEl.querySelector('input[value="json"]');
    const templateRadio = this.panelEl.querySelector('input[value="template"]');
    const jsonInputArea = this.panelEl.querySelector('#vtrip-json-input-area');
    const templateSelectArea = this.panelEl.querySelector('#vtrip-template-select-area');

    jsonRadio.addEventListener('change', () => {
      if (jsonRadio.checked) {
        jsonInputArea.style.display = 'block';
        templateSelectArea.style.display = 'none';
        this._onInputChange();
      }
    });

    templateRadio.addEventListener('change', () => {
      if (templateRadio.checked) {
        jsonInputArea.style.display = 'none';
        templateSelectArea.style.display = 'block';
        this._loadTemplateList();
      }
    });

    // 模版选择变化
    this.panelEl.querySelector('#vtrip-template-select').addEventListener('change', () => {
      this._onTemplateSelectChange();
    });

    // 粘贴按钮
    this.panelEl.querySelector('#vtrip-paste-btn').addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        this.panelEl.querySelector('#vtrip-json-input').value = text;
        this._onInputChange();
      } catch (e) {
        this._showMessage('剪切板读取失败，请手动粘贴');
      }
    });

    // 文件上传
    this.panelEl.querySelector('#vtrip-file-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        this.panelEl.querySelector('#vtrip-json-input').value = reader.result;
        this._onInputChange();
      };
      reader.readAsText(file);
    });

    // 输入框变化
    this.panelEl.querySelector('#vtrip-json-input').addEventListener('input', () => this._onInputChange());

    // 转换按钮
    this.panelEl.querySelector('#vtrip-transform-btn').addEventListener('click', () => this._handleTransform());

    // 确认填写按钮
    this.panelEl.querySelector('#vtrip-confirm-btn').addEventListener('click', () => this._handleConfirm());

    // 预览区上一步按钮 → 回到输入区
    this.panelEl.querySelector('#vtrip-back-btn').addEventListener('click', () => this._showSection('input'));

    // 匹配预览按钮 → 执行匹配并展示
    this.panelEl.querySelector('#vtrip-match-btn').addEventListener('click', () => this._handleMatch());

    // 匹配预览区上一步按钮 → 清除叠加label，回到预览区
    this.panelEl.querySelector('#vtrip-back-preview-btn').addEventListener('click', () => {
      this._clearOverlayLabels();
      this._showSection('preview');
    });

    // 验证区上一步按钮 → 重新执行匹配预览（反映填写后状态）
    this.panelEl.querySelector('#vtrip-back-match-btn').addEventListener('click', () => this._handleMatch());

    // 验证区重新导入按钮 → 清空回到输入区
    this.panelEl.querySelector('#vtrip-reimport-btn').addEventListener('click', () => this._resetToInput());

    // 面板内未匹配字段的手动绑定按钮
    this.panelEl.addEventListener('click', (e) => {
      const bindBtn = e.target.closest('.vtrip-bind-field-btn');
      if (bindBtn) {
        this._startManualBind(bindBtn.dataset.bindKey);
        return;
      }

      const resetBtn = e.target.closest('.vtrip-reset-binding-btn');
      if (resetBtn) {
        this._resetBinding(resetBtn.dataset.bindKey);
        return;
      }
    });

    // 预览区过滤/默认值/AI变化时保存当前Tab模板
    this.panelEl.addEventListener('change', (e) => {
      if (!e.target.matches('.vtrip-preview-filter, .vtrip-preview-default, .vtrip-preview-ai')) return;
      if (e.target.matches('.vtrip-preview-filter')) {
        e.target.closest('.vtrip-preview-field')?.classList.toggle('vtrip-preview-field-filtered', e.target.checked);
      }
      this._saveTemplateFromPreview();
    });
    this.panelEl.addEventListener('input', (e) => {
      if (!e.target.matches('.vtrip-preview-default')) return;
      this._saveTemplateFromPreview();
    });

    // AI 改写按钮
    this.panelEl.querySelector('#vtrip-ai-rewrite-btn').addEventListener('click', () => this._handleAIRewrite());

    // 页面点击：用于手动选择目标表单控件
    document.addEventListener('click', (e) => this._handlePageBindClick(e), true);
  },

  /**
   * 输入框内容变化
   */
  _onInputChange() {
    const jsonRadio = this.panelEl.querySelector('input[value="json"]');
    if (!jsonRadio.checked) return;

    const text = this.panelEl.querySelector('#vtrip-json-input').value.trim();
    const transformBtn = this.panelEl.querySelector('#vtrip-transform-btn');
    transformBtn.disabled = !text;
  },

  /**
   * 加载模版列表到下拉框
   * @private
   */
  async _loadTemplateList() {
    const select = this.panelEl.querySelector('#vtrip-template-select');
    const transformBtn = this.panelEl.querySelector('#vtrip-transform-btn');
    const hint = this.panelEl.querySelector('#vtrip-template-preview-hint');

    try {
      const templates = await TemplateManager.getAllSorted();

      if (templates.length === 0) {
        select.innerHTML = '<option value="">暂无模版</option>';
        select.disabled = true;
        transformBtn.disabled = true;
        hint.textContent = '还没有保存的模版，请先在页面底部点击"💾 保存为模版"';
        hint.style.color = '#999';
        return;
      }

      select.disabled = false;
      select.innerHTML = '<option value="">请选择模版...</option>' +
        templates.map(tpl => {
          const desc = tpl.description ? ` - ${tpl.description}` : '';
          return `<option value="${tpl.id}">${this._escapeHtml(tpl.name)}${this._escapeHtml(desc)}</option>`;
        }).join('');

      transformBtn.disabled = true;
      hint.textContent = '';

    } catch (error) {
      console.error('[ImportPanel] 加载模版列表失败:', error);
      select.innerHTML = '<option value="">加载失败</option>';
      select.disabled = true;
      transformBtn.disabled = true;
      hint.textContent = '加载模版失败，请刷新页面后重试';
      hint.style.color = '#ff4d4f';
    }
  },

  /**
   * 模版选择变化
   * @private
   */
  _onTemplateSelectChange() {
    const select = this.panelEl.querySelector('#vtrip-template-select');
    const transformBtn = this.panelEl.querySelector('#vtrip-transform-btn');
    const hint = this.panelEl.querySelector('#vtrip-template-preview-hint');

    const templateId = select.value;

    if (!templateId) {
      transformBtn.disabled = true;
      hint.textContent = '';
      return;
    }

    // 显示模版信息
    TemplateStorage.get(templateId).then(template => {
      if (!template) {
        hint.textContent = '模版不存在';
        hint.style.color = '#ff4d4f';
        transformBtn.disabled = true;
        return;
      }

      const fieldCount = TemplateManager.countFields(template);
      const updatedDate = new Date(template.updatedAt).toLocaleDateString('zh-CN');
      hint.textContent = `📦 ${fieldCount} 个字段 | 更新于 ${updatedDate}`;
      hint.style.color = '#666';
      transformBtn.disabled = false;
    });
  },

  /**
   * 处理转换操作
   */
  async _handleTransform() {
    const jsonRadio = this.panelEl.querySelector('input[value="json"]');
    const templateRadio = this.panelEl.querySelector('input[value="template"]');

    let jsonText;

    // 判断数据源
    if (jsonRadio.checked) {
      // 从 JSON 输入框获取
      jsonText = this.panelEl.querySelector('#vtrip-json-input').value.trim();
    } else if (templateRadio.checked) {
      // 从模版获取
      const select = this.panelEl.querySelector('#vtrip-template-select');
      const templateId = select.value;

      if (!templateId) {
        this._showMessage('请选择一个模版');
        return;
      }

      try {
        const templateData = await TemplateManager.applyTemplate(templateId);
        if (!templateData) {
          // 用户取消了不兼容确认
          return;
        }

        // 将模版数据转换为 JSON 字符串
        jsonText = JSON.stringify(templateData);
      } catch (error) {
        console.error('[ImportPanel] 应用模版失败:', error);
        this._showMessage(`应用模版失败：${error.message}`);
        return;
      }
    }

    const parsed = ImportHandler.parseInput(jsonText);

    if (!parsed.success) {
      this._showMessage(parsed.error);
      return;
    }

    this._showMessage('正在转换...');

    try {
      const transformed = await ImportHandler.transform(parsed.data);
      this._transformedData = transformed;
      await this._loadTemplate();
      this._renderPreview(transformed.data);
      this._showSection('preview');
    } catch (e) {
      this._showMessage(`转换失败: ${e.message}`);
    }
  },

  /**
   * 渲染预览列表
   * @param {object} data
   */
  _renderPreview(data) {
    const listEl = this.panelEl.querySelector('#vtrip-preview-list');
    let html = '';

    for (const [groupName, groupData] of Object.entries(data)) {
      html += `<div class="vtrip-preview-group">${this._escapeHtml(groupName)}</div>`;
      for (const [fieldLabel, fieldData] of Object.entries(groupData)) {
        if (!fieldData || typeof fieldData !== 'object') continue;

        // 推荐理由是复合字段，预览中拆成“分类”和“描述”两个可编辑输入，避免把 select + textarea 合成一个值。
        if (fieldData.fieldType === 'recommendReason') {
          const baseKey = this._getFieldKey(groupName, fieldLabel);
          const categoryKey = `${baseKey}::category.text`;
          const descriptionKey = `${baseKey}::description.value`;
          const categoryValue = fieldData.category?.text || '';
          const descriptionValue = fieldData.description?.value || '';
          const categoryFiltered = !!this._template.filters[categoryKey];
          const descriptionFiltered = !!this._template.filters[descriptionKey];
          const categoryAiEnabled = !!this._template.aiEnabled?.[categoryKey];
          const descriptionAiEnabled = !!this._template.aiEnabled?.[descriptionKey];

          html += `
            <div class="vtrip-preview-field ${categoryFiltered ? 'vtrip-preview-field-filtered' : ''}">
              <label class="vtrip-preview-filter-wrap" title="勾选后不填写此项">
                <input type="checkbox" class="vtrip-preview-filter" data-field-key="${this._escapeHtml(categoryKey)}" ${categoryFiltered ? 'checked' : ''}>
                忽略
              </label>
              <label class="vtrip-preview-label">${this._escapeHtml(fieldLabel)} / 分类</label>
              <input class="vtrip-preview-input" data-field-path="${this._escapeHtml(categoryKey)}" data-field-key="${this._escapeHtml(categoryKey)}" value="${this._escapeHtml(categoryValue)}">
              <input class="vtrip-preview-default" style="visibility:hidden" tabindex="-1">
              <label class="vtrip-preview-ai-wrap" title="勾选后可使用AI改写此项内容">
                <input type="checkbox" class="vtrip-preview-ai" data-field-key="${this._escapeHtml(categoryKey)}" ${categoryAiEnabled ? 'checked' : ''}>
                AI
              </label>
            </div>
            <div class="vtrip-preview-field ${descriptionFiltered ? 'vtrip-preview-field-filtered' : ''}">
              <label class="vtrip-preview-filter-wrap" title="勾选后不填写此项">
                <input type="checkbox" class="vtrip-preview-filter" data-field-key="${this._escapeHtml(descriptionKey)}" ${descriptionFiltered ? 'checked' : ''}>
                忽略
              </label>
              <label class="vtrip-preview-label">${this._escapeHtml(fieldLabel)} / 描述</label>
              <input class="vtrip-preview-input" data-field-path="${this._escapeHtml(descriptionKey)}" data-field-key="${this._escapeHtml(descriptionKey)}" value="${this._escapeHtml(descriptionValue)}">
              <input class="vtrip-preview-default" style="visibility:hidden" tabindex="-1">
              <label class="vtrip-preview-ai-wrap" title="勾选后可使用AI改写描述内容">
                <input type="checkbox" class="vtrip-preview-ai" data-field-key="${this._escapeHtml(descriptionKey)}" ${descriptionAiEnabled ? 'checked' : ''}>
                AI
              </label>
            </div>
          `;
          continue;
        }

        const value = this._getDisplayValue(fieldData);
        const fieldKey = this._getFieldKey(groupName, fieldLabel);
        const filtered = !!this._template.filters[fieldKey];
        const aiEnabled = !!this._template.aiEnabled?.[fieldKey];
        const defaultValue = this._template.defaults[fieldKey] || '';
        html += `
          <div class="vtrip-preview-field ${filtered ? 'vtrip-preview-field-filtered' : ''}">
            <label class="vtrip-preview-filter-wrap" title="勾选后不使用JSON原值；如填写默认值，则改用默认值">
              <input type="checkbox" class="vtrip-preview-filter" data-field-key="${this._escapeHtml(fieldKey)}" ${filtered ? 'checked' : ''}>
              忽略
            </label>
            <label class="vtrip-preview-label">${this._escapeHtml(fieldLabel)}</label>
            <input class="vtrip-preview-input" data-domkey="${this._escapeHtml(fieldData.domKey || '')}" data-field-key="${this._escapeHtml(fieldKey)}" value="${this._escapeHtml(value)}">
            <input class="vtrip-preview-default" data-field-key="${this._escapeHtml(fieldKey)}" placeholder="默认值" value="${this._escapeHtml(defaultValue)}">
            <label class="vtrip-preview-ai-wrap" title="勾选后可使用AI改写此字段内容">
              <input type="checkbox" class="vtrip-preview-ai" data-field-key="${this._escapeHtml(fieldKey)}" ${aiEnabled ? 'checked' : ''}>
              AI
            </label>
          </div>
        `;
      }
    }

    listEl.innerHTML = html;
  },

  /**
   * 获取字段模板key
   * @param {string} groupName
   * @param {string} fieldLabel
   * @returns {string}
   */
  _getFieldKey(groupName, fieldLabel) {
    return `${groupName}::${fieldLabel}`;
  },

  /**
   * 获取当前页面模板存储key：URL路径 + 当前Tab
   * @returns {string}
   */
  _getTemplateKey() {
    const tab = FormExtractor._detectCurrentTab();
    return `vtripImportTemplate::${location.origin}${location.pathname}::${tab}`;
  },

  /**
   * 加载当前页面+Tab的本地模板
   */
  async _loadTemplate() {
    this._templateKey = this._getTemplateKey();
    const stored = await SafeStorage.get([this._templateKey]);
    this._template = stored[this._templateKey] || { filters: {}, defaults: {}, aiEnabled: {} };
    this._template.filters = this._template.filters || {};
    this._template.defaults = this._template.defaults || {};
    this._template.aiEnabled = this._template.aiEnabled || {};
  },

  /**
   * 从预览区收集并保存模板
   */
  async _saveTemplateFromPreview() {
    if (!this._templateKey) this._templateKey = this._getTemplateKey();

    const filters = {};
    const defaults = {};
    const aiEnabled = {};

    this.panelEl.querySelectorAll('.vtrip-preview-filter').forEach(input => {
      if (input.checked) filters[input.dataset.fieldKey] = true;
    });
    this.panelEl.querySelectorAll('.vtrip-preview-default').forEach(input => {
      const value = input.value.trim();
      if (value) defaults[input.dataset.fieldKey] = value;
    });
    this.panelEl.querySelectorAll('.vtrip-preview-ai').forEach(input => {
      if (input.checked) aiEnabled[input.dataset.fieldKey] = true;
    });

    this._template = { filters, defaults, aiEnabled };
    await SafeStorage.set({ [this._templateKey]: this._template });
  },

  _getSourceTag(source) {
    switch (source) {
      case 'auto': return '已自动转换';
      case 'aiTranslation': return 'AI翻译';
      case 'translationFailed': return '翻译失败';
      case 'needsTranslation': return '待翻译';
      case 'defaultValue': return '默认值';
      default: return '未知';
    }
  },

  _getDisplayValue(fieldData) {
    if (!fieldData) return '';

    // 行程页专属字段（tourdays）：按 meta.role 取显示值，避免对象被 JSON.stringify
    if (fieldData.fieldType === 'itineraryField') {
      const role = fieldData.meta && fieldData.meta.role;
      const v = fieldData.value;
      if (v === null || v === undefined) return '';
      if (role === 'radio') return String(v);
      if (role === 'radioTime') {
        const r = v.radio ?? '';
        const t = Array.isArray(v.time) ? v.time.join(':') : '';
        return r === '-1' ? (t || '具体时间') : r;
      }
      if (role === 'checkbox') return Array.isArray(v) ? v.join(',') : String(v);
      if (role === 'select' || role === 'searchSelect') return (v && v.text) ? String(v.text) : '';
      if (role === 'numberGroup' && v && Array.isArray(v.values)) {
        const seps = v.separators || [];
        return v.values.map((val, i) => (val ?? '') + (i < seps.length ? seps[i] : '')).join('');
      }
      if (role === 'number' || role === 'text') return String(v);
      if (role === 'note' || role === 'title') return String(v).substring(0, 100) + (String(v).length > 100 ? '...' : '');
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
    }

    // 推荐理由（productImageText 页面）
    if (fieldData.fieldType === 'recommendReason') {
      const category = fieldData.category?.text || '';
      const description = fieldData.description?.value || '';
      return `${category}: ${description.substring(0, 50)}${description.length > 50 ? '...' : ''}`;
    }

    // 富文本编辑器（productImageText 页面）
    if (fieldData.fieldType === 'richText') {
      // 优先使用纯文本；零宽字符/换行视为空，再从 HTML 中提取
      const normalizeRichText = text => String(text || '').replace(/[​-‍﻿]/g, '').trim();
      let textValue = fieldData.textValue || '';
      if (!normalizeRichText(textValue) && fieldData.value) {
        // 从HTML中提取纯文本（图片型富文本可能仍为空）
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = fieldData.value;
        textValue = tempDiv.textContent || tempDiv.innerText || '';
      }
      const displayText = normalizeRichText(textValue).substring(0, 100);
      return displayText ? displayText + (normalizeRichText(textValue).length > 100 ? '...' : '') : '[富文本内容]';
    }

    if (fieldData.fieldType === 'inputNumberGroup' && fieldData.value && fieldData.value.values) {
      const vals = fieldData.value.values;
      const seps = fieldData.value.separators || [];
      let display = '';
      vals.forEach((v, i) => {
        display += (v !== null && v !== undefined ? v : '');
        if (i < seps.length) display += seps[i];
      });
      return display;
    }
    if (fieldData.fieldType === 'mixedGroup' && fieldData.value && fieldData.value.parts) {
      return fieldData.value.parts.map(p => {
        if (p.type === 'separator') return p.text;
        if (p.type === 'inputNumber') return p.value;
        if (p.type === 'timePicker') return p.value;
        if (p.type === 'select' || p.type === 'searchSelect') return p.text;
        return '';
      }).join(' ');
    }
    if (fieldData.fieldType === 'selectGroup' && fieldData.value && fieldData.value.values) {
      return fieldData.value.values.join(' - ');
    }
    if (fieldData.fieldType === 'cascader' && Array.isArray(fieldData.value)) {
      return fieldData.value.join(' / ');
    }
    if (fieldData.fieldType === 'customDisplay') {
      if (typeof fieldData.value === 'object' && fieldData.value.title) {
        return fieldData.value.title;
      }
      return String(fieldData.value ?? '');
    }
    if (fieldData.fieldType === 'searchSelectGroup' && fieldData.value && fieldData.value.items) {
      return fieldData.value.items.map(item => item.text || '').join(', ');
    }
    if (fieldData.fieldType === 'multiSearchSelect' && fieldData.value && Array.isArray(fieldData.value.text)) {
      return fieldData.value.text.join(', ');
    }
    if (fieldData.fieldType === 'searchSelect' && fieldData.value && fieldData.value.text) {
      return fieldData.value.text;
    }
    if (fieldData.fieldType === 'select' && fieldData.value && fieldData.value.text) {
      return fieldData.value.text;
    }
    if (typeof fieldData.value === 'object') return JSON.stringify(fieldData.value);
    return String(fieldData.value ?? '');
  },

  /**
   * 处理确认填写
   */
  async _handleConfirm() {
    // 清除页面上的叠加预览label
    this._clearOverlayLabels();
    this._bindingField = null;
    document.body.classList.remove('vtrip-binding-mode');

    // 从预览输入框收集用户修改后的值，并保存模板
    this._collectPreviewEdits();
    await this._saveTemplateFromPreview();
    const effectiveData = this._getEffectiveImportData();

    this._showSection('filling');

    // 初始化进度显示
    this._initFillProgress();

    try {
      // 导入前补齐卡片结构（仅 tourdays 行程描述页需要，决议 2A 时序）
      // 补卡必须在逐字段 fill 之前批量完成，否则定位竞态
      await this._ensureStructureBeforeFill(effectiveData);

      const result = await FormFiller.fillAll(effectiveData.data, (current, total, lastResult) => {
        // 实时更新进度
        this._updateFillProgress(current, total, lastResult);
      });

      this._renderFillProgress(result);

      // 填写完成后清理多余的默认空模板卡片（tourdays 专属，避免残留多余空卡）
      await this._cleanupExcessCards(effectiveData);

      // 填写完成后自动回读验证
      const verifyReport = FormFiller.verify(effectiveData);
      this._renderVerifyReport(verifyReport);
      this._showSection('verify');
    } catch (e) {
      this._showMessage(`填写失败: ${e.message}`);
    }
  },

  /**
   * 导入前补齐页面卡片结构（tourdays 行程描述页专属）
   * 若当前激活的页面适配器实现了 ensureAllStructure，则在 fillAll 前批量补齐卡片，
   * 保证国际页卡片序列与国内导出结构一致后再逐字段填入（决议 1A/2A）。
   * 其他页面适配器未实现该方法则跳过，零影响。
   * @private
   */
  async _ensureStructureBeforeFill(effectiveData) {
    const adapter = window.PageRegistry && window.PageRegistry.getActive
      ? window.PageRegistry.getActive()
      : null;
    if (!adapter || typeof adapter.ensureAllStructure !== 'function') return;

    try {
      await adapter.ensureAllStructure(effectiveData, (msg) => {
        this._showMessage(msg);
      });
    } catch (e) {
      console.warn('[ImportPanel] 补齐卡片结构失败，继续按现有结构填写:', e.message);
    }
  },

  /**
   * 导入填写后清理多余的默认空模板卡片（tourdays 行程描述页专属）
   * 国际版每天预置空模板卡，补齐+填写后超出源序列的空卡会被删除，避免残留。
   * 适配器未实现 cleanupExcessCards 则跳过，零影响。
   * @private
   */
  async _cleanupExcessCards(effectiveData) {
    const adapter = window.PageRegistry && window.PageRegistry.getActive
      ? window.PageRegistry.getActive()
      : null;
    if (!adapter || typeof adapter.cleanupExcessCards !== 'function') return;

    try {
      await adapter.cleanupExcessCards(effectiveData, (msg) => {
        this._showMessage(msg);
      });
    } catch (e) {
      console.warn('[ImportPanel] 清理多余卡片失败:', e.message);
    }
  },

  /**
   * 处理 AI 改写
   * @private
   */
  async _handleAIRewrite() {
    if (!window.AIRewriteDialog) {
      alert('AI 改写功能未加载，请刷新页面后重试');
      return;
    }

    // 收集勾选了 AI 的字段
    const aiCheckboxes = this.panelEl.querySelectorAll('.vtrip-preview-ai:checked');
    if (aiCheckboxes.length === 0) {
      alert('请先勾选需要 AI 改写的字段（最右侧的 AI 复选框）');
      return;
    }

    const fields = [];
    aiCheckboxes.forEach(checkbox => {
      const fieldKey = checkbox.dataset.fieldKey;
      const fieldRow = checkbox.closest('.vtrip-preview-field');
      const label = fieldRow.querySelector('.vtrip-preview-label').textContent;
      const input = fieldRow.querySelector('.vtrip-preview-input');
      const value = input.value;

      if (value && value.trim()) {
        fields.push({
          key: fieldKey,
          label: label,
          value: value,
          input: input
        });
      }
    });

    if (fields.length === 0) {
      alert('勾选的字段没有内容可以改写');
      return;
    }

    // 显示 AI 改写对话框
    try {
      const result = await AIRewriteDialog.show(fields);
      if (!result) {
        // 用户取消
        return;
      }

      // 应用改写结果
      const { rewrittenFields } = result;
      fields.forEach(field => {
        if (rewrittenFields[field.key]) {
          field.input.value = rewrittenFields[field.key];
          // 触发 input 事件以保存到模板
          field.input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      console.log('[ImportPanel] AI 改写完成，已更新', fields.length, '个字段');

    } catch (error) {
      console.error('[ImportPanel] AI 改写失败:', error);
      alert(`AI 改写失败：${error.message}`);
    }
  },

  /**
   * 收集预览面板中用户修改的值
   */
  _collectPreviewEdits() {
    const inputs = this.panelEl.querySelectorAll('.vtrip-preview-input');
    inputs.forEach(input => {
      const fieldPath = input.dataset.fieldPath;
      if (fieldPath) {
        this._setFieldValueByPath(fieldPath, input.value);
        return;
      }

      const domKey = input.dataset.domkey;
      if (!domKey) return;
      // 更新transformedData中对应字段的值
      for (const groupData of Object.values(this._transformedData.data)) {
        for (const fieldData of Object.values(groupData)) {
          if (fieldData && fieldData.domKey === domKey) {
            // 复杂类型不覆盖，保持原始结构；复合字段通过 data-field-path 单独回写。
            // itineraryField（行程页）含 numberGroup/select/radio 等 meta.role 分发，
            // value 结构是对象/数组，绝不能用预览输入框字符串覆盖。
            if (fieldData.fieldType === 'inputNumberGroup' ||
                fieldData.fieldType === 'mixedGroup' ||
                fieldData.fieldType === 'selectGroup' ||
                fieldData.fieldType === 'searchSelectGroup' ||
                fieldData.fieldType === 'multiSearchSelect' ||
                fieldData.fieldType === 'customDisplay' ||
                fieldData.fieldType === 'recommendReason' ||
                fieldData.fieldType === 'richText' ||
                fieldData.fieldType === 'itineraryField') {
              continue;
            }
            if (fieldData.fieldType === 'searchSelect' && fieldData.value) {
              fieldData.value.text = input.value;
            } else if (fieldData.fieldType === 'select' && fieldData.value) {
              fieldData.value.text = input.value;
            } else {
              fieldData.value = input.value;
            }
          }
        }
      }
    });
  },

  /**
   * 根据预览输入路径回写嵌套字段值，例如：推荐理由::推荐理由_0::description.value
   * @param {string} fieldPath
   * @param {string} value
   */
  _setFieldValueByPath(fieldPath, value) {
    const [groupName, fieldLabel, nestedPath] = fieldPath.split('::');
    const fieldData = this._transformedData?.data?.[groupName]?.[fieldLabel];
    if (!fieldData || !nestedPath) return;

    const keys = nestedPath.split('.');
    let target = fieldData;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!target[keys[i]] || typeof target[keys[i]] !== 'object') return;
      target = target[keys[i]];
    }
    target[keys[keys.length - 1]] = value;
  },

  /**
   * 根据过滤字段和默认值生成实际参与填写的数据
   * @returns {object}
   */
  _getEffectiveImportData() {
    const effective = JSON.parse(JSON.stringify(this._transformedData));
    for (const [groupName, groupData] of Object.entries(effective.data)) {
      for (const [fieldLabel, fieldData] of Object.entries(groupData)) {
        if (!fieldData || typeof fieldData !== 'object') continue;

        const fieldKey = this._getFieldKey(groupName, fieldLabel);

        // 复合字段（推荐理由）：按子项 key 单独处理忽略，子项被忽略则清空该子项的值
        if (fieldData.fieldType === 'recommendReason') {
          const categoryKey = `${fieldKey}::category.text`;
          const descriptionKey = `${fieldKey}::description.value`;
          if (this._template.filters[categoryKey] && fieldData.category) {
            fieldData.category.text = '';
          }
          if (this._template.filters[descriptionKey] && fieldData.description) {
            fieldData.description.value = '';
          }
          continue;
        }

        const filtered = !!this._template.filters[fieldKey];
        const defaultValue = this._template.defaults[fieldKey] || '';
        const currentValue = this._getDisplayValue(fieldData).trim();
        const shouldUseDefault = defaultValue && (filtered || !currentValue);

        if (shouldUseDefault) {
          fieldData.value = this._convertValueForTargetType(fieldData.value, defaultValue, fieldData.fieldType);
          fieldData.source = 'defaultValue';
          continue;
        }

        if (filtered) {
          delete groupData[fieldLabel];
        }
      }
    }
    return effective;
  },

  /**
   * 初始化填写进度显示
   * @private
   */
  _initFillProgress() {
    const fillEl = this.panelEl.querySelector('#vtrip-progress-fill');
    const textEl = this.panelEl.querySelector('#vtrip-progress-text');
    const listEl = this.panelEl.querySelector('#vtrip-result-list');

    fillEl.style.width = '0%';
    textEl.textContent = '0/0';
    listEl.innerHTML = '<div style="color: #808C9D; padding: 8px;">正在初始化...</div>';
  },

  /**
   * 实时更新填写进度
   * @param {number} current - 当前已完成数量
   * @param {number} total - 总数量
   * @param {object} lastResult - 最后一个字段的填写结果
   * @private
   */
  _updateFillProgress(current, total, lastResult) {
    const fillEl = this.panelEl.querySelector('#vtrip-progress-fill');
    const textEl = this.panelEl.querySelector('#vtrip-progress-text');
    const listEl = this.panelEl.querySelector('#vtrip-result-list');

    // 更新进度条
    const pct = total > 0 ? (current / total * 100) : 0;
    fillEl.style.width = `${pct}%`;
    textEl.textContent = `${current}/${total}`;

    // 追加最新的填写结果
    if (lastResult) {
      const icon = lastResult.status === 'success' ? '✅' : lastResult.status === 'skipped' ? '⚠️' : '❌';
      const reason = lastResult.reason ? ` (${lastResult.reason})` : '';
      const item = document.createElement('div');
      item.className = `vtrip-result-item ${lastResult.status}`;
      item.innerHTML = `${icon} ${this._escapeHtml(lastResult.field)}${reason}`;
      listEl.appendChild(item);

      // 自动滚动到最新项
      listEl.scrollTop = listEl.scrollHeight;
    }
  },

  /**
   * 渲染填写进度（完成后调用，确保最终状态正确）
   * @param {object} result
   */
  _renderFillProgress(result) {
    const fillEl = this.panelEl.querySelector('#vtrip-progress-fill');
    const textEl = this.panelEl.querySelector('#vtrip-progress-text');
    const listEl = this.panelEl.querySelector('#vtrip-result-list');

    const pct = result.total > 0 ? (result.success / result.total * 100) : 0;
    fillEl.style.width = `${pct}%`;
    textEl.textContent = `${result.success}/${result.total}`;

    let html = '';
    result.details.forEach(d => {
      const icon = d.status === 'success' ? '✅' : d.status === 'skipped' ? '⚠️' : '❌';
      const reason = d.reason ? ` (${d.reason})` : '';
      html += `<div class="vtrip-result-item ${d.status}">${icon} ${this._escapeHtml(d.field)}${reason}</div>`;
    });
    listEl.innerHTML = html;
  },

  /**
   * 渲染验证报告
   * @param {object} report
   */
  _renderVerifyReport(report) {
    const summaryEl = this.panelEl.querySelector('#vtrip-verify-summary');
    const detailsEl = this.panelEl.querySelector('#vtrip-verify-details');

    summaryEl.innerHTML = `
      匹配 <strong>${report.matched.length}</strong> |
      不匹配 <strong>${report.mismatched.length}</strong> |
      跳过 <strong>${report.skipped.length}</strong>
    `;

    let html = '';
    report.mismatched.forEach(m => {
      html += `<div class="vtrip-verify-mismatch">
        <strong>${this._escapeHtml(m.field)}</strong>:
        期望 "${this._escapeHtml(m.expectedDisplay ?? String(m.expected))}" → 实际 "${this._escapeHtml(m.actualDisplay ?? String(m.actual))}"
      </div>`;
    });
    report.skipped.forEach(s => {
      html += `<div class="vtrip-verify-skipped">
        <strong>${this._escapeHtml(s.field)}</strong>: ${this._escapeHtml(s.reason)}
      </div>`;
    });
    detailsEl.innerHTML = html;
  },

  /**
   * 处理匹配预览操作
   * 提取当前页面字段，与导入数据按label匹配，在页面控件上叠加预览label
   */
  async _handleMatch() {
    if (!this._transformedData || !this._transformedData.data) {
      this._showMessage('没有可匹配的数据');
      return;
    }

    // 收集预览面板中用户修改的值，并保存模板
    this._collectPreviewEdits();
    await this._saveTemplateFromPreview();

    // 先清除已有的叠加label
    this._clearOverlayLabels();

    // 提取当前页面字段映射，并使用过滤/默认值后的有效导入数据
    const pageFieldMap = FormExtractor.extractFieldMap();
    const effectiveData = this._getEffectiveImportData();
    const importData = effectiveData.data;

    // 执行匹配
    const matchResult = this._matchFields(importData, pageFieldMap);

    // 在页面控件上叠加预览label
    this._renderOverlayLabels(matchResult);

    // 面板显示摘要
    this._lastMatchResult = matchResult;
    this._renderMatchSummary(matchResult);
    this._showSection('match');
  },

  /**
   * 在页面控件上叠加预览label
   * @param {object} matchResult - { matched, unmatched, noTarget }
   */
  _renderOverlayLabels(matchResult) {
    const { matched } = matchResult;

    matched.forEach(m => {
      // 优先用页面字段的 domKey 定位真实控件；复合字段的导入 domKey 可能不存在于目标页面。
      const targetDomKey = m.pageField?.domKey || m.fieldData?.domKey || '';
      let targetEl = targetDomKey ? document.getElementById(targetDomKey) : null;

      // 兼容 select：domKey 通常在内部 input 上，叠加标签应挂在整行 form-item 上。
      let formItem = targetEl ? targetEl.closest('.ant-form-item') : null;

      // 兜底：通过页面 label 找对应行，而不是导入字段 label（推荐理由_0）
      if (!formItem) {
        const labelEl = this._findLabelElement(m.pageLabel || m.label);
        formItem = labelEl ? labelEl.closest('.ant-form-item') : null;
      }
      if (!formItem) return;

      const controlWrapper = formItem.querySelector('.ant-form-item-control');
      if (!controlWrapper) return;

      // 创建叠加label
      const overlay = document.createElement('div');
      overlay.className = 'vtrip-overlay-label vtrip-overlay-matched';
      const displayValue = m.importValue || '(空)';
      overlay.textContent = displayValue;

      // 添加 title 显示完整内容
      overlay.title = `将填入: ${displayValue}`;

      // 设置控件区域为relative定位（如果还不是）
      const computedStyle = window.getComputedStyle(controlWrapper);
      if (computedStyle.position === 'static') {
        controlWrapper.style.position = 'relative';
      }

      controlWrapper.appendChild(overlay);
    });
  },

  /**
   * 开始手动绑定字段
   * @param {string} bindKey - group::label
   */
  _startManualBind(bindKey) {
    const allFields = [
      ...(this._lastMatchResult?.matched || []),
      ...(this._lastMatchResult?.unmatched || [])
    ];
    const field = allFields.find(item => item.bindKey === bindKey);
    if (!field) {
      this._showMessage('未找到要绑定的数据');
      return;
    }

    this._bindingField = field;
    this._showMessage(`请选择页面控件：${field.label}`);
    document.body.classList.add('vtrip-binding-mode');
  },

  /**
   * 重置字段绑定，恢复默认匹配规则
   * @param {string} bindKey - group::label
   */
  _resetBinding(bindKey) {
    const allFields = [
      ...(this._lastMatchResult?.matched || []),
      ...(this._lastMatchResult?.unmatched || [])
    ];
    const field = allFields.find(item => item.bindKey === bindKey);
    if (!field || !field.fieldData) {
      this._showMessage('未找到要重置的字段');
      return;
    }

    // 移除手动绑定标记
    delete field.fieldData.manualMappedFrom;

    // 恢复原始的 domKey（基于 label 自动匹配）
    // 从原始导入数据中查找初始 domKey
    const [groupName, fieldLabel] = bindKey.split('::');
    const originalField = this._rawData?.data?.[groupName]?.[fieldLabel];
    if (originalField && originalField.domKey) {
      field.fieldData.domKey = originalField.domKey;
    } else {
      // 如果原始数据没有 domKey，则清除它（让自动匹配重新工作）
      delete field.fieldData.domKey;
    }

    this._showMessage(`已重置"${fieldLabel}"的绑定`);

    // 重新执行匹配
    this._handleMatch();
  },

  /**
   * 处理页面点击，完成未匹配字段到页面控件的手动绑定
   * @param {MouseEvent} e
   */
  _handlePageBindClick(e) {
    if (!this._bindingField) return;
    if (this.panelEl && this.panelEl.contains(e.target)) return;

    const formItem = e.target.closest('.ant-form-item');
    if (!formItem) return;

    e.preventDefault();
    e.stopPropagation();

    const labelEl = formItem.querySelector('.ant-form-item-label label');
    const controlWrapper = formItem.querySelector('.ant-form-item-control');
    if (!labelEl || !controlWrapper) {
      this._showMessage('请选择有效的表单控件');
      return;
    }

    const domKey = labelEl.getAttribute('for') || '';
    if (!domKey) {
      this._showMessage('目标控件没有可绑定的domKey');
      return;
    }

    const targetFieldType = this._detectTargetFieldType(controlWrapper);
    this._bindingField.fieldData.domKey = domKey;
    this._bindingField.fieldData.fieldType = targetFieldType;
    this._bindingField.fieldData.value = this._convertValueForTargetType(
      this._bindingField.fieldData.value,
      this._bindingField.importValue,
      targetFieldType
    );
    this._bindingField.fieldData.manualMappedFrom = this._bindingField.label;

    this._clearOverlayLabels();
    this._renderManualOverlay(controlWrapper, this._bindingField.importValue);
    this._bindingField = null;
    document.body.classList.remove('vtrip-binding-mode');
    this._handleMatch();
  },

  /**
   * 根据目标控件DOM推断填写类型
   * @param {HTMLElement} controlWrapper
   * @returns {string}
   */
  _detectTargetFieldType(controlWrapper) {
    if (controlWrapper.querySelector('input[type="radio"]')) return 'radio';
    if (controlWrapper.querySelector('input[type="checkbox"]')) return 'checkbox';
    if (controlWrapper.querySelectorAll('.ant-input-number').length > 1) return 'inputNumberGroup';
    if (controlWrapper.querySelector('.ant-input-number')) return 'inputNumber';
    if (controlWrapper.querySelectorAll('.ant-select').length > 1) return 'selectGroup';
    const select = controlWrapper.querySelector('.ant-select');
    if (select) {
      return select.querySelector('input.ant-select-search__field[id]') ? 'searchSelect' : 'select';
    }
    if (controlWrapper.querySelector('textarea')) return 'textarea';
    if (controlWrapper.querySelector('input')) return 'input';
    return 'customDisplay';
  },

  /**
   * 将导入值转换成目标控件需要的结构
   * @param {*} rawValue - 原字段值
   * @param {string} displayValue - 面板显示值
   * @param {string} targetFieldType - 目标控件类型
   * @returns {*}
   */
  _convertValueForTargetType(rawValue, displayValue, targetFieldType) {
    const text = String(displayValue ?? '').trim();
    switch (targetFieldType) {
      case 'select':
      case 'searchSelect':
        return { text };
      case 'selectGroup':
        return { values: this._splitDisplayValues(text) };
      case 'inputNumber': {
        const firstNumber = text.match(/-?\d+(?:\.\d+)?/);
        return firstNumber ? Number(firstNumber[0]) : rawValue;
      }
      case 'inputNumberGroup':
        return { values: this._extractNumbers(text), separators: [] };
      case 'radio':
        return text;
      case 'checkbox':
        return text === 'true' || text === '是' || text === '开启' || text === '选中';
      default:
        return rawValue;
    }
  },

  /**
   * 从显示文本中拆出多个值，优先按常见分隔符，否则提取数字
   * @param {string} text
   * @returns {string[]}
   */
  _splitDisplayValues(text) {
    const parts = text.split(/\s*(?:-|到|至|\/|,|，)\s*/).filter(Boolean);
    return parts.length > 1 ? parts : this._extractNumbers(text).map(String);
  },

  /**
   * 从文本中提取数字
   * @param {string} text
   * @returns {number[]}
   */
  _extractNumbers(text) {
    return (text.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  },

  /**
   * 手动绑定后立即渲染红色预览label
   * @param {HTMLElement} controlWrapper
   * @param {string} value
   */
  _renderManualOverlay(controlWrapper, value) {
    const computedStyle = window.getComputedStyle(controlWrapper);
    if (computedStyle.position === 'static') {
      controlWrapper.style.position = 'relative';
    }
    const overlay = document.createElement('div');
    overlay.className = 'vtrip-overlay-label vtrip-overlay-unmatched';
    const displayValue = value || '(空)';
    overlay.textContent = displayValue;
    overlay.title = `将填入: ${displayValue}`;
    controlWrapper.appendChild(overlay);
  },

  /**
   * 通过label文本找到对应的label元素
   * @param {string} labelText
   * @returns {HTMLElement|null}
   */
  _findLabelElement(labelText) {
    const labels = document.querySelectorAll('.ant-form-item-label label');
    for (const label of labels) {
      if (label.textContent.trim() === labelText) {
        return label;
      }
    }
    return null;
  },

  /**
   * 清除页面上所有叠加的预览label
   */
  _clearOverlayLabels() {
    const overlays = document.querySelectorAll('.vtrip-overlay-label');
    overlays.forEach(el => el.remove());
  },

  /**
   * 面板中渲染匹配摘要
   * @param {object} matchResult
   */
  _renderMatchSummary(matchResult) {
    const { matched, unmatched, noTarget } = matchResult;

    const summaryEl = this.panelEl.querySelector('#vtrip-match-summary');
    summaryEl.innerHTML = `
      <div class="vtrip-match-stat">
        <span class="vtrip-match-stat-item vtrip-stat-matched">匹配 ${matched.length}</span>
        <span class="vtrip-match-stat-item vtrip-stat-unmatched">未匹配 ${unmatched.length}</span>
        <span class="vtrip-match-stat-item vtrip-stat-notarget">无数据源 ${noTarget.length}</span>
      </div>
    `;

    const listEl = this.panelEl.querySelector('#vtrip-match-list');
    let html = '';

    if (unmatched.length > 0) {
      html += '<div class="vtrip-match-group-title vtrip-stat-unmatched">导入数据未匹配（页面上无对应字段）</div>';
      unmatched.forEach(m => {
        html += `
          <div class="vtrip-match-row vtrip-match-unmatched">
            <div class="vtrip-match-label">${this._escapeHtml(m.label)}</div>
            <div class="vtrip-match-values">
              <span class="vtrip-match-import">${this._escapeHtml(m.importValue || '(空)')}</span>
              <span class="vtrip-preview-tag ${m.source || ''}">${this._getSourceTag(m.source)}</span>
              <button class="vtrip-bind-field-btn" data-bind-key="${this._escapeHtml(m.bindKey)}">选择控件</button>
            </div>
          </div>
        `;
      });
    } else {
      html += '<div class="vtrip-match-empty">暂无未匹配字段，可直接确认填写；如需调整已匹配字段，可展开底部面板。</div>';
    }

    if (noTarget.length > 0) {
      html += '<div class="vtrip-match-group-title vtrip-stat-notarget">页面字段无数据源（不会被填写）</div>';
      noTarget.forEach(m => {
        html += `
          <div class="vtrip-match-row vtrip-match-notarget">
            <div class="vtrip-match-label">${this._escapeHtml(m.label)}</div>
            <div class="vtrip-match-values">
              <span class="vtrip-match-current">${this._escapeHtml(m.currentValue || '(空)')}</span>
            </div>
          </div>
        `;
      });
    }

    if (matched.length > 0) {
      html += `<details class="vtrip-match-matched-panel">
        <summary class="vtrip-match-group-title vtrip-stat-matched">已匹配字段（${matched.length}）—— 可点击展开重新选择控件</summary>`;
      matched.forEach(m => {
        html += `
          <div class="vtrip-match-row vtrip-match-matched">
            <div class="vtrip-match-label">${this._escapeHtml(m.label)}</div>
            <div class="vtrip-match-values">
              <button class="vtrip-bind-field-btn" data-bind-key="${this._escapeHtml(m.bindKey)}">重新选择</button>
              <button class="vtrip-reset-binding-btn" data-bind-key="${this._escapeHtml(m.bindKey)}" title="恢复默认匹配">重置</button>
            </div>
          </div>
        `;
      });
      html += '</details>';
    }

    if (matched.length === 0 && unmatched.length === 0 && noTarget.length === 0) {
      html = '<div style="color:#52c41a;text-align:center;padding:12px;">没有需要填写的字段</div>';
    }

    listEl.innerHTML = html;
  },

  /**
   * 将导入数据与页面字段进行匹配
   * @param {object} importData - 导入转换后的数据
   * @param {object} pageFieldMap - 当前页面字段映射
   * @returns {object} { matched, unmatched, noTarget }
   */
  _matchFields(importData, pageFieldMap) {
    const matched = [];
    const unmatched = [];
    const noTarget = [];

    const pageIndex = {};
    const pageDomIndex = {};
    for (const [groupName, fields] of Object.entries(pageFieldMap)) {
      for (const [fieldLabel, fieldInfo] of Object.entries(fields)) {
        const indexedField = { ...fieldInfo, pageGroup: groupName, pageLabel: fieldLabel };
        pageIndex[fieldLabel] = indexedField;
        if (fieldInfo.domKey) {
          pageDomIndex[fieldInfo.domKey] = indexedField;
        }
      }
    }

    for (const [groupName, groupData] of Object.entries(importData)) {
      for (const [fieldLabel, fieldData] of Object.entries(groupData)) {
        if (!fieldData || typeof fieldData !== 'object') continue;

        const bindKey = `${groupName}::${fieldLabel}`;
        const originalFieldData = this._findFieldDataByKey(bindKey) || fieldData;
        const pageField = fieldData.domKey && pageDomIndex[fieldData.domKey]
          ? pageDomIndex[fieldData.domKey]
          : pageIndex[fieldLabel];
        if (pageField) {
          matched.push({
            bindKey,
            label: fieldLabel,
            importGroup: groupName,
            pageGroup: pageField.pageGroup,
            pageLabel: pageField.pageLabel,
            pageField,
            importValue: this._getDisplayValue(fieldData),
            currentValue: pageField.currentValue,
            fieldType: fieldData.fieldType,
            source: fieldData.source,
            fieldData: originalFieldData
          });
          delete pageIndex[pageField.pageLabel || fieldLabel];
        } else {
          unmatched.push({
            bindKey,
            label: fieldLabel,
            importGroup: groupName,
            importValue: this._getDisplayValue(fieldData),
            fieldType: fieldData.fieldType,
            source: fieldData.source,
            fieldData: originalFieldData
          });
        }
      }
    }

    for (const [fieldLabel, fieldInfo] of Object.entries(pageIndex)) {
      // 空白的页面占位字段不提示“无数据源”，避免 productImageText 的新增空行造成误导。
      const currentValue = String(fieldInfo.currentValue || '').replace(/^:\s*$/, '').trim();
      if (!currentValue) continue;

      noTarget.push({
        label: fieldLabel,
        pageGroup: fieldInfo.pageGroup,
        currentValue: fieldInfo.currentValue,
        fieldType: fieldInfo.fieldType
      });
    }

    return { matched, unmatched, noTarget };
  },

  /**
   * 根据字段key查找原始转换数据中的字段对象
   * @param {string} fieldKey - group::label
   * @returns {object|null}
   */
  _findFieldDataByKey(fieldKey) {
    if (!this._transformedData?.data) return null;
    const [groupName, fieldLabel] = fieldKey.split('::');
    return this._transformedData.data[groupName]?.[fieldLabel] || null;
  },

  /**
   * 切换显示的section
   * @param {string} section - input | preview | match | filling | verify
   */
  _showSection(section) {
    this.state = section;
    const sections = ['input', 'preview', 'match', 'filling', 'verify'];
    sections.forEach(s => {
      const el = this.panelEl.querySelector(`.vtrip-section-${s}`);
      if (el) el.style.display = s === section ? 'block' : 'none';
    });
  },

  /**
   * 重置到输入状态，清空数据
   */
  _resetToInput() {
    this._clearOverlayLabels();
    this._bindingField = null;
    this._lastMatchResult = null;
    document.body.classList.remove('vtrip-binding-mode');
    this._transformedData = null;
    this.panelEl.querySelector('#vtrip-json-input').value = '';
    this._onInputChange();
    this._showSection('input');
  },

  _showMessage(msg) {
    // 简单的消息提示
    let msgEl = this.panelEl.querySelector('.vtrip-panel-message');
    if (!msgEl) {
      msgEl = document.createElement('div');
      msgEl.className = 'vtrip-panel-message';
      this.panelEl.querySelector('.vtrip-panel-body').prepend(msgEl);
    }
    msgEl.textContent = msg;
    msgEl.style.display = 'block';
    setTimeout(() => { msgEl.style.display = 'none'; }, 3000);
  },

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
