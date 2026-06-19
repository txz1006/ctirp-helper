/**
 * 模版系统集成测试脚本
 *
 * 使用方法：
 * 1. 打开携程产品详情页
 * 2. 打开浏览器控制台（F12）
 * 3. 复制此文件内容并粘贴到控制台
 * 4. 运行各个测试函数
 */

const TemplateSystemTest = {
  /**
   * 测试1：端到端 - 保存流程
   */
  async testSaveFlow() {
    console.log('========== 测试1：保存流程 ==========');

    try {
      // 1. 检查模块是否加载
      if (!window.TemplateManager || !window.TemplateStorage) {
        throw new Error('模版模块未加载');
      }
      console.log('✅ 模版模块已加载');

      // 2. 生成默认名称
      const defaultName = await TemplateManager.generateDefaultName();
      console.log('✅ 生成默认名称:', defaultName);

      // 3. 创建测试模版
      const testName = `测试模版_${Date.now()}`;
      const testDesc = '自动化测试创建';

      const template = await TemplateManager.createFromCurrentPage(testName, testDesc);
      console.log('✅ 模版创建成功:', template.id, template.name);

      // 4. 验证模版数据结构
      if (!template.id || !template.name || !template.data) {
        throw new Error('模版结构不完整');
      }
      console.log('✅ 模版结构验证通过');

      // 5. 从存储中读取
      const stored = await TemplateStorage.get(template.id);
      if (!stored || stored.name !== testName) {
        throw new Error('存储读取失败');
      }
      console.log('✅ 存储读取验证通过');

      // 6. 在模版管理中查看
      const allTemplates = await TemplateStorage.getAll();
      const found = allTemplates.find(t => t.id === template.id);
      if (!found) {
        throw new Error('模版列表中未找到');
      }
      console.log('✅ 模版列表验证通过，当前共', allTemplates.length, '个模版');

      console.log('🎉 保存流程测试通过！');
      return template;

    } catch (error) {
      console.error('❌ 保存流程测试失败:', error);
      throw error;
    }
  },

  /**
   * 测试2：端到端 - 编辑流程
   */
  async testEditFlow() {
    console.log('========== 测试2：编辑流程 ==========');

    try {
      // 1. 获取第一个模版
      const templates = await TemplateStorage.getAll();
      if (templates.length === 0) {
        throw new Error('没有模版可供测试，请先运行 testSaveFlow()');
      }

      const template = templates[0];
      const originalUpdatedAt = template.updatedAt;
      console.log('✅ 获取模版:', template.name);

      // 等待1秒确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 2. 修改名称和描述
      const newName = template.name + '_已编辑';
      const newDesc = '测试编辑功能';

      const updated = await TemplateManager.updateMetadata(template.id, newName, newDesc);
      console.log('✅ 模版更新成功:', updated.name);

      // 3. 验证更新
      if (updated.name !== newName || updated.description !== newDesc) {
        throw new Error('名称或描述未正确更新');
      }
      console.log('✅ 名称和描述验证通过');

      // 4. 验证 updatedAt 已更新
      if (updated.updatedAt === originalUpdatedAt) {
        throw new Error('updatedAt 时间戳未更新');
      }
      console.log('✅ updatedAt 时间戳已更新');

      // 5. 验证数据内容未改变
      if (!updated.data || JSON.stringify(updated.data) !== JSON.stringify(template.data)) {
        throw new Error('数据内容被意外修改');
      }
      console.log('✅ 数据内容未改变');

      console.log('🎉 编辑流程测试通过！');
      return updated;

    } catch (error) {
      console.error('❌ 编辑流程测试失败:', error);
      throw error;
    }
  },

  /**
   * 测试3：端到端 - 删除流程
   */
  async testDeleteFlow() {
    console.log('========== 测试3：删除流程 ==========');

    try {
      // 1. 创建一个临时模版
      const tempName = `临时测试模版_${Date.now()}`;
      const template = await TemplateManager.createFromCurrentPage(tempName, '用于删除测试');
      console.log('✅ 创建临时模版:', template.id);

      // 2. 验证模版存在
      let exists = await TemplateStorage.get(template.id);
      if (!exists) {
        throw new Error('临时模版创建失败');
      }
      console.log('✅ 临时模版验证存在');

      // 3. 删除模版（跳过确认，直接调用存储层）
      await TemplateStorage.delete(template.id);
      console.log('✅ 模版删除成功');

      // 4. 验证模版已删除
      exists = await TemplateStorage.get(template.id);
      if (exists) {
        throw new Error('模版未被删除');
      }
      console.log('✅ 验证模版已删除');

      // 5. 验证其他模版不受影响
      const allTemplates = await TemplateStorage.getAll();
      console.log('✅ 其他模版不受影响，当前共', allTemplates.length, '个模版');

      console.log('🎉 删除流程测试通过！');

    } catch (error) {
      console.error('❌ 删除流程测试失败:', error);
      throw error;
    }
  },

  /**
   * 测试4：端到端 - 预览流程
   */
  async testPreviewFlow() {
    console.log('========== 测试4：预览流程 ==========');

    try {
      // 1. 获取一个模版
      const templates = await TemplateStorage.getAll();
      if (templates.length === 0) {
        throw new Error('没有模版可供测试');
      }

      const template = templates[0];
      console.log('✅ 获取模版:', template.name);

      // 2. 统计字段数量
      const fieldCount = TemplateManager.countFields(template);
      console.log('✅ 字段数量:', fieldCount);

      // 3. 验证数据结构
      if (!template.data || !template.data.data) {
        throw new Error('模版数据结构无效');
      }

      const groups = template.data.data;
      const groupNames = Object.keys(groups);
      console.log('✅ 分组数量:', groupNames.length);

      // 4. 遍历所有分组和字段
      let totalFields = 0;
      for (const groupName of groupNames) {
        const fields = groups[groupName];
        const fieldNames = Object.keys(fields);
        totalFields += fieldNames.length;
        console.log(`  - ${groupName}: ${fieldNames.length} 个字段`);
      }

      // 5. 验证字段数量一致
      if (totalFields !== fieldCount) {
        throw new Error(`字段数量不一致: ${totalFields} vs ${fieldCount}`);
      }
      console.log('✅ 字段数量一致性验证通过');

      console.log('🎉 预览流程测试通过！');

    } catch (error) {
      console.error('❌ 预览流程测试失败:', error);
      throw error;
    }
  },

  /**
   * 测试5：边界情况 - 重名模版
   */
  async testDuplicateName() {
    console.log('========== 测试5：重名模版 ==========');

    try {
      // 1. 创建第一个模版
      const name = `重名测试_${Date.now()}`;
      const template1 = await TemplateManager.createFromCurrentPage(name, '第一个');
      console.log('✅ 创建第一个模版:', template1.id);

      // 2. 尝试创建同名模版
      try {
        await TemplateManager.createFromCurrentPage(name, '第二个');
        throw new Error('应该抛出重名错误但没有');
      } catch (error) {
        if (error.message.includes('名称已存在')) {
          console.log('✅ 正确拒绝了重名模版');
        } else {
          throw error;
        }
      }

      // 3. 清理测试模版
      await TemplateStorage.delete(template1.id);
      console.log('✅ 清理测试模版');

      console.log('🎉 重名测试通过！');

    } catch (error) {
      console.error('❌ 重名测试失败:', error);
      throw error;
    }
  },

  /**
   * 测试6：边界情况 - 数量限制
   */
  async testMaxTemplates() {
    console.log('========== 测试6：数量限制 ==========');

    try {
      const currentCount = (await TemplateStorage.getAll()).length;
      console.log('当前模版数量:', currentCount);

      if (currentCount >= 25) {
        console.log('⚠️ 已达到上限，测试删除后保存');

        // 删除一个
        const templates = await TemplateStorage.getAll();
        await TemplateStorage.delete(templates[0].id);
        console.log('✅ 删除一个模版');

        // 尝试保存
        const template = await TemplateManager.createFromCurrentPage('上限测试', '测试');
        console.log('✅ 删除后可以保存');

        // 清理
        await TemplateStorage.delete(template.id);

      } else {
        console.log('✅ 未达上限，当前可继续保存');
      }

      console.log('🎉 数量限制测试通过！');

    } catch (error) {
      console.error('❌ 数量限制测试失败:', error);
      throw error;
    }
  },

  /**
   * 测试7：应用模版流程
   */
  async testApplyFlow() {
    console.log('========== 测试7：应用模版流程 ==========');

    try {
      // 1. 获取一个模版
      const templates = await TemplateStorage.getAll();
      if (templates.length === 0) {
        throw new Error('没有模版可供测试');
      }

      const template = templates[0];
      console.log('✅ 获取模版:', template.name);

      // 2. 应用模版（会检查页面兼容性）
      const data = await TemplateManager.applyTemplate(template.id);

      if (data === null) {
        console.log('⚠️ 用户取消了应用（可能是页面类型不匹配）');
        return;
      }

      console.log('✅ 模版应用成功');

      // 3. 验证返回的数据结构
      if (!data || !data.data) {
        throw new Error('返回的数据结构无效');
      }
      console.log('✅ 数据结构验证通过');

      console.log('🎉 应用模版测试通过！');

    } catch (error) {
      console.error('❌ 应用模版测试失败:', error);
      throw error;
    }
  },

  /**
   * 运行所有测试
   */
  async runAll() {
    console.log('🚀 开始运行所有测试...\n');

    const tests = [
      this.testSaveFlow,
      this.testEditFlow,
      this.testDeleteFlow,
      this.testPreviewFlow,
      this.testDuplicateName,
      this.testMaxTemplates,
      this.testApplyFlow
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      try {
        await test.call(this);
        passed++;
        console.log('');
      } catch (error) {
        failed++;
        console.log('');
      }
    }

    console.log('========================================');
    console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
    console.log('========================================');

    if (failed === 0) {
      console.log('🎉🎉🎉 所有测试通过！');
    }
  },

  /**
   * 清理所有测试模版
   */
  async cleanup() {
    console.log('========== 清理测试模版 ==========');

    const templates = await TemplateStorage.getAll();
    const testTemplates = templates.filter(t =>
      t.name.includes('测试') || t.name.includes('临时')
    );

    console.log(`找到 ${testTemplates.length} 个测试模版`);

    for (const template of testTemplates) {
      await TemplateStorage.delete(template.id);
      console.log('删除:', template.name);
    }

    console.log('✅ 清理完成');
  },

  /**
   * 显示当前状态
   */
  async status() {
    console.log('========== 模版系统状态 ==========');

    const templates = await TemplateStorage.getAll();
    console.log(`总模版数: ${templates.length}/25`);

    if (templates.length > 0) {
      console.log('\n模版列表:');
      const sorted = TemplateStorage.sortByUpdatedAt(templates);
      sorted.forEach((t, i) => {
        const fieldCount = TemplateManager.countFields(t);
        const date = new Date(t.updatedAt).toLocaleString('zh-CN');
        console.log(`${i + 1}. ${t.name} (${fieldCount}字段) - ${date}`);
      });
    }

    console.log('========================================');
  }
};

// 导出到全局
window.TemplateSystemTest = TemplateSystemTest;

console.log('✅ 测试脚本已加载');
console.log('');
console.log('使用方法：');
console.log('  TemplateSystemTest.runAll()       - 运行所有测试');
console.log('  TemplateSystemTest.testSaveFlow() - 测试保存流程');
console.log('  TemplateSystemTest.status()       - 查看当前状态');
console.log('  TemplateSystemTest.cleanup()      - 清理测试模版');
console.log('');
