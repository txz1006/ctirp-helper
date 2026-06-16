/**
 * 页面检测器 - 自动识别国内版/国际版页面
 *
 * 检测策略：
 * 1. 检查页面label文本语言（中文=国内版，英文=国际版）
 * 2. 检查ant-select选中值的语言
 * 3. 结合用户手动设置的模式
 */

const PageDetector = {
  /** 检测结果缓存 */
  _cachedResult: null,

  /**
   * 检测当前页面是国内版还是国际版
   * @returns {'domestic' | 'international' | 'unknown'}
   */
  detect() {
    if (this._cachedResult) return this._cachedResult;

    // 策略1：检查表单label文本
    const labels = document.querySelectorAll('.ant-form-item-label label');
    if (labels.length > 0) {
      const sampleText = Array.from(labels).slice(0, 5).map(l => l.textContent).join('');
      if (/[\u4e00-\u9fa5]/.test(sampleText) && !/[a-zA-Z]{3,}/.test(sampleText.replace(/\s/g, ''))) {
        this._cachedResult = 'domestic';
        return 'domestic';
      }
      if (/[a-zA-Z]{3,}/.test(sampleText) && !/[\u4e00-\u9fa5]/.test(sampleText)) {
        this._cachedResult = 'international';
        return 'international';
      }
    }

    // 策略2：检查已选下拉框值的语言
    const selectedValues = document.querySelectorAll('.ant-select-selection-selected-value');
    if (selectedValues.length > 0) {
      const sampleText = Array.from(selectedValues).slice(0, 3).map(el => el.getAttribute('title') || el.textContent).join('');
      if (/[\u4e00-\u9fa5]/.test(sampleText)) {
        this._cachedResult = 'domestic';
        return 'domestic';
      }
    }

    // 策略3：检查操作栏按钮文本
    const footerButtons = document.querySelectorAll('.maincontent-bottomfooter button span');
    if (footerButtons.length > 0) {
      const buttonText = Array.from(footerButtons).map(s => s.textContent).join('');
      if (/保存|提交/.test(buttonText)) {
        this._cachedResult = 'domestic';
        return 'domestic';
      }
      if (/Save|Submit/i.test(buttonText)) {
        this._cachedResult = 'international';
        return 'international';
      }
    }

    this._cachedResult = 'unknown';
    return 'unknown';
  },

  /**
   * 获取有效模式：用户手动设置优先，否则用自动检测结果
   * @returns {Promise<'domestic' | 'international'>}
   */
  async getEffectiveMode() {
    const stored = await SafeStorage.get('mode');
    if (stored.mode === 'domestic' || stored.mode === 'international') {
      return stored.mode;
    }
    const detected = this.detect();
    return detected === 'unknown' ? 'domestic' : detected;
  },

  /** 清除缓存（页面变化时调用） */
  invalidateCache() {
    this._cachedResult = null;
  }
};
