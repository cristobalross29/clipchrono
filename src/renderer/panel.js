const $ = (sel) => document.querySelector(sel);
const itemsEl = $('#items');
const searchEl = $('#search');
const deleteBtn = $('#delete-selected');
const selCountEl = $('#sel-count');

let items = [];
let activeIndex = 0;
let selection = new Set();

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
  const result = await pastport.list(searchEl.value);
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
    div.textContent = searchEl.value ? 'No matches' : 'Copy something — it will show up here';
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
      await pastport.setPinned(item.id, !item.pinned);
      refresh();
    };
    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn';
    delBtn.title = 'Delete';
    delBtn.textContent = '✕';
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      await pastport.remove([item.id]);
      refresh();
    };
    actions.append(pinBtn, delBtn);
    row.appendChild(actions);

    row.onclick = (e) => {
      if (e.metaKey) {
        selection.has(item.id) ? selection.delete(item.id) : selection.add(item.id);
        updateSelectionUI();
        render();
      } else {
        pastport.select(item.id);
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
  await pastport.remove([...selection]);
  selection.clear();
  refresh();
};

$('#clear-all').onclick = async () => {
  await pastport.clearAll();
  refresh();
};

$('#open-settings').onclick = () => showView('settings');

document.addEventListener('keydown', (e) => {
  if (!$('#settings-view').hidden) {
    if (e.key === 'Escape') showView('list');
    return;
  }
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
    pastport.select(items[activeIndex].id);
  } else if ((e.key === 'Backspace' || e.key === 'Delete') && document.activeElement !== searchEl) {
    const ids = selection.size ? [...selection] : items[activeIndex] ? [items[activeIndex].id] : [];
    if (ids.length) {
      pastport.remove(ids).then(() => { selection.clear(); refresh(); });
    }
  } else if (e.key === 'Escape') {
    if (selection.size) { selection.clear(); render(); }
    else if (searchEl.value) { searchEl.value = ''; refresh(); }
    else pastport.hidePanel();
  }
});

pastport.onShow(() => {
  searchEl.value = '';
  selection.clear();
  activeIndex = 0;
  showView('list');
  refresh();
});
pastport.onHistoryChanged(() => refresh());

refresh();
