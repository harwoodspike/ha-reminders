/**
 * ha-reminders-card
 *
 * Custom Lovelace card for the HA Reminders integration.
 * Auto-discovers all reminder sensor entities and renders
 * each row with a "Mark Done" button.
 *
 * Installation:
 *   1. Copy this file to /config/www/ha-reminders-card.js
 *   2. In HA: Settings > Dashboards > Resources > Add resource
 *      URL: /local/ha-reminders-card.js  Type: JavaScript module
 *   3. Add card to dashboard:
 *        type: custom:ha-reminders-card
 *        title: Reminders   # optional
 */

const REMINDER_ATTRS = ['days_until', 'is_overdue', 'due_date', 'interval'];

class HaRemindersCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  setConfig(config) {
    this._config = config || {};
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  // ---------------------------------------------------------------------------
  // Helpers
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

  // ---------------------------------------------------------------------------
  // Rendering
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

  _render() {
    const entities = this._getReminderEntities();
    const title = this._config.title ?? 'Reminders';

    const rows = entities.length === 0
      ? `<p class="empty">No reminders configured.</p>`
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

    this.shadowRoot.innerHTML = `
      <style>
        ha-card { padding: 0 0 12px; }
        .header {
          padding: 16px 16px 4px;
          font-size: 1.1em;
          font-weight: 500;
          color: var(--ha-card-header-color, var(--primary-text-color));
        }
        hr {
          border: none;
          border-top: 1px solid var(--divider-color);
          margin: 0;
        }
        .row {
          display: flex;
          align-items: center;
          padding: 10px 16px;
          gap: 12px;
        }
        .info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .name {
          color: var(--primary-text-color);
        }
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
        button {
          background: var(--primary-color);
          color: var(--text-primary-color, white);
          border: none;
          border-radius: 4px;
          padding: 6px 14px;
          font-size: 0.85em;
          cursor: pointer;
          white-space: nowrap;
        }
        button:active { opacity: 0.75; }
        .empty {
          padding: 8px 16px;
          color: var(--secondary-text-color);
          font-style: italic;
        }
      </style>
      <ha-card>
        ${title ? `<div class="header">${title}</div>` : ''}
        ${rows}
      </ha-card>`;

    this.shadowRoot.querySelectorAll('button[data-entity]').forEach(btn => {
      btn.addEventListener('click', () => this._markDone(btn.dataset.entity));
    });
  }

  // ---------------------------------------------------------------------------
  // Card metadata
  // ---------------------------------------------------------------------------

  getCardSize() {
    return Math.max(1, this._getReminderEntities().length);
  }

  static getStubConfig() {
    return { title: 'Reminders' };
  }
}

customElements.define('ha-reminders-card', HaRemindersCard);
