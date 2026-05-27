let data = loadData();
let todoGuardOn = loadTodoGuard();
let currentL1Id = null;
let currentL2Id = null;
let savedCursor = null; // 记录 textarea 光标位置，用于插入
let autoExportTimer = null;

// 包装 saveData，自动导出
const _originalSaveData = saveData;
saveData = function(d) {
  _originalSaveData(d);
  if (localStorage.getItem('autoExport') !== '1') return;
  clearTimeout(autoExportTimer);
  autoExportTimer = setTimeout(() => {
    const payload = { version: 3, categories: d.categories };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
      url: url,
      filename: '审核意见助手数据_自动备份.json',
      saveAs: false,
      conflictAction: 'overwrite'
    }, () => {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }, 2000);
};

// ===== 初始化 =====

function init() {
  const lastL1Id = getLastL1Id();
  const lastL2Id = getLastL2Id();
  const catIds = data.categories.map(c => c.id);
  currentL1Id = (lastL1Id && catIds.includes(lastL1Id)) ? lastL1Id : (data.categories[0]?.id || null);

  // 恢复上次选中的 L2
  if (currentL1Id && lastL2Id) {
    const cat = getCurrentCategory();
    if (cat) {
      const modIds = cat.modules.map(m => m.id);
      if (modIds.includes(lastL2Id)) currentL2Id = lastL2Id;
      else currentL2Id = cat.modules[0]?.id || null;
    }
  } else if (currentL1Id) {
    const cat = getCurrentCategory();
    currentL2Id = cat ? (cat.modules[0]?.id || null) : null;
  }

  renderL1Selector();
  renderModuleTabs();
  renderComments();
  renderTodos();
  syncGuardSwitch();
  bindEvents();
  initResize();
  initTodoResize();
}

function syncGuardSwitch() {
  const cb = document.getElementById('todo-guard-checkbox');
  if (cb) cb.checked = !!todoGuardOn;
}

// ===== L1 选择器（顶部下拉） =====

function renderL1Selector() {
  const sel = document.getElementById('l1-selector');
  sel.innerHTML = '';

  if (data.categories.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = '请先在设置中创建类别';
    sel.appendChild(opt);
    return;
  }

  data.categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    if (cat.id === currentL1Id) opt.selected = true;
    sel.appendChild(opt);
  });
}

function switchL1(id) {
  currentL1Id = id;
  setLastL1Id(id);
  const cat = getCurrentCategory();
  currentL2Id = cat ? (cat.modules[0]?.id || null) : null;
  if (currentL2Id) setLastL2Id(currentL2Id);

  renderL1Selector();
  renderModuleTabs();
  renderComments();
  renderTodos();
}

// ===== 模块标签渲染（L2） =====

function renderModuleTabs() {
  const tabsEl = document.getElementById('module-tab-buttons');
  const menuEl = document.getElementById('dropdown-menu');
  tabsEl.innerHTML = '';
  menuEl.innerHTML = '';

  const cat = getCurrentCategory();
  if (!cat) return;

  if (cat.modules.length === 0) {
    const hint = document.createElement('span');
    hint.style.cssText = 'font-size:12px; color:var(--text-muted); padding:0 4px;';
    hint.textContent = '请在设置中新建模块';
    tabsEl.appendChild(hint);
    return;
  }

  cat.modules.forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'module-tab' + (m.id === currentL2Id ? ' active' : '');
    btn.textContent = m.name;
    btn.dataset.id = m.id;
    btn.addEventListener('click', () => switchL2(m.id));
    tabsEl.appendChild(btn);

    const item = document.createElement('div');
    item.className = 'dropdown-item' + (m.id === currentL2Id ? ' active' : '');
    item.textContent = m.name;
    item.dataset.id = m.id;
    item.addEventListener('click', () => { switchL2(m.id); closeDropdown(); });
    menuEl.appendChild(item);
  });
}

function switchL2(id) {
  currentL2Id = id;
  setLastL2Id(id);
  renderModuleTabs();
  renderComments();
}

// ===== 意见列表渲染（L3） =====

function renderComments() {
  const section = document.getElementById('comment-section');
  section.innerHTML = '';

  const module = getCurrentModule();
  if (!module) return;

  if (module.comments.length === 0) {
    const tip = document.createElement('div');
    tip.id = 'empty-module-tip';
    tip.textContent = '该模块暂无意见，可点击下方"添加意见"';
    section.appendChild(tip);
    return;
  }

  module.comments.forEach(comment => {
    section.appendChild(createCommentItem(comment));
  });
}

function createCommentItem(comment) {
  const div = document.createElement('div');
  div.className = 'comment-item';
  div.title = '点击插入到光标位置';

  const icon = document.createElement('span');
  icon.className = 'comment-insert-icon';
  icon.textContent = '+';

  const text = document.createElement('span');
  text.className = 'comment-text';
  text.textContent = comment.text;

  div.appendChild(icon);
  div.appendChild(text);

  div.addEventListener('click', () => insertComment(comment.text));
  return div;
}

// ===== 审核待办（L2'） =====

function renderTodos() {
  const list = document.getElementById('todo-list');
  const progress = document.getElementById('todo-progress');
  const cat = getCurrentCategory();
  const todos = cat ? cat.todos : [];
  list.innerHTML = '';

  if (todos.length === 0) {
    const tip = document.createElement('div');
    tip.id = 'todo-empty-tip';
    tip.textContent = '该类别暂无待办，点击下方"添加待办"';
    list.appendChild(tip);
    progress.textContent = '';
    progress.classList.remove('all-done');
    return;
  }

  const sorted = [...todos.filter(t => !t.checked), ...todos.filter(t => t.checked)];
  sorted.forEach(todo => list.appendChild(createTodoItem(todo)));

  const checkedCount = todos.filter(t => t.checked).length;
  progress.textContent = `${checkedCount} / ${todos.length}`;
  progress.classList.toggle('all-done', checkedCount === todos.length);
}

function createTodoItem(todo) {
  const li = document.createElement('li');
  li.className = 'todo-item' + (todo.checked ? ' checked' : '');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'todo-checkbox';
  checkbox.checked = !!todo.checked;
  checkbox.addEventListener('change', () => toggleTodo(todo.id));

  const text = document.createElement('span');
  text.className = 'todo-text';
  text.textContent = todo.text;
  text.addEventListener('click', () => toggleTodo(todo.id));

  const del = document.createElement('button');
  del.className = 'todo-delete';
  del.title = '删除待办';
  del.textContent = '×';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteTodo(todo.id);
  });

  li.appendChild(checkbox);
  li.appendChild(text);
  li.appendChild(del);
  return li;
}

function toggleTodo(id) {
  const cat = getCurrentCategory();
  if (!cat) return;
  const t = cat.todos.find(x => x.id === id);
  if (!t) return;
  t.checked = !t.checked;
  saveData(data);
  renderTodos();
}

function deleteTodo(id) {
  const cat = getCurrentCategory();
  if (!cat) return;
  cat.todos = cat.todos.filter(t => t.id !== id);
  saveData(data);
  renderTodos();
}

function confirmAddTodo() {
  const input = document.getElementById('add-todo-input');
  const text = input.value.trim();
  if (!text) { cancelAddTodo(); return; }
  const cat = getCurrentCategory();
  if (!cat) { cancelAddTodo(); return; }
  cat.todos.push({ id: genId(), text, checked: false });
  saveData(data);
  cancelAddTodo();
  renderTodos();
}

function cancelAddTodo() {
  document.getElementById('add-todo-input-row').style.display = 'none';
  document.getElementById('btn-add-todo').style.display = '';
  document.getElementById('add-todo-input').value = '';
}

function resetTodoChecks() {
  const cat = getCurrentCategory();
  if (!cat) return;
  let changed = false;
  cat.todos.forEach(t => {
    if (t.checked) { t.checked = false; changed = true; }
  });
  if (changed) saveData(data);
  renderTodos();
}

// ===== 插入文字到光标位置 =====

function insertComment(text) {
  const textarea = document.getElementById('output');
  const current = textarea.value;

  let pos = (savedCursor !== null) ? savedCursor : current.length;
  pos = Math.max(0, Math.min(pos, current.length));

  textarea.value = current.slice(0, pos) + text + current.slice(pos);

  const newPos = pos + text.length;
  savedCursor = newPos;

  textarea.focus();
  textarea.setSelectionRange(newPos, newPos);
}

// ===== 下拉菜单 =====

function closeDropdown() {
  document.getElementById('dropdown-menu').classList.remove('open');
}

// ===== 拖拽分割线 =====

function initResize() {
  const handle = document.getElementById('resize-handle');
  const topPane = document.getElementById('top-pane');
  const container = document.getElementById('pane-container');

  let isResizing = false;
  let startY = 0;
  let startH = 0;

  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startY = e.clientY;
    startH = topPane.getBoundingClientRect().height;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const dy = e.clientY - startY;
    const containerH = container.getBoundingClientRect().height;
    const handleH = handle.getBoundingClientRect().height;
    const newH = Math.max(80, Math.min(containerH - handleH - 120, startH + dy));
    topPane.style.height = newH + 'px';
    topPane.style.flex = 'none';
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

// ===== 拖拽分割线（待办 ↔ 模块标签） =====

function initTodoResize() {
  const handle = document.getElementById('todo-resize-handle');
  const todoSection = document.getElementById('todo-section');

  let isResizing = false;
  let startY = 0;
  let startH = 0;

  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startY = e.clientY;
    startH = todoSection.getBoundingClientRect().height;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const dy = e.clientY - startY;
    const newH = Math.max(80, Math.min(400, startH + dy));
    todoSection.style.height = newH + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

// ===== 事件绑定 =====

function bindEvents() {
  // L1 选择器
  document.getElementById('l1-selector').addEventListener('change', (e) => {
    switchL1(e.target.value);
  });

  // 记录 textarea 光标位置
  const textarea = document.getElementById('output');
  ['mouseup', 'keyup', 'focus'].forEach(evt => {
    textarea.addEventListener(evt, () => {
      savedCursor = textarea.selectionStart;
    });
  });
  textarea.addEventListener('blur', () => {
    savedCursor = textarea.selectionStart;
  });

  // 设置页
  document.getElementById('btn-open-settings').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  });

  // 下拉菜单
  document.getElementById('btn-dropdown').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('dropdown-menu').classList.toggle('open');
  });
  document.addEventListener('click', () => closeDropdown());

  // 添加意见
  document.getElementById('btn-add-comment').addEventListener('click', () => {
    document.getElementById('btn-add-comment').style.display = 'none';
    const row = document.getElementById('add-comment-input-row');
    row.style.display = 'flex';
    document.getElementById('add-comment-input').focus();
  });

  document.getElementById('add-comment-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmAddComment();
    if (e.key === 'Escape') cancelAddComment();
  });

  document.getElementById('btn-add-cancel').addEventListener('click', cancelAddComment);

  // 复制
  document.getElementById('btn-copy').addEventListener('click', async () => {
    const text = textarea.value;
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      const btn = document.getElementById('btn-copy');
      btn.textContent = '已复制 ✓';
      setTimeout(() => { btn.textContent = '复制'; }, 1500);
    } catch (e) {
      console.error('复制失败', e);
    }
  });

  // 待办拦截开关
  document.getElementById('todo-guard-checkbox').addEventListener('change', (e) => {
    todoGuardOn = e.target.checked;
    saveTodoGuard(todoGuardOn);
  });

  // 清空
  document.getElementById('btn-clear').addEventListener('click', () => {
    if (todoGuardOn) {
      const cat = getCurrentCategory();
      const todos = cat ? cat.todos : [];
      const uncheckedCount = todos.filter(t => !t.checked).length;
      if (uncheckedCount > 0) {
        const ok = confirm(`还有 ${uncheckedCount} 项待办未勾选，确认清空？`);
        if (!ok) return;
      }
    }
    textarea.value = '';
    savedCursor = null;
    resetTodoChecks();
    textarea.focus();
  });

  // 添加待办
  document.getElementById('btn-add-todo').addEventListener('click', () => {
    document.getElementById('btn-add-todo').style.display = 'none';
    const row = document.getElementById('add-todo-input-row');
    row.style.display = 'flex';
    document.getElementById('add-todo-input').focus();
  });
  document.getElementById('add-todo-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmAddTodo();
    if (e.key === 'Escape') cancelAddTodo();
  });
  document.getElementById('btn-add-todo-cancel').addEventListener('click', cancelAddTodo);

  // settings 修改后同步
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      data = loadData();
      const catIds = data.categories.map(c => c.id);
      if (!catIds.includes(currentL1Id)) {
        currentL1Id = data.categories[0]?.id || null;
      }
      const cat = getCurrentCategory();
      if (cat) {
        const modIds = cat.modules.map(m => m.id);
        if (!modIds.includes(currentL2Id)) {
          currentL2Id = cat.modules[0]?.id || null;
        }
      } else {
        currentL2Id = null;
      }
      renderL1Selector();
      renderModuleTabs();
      renderComments();
      renderTodos();
    }
  });
}

// ===== 工具函数 =====

function getCurrentCategory() {
  return data.categories.find(c => c.id === currentL1Id) || null;
}

function getCurrentModule() {
  const cat = getCurrentCategory();
  if (!cat) return null;
  return cat.modules.find(m => m.id === currentL2Id) || null;
}

function confirmAddComment() {
  const input = document.getElementById('add-comment-input');
  const text = input.value.trim();
  if (!text) { cancelAddComment(); return; }
  const module = getCurrentModule();
  if (!module) { cancelAddComment(); return; }
  module.comments.push({ id: genId(), text });
  saveData(data);
  cancelAddComment();
  renderComments();
}

function cancelAddComment() {
  document.getElementById('add-comment-input-row').style.display = 'none';
  document.getElementById('btn-add-comment').style.display = '';
  document.getElementById('add-comment-input').value = '';
}

// ===== 启动 =====
init();
