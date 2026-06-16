/**
 * Ant Design 1.x 填写器
 * 专门针对 antd@1.0.16 版本的填写方案
 */

const AntD1Filler = {
  /**
   * 填写输入框
   * 对于 Ant Design 1.x，直接修改 DOM 值并触发原生事件即可
   */
  fillInput(input, value) {
    // 直接设置值
    input.value = value;

    // 只触发 change 事件
    input.dispatchEvent(new Event('change', { bubbles: true }));

    return true;
  },

  /**
   * 填写数字输入框
   */
  fillInputNumber(input, value) {
    // 直接设置值
    input.value = String(value);

    // 只触发 change 事件
    input.dispatchEvent(new Event('change', { bubbles: true }));

    return true;
  },

  /**
   * 填写时间选择器
   * Ant Design 1.x 的 TimePicker - 直接设置值
   */
  async fillTimePicker(input, value) {
    // 方法1：直接设置 value（最简单）
    input.value = value;

    // 等待 DOM 更新
    await this.delay(100);

    // 触发一次 change 事件即可
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await this.delay(200);

    console.log('[AntD1] TimePicker 填写完成，当前值:', input.value);

    return true;
  },

  /**
   * 填写普通下拉框
   * Ant Design 1.x - 通过输入文字后失焦来选中
   */
  async fillSelect(selectEl, targetText) {
    console.log('[AntD1] 填写下拉框:', targetText);

    // 找到 select 中的输入框（如果有）
    const searchInput = selectEl.querySelector('input.ant-select-search__field');

    if (searchInput) {
      // 方案1：有搜索输入框，直接输入文字
      console.log('[AntD1] 使用输入方式');

      // 聚焦
      searchInput.focus();
      await this.delay(200);

      // 尝试简繁体转换后的所有可能
      const variants = [
        targetText,
        this.toSimplified(targetText),
        this.toTraditional(targetText)
      ];

      // 去重
      const uniqueVariants = [...new Set(variants)];
      console.log('[AntD1] 尝试的文本变体:', uniqueVariants);

      // 尝试第一个变体
      const textToInput = uniqueVariants[0];

      // 输入文字
      searchInput.value = textToInput;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      await this.delay(300);

      // 失焦触发选择
      searchInput.blur();

      await this.delay(500);

      console.log('[AntD1] 输入方式完成');
      return true;
    }

    // 方案2：没有搜索框，使用点击方式
    console.log('[AntD1] 使用点击方式');

    // 展开下拉框
    const selection = selectEl.querySelector('.ant-select-selection');
    if (!selection) return false;

    selection.click();
    await this.delay(800);

    // 查找选项
    const dropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    if (!dropdown) {
      console.warn('[AntD1] 下拉框未展开');
      return false;
    }

    const options = Array.from(dropdown.querySelectorAll('.ant-select-dropdown-menu-item'));
    if (options.length === 0) {
      console.warn('[AntD1] 未找到选项');
      return false;
    }

    console.log('[AntD1] 可用选项:', options.map(o => o.textContent.trim()));

    // 如果只有一个选项，直接选择
    if (options.length === 1) {
      console.log('[AntD1] 只有一个选项，直接选择:', options[0].textContent.trim());
      options[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await this.delay(50);
      options[0].click();
      await this.delay(300);
      return true;
    }

    // 繁简体转换
    const targetSimplified = this.toSimplified(targetText);
    const targetTraditional = this.toTraditional(targetText);

    // 1. 精确匹配（考虑繁简体）
    let match = options.find(opt => {
      const text = opt.textContent.trim();
      return text === targetText ||
             text === targetSimplified ||
             text === targetTraditional;
    });

    // 2. 包含匹配
    if (!match) {
      match = options.find(opt => {
        const text = opt.textContent.trim();
        return text.includes(targetText) ||
               text.includes(targetSimplified) ||
               text.includes(targetTraditional);
      });
    }

    // 3. 被包含匹配
    if (!match) {
      match = options.find(opt => {
        const text = opt.textContent.trim();
        return targetText.includes(text) ||
               targetSimplified.includes(text) ||
               targetTraditional.includes(text);
      });
    }

    if (match) {
      console.log('[AntD1] 匹配到:', match.textContent.trim());

      // Ant Design 1.x 可能需要 mousedown 事件
      match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await this.delay(50);
      match.click();
      await this.delay(300);

      return true;
    }

    console.warn('[AntD1] 未匹配到:', targetText);
    selection.click(); // 关闭下拉框
    return false;
  },

  /**
   * 填写搜索下拉框
   * Ant Design 1.x 的搜索框需要直接设置 value 并触发 input 事件
   */
  async fillSearchSelect(searchInput, targetText) {
    const selectEl = searchInput.closest('.ant-select');
    if (!selectEl) return false;

    // 清除旧值
    const clearBtn = selectEl.querySelector('.ant-select-selection__clear');
    if (clearBtn) {
      clearBtn.click();
      await this.delay(300);
    }

    // 展开下拉框
    const selection = selectEl.querySelector('.ant-select-selection');
    if (selection) {
      selection.click();
      await this.delay(500);
    }

    // 输入搜索文本
    searchInput.value = targetText;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));

    console.log('[AntD1] 搜索输入:', targetText);

    // 等待搜索结果（增加等待时间）
    await this.delay(500);
    const result = await this.waitForSearchResult(targetText, 8000);  // 增加到 8 秒
    if (!result) {
      console.warn('[AntD1] 搜索无结果:', targetText);
      return false;
    }

    console.log('[AntD1] 搜索匹配到:', result.textContent.trim());

    // 点击结果
    result.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await this.delay(100);
    result.click();
    await this.delay(500);

    return true;
  },

  /**
   * 等待搜索结果
   */
  async waitForSearchResult(targetText, timeout = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      await this.delay(200);

      const dropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
      if (!dropdown) continue;

      const options = Array.from(dropdown.querySelectorAll('.ant-select-dropdown-menu-item:not(.ant-select-dropdown-menu-item-disabled)'));
      if (options.length === 0) continue;

      console.log('[AntD1] 搜索结果:', options.map(o => o.textContent.trim()));

      // 如果只有一个选项，直接返回
      if (options.length === 1) {
        console.log('[AntD1] 只有一个搜索结果，直接选择');
        return options[0];
      }

      // 包含匹配即可
      const match = options.find(opt => {
        const text = opt.textContent.trim();
        return text.includes(targetText);
      });

      if (match) return match;
    }

    return null;
  },

  /**
   * 延迟
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * 简体转繁体（常用字 + 语言相关）
   */
  toTraditional(text) {
    const map = {
      // 基础字
      '普通话': '普通話',
      '粤语': '粵語',
      '英语': '英語',
      '泰语': '泰語',
      '越南语': '越南語',
      '日语': '日語',
      '韩语': '韓語',
      '当地语言': '當地語言',
      '西班牙语': '西班牙語',

      // 单字映射
      '语': '語',
      '国': '國',
      '台': '臺',
      '湾': '灣',
      '广': '廣',
      '东': '東',
      '义': '義',
      '为': '為',
      '书': '書',
      '长': '長',
      '门': '門',
      '马': '馬',
      '飞': '飛',
      '风': '風',
      '个': '個',
      '产': '產',
      '业': '業',
      '从': '從',
      '会': '會',
      '电': '電',
      '华': '華',
      '边': '邊',
      '达': '達',
      '车': '車',
      '时': '時',
      '间': '間',
      '听': '聽',
      '说': '說',
      '读': '讀',
      '写': '寫',
      '当': '當'
    };

    let result = text;
    // 先尝试整词匹配
    for (const [s, t] of Object.entries(map)) {
      if (s.length > 1 && result.includes(s)) {
        result = result.replace(new RegExp(s, 'g'), t);
      }
    }
    // 再尝试单字匹配
    for (const [s, t] of Object.entries(map)) {
      if (s.length === 1) {
        result = result.replace(new RegExp(s, 'g'), t);
      }
    }
    return result;
  },

  /**
   * 繁体转简体（常用字 + 语言相关）
   */
  toSimplified(text) {
    const map = {
      // 基础字
      '普通話': '普通话',
      '粵語': '粤语',
      '英語': '英语',
      '泰語': '泰语',
      '越南語': '越南语',
      '日語': '日语',
      '韓語': '韩语',
      '當地語言': '当地语言',
      '西班牙語': '西班牙语',

      // 单字映射
      '語': '语',
      '國': '国',
      '臺': '台',
      '灣': '湾',
      '廣': '广',
      '東': '东',
      '義': '义',
      '為': '为',
      '書': '书',
      '長': '长',
      '門': '门',
      '馬': '马',
      '飛': '飞',
      '風': '风',
      '個': '个',
      '產': '产',
      '業': '业',
      '從': '从',
      '會': '会',
      '電': '电',
      '華': '华',
      '邊': '边',
      '達': '达',
      '車': '车',
      '時': '时',
      '間': '间',
      '聽': '听',
      '說': '说',
      '讀': '读',
      '寫': '写',
      '當': '当'
    };

    let result = text;
    // 先尝试整词匹配
    for (const [t, s] of Object.entries(map)) {
      if (t.length > 1 && result.includes(t)) {
        result = result.replace(new RegExp(t, 'g'), s);
      }
    }
    // 再尝试单字匹配
    for (const [t, s] of Object.entries(map)) {
      if (t.length === 1) {
        result = result.replace(new RegExp(t, 'g'), s);
      }
    }
    return result;
  }
};

// 导出到全局
window.AntD1Filler = AntD1Filler;
