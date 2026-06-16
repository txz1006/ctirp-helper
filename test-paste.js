/**
 * 测试通过模拟粘贴来填写时间选择器
 */

const timePicker = document.querySelector('.ant-time-picker-input');

// 方案1：模拟粘贴事件
timePicker.focus();

const pasteEvent = new ClipboardEvent('paste', {
  bubbles: true,
  cancelable: true,
  clipboardData: new DataTransfer()
});

// 设置剪贴板数据
pasteEvent.clipboardData.setData('text/plain', '18:00');

timePicker.dispatchEvent(pasteEvent);

setTimeout(() => {
  console.log('粘贴后的值:', timePicker.value);
}, 500);

// ========================================

// 方案2：使用 execCommand (如果支持)
setTimeout(() => {
  console.log('\n尝试方案2: execCommand');

  timePicker.focus();
  timePicker.select();

  // 设置剪贴板
  navigator.clipboard.writeText('18:00').then(() => {
    document.execCommand('paste');

    setTimeout(() => {
      console.log('execCommand后的值:', timePicker.value);
    }, 500);
  });
}, 1500);
