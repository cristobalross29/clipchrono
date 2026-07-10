const $ = (sel) => document.querySelector(sel);
const itemsEl = $('#items');
const searchEl = $('#search');
const deleteBtn = $('#delete-selected');
const selCountEl = $('#sel-count');
const folderSelect = $('#folder-select');
const nameRow = $('#folder-name-row');
const nameInput = $('#folder-name-input');
const nameHint = $('#folder-name-hint');
const folderHeader = $('#folder-header');
const folderTitle = $('#folder-title');

let items = [];
let activeIndex = 0;
let selection = new Set();

let currentFolderId = null;
let folderCache = [];
let nameMode = null; // 'create' | 'rename' | 'create-and-move'
let pendingFolderItemId = null;

function showView(name) {
  $('#list-view').hidden = name !== 'list';
  $('#settings-view').hidden = name !== 'settings';
  if (name === 'list') searchEl.focus();
  if (name === 'settings' && window.loadSettingsView) window.loadSettingsView();
}
window.showView = showView;

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

let refreshSeq = 0;
async function refresh() {
  const seq = ++refreshSeq;
  const result = await clipchrono.list(searchEl.value, currentFolderId);
  if (seq !== refreshSeq) return; // a newer refresh superseded this one
  items = result;
  selection = new Set([...selection].filter((id) => items.some((i) => i.id === id)));
  activeIndex = Math.min(activeIndex, Math.max(items.length - 1, 0));
  render();
}

function render() {
  itemsEl.innerHTML = '';
  if (!items.length) {
    const div = document.createElement('div');
    div.className = 'empty';
    div.textContent = searchEl.value
      ? 'No matches'
      : currentFolderId
        ? 'No clips in this folder yet — use 📁 on any clip'
        : 'Copy something — it will show up here';
    itemsEl.appendChild(div);
  }
  items.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'item';
    if (idx === activeIndex) row.classList.add('active');
    if (selection.has(item.id)) row.classList.add('selected');

    if (item.pinned) {
      const pin = document.createElement('span');
      pin.className = 'pin-badge';
      pin.textContent = '📌';
      row.appendChild(pin);
    }

    const body = document.createElement('div');
    body.className = 'body';
    if (item.type === 'text') {
      const p = document.createElement('div');
      p.className = 'text-preview';
      p.textContent = item.preview;
      body.appendChild(p);
    } else {
      const img = document.createElement('img');
      img.className = 'thumb';
      img.src = item.thumbUrl;
      body.appendChild(img);
    }
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = (item.type === 'image' ? 'Image · ' : '') + timeAgo(item.copiedAt);
    body.appendChild(meta);
    row.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const pinBtn = document.createElement('button');
    pinBtn.className = 'icon-btn';
    pinBtn.title = item.pinned ? 'Unpin' : 'Pin';
    pinBtn.textContent = '📌';
    pinBtn.onclick = async (e) => {
      e.stopPropagation();
      await clipchrono.setPinned(item.id, !item.pinned);
      refresh();
    };
    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn';
    delBtn.title = 'Delete';
    delBtn.textContent = '✕';
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      await clipchrono.remove([item.id]);
      refresh();
    };
    const folderBtn = document.createElement('button');
    folderBtn.className = 'icon-btn';
    folderBtn.title = 'Move to folder';
    folderBtn.textContent = '📁';
    folderBtn.onclick = (e) => {
      e.stopPropagation();
      openFolderPopover(item, folderBtn);
    };
    actions.append(folderBtn, pinBtn, delBtn);
    row.appendChild(actions);

    row.onclick = (e) => {
      if (e.metaKey) {
        selection.has(item.id) ? selection.delete(item.id) : selection.add(item.id);
        updateSelectionUI();
        render();
      } else {
        clipchrono.select(item.id);
        selection.clear();
        updateSelectionUI();
      }
    };
    itemsEl.appendChild(row);
  });
  updateSelectionUI();
}

function updateSelectionUI() {
  deleteBtn.hidden = selection.size === 0;
  selCountEl.textContent = selection.size;
}

searchEl.addEventListener('input', () => { activeIndex = 0; refresh(); });

deleteBtn.onclick = async () => {
  await clipchrono.remove([...selection]);
  selection.clear();
  refresh();
};

$('#clear-all').onclick = async () => {
  await clipchrono.clearAll();
  refresh();
};

$('#open-settings').onclick = () => showView('settings');

let folderSeq = 0;
async function refreshFolderSelect() {
  const seq = ++folderSeq;
  const fetched = await clipchrono.listFolders();
  if (seq !== folderSeq) return; // a newer folder refresh superseded this one
  folderCache = fetched;
  if (currentFolderId && !folderCache.some((f) => f.id === currentFolderId)) currentFolderId = null;
  folderSelect.innerHTML = '';
  folderSelect.add(new Option('All', ''));
  for (const f of folderCache) folderSelect.add(new Option(f.name, f.id));
  if (folderCache.length) {
    const sep = new Option('──────────', '__sep__');
    sep.disabled = true;
    folderSelect.add(sep);
  }
  folderSelect.add(new Option('+ New folder…', '__new__'));
  folderSelect.value = currentFolderId || '';
  const current = folderCache.find((f) => f.id === currentFolderId);
  folderHeader.hidden = !current;
  if (current) folderTitle.textContent = current.name;
}

function cancelNameRow() {
  nameMode = null;
  pendingFolderItemId = null;
  nameRow.hidden = true;
  nameInput.value = '';
  nameInput.classList.remove('error');
  nameHint.textContent = '';
  folderSelect.value = currentFolderId || '';
  searchEl.focus();
}

function openNameRow(mode, prefill) {
  nameMode = mode;
  nameRow.hidden = false;
  nameInput.value = prefill || '';
  nameInput.classList.remove('error');
  nameInput.focus();
  nameInput.select();
}

async function confirmNameRow() {
  const name = nameInput.value.trim();
  if (!name) { cancelNameRow(); return; }
  let folder = null;
  if (nameMode === 'rename') folder = await clipchrono.renameFolder(currentFolderId, name);
  else folder = await clipchrono.createFolder(name);
  if (!folder) {
    nameInput.classList.add('error');
    nameHint.textContent = 'Name already exists';
    nameInput.select();
    return;
  }
  if (nameMode === 'create-and-move' && pendingFolderItemId) {
    await clipchrono.setItemFolder(pendingFolderItemId, folder.id);
  }
  if (nameMode !== 'rename') currentFolderId = folder.id;
  cancelNameRow();
  await refreshFolderSelect();
  refresh();
}

nameInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') confirmNameRow();
  else if (e.key === 'Escape') cancelNameRow();
});
nameInput.addEventListener('blur', () => { if (nameMode) cancelNameRow(); });

folderSelect.onchange = () => {
  if (folderSelect.value === '__new__') {
    openNameRow('create', '');
    return;
  }
  currentFolderId = folderSelect.value || null;
  activeIndex = 0;
  selection.clear();
  refreshFolderSelect().then(refresh);
};

$('#folder-rename').onclick = () => openNameRow('rename', folderTitle.textContent);

$('#folder-delete').onclick = async () => {
  const count = (await clipchrono.list('', currentFolderId)).length; // full folder count, ignoring any active search
  if (!confirm(`Delete folder "${folderTitle.textContent}" and its ${count} clip${count === 1 ? '' : 's'}?`)) return;
  await clipchrono.deleteFolder(currentFolderId);
  currentFolderId = null;
  await refreshFolderSelect();
  refresh();
};

let folderPopover = null;

function closeFolderPopover() {
  if (folderPopover) { folderPopover.remove(); folderPopover = null; }
}

function openFolderPopover(item, anchor) {
  closeFolderPopover();
  const pop = document.createElement('div');
  pop.id = 'folder-popover';
  const addChoice = (label, fn) => {
    const el = document.createElement('div');
    el.className = 'folder-popover-item';
    el.textContent = label;
    el.onclick = async (e) => {
      e.stopPropagation();
      closeFolderPopover();
      await fn();
      await refreshFolderSelect();
      refresh();
    };
    pop.appendChild(el);
  };
  if (item.folderId) addChoice('All (remove from folder)', () => clipchrono.setItemFolder(item.id, null));
  for (const f of folderCache) {
    if (f.id !== item.folderId) addChoice(f.name, () => clipchrono.setItemFolder(item.id, f.id));
  }
  addChoice('+ New…', async () => {
    pendingFolderItemId = item.id;
    openNameRow('create-and-move', '');
  });
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.top = Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 8) + 'px';
  pop.style.left = Math.min(r.left - pop.offsetWidth + anchor.offsetWidth, window.innerWidth - pop.offsetWidth - 8) + 'px';
  folderPopover = pop;
}

document.addEventListener('click', (e) => {
  if (folderPopover && !folderPopover.contains(e.target)) closeFolderPopover();
});

document.addEventListener('keydown', (e) => {
  if (!$('#settings-view').hidden) {
    if (e.key === 'Escape') showView('list');
    return;
  }
  const t = e.target;
  if (t !== searchEl && (t.tagName === 'SELECT' || t.tagName === 'BUTTON' || t === nameInput)) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex = Math.min(activeIndex + 1, items.length - 1);
    render();
    itemsEl.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex = Math.max(activeIndex - 1, 0);
    render();
    itemsEl.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && items[activeIndex]) {
    clipchrono.select(items[activeIndex].id);
  } else if ((e.key === 'Backspace' || e.key === 'Delete') && document.activeElement !== searchEl) {
    const ids = selection.size ? [...selection] : items[activeIndex] ? [items[activeIndex].id] : [];
    if (ids.length) {
      clipchrono.remove(ids).then(() => { selection.clear(); refresh(); });
    }
  } else if (e.key === 'Escape') {
    if (folderPopover) { closeFolderPopover(); }
    else if (selection.size) { selection.clear(); render(); }
    else if (searchEl.value) { searchEl.value = ''; refresh(); }
    else if (currentFolderId) { currentFolderId = null; refreshFolderSelect().then(refresh); }
    else clipchrono.hidePanel();
  }
});

clipchrono.onShow(() => {
  searchEl.value = '';
  selection.clear();
  activeIndex = 0;
  showView('list');
  currentFolderId = null;
  closeFolderPopover();
  cancelNameRow();
  refreshFolderSelect();
  refresh();
});
clipchrono.onHistoryChanged(() => refresh());

refresh();
refreshFolderSelect();
