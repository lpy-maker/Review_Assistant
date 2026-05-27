let data = loadData();
let activeL1Id = null;
let activeView = null; // 'l1' | 'module' | 'todo'
let activeModuleId = null;
let commentDragSrcIndex = null;
let moduleDragSrcIndex = null;
let todoDragSrcIndex = null;
let autoExportOn = loadAutoExport();
let autoExportTimer = null;

// 包装 saveData，自动导出
const _originalSaveData = saveData;
saveData = function(d) {
  _originalSaveData(d);
  scheduleAutoExport();
};

function loadAutoExport() {
  return localStorage.getItem('autoExport') === '1';
}

function saveAutoExport(on) {
  localStorage.setItem('autoExport', on ? '1' : '0');
}

function scheduleAutoExport() {
  if (!autoExportOn) return;
  clearTimeout(autoExportTimer);
  autoExportTimer = setTimeout(doAutoExport, 2000);
}

function doAutoExport() {
  const payload = { version: 3, categories: data.categories };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({
    url: url,
    filename: '审核意见助手数据_自动备份.json',
    saveAs: false,
    conflictAction: 'overwrite'
  }, () => {
    // 延迟释放 blob URL
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

// ===== 初始化 =====

function init() {
  renderL1List();
  bindEvents();
  if (data.categories.length > 0) {
    selectL1(data.categories[0].id);
  }
}

// ===== 渲染 L1 类别列表 =====

function renderL1List() {
  const ul = document.getElementById('l1-list');
  ul.innerHTML = '';

  data.categories.forEach((cat, index) => {
    const li = document.createElement('li');
    li.className = 'module-list-item' + (cat.id === activeL1Id ? ' active' : '');
    li.dataset.id = cat.id;
    li.dataset.index = index;

    const span = document.createElement('span');
    span.textContent = cat.name;

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.textContent = '✕';
    delBtn.title = '删除此类别及其所有内容';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteL1(cat.id);
    });

    li.appendChild(span);
    li.appendChild(delBtn);
    li.addEventListener('click', () => selectL1(cat.id));

    ul.appendChild(li);
  });
}

// ===== 选择 L1 =====

function selectL1(id) {
  activeL1Id = id;
  activeView = 'l1';
  activeModuleId = null;
  renderL1List();
  renderTodoEntry();
  renderModuleList();

  const cat = getActiveCategory();
  if (!cat) { showDetailEmpty(); return; }

  document.getElementById('detail-empty').style.display = 'none';
  document.getElementById('detail-todos').style.display = 'none';
  document.getElementById('detail-content').style.display = 'none';
  document.getElementById('detail-l1').style.display = 'flex';
  document.getElementById('l1-name-input').value = cat.name;
  document.getElementById('l1-module-count').textContent = cat.modules.length;
  document.getElementById('l1-todo-count').textContent = cat.todos.length;
}

// ===== 待办入口（左侧） =====

function renderTodoEntry() {
  const entry = document.getElementById('todo-entry');
  if (!entry) return;
  entry.classList.toggle('active', activeView === 'todo');
}

// ===== 渲染 L2 模块列表 =====

function renderModuleList() {
  const ul = document.getElementById('module-list');
  ul.innerHTML = '';

  const cat = getActiveCategory();
  if (!cat) return;

  cat.modules.forEach((m, index) => {
    const li = document.createElement('li');
    li.className = 'module-list-item' + (m.id === activeModuleId && activeView === 'module' ? ' active' : '');
    li.dataset.id = m.id;
    li.dataset.index = index;
    li.draggable = true;

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⋮⋮';
    handle.title = '拖拽排序';

    const span = document.createElement('span');
    span.textContent = m.name;

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.textContent = '✕';
    delBtn.title = '删除此模块';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteModule(m.id);
    });

    li.appendChild(handle);
    li.appendChild(span);
    li.appendChild(delBtn);
    li.addEventListener('click', () => selectModule(m.id));

    // 模块拖拽
    li.addEventListener('dragstart', (e) => {
      moduleDragSrcIndex = index;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      document.querySelectorAll('#module-list .module-list-item').forEach(el => el.classList.remove('drag-over'));
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('#module-list .module-list-item').forEach(el => el.classList.remove('drag-over'));
      li.classList.add('drag-over');
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('drag-over');
      const targetIndex = parseInt(li.dataset.index);
      if (moduleDragSrcIndex === null || moduleDragSrcIndex === targetIndex) return;
      const cat = getActiveCategory();
      if (!cat) return;
      const [moved] = cat.modules.splice(moduleDragSrcIndex, 1);
      cat.modules.splice(targetIndex, 0, moved);
      moduleDragSrcIndex = null;
      saveData(data);
      renderModuleList();
    });

    ul.appendChild(li);
  });
}

// ===== 选择模块（L2） =====

function selectModule(id) {
  activeView = 'module';
  activeModuleId = id;
  renderTodoEntry();
  renderModuleList();

  const module = getModule(id);
  if (!module) { showDetailEmpty(); return; }

  document.getElementById('detail-empty').style.display = 'none';
  document.getElementById('detail-todos').style.display = 'none';
  document.getElementById('detail-l1').style.display = 'none';
  document.getElementById('detail-content').style.display = 'flex';
  document.getElementById('module-name-input').value = module.name;
  renderCommentList(module);
}

// ===== 选择待办（L2'） =====

function selectTodoView() {
  activeView = 'todo';
  activeModuleId = null;
  renderTodoEntry();
  renderModuleList();

  document.getElementById('detail-empty').style.display = 'none';
  document.getElementById('detail-content').style.display = 'none';
  document.getElementById('detail-l1').style.display = 'none';
  document.getElementById('detail-todos').style.display = 'flex';
  renderTodoListSettings();
}

function showDetailEmpty() {
  document.getElementById('detail-empty').style.display = 'flex';
  document.getElementById('detail-content').style.display = 'none';
  document.getElementById('detail-todos').style.display = 'none';
  document.getElementById('detail-l1').style.display = 'none';
  activeView = null;
  activeModuleId = null;
  renderTodoEntry();
  renderModuleList();
}

// ===== 待办列表渲染（L2'，右侧详情） =====

function renderTodoListSettings() {
  const ul = document.getElementById('settings-todo-list');
  ul.innerHTML = '';
  const cat = getActiveCategory();
  if (!cat) return;

  cat.todos.forEach((todo, index) => {
    ul.appendChild(createTodoListItem(cat, todo, index));
  });
}

function createTodoListItem(cat, todo, index) {
  const li = document.createElement('li');
  li.className = 'settings-comment-item';
  li.dataset.id = todo.id;
  li.dataset.index = index;
  li.draggable = true;

  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.textContent = '⋮⋮';
  handle.title = '拖拽排序';

  const textEl = document.createElement('span');
  textEl.className = 'comment-edit-text';
  textEl.contentEditable = 'true';
  textEl.textContent = todo.text;
  textEl.spellcheck = false;
  textEl.addEventListener('blur', () => {
    const newText = textEl.textContent.trim();
    if (!newText) { textEl.textContent = todo.text; return; }
    todo.text = newText;
    saveData(data);
  });
  textEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); textEl.blur(); }
    if (e.key === 'Escape') { textEl.textContent = todo.text; textEl.blur(); }
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'btn-icon';
  delBtn.textContent = '✕';
  delBtn.title = '删除此待办';
  delBtn.addEventListener('click', () => deleteTodoSettings(cat, todo.id));

  li.appendChild(handle);
  li.appendChild(textEl);
  li.appendChild(delBtn);

  // 拖拽
  li.addEventListener('dragstart', (e) => {
    todoDragSrcIndex = index;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  li.addEventListener('dragend', () => {
    li.classList.remove('dragging');
    document.querySelectorAll('#settings-todo-list .settings-comment-item').forEach(el => el.classList.remove('drag-over'));
  });
  li.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('#settings-todo-list .settings-comment-item').forEach(el => el.classList.remove('drag-over'));
    li.classList.add('drag-over');
  });
  li.addEventListener('drop', (e) => {
    e.preventDefault();
    li.classList.remove('drag-over');
    const targetIndex = parseInt(li.dataset.index);
    if (todoDragSrcIndex === null || todoDragSrcIndex === targetIndex) return;
    const [moved] = cat.todos.splice(todoDragSrcIndex, 1);
    cat.todos.splice(targetIndex, 0, moved);
    todoDragSrcIndex = null;
    saveData(data);
    renderTodoListSettings();
  });

  return li;
}

function deleteTodoSettings(cat, todoId) {
  cat.todos = cat.todos.filter(t => t.id !== todoId);
  saveData(data);
  renderTodoListSettings();
}

function addTodoSettings(cat, text) {
  cat.todos.push({ id: genId(), text, checked: false });
  saveData(data);
  renderTodoListSettings();
}

// ===== 意见列表渲染（L3） =====

function renderCommentList(module) {
  const ul = document.getElementById('settings-comment-list');
  ul.innerHTML = '';
  module.comments.forEach((comment, index) => {
    ul.appendChild(createCommentListItem(comment, index));
  });
}

function createCommentListItem(comment, index) {
  const li = document.createElement('li');
  li.className = 'settings-comment-item';
  li.dataset.id = comment.id;
  li.dataset.index = index;
  li.draggable = true;

  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.textContent = '⋮⋮';
  handle.title = '拖拽排序';

  const textEl = document.createElement('span');
  textEl.className = 'comment-edit-text';
  textEl.contentEditable = 'true';
  textEl.textContent = comment.text;
  textEl.spellcheck = false;
  textEl.addEventListener('blur', () => {
    const newText = textEl.textContent.trim();
    if (!newText) { textEl.textContent = comment.text; return; }
    comment.text = newText;
    saveData(data);
  });
  textEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); textEl.blur(); }
    if (e.key === 'Escape') { textEl.textContent = comment.text; textEl.blur(); }
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'btn-icon';
  delBtn.textContent = '✕';
  delBtn.title = '删除此意见';
  delBtn.addEventListener('click', () => deleteComment(comment.id));

  li.appendChild(handle);
  li.appendChild(textEl);
  li.appendChild(delBtn);

  // 意见拖拽
  li.addEventListener('dragstart', (e) => {
    commentDragSrcIndex = index;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  li.addEventListener('dragend', () => {
    li.classList.remove('dragging');
    document.querySelectorAll('#settings-comment-list .settings-comment-item').forEach(el => el.classList.remove('drag-over'));
  });
  li.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('#settings-comment-list .settings-comment-item').forEach(el => el.classList.remove('drag-over'));
    li.classList.add('drag-over');
  });
  li.addEventListener('drop', (e) => {
    e.preventDefault();
    li.classList.remove('drag-over');
    const targetIndex = parseInt(li.dataset.index);
    if (commentDragSrcIndex === null || commentDragSrcIndex === targetIndex) return;
    const module = getActiveModule();
    if (!module) return;
    const [moved] = module.comments.splice(commentDragSrcIndex, 1);
    module.comments.splice(targetIndex, 0, moved);
    commentDragSrcIndex = null;
    saveData(data);
    renderCommentList(module);
  });

  return li;
}

// ===== CRUD =====

function deleteL1(id) {
  const cat = getCategory(id);
  if (!cat) return;
  if (!confirm(`确定删除类别"${cat.name}"及其所有模块、意见和待办吗？此操作不可恢复。`)) return;
  data.categories = data.categories.filter(c => c.id !== id);
  saveData(data);
  if (activeL1Id === id) {
    activeL1Id = data.categories[0]?.id || null;
    activeModuleId = null;
    activeView = null;
  }
  renderL1List();
  renderTodoEntry();
  renderModuleList();
  if (activeL1Id) selectL1(activeL1Id);
  else showDetailEmpty();
}

function deleteModule(id) {
  const cat = getActiveCategory();
  if (!cat) return;
  const module = getModule(id);
  if (!module) return;
  if (!confirm(`确定删除模块"${module.name}"及其所有意见吗？`)) return;
  cat.modules = cat.modules.filter(m => m.id !== id);
  saveData(data);
  renderModuleList();
  if (activeModuleId === id) {
    activeModuleId = cat.modules[0]?.id || null;
  }
  if (activeModuleId) selectModule(activeModuleId);
  else showDetailEmpty();
}

function deleteComment(id) {
  const module = getActiveModule();
  if (!module) return;
  module.comments = module.comments.filter(c => c.id !== id);
  saveData(data);
  renderCommentList(module);
}

function addComment(text) {
  const module = getActiveModule();
  if (!module) return;
  module.comments.push({ id: genId(), text });
  saveData(data);
  renderCommentList(module);
}

// ===== 事件绑定 =====

function bindEvents() {
  // 自动导出开关
  const autoExportCb = document.getElementById('auto-export-checkbox');
  if (autoExportCb) {
    autoExportCb.checked = autoExportOn;
    autoExportCb.addEventListener('change', (e) => {
      autoExportOn = e.target.checked;
      saveAutoExport(autoExportOn);
    });
  }

  // 待办入口
  document.getElementById('todo-entry').addEventListener('click', selectTodoView);

  // L1 名称编辑
  document.getElementById('l1-name-input').addEventListener('input', (e) => {
    const cat = getActiveCategory();
    if (!cat) return;
    const val = e.target.value.trim();
    if (!val) return;
    cat.name = val;
    saveData(data);
    const listItem = document.querySelector(`#l1-list .module-list-item[data-id="${cat.id}"] span`);
    if (listItem) listItem.textContent = cat.name;
  });

  // 删除 L1（右侧面板按钮）
  document.getElementById('btn-delete-l1').addEventListener('click', () => {
    if (activeL1Id) deleteL1(activeL1Id);
  });

  // 添加待办
  document.getElementById('btn-add-todo-settings').addEventListener('click', () => {
    const cat = getActiveCategory();
    if (!cat) return;
    const input = document.getElementById('new-todo-input');
    const text = input.value.trim();
    if (!text) return;
    addTodoSettings(cat, text);
    input.value = '';
    input.focus();
  });
  document.getElementById('new-todo-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      document.getElementById('btn-add-todo-settings').click();
    }
  });

  // 新建 L1
  document.getElementById('btn-new-l1').addEventListener('click', () => {
    const name = prompt('请输入类别名称（如"项目验收"）：');
    if (!name || !name.trim()) return;
    const newCat = { id: genId(), name: name.trim(), todos: [], modules: [] };
    data.categories.push(newCat);
    saveData(data);
    activeL1Id = newCat.id;
    activeModuleId = null;
    activeView = null;
    renderL1List();
    renderTodoEntry();
    renderModuleList();
    showDetailEmpty();
  });

  // 新建模块（L2）
  document.getElementById('btn-new-module').addEventListener('click', () => {
    const cat = getActiveCategory();
    if (!cat) { alert('请先选择一个类别'); return; }
    const name = prompt('请输入模块名称（如"汇总表"）：');
    if (!name || !name.trim()) return;
    const newModule = { id: genId(), name: name.trim(), comments: [] };
    cat.modules.push(newModule);
    saveData(data);
    renderModuleList();
    selectModule(newModule.id);
  });

  // 模块名称编辑
  document.getElementById('module-name-input').addEventListener('input', (e) => {
    const module = getActiveModule();
    if (!module) return;
    const val = e.target.value.trim();
    if (!val) return;
    module.name = val;
    saveData(data);
    const listItem = document.querySelector(`#module-list .module-list-item[data-id="${module.id}"] span:not(.drag-handle)`);
    if (listItem) listItem.textContent = module.name;
  });

  // 删除模块
  document.getElementById('btn-delete-module').addEventListener('click', () => {
    if (activeModuleId) deleteModule(activeModuleId);
  });

  // 添加意见（L3）
  document.getElementById('btn-add-comment').addEventListener('click', () => {
    const input = document.getElementById('new-comment-input');
    const text = input.value.trim();
    if (!text) return;
    addComment(text);
    input.value = '';
    input.focus();
  });
  document.getElementById('new-comment-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      document.getElementById('btn-add-comment').click();
    }
  });

  // 导出/导入
  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
  });
  document.getElementById('import-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importData(file);
    e.target.value = '';
  });

  // 侧边栏修改后同步
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    data = loadData();

    // 检查当前选中的项目是否仍存在
    const catIds = data.categories.map(c => c.id);
    if (!catIds.includes(activeL1Id)) {
      activeL1Id = data.categories[0]?.id || null;
      activeView = null;
      activeModuleId = null;
    }

    if (activeView === 'module' && activeModuleId) {
      const cat = getActiveCategory();
      if (cat) {
        const modIds = cat.modules.map(m => m.id);
        if (!modIds.includes(activeModuleId)) {
          activeModuleId = cat.modules[0]?.id || null;
        }
      } else {
        activeModuleId = null;
      }
    }

    // 重新渲染
    renderL1List();
    renderTodoEntry();
    renderModuleList();

    if (activeView === 'l1' && activeL1Id) {
      selectL1(activeL1Id);
    } else if (activeView === 'todo') {
      selectTodoView();
    } else if (activeView === 'module' && activeModuleId) {
      selectModule(activeModuleId);
    } else {
      if (activeL1Id) selectL1(activeL1Id);
      else showDetailEmpty();
    }
  });
}

// ===== 工具函数 =====

function getCategory(id) {
  return data.categories.find(c => c.id === id) || null;
}

function getActiveCategory() {
  return activeL1Id ? getCategory(activeL1Id) : null;
}

function getModule(id) {
  const cat = getActiveCategory();
  if (!cat) return null;
  return cat.modules.find(m => m.id === id) || null;
}

function getActiveModule() {
  return activeModuleId ? getModule(activeModuleId) : null;
}

// ===== 导出数据 =====

function exportData() {
  const payload = { version: 3, categories: data.categories };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '审核意见助手数据.json';
  a.click();
  URL.revokeObjectURL(url);
}

// ===== 导入数据 =====

function importData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported.categories || !Array.isArray(imported.categories)) {
        // Try old format
        if (imported.modules && Array.isArray(imported.modules)) {
          if (!confirm('检测到旧版本数据，导入后将自动迁移为新格式，确定继续吗？')) return;
          imported.categories = [{
            id: genId(),
            name: '默认分类',
            todos: [],
            modules: imported.modules
          }];
        } else {
          alert('文件格式不正确，请选择由本插件导出的 JSON 文件。');
          return;
        }
      }

      // Ensure backward compat
      imported.categories.forEach(cat => {
        if (!Array.isArray(cat.todos)) cat.todos = [];
        if (cat.modules && Array.isArray(cat.modules)) {
          cat.modules.forEach(m => {
            if (!Array.isArray(m.comments)) m.comments = [];
          });
        } else {
          cat.modules = [];
        }
      });

      const moduleCount = imported.categories.reduce((sum, c) => sum + c.modules.length, 0);
      if (!confirm(`导入后将覆盖当前所有数据（共 ${imported.categories.length} 个类别，${moduleCount} 个模块），确定继续吗？`)) return;

      data = { categories: imported.categories };
      saveData(data);
      activeL1Id = null;
      activeModuleId = null;
      activeView = null;
      renderL1List();
      renderTodoEntry();
      renderModuleList();
      if (data.categories.length > 0) {
        selectL1(data.categories[0].id);
        const cat = data.categories[0];
        if (cat && cat.modules.length > 0) selectModule(cat.modules[0].id);
        else showDetailEmpty();
      } else {
        showDetailEmpty();
      }
      alert('导入成功！');
    } catch (err) {
      alert('文件解析失败，请确认是有效的 JSON 文件。');
    }
  };
  reader.readAsText(file);
}

// ===== 启动 =====
init();
