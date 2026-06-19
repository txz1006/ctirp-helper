/**
 * UEditor 主世界桥接脚本
 *
 * 背景：content script 运行在隔离世界，无法访问页面真正的 window.UE 实例。
 * 直接写 iframe body 的 innerHTML 只更新显示，不更新 UEditor 数据模型，
 * 导致保存时 editor.getContent() / 同步 textarea 读到空内容。
 *
 * 本脚本通过 web_accessible_resources 注入到页面主世界执行，
 * 从约定的 payload 节点读取 { iframeId, html }，调用真正的 UEditor API
 * setContent() + sync()，确保数据模型和隐藏 textarea 一并更新。
 *
 * 传参方式：content script 写入 <script type="application/json" id="...">，
 * 本脚本通过 document.currentScript 的 data-payload-id 找到该节点读取数据。
 */
(function () {
  try {
    var self = document.currentScript;
    var payloadId = self && self.getAttribute('data-payload-id');
    if (!payloadId) {
      console.warn('[vtrip-UE] 缺少 payload id');
      return;
    }

    var payloadEl = document.getElementById(payloadId);
    if (!payloadEl) {
      console.warn('[vtrip-UE] 未找到 payload 节点');
      return;
    }

    var data = JSON.parse(payloadEl.textContent || '{}');
    var iframeId = data.iframeId;
    var html = data.html || '';

    if (!window.UE) {
      console.warn('[vtrip-UE] 页面未找到 UE 对象');
      return;
    }

    // 收集所有可能的编辑器实例
    var editors = [];
    if (window.UE.instants) {
      for (var k in window.UE.instants) {
        if (window.UE.instants[k]) editors.push(window.UE.instants[k]);
      }
    }
    if (window.UE._editors) {
      for (var k2 in window.UE._editors) {
        if (window.UE._editors[k2]) editors.push(window.UE._editors[k2]);
      }
    }

    // 找到 iframe id 匹配的编辑器实例
    var target = null;
    for (var i = 0; i < editors.length; i++) {
      var ed = editors[i];
      try {
        var edIframe = ed.iframe ||
          (ed.body && ed.body.ownerDocument && ed.body.ownerDocument.defaultView && ed.body.ownerDocument.defaultView.frameElement);
        if (edIframe && edIframe.id === iframeId) { target = ed; break; }
      } catch (e) {}
    }

    // 兜底：只有一个实例时直接用
    if (!target && editors.length === 1) target = editors[0];

    if (!target) {
      console.warn('[vtrip-UE] 未匹配到 UEditor 实例, iframeId=' + iframeId);
      return;
    }

    // 写入内容并同步到隐藏 textarea（保存读取的是同步后的值）
    if (typeof target.setContent === 'function') {
      target.setContent(html);
    }
    if (typeof target.sync === 'function') {
      target.sync();
    }
    // 触发内容变更事件，通知页面 React/监听器更新自身 state
    // （savedescriptioninfo 保存的是页面 state 中的 productDesc，需要 contentchange 同步）
    try {
      if (typeof target.fireEvent === 'function') {
        target.fireEvent('contentchange');
        target.fireEvent('selectionchange');
        target.fireEvent('blur');
      }
    } catch (evtErr) {
      console.warn('[vtrip-UE] 触发 UEditor 事件失败:', evtErr);
    }
    console.log('[vtrip-UE] UEditor 内容已写入并同步, iframeId=' + iframeId);
  } catch (err) {
    console.error('[vtrip-UE] 注入执行失败:', err);
  }
})();
