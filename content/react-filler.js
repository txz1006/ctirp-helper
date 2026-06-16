/**
 * React Fiber 填写器 - 通过直接修改 React 状态来填写表单
 *
 * 原理：找到 DOM 元素对应的 React Fiber 节点，直接修改其 props 和 state
 */

const ReactFiller = {
  /**
   * 查找元素的 React Fiber 节点
   * @param {HTMLElement} element
   * @returns {object|null}
   */
  findFiber(element) {
    const key = Object.keys(element).find(k =>
      k.startsWith('__reactInternalInstance') ||
      k.startsWith('__reactFiber')
    );
    return element[key] || null;
  },

  /**
   * 查找包含 onChange 的父级 Fiber
   * @param {object} fiber
   * @returns {object|null}
   */
  findOnChange(fiber) {
    let current = fiber;
    let depth = 0;
    while (current && depth < 20) {
      if (current.memoizedProps?.onChange || current.pendingProps?.onChange) {
        return current;
      }
      current = current.return;
      depth++;
    }
    return null;
  },

  /**
   * 填写输入框（通过 React）
   * @param {HTMLInputElement} input
   * @param {string} value
   */
  fillInput(input, value) {
    const fiber = this.findFiber(input);
    if (!fiber) {
      // 静默失败，让外部回退到原生方法
      return false;
    }

    const changeFiber = this.findOnChange(fiber);
    const onChange = changeFiber?.memoizedProps?.onChange || changeFiber?.pendingProps?.onChange;

    if (onChange) {
      // 创建模拟事件
      const event = {
        target: { value },
        currentTarget: { value },
        bubbles: true,
        cancelable: false,
        defaultPrevented: false,
        eventPhase: 3,
        isTrusted: true,
        preventDefault: () => {},
        stopPropagation: () => {},
        nativeEvent: new Event('input')
      };

      // 调用 React 的 onChange
      onChange(event);
      return true;
    }

    // 静默失败
    return false;
  },

  /**
   * 填写数字输入框
   * @param {HTMLInputElement} input
   * @param {number} value
   */
  fillInputNumber(input, value) {
    return this.fillInput(input, String(value));
  },

  /**
   * 填写时间选择器
   * @param {HTMLInputElement} input
   * @param {string} value - HH:mm 格式
   */
  fillTimePicker(input, value) {
    // 先聚焦
    input.focus();

    // 通过 React 填写
    const success = this.fillInput(input, value);

    // 失焦触发验证
    input.blur();

    return success;
  },

  /**
   * 填写下拉框（通过点击选项）
   * @param {HTMLElement} selectEl - .ant-select 元素
   * @param {string} targetText - 要选择的文本
   * @returns {Promise<boolean>}
   */
  async fillSelect(selectEl, targetText) {
    // 打开下拉框
    const selection = selectEl.querySelector('.ant-select-selection');
    if (!selection) return false;

    selection.click();
    await this.delay(500);

    // 查找选项
    const dropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    if (!dropdown) return false;

    const options = Array.from(dropdown.querySelectorAll('.ant-select-dropdown-menu-item:not(.ant-select-dropdown-menu-item-disabled)'));

    // 精确匹配
    let match = options.find(opt => opt.textContent.trim() === targetText);

    // 模糊匹配
    if (!match) {
      match = options.find(opt => {
        const text = opt.textContent.trim();
        return text.includes(targetText) || targetText.includes(text);
      });
    }

    if (!match) {
      selection.click(); // 关闭下拉框
      return false;
    }

    // 使用 React 事件点击
    const fiber = this.findFiber(match);
    if (fiber) {
      const onClick = fiber.memoizedProps?.onClick || fiber.pendingProps?.onClick;
      if (onClick) {
        onClick({ target: match, currentTarget: match });
        return true;
      }
    }

    // 回退：使用 DOM 点击
    match.click();
    return true;
  },

  /**
   * 填写搜索下拉框
   * @param {HTMLInputElement} searchInput - 搜索输入框
   * @param {string} targetText - 要选择的文本
   * @returns {Promise<boolean>}
   */
  async fillSearchSelect(searchInput, targetText) {
    const selectEl = searchInput.closest('.ant-select');
    if (!selectEl) return false;

    // 清除当前值
    const clearBtn = selectEl.querySelector('.ant-select-selection__clear');
    if (clearBtn) {
      clearBtn.click();
      await this.delay(300);
    }

    // 打开下拉框
    selectEl.querySelector('.ant-select-selection')?.click();
    await this.delay(300);

    // 输入搜索文本
    this.fillInput(searchInput, targetText);
    await this.delay(500);

    // 等待搜索结果
    const result = await this.waitForSearchResult(targetText, 5000);
    if (!result) return false;

    // 点击结果
    result.click();
    await this.delay(300);

    return true;
  },

  /**
   * 等待搜索结果出现
   * @param {string} targetText
   * @param {number} timeout
   * @returns {Promise<HTMLElement|null>}
   */
  async waitForSearchResult(targetText, timeout = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      await this.delay(200);

      const dropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
      if (!dropdown) continue;

      const options = Array.from(dropdown.querySelectorAll('.ant-select-dropdown-menu-item:not(.ant-select-dropdown-menu-item-disabled)'));
      if (options.length === 0) continue;

      // 策略：只要选项包含搜索文本，就选择它（更宽松的匹配）
      const match = options.find(opt => {
        const text = opt.textContent.trim();
        return text.includes(targetText);
      });

      if (match) return match;
    }

    return null;
  },

  /**
   * 延迟函数
   * @param {number} ms
   * @returns {Promise}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

// 导出到全局
window.ReactFiller = ReactFiller;
