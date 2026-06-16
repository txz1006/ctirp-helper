/**
 * 安全的 Chrome Storage 访问包装器
 * 解决扩展上下文失效（Extension context invalidated）问题
 *
 * 当扩展重新加载或更新后，content script 的 chrome API 上下文会失效，
 * 直接调用 chrome.storage 会抛出错误。本模块提供安全的访问方法。
 */

const SafeStorage = {
  /**
   * 检查 chrome.storage API 是否可用
   * @returns {boolean}
   */
  isAvailable() {
    try {
      return !!(chrome && chrome.storage && chrome.storage.local);
    } catch (e) {
      return false;
    }
  },

  /**
   * 安全地读取 storage 数据
   * @param {string|string[]|object} keys - 要读取的键
   * @returns {Promise<object>} 读取结果，失败时返回空对象
   */
  async get(keys) {
    if (!this.isAvailable()) {
      console.warn('[SafeStorage] Chrome storage 不可用（上下文可能已失效）');
      return typeof keys === 'string' ? { [keys]: undefined } : {};
    }

    try {
      return await chrome.storage.local.get(keys);
    } catch (err) {
      console.warn('[SafeStorage] 读取失败:', err.message);
      return typeof keys === 'string' ? { [keys]: undefined } : {};
    }
  },

  /**
   * 安全地写入 storage 数据
   * @param {object} items - 要写入的键值对
   * @returns {Promise<boolean>} 是否成功写入
   */
  async set(items) {
    if (!this.isAvailable()) {
      console.warn('[SafeStorage] Chrome storage 不可用（上下文可能已失效），跳过写入');
      return false;
    }

    try {
      await chrome.storage.local.set(items);
      return true;
    } catch (err) {
      console.warn('[SafeStorage] 写入失败:', err.message);
      return false;
    }
  },

  /**
   * 安全地删除 storage 数据
   * @param {string|string[]} keys - 要删除的键
   * @returns {Promise<boolean>} 是否成功删除
   */
  async remove(keys) {
    if (!this.isAvailable()) {
      console.warn('[SafeStorage] Chrome storage 不可用（上下文可能已失效），跳过删除');
      return false;
    }

    try {
      await chrome.storage.local.remove(keys);
      return true;
    } catch (err) {
      console.warn('[SafeStorage] 删除失败:', err.message);
      return false;
    }
  },

  /**
   * 监听 storage 变化（仅当 API 可用时）
   * @param {Function} callback - 变化回调
   * @returns {Function|null} 取消监听函数，如果注册失败返回null
   */
  addListener(callback) {
    if (!this.isAvailable() || !chrome.storage.onChanged) {
      console.warn('[SafeStorage] Chrome storage 监听器不可用');
      return null;
    }

    try {
      chrome.storage.onChanged.addListener(callback);
      return () => {
        try {
          chrome.storage.onChanged.removeListener(callback);
        } catch (e) {
          // 静默失败
        }
      };
    } catch (err) {
      console.warn('[SafeStorage] 添加监听器失败:', err.message);
      return null;
    }
  }
};
