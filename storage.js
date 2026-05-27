const STORAGE_KEY = 'reviewCategories';
const LAST_L1_KEY = 'lastL1Id';
const LAST_L2_KEY = 'lastL2Id';
const TODO_GUARD_KEY = 'reviewTodoGuard';

const DEFAULT_DATA = {
  categories: [
    {
      id: 'default-cat-1',
      name: '项目验收',
      todos: [
        { id: 't1-1', text: '申报书是否跨页', checked: false },
        { id: 't1-2', text: '金额是否一致', checked: false },
        { id: 't1-3', text: '是否核对所有附件完整性', checked: false }
      ],
      modules: [
        {
          id: 'default-module-1',
          name: '汇总表',
          comments: [
            { id: 'c1-1', text: '汇总表缺少必填字段，请补充完整' },
            { id: 'c1-2', text: '不能出现超支金额' },
            { id: 'c1-3', text: 'B列的内容要与批复保持一致' },
            { id: 'c1-4', text: '表格格式不规范，请按模板要求调整' }
          ]
        },
        {
          id: 'default-module-2',
          name: '对照表',
          comments: [
            { id: 'c2-1', text: '对照表数据与汇总表不一致，请核实' },
            { id: 'c2-2', text: '缺少关键对照项，请补充' }
          ]
        },
        {
          id: 'default-module-3',
          name: '用户报告',
          comments: [
            { id: 'c3-1', text: '用户报告缺少签字盖章' },
            { id: 'c3-2', text: '报告结论与数据不符，请核实' }
          ]
        }
      ]
    },
    {
      id: 'default-cat-2',
      name: '计划申报',
      todos: [
        { id: 't2-1', text: '计划书是否已签字', checked: false },
        { id: 't2-2', text: '预算表金额是否正确', checked: false }
      ],
      modules: [
        {
          id: 'default-module-4',
          name: '计划书',
          comments: [
            { id: 'c4-1', text: '计划书格式不符合要求，请调整' },
            { id: 'c4-2', text: '缺少必要章节，请补充完整' }
          ]
        },
        {
          id: 'default-module-5',
          name: '预算表',
          comments: [
            { id: 'c5-1', text: '预算明细与汇总金额不一致' },
            { id: 'c5-2', text: '预算科目分类有误，请修正' }
          ]
        }
      ]
    },
    {
      id: 'default-cat-3',
      name: '正式申报',
      todos: [
        { id: 't3-1', text: '申报材料是否齐全', checked: false },
        { id: 't3-2', text: '公章是否正确加盖', checked: false }
      ],
      modules: [
        {
          id: 'default-module-6',
          name: '申报书',
          comments: [
            { id: 'c6-1', text: '申报书版本不是最新，请更新' },
            { id: 'c6-2', text: '申报书内容与附件材料不符' }
          ]
        },
        {
          id: 'default-module-7',
          name: '附件材料',
          comments: [
            { id: 'c7-1', text: '附件扫描件不清晰，请重新上传' },
            { id: 'c7-2', text: '缺少必要附件，请补充上传' },
            { id: 'c7-3', text: '附件与申报内容不符，请核实' }
          ]
        }
      ]
    }
  ]
};

function loadData() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);

    // 检查旧 key 并迁移
    if (!raw) {
      const oldRaw = localStorage.getItem('reviewModules');
      if (oldRaw) {
        const oldModules = JSON.parse(oldRaw);
        const oldTodosRaw = localStorage.getItem('reviewTodos');
        let oldTodos = [];
        if (oldTodosRaw) {
          try { oldTodos = JSON.parse(oldTodosRaw); } catch (_) {}
        }
        const migrated = {
          categories: [{
            id: genId(),
            name: '默认分类',
            todos: Array.isArray(oldTodos) ? oldTodos : [],
            modules: (oldModules.modules && Array.isArray(oldModules.modules)) ? oldModules.modules : []
          }]
        };
        // 确保每个模块都有 comments
        migrated.categories[0].modules.forEach(m => {
          if (!Array.isArray(m.comments)) m.comments = [];
        });
        saveData(migrated);
        localStorage.removeItem('reviewModules');
        localStorage.removeItem('reviewTodos');
        return JSON.parse(JSON.stringify(migrated));
      }

      saveData(DEFAULT_DATA);
      return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }

    const data = JSON.parse(raw);

    // Migrate old format found under new key
    if (data.modules && !data.categories) {
      const oldTodosKey = 'reviewTodos';
      const oldTodosRaw = localStorage.getItem(oldTodosKey);
      let oldTodos = [];
      if (oldTodosRaw) {
        try { oldTodos = JSON.parse(oldTodosRaw); } catch (_) {}
      }
      localStorage.removeItem(oldTodosKey);

      data.categories = [{
        id: genId(),
        name: '默认分类',
        todos: oldTodos || [],
        modules: data.modules
      }];
      delete data.modules;
      saveData(data);
      return JSON.parse(JSON.stringify(data));
    }

    if (!data.categories || !Array.isArray(data.categories)) {
      saveData(DEFAULT_DATA);
      return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }

    // 向后兼容
    data.categories.forEach(cat => {
      if (!Array.isArray(cat.todos)) cat.todos = [];
      if (cat.modules && Array.isArray(cat.modules)) {
        cat.modules.forEach(m => {
          if (!Array.isArray(m.comments)) m.comments = [];
        });
      } else {
        cat.modules = [];
      }
    });

    return data;
  } catch (e) {
    console.warn('数据加载失败，使用默认数据', e);
    saveData(DEFAULT_DATA);
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getLastL1Id() {
  return localStorage.getItem(LAST_L1_KEY);
}

function setLastL1Id(id) {
  localStorage.setItem(LAST_L1_KEY, id);
}

function getLastL2Id() {
  return localStorage.getItem(LAST_L2_KEY);
}

function setLastL2Id(id) {
  localStorage.setItem(LAST_L2_KEY, id);
}

function loadTodoGuard() {
  const v = localStorage.getItem(TODO_GUARD_KEY);
  return v === null ? true : v === '1';
}

function saveTodoGuard(on) {
  localStorage.setItem(TODO_GUARD_KEY, on ? '1' : '0');
}

function genId() {
  return crypto.randomUUID();
}
