/**
 * 导出逻辑 - 国内版页面表单数据导出
 */

const ExportHandler = {
  /**
   * 执行导出操作
   * @returns {Promise<object>} 导出结果
   */
  async execute() {
    try {
      // 1. 提取表单数据
      const data = FormExtractor.extract();

      // 2. 序列化为JSON
      const json = JSON.stringify(data, null, 2);
      const sizeKB = (new Blob([json]).size / 1024).toFixed(1);

      // 3. 复制到剪切板
      let clipboardSuccess = false;
      try {
        await navigator.clipboard.writeText(json);
        clipboardSuccess = true;
      } catch (e) {
        // 剪切板写入失败，降级为文件下载
        this._downloadJson(json, `export-${data.tab}-${Date.now()}.json`);
      }

      // 4. 更新状态到storage（可选，失败不影响主流程）
      await SafeStorage.set({
        lastExport: {
          timestamp: data.timestamp,
          tab: data.tab,
          sizeKB: sizeKB,
          fieldCount: this._countFields(data.data),
          clipboardSuccess
        }
      });

      return {
        success: true,
        sizeKB,
        fieldCount: this._countFields(data.data),
        clipboardSuccess,
        data
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  },

  /**
   * 下载JSON文件（剪切板失败时降级）
   * @param {string} json
   * @param {string} filename
   */
  _downloadJson(json, filename) {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * 统计字段数量
   * @param {object} data
   * @returns {number}
   */
  _countFields(data) {
    let count = 0;
    for (const group of Object.values(data)) {
      if (typeof group === 'object') {
        count += Object.keys(group).length;
      }
    }
    return count;
  }
};
