/**
 * ha-reminders-panel
 *
 * Full-page sidebar panel for the HA Reminders integration.
 * Toolbar-driven UI with a card-grid view and a table view.
 * HA sets `hass`, `narrow`, `route`, `panel` on this element.
 *
 * Design: a shell (app bar + toolbar + results container) is built once;
 * `_renderResults()` re-renders only the results area on data/search/filter/
 * layout changes, so the search input keeps focus across frequent hass updates.
 */

const REMINDER_ATTRS = ['days_until', 'is_overdue', 'due_date', 'interval'];
const STORAGE_KEY = 'ha-reminders-panel';
const DEFAULT_COLUMNS = { status: true, due_date: true, last_done: true, due_in: true };
const TABLE_COLUMNS = [
  { key: 'status', label: 'Status' },
  { key: 'due_date', label: 'Due date' },
  { key: 'last_done', label: 'Last done' },
  { key: 'due_in', label: 'Due in' },
];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

class HaRemindersPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._narrow = false;
    this._built = false;
    this._state = {
      layout: 'grid',
      search: '',
      filter: { status: 'all', overdueOnly: false, withinDays: null },
      columns: { ...DEFAULT_COLUMNS },
      sort: { key: 'due_in', dir: 'asc' },
    };
    this._loadPersisted();
    this._onDocClick = this._onDocClick.bind(this);
  }

  connectedCallback() {
    // Listen at document level so clicks anywhere outside the panel (e.g. the
    // HA sidebar) also dismiss open popovers. Composed click events cross the
    // shadow boundary, so composedPath() still reveals our internal targets.
    document.addEventListener('click', this._onDocClick);
  }

  disconnectedCallback() {
    document.removeEventListener('click', this._onDocClick);
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) this._buildShell();
    this._renderResults();
  }

  set narrow(value) {
    if (this._narrow === value) return;
    this._narrow = value;
    if (this._built) {
      this._buildShell();
      this._renderResults();
    }
  }

  set route(_value) {}
  set panel(_value) {}

  // --- persistence ---------------------------------------------------------

  _loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.layout === 'grid' || saved.layout === 'table') {
        this._state.layout = saved.layout;
      }
      if (saved.columns && typeof saved.columns === 'object') {
        this._state.columns = { ...DEFAULT_COLUMNS, ...saved.columns };
      }
    } catch (_e) {
      // Corrupt or unavailable storage: keep defaults.
    }
  }

  _persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ layout: this._state.layout, columns: this._state.columns })
      );
    } catch (_e) {
      // Storage disabled: ignore.
    }
  }

  // --- data ----------------------------------------------------------------

  _allReminders() {
    if (!this._hass) return [];
    return Object.values(this._hass.states).filter((s) =>
      REMINDER_ATTRS.every((a) => a in s.attributes)
    );
  }

  _name(entity) {
    return entity.attributes.friendly_name || entity.entity_id;
  }

  _filteredSorted() {
    let list = this._allReminders();

    const q = this._state.search.trim().toLowerCase();
    if (q) list = list.filter((s) => this._name(s).toLowerCase().includes(q));

    const f = this._state.filter;
    if (f.status === 'overdue') list = list.filter((s) => s.attributes.is_overdue);
    else if (f.status === 'due_today') list = list.filter((s) => s.attributes.days_until === 0);
    else if (f.status === 'upcoming') list = list.filter((s) => s.attributes.days_until > 0);
    if (f.overdueOnly) list = list.filter((s) => s.attributes.is_overdue);
    if (f.withinDays != null) list = list.filter((s) => s.attributes.days_until <= f.withinDays);

    if (this._state.layout === 'table') return this._sorted(list, this._state.sort);
    return [...list].sort((a, b) => a.attributes.days_until - b.attributes.days_until);
  }

  _sorted(list, sort) {
    const dir = sort.dir === 'desc' ? -1 : 1;
    const keyVal = (s) => {
      const a = s.attributes;
      switch (sort.key) {
        case 'name': return this._name(s).toLowerCase();
        case 'due_date': return a.due_date || '';
        case 'last_done': return a.last_changed || '';
        case 'status': return a.is_overdue ? 0 : 1;
        case 'due_in':
        default: return a.days_until;
      }
    };
    return [...list].sort((x, y) => {
      const vx = keyVal(x);
      const vy = keyVal(y);
      let cmp = 0;
      if (vx < vy) cmp = -1;
      else if (vx > vy) cmp = 1;
      if (cmp === 0) cmp = x.attributes.days_until - y.attributes.days_until;
      return cmp * dir;
    });
  }

  // --- actions -------------------------------------------------------------

  _markDone(entityId) {
    this._hass.callService('ha_reminders', 'mark_done', {}, { entity_id: entityId });
  }

  _toggleMenu() {
    this.dispatchEvent(new CustomEvent('hass-toggle-menu', { bubbles: true, composed: true }));
  }

  // --- text / badges -------------------------------------------------------

  _statusText(attrs) {
    const days = Math.abs(attrs.days_until);
    if (attrs.is_overdue) return `Overdue by ${days} day${days !== 1 ? 's' : ''}`;
    if (days === 0) return 'Due today';
    return `Due in ${days} day${days !== 1 ? 's' : ''}`;
  }

  _statusBadge(attrs) {
    const overdue = attrs.is_overdue;
    return `<span class="badge ${overdue ? 'overdue' : 'notdue'}">${overdue ? 'Overdue' : 'Not Due'}</span>`;
  }

  // --- shell (built once, and on narrow change) ----------------------------

  _buildShell() {
    const s = this._state;
    const menuButton = this._narrow
      ? `<button class="menu" data-action="menu" title="Open sidebar" aria-label="Open sidebar">☰</button>`
      : '';

    this.shadowRoot.innerHTML = `
      <style>${this._css()}</style>
      <div class="bar">
        ${menuButton}
        <span class="title">Reminders</span>
      </div>
      <div class="toolbar">
        <input class="search" type="search" placeholder="Search reminders…" value="${escapeHtml(s.search)}" />
        <div class="layout-toggle" role="group" aria-label="Layout">
          <button data-layout="grid" class="${s.layout === 'grid' ? 'active' : ''}" title="Card grid" aria-label="Card grid">▦</button>
          <button data-layout="table" class="${s.layout === 'table' ? 'active' : ''}" title="Table" aria-label="Table">≣</button>
        </div>
        <div class="menu-wrap">
          <button class="tbtn" data-action="toggle-filters">Filters ▾</button>
          <div class="popover" data-pop="filters">${this._filtersPopover()}</div>
        </div>
        <div class="menu-wrap" data-columns ${s.layout === 'table' ? '' : 'hidden'}>
          <button class="tbtn" data-action="toggle-columns">Columns ▾</button>
          <div class="popover" data-pop="columns">${this._columnsPopover()}</div>
        </div>
      </div>
      <div class="results" data-results></div>`;

    this._resultsEl = this.shadowRoot.querySelector('[data-results]');
    this._wireShell();
    this._built = true;
  }

  _filtersPopover() {
    const f = this._state.filter;
    const opt = (val, label) =>
      `<option value="${val}" ${f.status === val ? 'selected' : ''}>${label}</option>`;
    return `
      <label class="pf">
        <span>Status</span>
        <select data-filter="status">
          ${opt('all', 'All')}${opt('overdue', 'Overdue')}${opt('due_today', 'Due today')}${opt('upcoming', 'Upcoming')}
        </select>
      </label>
      <label class="pf">
        <input type="checkbox" data-filter="overdueOnly" ${f.overdueOnly ? 'checked' : ''} />
        <span>Overdue only</span>
      </label>
      <label class="pf">
        <span>Due within (days)</span>
        <input type="number" min="0" data-filter="withinDays" value="${f.withinDays == null ? '' : f.withinDays}" />
      </label>`;
  }

  _columnsPopover() {
    const c = this._state.columns;
    return TABLE_COLUMNS.map(
      (col) => `
      <label class="pf">
        <input type="checkbox" data-column="${col.key}" ${c[col.key] ? 'checked' : ''} />
        <span>${col.label}</span>
      </label>`
    ).join('');
  }

  _wireShell() {
    const root = this.shadowRoot;
    root.querySelector('.search').addEventListener('input', (e) => {
      this._state.search = e.target.value;
      this._renderResults();
    });
    root.querySelectorAll('[data-layout]').forEach((btn) => {
      btn.addEventListener('click', () => this._setLayout(btn.dataset.layout));
    });
    root.querySelectorAll('[data-filter]').forEach((el) => {
      el.addEventListener('change', () => this._onFilterChange());
    });
    // Live filtering for the "Due within N days" number field (matches Search).
    root.querySelector('[data-filter="withinDays"]').addEventListener('input', () => this._onFilterChange());
    root.querySelectorAll('[data-column]').forEach((el) => {
      el.addEventListener('change', () => {
        this._state.columns[el.dataset.column] = el.checked;
        this._persist();
        this._renderResults();
      });
    });
  }

  _onFilterChange() {
    const root = this.shadowRoot;
    const statusEl = root.querySelector('[data-filter="status"]');
    const overdueEl = root.querySelector('[data-filter="overdueOnly"]');
    const withinEl = root.querySelector('[data-filter="withinDays"]');
    this._state.filter.status = statusEl.value;
    this._state.filter.overdueOnly = overdueEl.checked;
    const n = parseInt(withinEl.value, 10);
    this._state.filter.withinDays =
      withinEl.value === '' || Number.isNaN(n) ? null : Math.max(0, n);
    this._renderResults();
  }

  _setLayout(layout) {
    if (this._state.layout === layout) return;
    this._state.layout = layout;
    this._persist();
    this.shadowRoot
      .querySelectorAll('[data-layout]')
      .forEach((b) => b.classList.toggle('active', b.dataset.layout === layout));
    const colWrap = this.shadowRoot.querySelector('[data-columns]');
    if (colWrap) colWrap.hidden = layout !== 'table';
    this._closePopovers();
    this._renderResults();
  }

  // --- popovers ------------------------------------------------------------

  _onDocClick(e) {
    const path = e.composedPath();
    const actionEl = path.find(
      (n) => n instanceof HTMLElement && n.dataset && n.dataset.action
    );
    const action = actionEl && actionEl.dataset.action;
    if (action === 'menu') {
      this._toggleMenu();
      return;
    }
    if (action === 'toggle-filters') {
      this._togglePopover('filters');
      return;
    }
    if (action === 'toggle-columns') {
      this._togglePopover('columns');
      return;
    }
    const inPopover = path.some(
      (n) => n instanceof HTMLElement && n.dataset && n.dataset.pop
    );
    if (!inPopover) this._closePopovers();
  }

  _togglePopover(name) {
    const pop = this.shadowRoot.querySelector(`[data-pop="${name}"]`);
    const isOpen = pop.classList.contains('open');
    this._closePopovers();
    if (!isOpen) pop.classList.add('open');
  }

  _closePopovers() {
    this.shadowRoot.querySelectorAll('.popover.open').forEach((p) => p.classList.remove('open'));
  }

  // --- results -------------------------------------------------------------

  _renderResults() {
    if (!this._resultsEl) return;
    const total = this._allReminders().length;
    const list = this._filteredSorted();

    if (total === 0) {
      this._resultsEl.innerHTML =
        `<p class="empty">No reminders configured — add one from Settings → Devices &amp; Services.</p>`;
      return;
    }
    if (list.length === 0) {
      this._resultsEl.innerHTML =
        `<p class="empty">No reminders match your search or filters.</p>`;
      return;
    }

    this._resultsEl.innerHTML =
      this._state.layout === 'table' ? this._renderTable(list) : this._renderGrid(list);

    this._resultsEl.querySelectorAll('button[data-entity]').forEach((btn) => {
      btn.addEventListener('click', () => this._markDone(btn.dataset.entity));
    });
    if (this._state.layout === 'table') {
      this._resultsEl.querySelectorAll('th[data-sort]').forEach((th) => {
        th.addEventListener('click', () => this._toggleSort(th.dataset.sort));
      });
    }
  }

  _renderGrid(list) {
    const cards = list
      .map((entity) => {
        const attrs = entity.attributes;
        const name = escapeHtml(this._name(entity));
        const status = escapeHtml(this._statusText(attrs));
        const last = attrs.last_changed
          ? `Last done  ${escapeHtml(formatDate(attrs.last_changed))}`
          : '';
        return `
        <div class="card">
          <div class="card-head">
            <span class="card-name">${name}</span>
            ${this._statusBadge(attrs)}
          </div>
          <div class="card-status">${status}</div>
          ${last ? `<div class="card-last">${last}</div>` : ''}
          <hr>
          <div class="card-actions">
            <button data-entity="${escapeHtml(entity.entity_id)}">Mark Done</button>
          </div>
        </div>`;
      })
      .join('');
    return `<div class="grid">${cards}</div>`;
  }

  _renderTable(list) {
    const c = this._state.columns;
    const sort = this._state.sort;
    const arrow = (key) => (sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');
    const th = (key, label, extraClass = '') =>
      `<th data-sort="${key}" class="${extraClass}">${label}${arrow(key)}</th>`;

    const headers = [th('name', 'Name')];
    if (c.status) headers.push(th('status', 'Status'));
    if (c.due_date) headers.push(th('due_date', 'Due date'));
    if (c.last_done) headers.push(th('last_done', 'Last done'));
    if (c.due_in) headers.push(th('due_in', 'Due in', 'num'));
    headers.push('<th class="actions" aria-label="Actions"></th>');

    const rows = list
      .map((entity) => {
        const attrs = entity.attributes;
        const cells = [`<td>${escapeHtml(this._name(entity))}</td>`];
        if (c.status) cells.push(`<td>${this._statusBadge(attrs)}</td>`);
        if (c.due_date) cells.push(`<td>${escapeHtml(formatDate(attrs.due_date))}</td>`);
        if (c.last_done) cells.push(`<td>${escapeHtml(formatDate(attrs.last_changed))}</td>`);
        if (c.due_in) cells.push(`<td class="num">${attrs.days_until}</td>`);
        cells.push(
          `<td class="actions"><button data-entity="${escapeHtml(entity.entity_id)}">Mark Done</button></td>`
        );
        return `<tr>${cells.join('')}</tr>`;
      })
      .join('');

    return `<table><thead><tr>${headers.join('')}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  _toggleSort(key) {
    const sort = this._state.sort;
    if (sort.key === key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
    else {
      sort.key = key;
      sort.dir = 'asc';
    }
    this._renderResults();
  }

  // --- styles --------------------------------------------------------------

  _css() {
    return `
      :host {
        display: block;
        height: 100%;
        background: var(--primary-background-color, #fafafa);
        color: var(--primary-text-color);
      }
      .bar {
        display: flex;
        align-items: center;
        gap: 12px;
        height: 56px;
        padding: 0 16px;
        background: var(--app-header-background-color, var(--primary-color));
        color: var(--app-header-text-color, var(--text-primary-color, white));
        font-size: 1.25em;
        box-sizing: border-box;
      }
      .menu {
        background: none;
        border: none;
        color: inherit;
        font-size: 1.2em;
        cursor: pointer;
        padding: 4px 8px;
        line-height: 1;
      }
      .toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        padding: 12px 16px;
        position: sticky;
        top: 0;
        z-index: 2;
        background: var(--primary-background-color, #fafafa);
        border-bottom: 1px solid var(--divider-color);
      }
      .search {
        flex: 1;
        min-width: 160px;
        padding: 8px 10px;
        border: 1px solid var(--divider-color);
        border-radius: 6px;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color);
        font-size: 0.95em;
      }
      .layout-toggle {
        display: inline-flex;
        border: 1px solid var(--divider-color);
        border-radius: 6px;
        overflow: hidden;
      }
      .layout-toggle button {
        background: var(--card-background-color, #fff);
        border: none;
        padding: 6px 10px;
        cursor: pointer;
        color: var(--secondary-text-color);
        font-size: 1em;
      }
      .layout-toggle button.active {
        background: var(--primary-color);
        color: var(--text-primary-color, white);
      }
      .menu-wrap { position: relative; }
      .tbtn {
        background: var(--card-background-color, #fff);
        border: 1px solid var(--divider-color);
        border-radius: 6px;
        padding: 7px 10px;
        cursor: pointer;
        color: var(--primary-text-color);
        font-size: 0.9em;
        white-space: nowrap;
      }
      .popover {
        position: absolute;
        top: calc(100% + 4px);
        right: 0;
        min-width: 210px;
        background: var(--card-background-color, #fff);
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        padding: 12px;
        display: none;
        flex-direction: column;
        gap: 10px;
        z-index: 5;
      }
      .popover.open { display: flex; }
      .pf {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-size: 0.9em;
        color: var(--primary-text-color);
      }
      .pf select,
      .pf input[type='number'] {
        padding: 4px 6px;
        border: 1px solid var(--divider-color);
        border-radius: 4px;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color);
      }
      .pf input[type='number'] { width: 70px; }
      .results { padding: 16px; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 12px;
      }
      .card {
        background: var(--ha-card-background, var(--card-background-color, white));
        border-radius: var(--ha-card-border-radius, 12px);
        box-shadow: var(--ha-card-box-shadow, 0 2px 4px rgba(0, 0, 0, 0.1));
        padding: 12px 16px;
      }
      .card-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }
      .card-name { font-weight: 500; color: var(--primary-text-color); }
      .card-status { font-size: 0.9em; color: var(--secondary-text-color); margin-top: 4px; }
      .card-last { font-size: 0.8em; color: var(--disabled-text-color, #9e9e9e); margin-top: 2px; }
      .card hr { border: none; border-top: 1px solid var(--divider-color); margin: 12px 0 10px; }
      .card-actions { display: flex; justify-content: flex-end; }
      button[data-entity] {
        background: var(--primary-color);
        color: var(--text-primary-color, white);
        border: none;
        border-radius: 4px;
        padding: 6px 14px;
        font-size: 0.85em;
        cursor: pointer;
        white-space: nowrap;
      }
      button[data-entity]:active { opacity: 0.75; }
      .badge {
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 0.75em;
        font-weight: 500;
        white-space: nowrap;
        color: var(--c);
        background: color-mix(in srgb, var(--c) 12%, transparent);
      }
      .badge.overdue { --c: var(--error-color, #db4437); }
      .badge.notdue { --c: var(--success-color, #43a047); }
      table {
        width: 100%;
        border-collapse: collapse;
        background: var(--card-background-color, #fff);
        border-radius: 8px;
        overflow: hidden;
      }
      th, td {
        text-align: left;
        padding: 10px 12px;
        border-bottom: 1px solid var(--divider-color);
        font-size: 0.9em;
      }
      th {
        cursor: pointer;
        color: var(--secondary-text-color);
        font-weight: 500;
        user-select: none;
        white-space: nowrap;
      }
      th.num, td.num { text-align: right; }
      th.actions, td.actions { text-align: right; cursor: default; }
      .empty { padding: 16px; color: var(--secondary-text-color); font-style: italic; }
    `;
  }
}

customElements.define('ha-reminders-panel', HaRemindersPanel);
