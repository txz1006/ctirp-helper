/**
 * Sanitizers — 字符清洗函数集（D6 函数式，从对话框/filler 抽出，独立可测）
 *
 * 来源：
 *   internationalRules  ← ai-rewrite-dialog.js _sanitizeForInternationalRules
 *   normalizeImageId    ← form-filler.js _normalizeRichTextImageId
 *
 * 逻辑原样搬入，两处原方法改为转发到这里，消除重复，预留可测边界（阶段3，§5.4）。
 */

const Sanitizers = {
  /**
   * 通用清洗：去首尾空白
   * @param {*} text
   * @returns {string}
   */
  default(text) {
    return String(text ?? '').trim();
  },

  /**
   * 国际版推荐理由字符规则清洗
   * 允许：中文、英文、数字、空白换行，以及指定全角/半角符号。
   * 实现原样来自 ai-rewrite-dialog.js:300 _sanitizeForInternationalRules。
   * @param {string} text
   * @returns {string}
   */
  internationalRules(text) {
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
   * 规范化富文本中所有 <img> 的 imageid，统一为固定值。
   * 携程图片在不同环境下 imageid 不一致，导入时统一改写以避免无效引用。
   * 实现原样来自 form-filler.js _normalizeRichTextImageId。
   * @param {string} html
   * @param {string} [fixedId='41973044']
   * @returns {string}
   */
  normalizeImageId(html, fixedId = '41973044') {
    if (!html) return '';
    return html.replace(/(\bimageid\s*=\s*")[^"]*(")/gi, `$1${fixedId}$2`);
  }
};

if (typeof window !== 'undefined') { window.Sanitizers = Sanitizers; }
if (typeof module !== 'undefined' && module.exports) { module.exports = Sanitizers; }
