# Reminders Sidebar Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragile auto-created Lovelace dashboard with a reliable custom sidebar panel (`panel_custom`) that lists reminders and lets the user mark each done.

**Architecture:** The integration's `async_setup` registers a static path for a new panel JS module and registers a custom panel via `frontend.async_register_built_in_panel`. The panel JS defines a full-page `<ha-reminders-panel>` web component that reuses the old card's rendering logic. The embeddable Lovelace card and all dashboard/resource-registry code are deleted.

**Tech Stack:** Home Assistant custom integration (Python), vanilla-JS custom element (Shadow DOM), pytest + HA test harness.

## Global Constraints

- Panel identity: sidebar title `Reminders`, icon `mdi:bell-check`, url path `reminders`, custom element name `ha-reminders-panel`.
- Panel JS served at `/ha_reminders/ha-reminders-panel.js`; static path registered with `cache_headers=False`.
- `module_url` carries a `?v=<manifest version>` cache-buster, version read via `homeassistant.loader.async_get_integration(hass, DOMAIN).version` — no file I/O in the event loop.
- Panel registered directly in `async_setup` (not on `EVENT_HOMEASSISTANT_STARTED`); guard the registration with `try/except ValueError` for reload safety.
- Panel visible to all users (`require_admin=False`).
- `manifest.json` keeps `frontend` and `http` dependencies. No version bump in this change.
- Frontend styling uses HA theme CSS variables so it matches the active theme.
- Scope is view + mark-done only. No add/edit/delete in the panel; no embeddable card.

---

### Task 1: Panel frontend (`ha-reminders-panel.js`) + remove the card

**Files:**
- Create: `custom_components/ha_reminders/ha-reminders-panel.js`
- Delete: `custom_components/ha_reminders/ha-reminders-card.js`

**Interfaces:**
- Consumes: nothing (leaf frontend asset).
- Produces: a custom element `ha-reminders-panel` served at `/ha_reminders/ha-reminders-panel.js` (Task 2's `module_url` and static path point here). HA sets `hass`, `narrow`, `route`, `panel` properties on the element.

There is no JS test harness in this repo, so this task is verified by manual load in Home Assistant (Step 4). Do the file work first so the static path in Task 2 points at a real file.

- [ ] **Step 1: Create the panel JS file**

Create `custom_components/ha_reminders/ha-reminders-panel.js` with exactly this content:

```javascript
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
```

- [ ] **Step 2: Delete the old card file**

Run: `git rm custom_components/ha_reminders/ha-reminders-card.js`
Expected: `rm 'custom_components/ha_reminders/ha-reminders-card.js'`

- [ ] **Step 3: Commit**

```bash
git add custom_components/ha_reminders/ha-reminders-panel.js
git commit -m "feat: add reminders sidebar panel web component, remove card"
```

- [ ] **Step 4: Manual verification (after Task 2 lands)**

This step cannot run until Task 2 registers the panel. After both tasks are done, load the integration in a running Home Assistant, open the **Reminders** sidebar entry, and confirm: reminders list sorted by urgency, overdue ones in the error color, "Mark Done" resets a reminder to "Due in <interval> days", the empty-state text shows when no reminders exist, and the hamburger appears/toggles the sidebar on a narrow window. Hard-refresh once if the old asset is cached.

---

### Task 2: Register the panel in `__init__.py`, remove dashboard/resource code

**Files:**
- Modify: `custom_components/ha_reminders/__init__.py`
- Test: `tests/components/ha_reminders/test_init.py`

**Interfaces:**
- Consumes: the `ha-reminders-panel.js` asset and `ha-reminders-panel` element name from Task 1.
- Produces: a registered built-in panel at url path `reminders` in `hass.data[frontend.DATA_PANELS]`, whose `config["_panel_custom"]["module_url"]` begins with `/ha_reminders/ha-reminders-panel.js?v=`.

- [ ] **Step 1: Write the failing tests**

Add these two tests to `tests/components/ha_reminders/test_init.py` (keep the existing imports; add `from homeassistant.components import frontend` near the other imports):

```python
async def test_panel_registered_after_setup(hass: HomeAssistant) -> None:
    """The custom Reminders sidebar panel is registered after setup."""
    entry = _make_entry()
    await _setup(hass, entry)

    panels = hass.data[frontend.DATA_PANELS]
    assert "reminders" in panels

    panel = panels["reminders"]
    assert panel.sidebar_title == "Reminders"
    assert panel.sidebar_icon == "mdi:bell-check"
    assert panel.component_name == "custom"


async def test_panel_module_url_is_versioned(hass: HomeAssistant) -> None:
    """The panel module URL carries a version cache-buster query token."""
    entry = _make_entry()
    await _setup(hass, entry)

    panel = hass.data[frontend.DATA_PANELS]["reminders"]
    module_url = panel.config["_panel_custom"]["module_url"]
    assert module_url.startswith("/ha_reminders/ha-reminders-panel.js?v=")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/components/ha_reminders/test_init.py::test_panel_registered_after_setup tests/components/ha_reminders/test_init.py::test_panel_module_url_is_versioned -v`
Expected: FAIL — `"reminders" not in panels` (panel not registered yet; old code registers a lovelace dashboard named `reminders` only on the started event, which does not fire in tests).

- [ ] **Step 3: Rewrite the top of `__init__.py`**

Replace the module header through the end of `async_setup` (current lines 1–93, from `"""The HA Reminders integration."""` down to the end of `async_setup`) with:

```python
"""The HA Reminders integration."""

from __future__ import annotations

from datetime import date
import logging
from pathlib import Path

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)
_PLATFORMS: list[Platform] = [Platform.SENSOR]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

_PANEL_URL = "/ha_reminders/ha-reminders-panel.js"
_PANEL_PATH = Path(__file__).parent / "ha-reminders-panel.js"
_PANEL_URL_PATH = "reminders"


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the Reminders panel JS and sidebar panel."""
    await hass.http.async_register_static_paths(
        [StaticPathConfig(_PANEL_URL, str(_PANEL_PATH), cache_headers=False)]
    )

    integration = await async_get_integration(hass, DOMAIN)
    module_url = f"{_PANEL_URL}?v={integration.version}"

    try:
        frontend.async_register_built_in_panel(
            hass,
            component_name="custom",
            sidebar_title="Reminders",
            sidebar_icon="mdi:bell-check",
            frontend_url_path=_PANEL_URL_PATH,
            require_admin=False,
            config={
                "_panel_custom": {
                    "name": "ha-reminders-panel",
                    "module_url": module_url,
                    "embed_iframe": False,
                    "trust_external": False,
                }
            },
        )
    except ValueError:
        pass  # Panel already registered (e.g. integration reload).

    return True
```

This deletes `_async_register_lovelace_resource`, `_async_setup_dashboard`, the `_CARD_URL`/`_CARD_PATH`/`_DASHBOARD_URL_PATH` constants, the `EVENT_HOMEASSISTANT_STARTED`/`Event`/`Store`/`async_register_built_in_panel` imports, and the started-event listener. Leave everything from `class HaRemindersClient` onward (lines 96–127) unchanged — `date` is still imported for it.

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `python -m pytest tests/components/ha_reminders/test_init.py::test_panel_registered_after_setup tests/components/ha_reminders/test_init.py::test_panel_module_url_is_versioned -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Run the full integration test suite**

Run: `python -m pytest tests/components/ha_reminders/ -v`
Expected: PASS — all tests (existing sensor/config-flow/init tests plus the two new ones). No test references the removed dashboard/resource/card code.

- [ ] **Step 6: Commit**

```bash
git add custom_components/ha_reminders/__init__.py tests/components/ha_reminders/test_init.py
git commit -m "feat: register reminders sidebar panel, drop dashboard auto-creation"
```

---

## Notes for the implementer

- Run the manual verification (Task 1, Step 4) only after Task 2 is committed, since it needs the panel registration to exist.
- If `python -m pytest` is not the project's runner, use whatever the repo uses (check for a `Makefile`/`tox.ini`/CI config); the test paths and expected results are unchanged.
- Do not bump `manifest.json` `version` as part of this change — that happens at release time (it also drives the panel cache-buster).
