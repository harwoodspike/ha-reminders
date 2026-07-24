/**
 * ha-reminders-panel
 *
 * Full-page sidebar panel for the HA Reminders integration.
 * Registered via panel_custom in __init__.py. HA sets the
 * `hass`, `narrow`, `route`, and `panel` properties on this element.
 * Lists all reminder sensors sorted by urgency, each with a Mark Done button.
 */

const REMINDER_ATTRS = ['days_until', 'is_overdue', 'due_date', 'interval'];

class HaRemindersPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._narrow = false;
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  set narrow(value) {
    this._narrow = value;
    this._render();
  }

  set route(_value) {}

  set panel(_value) {}

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------

  _getReminderEntities() {
    if (!this._hass) return [];
    return Object.values(this._hass.states)
      .filter(s => REMINDER_ATTRS.every(a => a in s.attributes))
      .sort((a, b) => a.attributes.days_until - b.attributes.days_until);
  }

  _markDone(entityId) {
    this._hass.callService('ha_reminders', 'mark_done', {}, { entity_id: entityId });
  }

  _toggleMenu() {
    this.dispatchEvent(new CustomEvent('hass-toggle-menu', { bubbles: true, composed: true }));
  }

  // ---------------------------------------------------------------------------
  // Text helpers
  // ---------------------------------------------------------------------------

  _statusText(attrs) {
    const days = Math.abs(attrs.days_until);
    if (attrs.is_overdue) return `Overdue by ${days} day${days !== 1 ? 's' : ''}`;
    if (days === 0) return 'Due today';
    return `Due in ${days} day${days !== 1 ? 's' : ''}`;
  }

  _lastChangedText(attrs) {
    if (!attrs.last_changed) return '';
    const d = new Date(attrs.last_changed + 'T00:00:00');
    return 'Last done: ' + d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  _render() {
    const entities = this._getReminderEntities();

    const body = entities.length === 0
      ? `<p class="empty">No reminders yet — add one from Settings → Devices &amp; Services.</p>`
      : entities.map((entity, i) => {
          const attrs = entity.attributes;
          const name = attrs.friendly_name || entity.entity_id;
          const status = this._statusText(attrs);
          const overdue = attrs.is_overdue ? ' overdue' : '';
          const divider = i > 0 ? '<hr>' : '';
          const lastDone = this._lastChangedText(attrs);
          return `
            ${divider}
            <div class="row">
              <div class="info">
                <span class="name">${name}</span>
                <span class="status${overdue}">${status}</span>
                ${lastDone ? `<span class="last-done">${lastDone}</span>` : ''}
              </div>
              <button data-entity="${entity.entity_id}">Mark Done</button>
            </div>`;
        }).join('');

    const menuButton = this._narrow
      ? `<button class="menu" title="Open sidebar" aria-label="Open sidebar">☰</button>`
      : '';

    this.shadowRoot.innerHTML = `
      <style>
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
          font-weight: 400;
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
        .content {
          max-width: 600px;
          margin: 16px auto;
          padding: 0 8px;
        }
        .card {
          background: var(--ha-card-background, var(--card-background-color, white));
          border-radius: var(--ha-card-border-radius, 12px);
          box-shadow: var(--ha-card-box-shadow, 0 2px 4px rgba(0,0,0,0.1));
          padding: 0 0 12px;
          overflow: hidden;
        }
        hr {
          border: none;
          border-top: 1px solid var(--divider-color);
          margin: 0;
        }
        .row {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          gap: 12px;
        }
        .info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .name { color: var(--primary-text-color); }
        .status {
          font-size: 0.85em;
          color: var(--secondary-text-color);
        }
        .status.overdue {
          color: var(--error-color, #db4437);
          font-weight: 500;
        }
        .last-done {
          font-size: 0.8em;
          color: var(--disabled-text-color, #9e9e9e);
        }
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
        .empty {
          padding: 16px;
          color: var(--secondary-text-color);
          font-style: italic;
        }
      </style>
      <div class="bar">
        ${menuButton}
        <span>Reminders</span>
      </div>
      <div class="content">
        <div class="card">
          ${body}
        </div>
      </div>`;

    const menu = this.shadowRoot.querySelector('button.menu');
    if (menu) menu.addEventListener('click', () => this._toggleMenu());

    this.shadowRoot.querySelectorAll('button[data-entity]').forEach(btn => {
      btn.addEventListener('click', () => this._markDone(btn.dataset.entity));
    });
  }
}

customElements.define('ha-reminders-panel', HaRemindersPanel);
