/**
 * 基础信息Tab转换规则
 *
 * 包含字段映射和格式转换函数
 */

const BaseInfoRules = {
  /**
   * 字段映射表（JSON配置）
   * key: 国内版domKey, value: 国际版domKey或转换配置
   */
  fieldMappings: {
    'baseInfo.travelDays': { action: 'copy', label: '行程天数' },
    'baseInfo.travelNights': { action: 'copy', label: '行程晚数' },
    'baseInfo.mainName': { action: 'translate', label: '产品名称' },
    'baseInfo.subName': { action: 'translate', label: '副标题' },
    'baseInfo.operationNote': { action: 'translate', label: '操作说明' },
    'baseInfo.masterDepartureCityId': { action: 'searchSelect', label: '出发城市' },
    'baseInfo.destinationCityID': { action: 'searchSelect', label: '目的地城市' },
    'nameAreas.countryScienc': { action: 'cascader', label: '国家景区' }
  },

  /**
   * 枚举值映射表
   */
  enumMappings: {
    // 酒店星级
    '三钻/舒适型': '3-Star/Comfort',
    '四钻/高档型': '4-Star/Premium',
    '五钻/豪华型': '5-Star/Luxury',
    // 服务语言
    '中文': 'Chinese',
    '英文': 'English',
    '中英文': 'Chinese & English'
  },

  /**
   * mainName拼接规则
   * 格式：{Country} {N}D{N-1}N {TourType}
   * @param {object} data - 导出数据
   * @returns {string}
   */
  buildMainName(data) {
    const country = this._getFieldValue(data, 'destinationCountry') || '';
    const days = this._getFieldValue(data, 'travelDays') || '';
    const nights = this._getFieldValue(data, 'travelNights') || (days ? days - 1 : '');

    if (!country || !days) return '';

    return `${country} ${days}D${nights}N Private Tour`;
  },

  /**
   * 目的地格式转换
   * 国内版：级联下拉 "目的地1/目的地2"
   * 国际版：短横线连接 "Destination1-Destination2"
   * @param {string} domesticFormat - 国内版格式
   * @returns {string}
   */
  convertDestinationFormat(domesticFormat) {
    if (!domesticFormat) return '';
    return domesticFormat
      .split(/[\/\\]/)
      .map(s => s.trim())
      .filter(Boolean)
      .join('-');
  },

  /**
   * 从导出数据中获取字段值
   * @param {object} data
   * @param {string} domKey
   * @returns {*}
   */
  _getFieldValue(data, domKey) {
    for (const group of Object.values(data)) {
      for (const field of Object.values(group)) {
        if (field && typeof field === 'object' && field.domKey === domKey) {
          if (field.value && typeof field.value === 'object' && field.value.text) {
            return field.value.text;
          }
          return field.value;
        }
      }
    }
    return null;
  }
};
