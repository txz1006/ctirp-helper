/**
 * 时间选择器填写测试脚本
 * 在浏览器控制台运行
 */

// 测试1：直接点击时间选择器图标打开面板
const timePicker = document.querySelector('.ant-time-picker-input');
const timePickerWrapper = timePicker.closest('.ant-time-picker');
const icon = timePickerWrapper.querySelector('.ant-time-picker-icon');

console.log('时间选择器:', timePicker);
console.log('图标:', icon);

// 点击图标打开面板
icon.click();

// 等待面板打开后检查
setTimeout(() => {
  const panel = document.querySelector('.ant-time-picker-panel');
  console.log('时间面板:', panel);

  if (panel) {
    // 查找所有时间选项
    const hourOptions = panel.querySelectorAll('.ant-time-picker-panel-select:nth-child(1) li');
    const minuteOptions = panel.querySelectorAll('.ant-time-picker-panel-select:nth-child(2) li');

    console.log('小时选项数:', hourOptions.length);
    console.log('分钟选项数:', minuteOptions.length);

    // 尝试找到 18:00
    const hour18 = Array.from(hourOptions).find(li => li.textContent.trim() === '18');
    const minute00 = Array.from(minuteOptions).find(li => li.textContent.trim() === '00');

    console.log('18小时选项:', hour18);
    console.log('00分钟选项:', minute00);

    if (hour18 && minute00) {
      console.log('找到 18:00 选项，尝试点击...');
      hour18.click();
      setTimeout(() => {
        minute00.click();
        console.log('点击完成，当前值:', timePicker.value);
      }, 100);
    }
  }
}, 500);
