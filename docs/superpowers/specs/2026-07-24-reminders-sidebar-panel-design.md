# HA Reminders — Sidebar Panel Design

**Date:** 2026-07-24
**Status:** Approved

## Problem

After installing the integration and creating reminders (one sensor per config
entry), there is nowhere in the UI to see them. The current approach tries to
auto-create a storage-mode Lovelace dashboard and register it as a sidebar
panel, plus auto-register a custom Lovelace card as a Lovelace resource. This is
fragile and does not reliably work — the dashboard/panel often fails to appear.

## Goal

Give the integration a dedicated, reliable **sidebar panel** — the same
mechanism HACS and ESPHome Builder use (`panel_custom`) — that lists all
reminders and lets the user mark each one done. Adding/editing/deleting
reminders stays where it is today: Settings → Devices & Services.

## Decisions

- **Panel only.** Drop the embeddable Lovelace card (`custom:ha-reminders-card`)
  and its resource registration entirely. Reminders live only on the dedicated
  sidebar page.
- **Panel scope: View + Mark Done.** The panel lists all reminders sorted by
  urgency, each with a "Mark Done" button. No add/edit/delete in the panel.
- **`panel_custom`, not a Lovelace dashboard.** A panel is registered once at
  integration load, independent of Lovelace's storage/timing — this is why it is
  reliable where the dashboard approach was not.

## Architecture

### Backend — `custom_components/ha_reminders/__init__.py`

**Remove entirely:**
- `_async_register_lovelace_resource()` — Lovelace resource registry logic.
- `_async_setup_dashboard()` — storage-mode dashboard + built-in lovelace panel.
- The `EVENT_HOMEASSISTANT_STARTED` listener wiring that drove the two above.
- Now-unused imports: `async_register_built_in_panel` (replaced by the
  `frontend` module import used below), `Store`, `EVENT_HOMEASSISTANT_STARTED`,
  `date`/`Event` only if they become unused (note: `date` is still used by
  `HaRemindersClient.mark_done`, so keep it).

**Keep:**
- Static path registration for the panel JS module (already present, repurposed
  from the card URL to the panel URL).

**Add** — in `async_setup`, register the custom panel directly (no started-event
wait; `frontend` is a declared dependency and is already available):

```python
from homeassistant.components import frontend
from homeassistant.loader import async_get_integration

integration = await async_get_integration(hass, DOMAIN)
module_url = f"{_PANEL_URL}?v={integration.version}"

frontend.async_register_built_in_panel(
    hass,
    component_name="custom",
    sidebar_title="Reminders",
    sidebar_icon="mdi:bell-check",
    frontend_url_path="reminders",
    require_admin=False,
    config={"_panel_custom": {
        "name": "ha-reminders-panel",
        "module_url": module_url,
        "embed_iframe": False,
        "trust_external": False,
    }},
)
```

Constants: replace `_CARD_URL` / `_CARD_PATH` with `_PANEL_URL`
(`/ha_reminders/ha-reminders-panel.js`) and `_PANEL_PATH`
(`ha-reminders-panel.js`). Drop `_DASHBOARD_URL_PATH`.

**Cache-busting.** The `module_url` carries a `?v=<version>` query token so the
browser fetches a fresh copy whenever the version changes, avoiding stale-cache
force-refreshes. The token is the integration's manifest version, read via
`async_get_integration(hass, DOMAIN).version` (no file I/O in the event loop).
This ties cache-busting to the version bump the maintainer already performs on
every release (HACS requires it). The static path keeps `cache_headers=False`
as a second layer so the browser re-validates rather than serving stale JS.
Reminder: **bump `manifest.json` `version` whenever the panel JS changes**, or a
browser that already loaded the panel will keep the old module within a version.

The panel is registered once for the component (not per config entry). It
persists for the lifetime of the loaded integration. No per-entry
register/unregister is needed.

`async_setup_entry` / `async_unload_entry` and `HaRemindersClient` are
unchanged.

### Frontend — new `custom_components/ha_reminders/ha-reminders-panel.js`

Delete `ha-reminders-card.js`. Create `ha-reminders-panel.js` defining the
custom element `<ha-reminders-panel>`.

HA sets these properties on the panel element: `hass`, `narrow`, `route`,
`panel`. The element re-renders when `hass` is set.

Reuse the card's existing logic almost verbatim:
- `_getReminderEntities()` — filter states that have the reminder attributes
  (`days_until`, `is_overdue`, `due_date`, `interval`), sort by `days_until`.
- `_statusText(attrs)` — "Overdue by N days" / "Due today" / "Due in N days".
- `_lastChangedText(attrs)` — "Last done: <formatted date>".
- `_markDone(entityId)` — `hass.callService('ha_reminders', 'mark_done', {},
  { entity_id })`.
- Per-row rendering (name, status, last-done, Mark Done button).

Wrap in a **full-page layout** instead of an `ha-card`:
- A top app bar with the title "Reminders" and a hamburger menu button that
  fires the `hass-toggle-menu` event to open the sidebar on narrow/mobile
  screens (matching Terminal/ESPHome panel behaviour).
- The reminder list below the bar, in a padded, max-width container.

**Empty state:** when no reminders exist, show
"No reminders yet — add one from Settings → Devices & Services" so a fresh
install is not a blank page.

Styling uses HA theme CSS variables (`--primary-text-color`,
`--secondary-text-color`, `--error-color`, `--divider-color`,
`--primary-color`, `--app-header-background-color`, etc.) so it matches the
active theme, as the card already does.

### `manifest.json`

Keep `frontend` and `http` dependencies — both still needed (panel registration
+ static path). The `version` field now doubles as the panel JS cache-buster
(see Cache-busting above), so it must be bumped on any release that changes the
panel JS — which aligns with the bump HACS already requires per release.

## Data Flow

1. Integration loads → `async_setup` reads the manifest version, registers the
   static JS path and the custom panel (with `?v=<version>` on the module URL) →
   "Reminders" appears in the sidebar.
2. User opens the panel → HA loads `ha-reminders-panel.js`, mounts
   `<ha-reminders-panel>`, and sets `hass`.
3. Panel filters `hass.states` for reminder sensors, renders the sorted list.
4. User clicks "Mark Done" → `hass.callService('ha_reminders', 'mark_done', …)`
   → sensor's `last_changed` resets to today → state update flows back into
   `hass` → panel re-renders with updated urgency/order.

## Error Handling

- **No reminders:** empty-state message (above), not an error.
- **Panel registration already exists** (e.g. reload): `async_register_built_in_panel`
  raises `ValueError` if the `frontend_url_path` is already registered. Guard the
  call so a reload does not crash setup (try/except `ValueError`, pass).
- **Static path already registered:** the existing `async_register_static_paths`
  call is idempotent enough for setup; no extra handling beyond what exists.

## Testing

- `tests/components/ha_reminders/test_init.py`: update/replace the tests that
  asserted dashboard/resource behaviour. Assert that after setup the custom
  panel is registered (present in `hass.data[frontend.DATA_PANELS]` under
  `reminders`) with the expected title/icon and a `_panel_custom` module URL
  that starts with the panel path and carries a `?v=` version token.
- Assert the static path for the panel JS is registered.
- Sensor and config-flow tests are unaffected.

## Out of Scope

- Add/edit/delete reminders from the panel.
- Re-introducing an embeddable Lovelace card.
- Any change to sensor calculation, the `mark_done` service, or the config flow.
