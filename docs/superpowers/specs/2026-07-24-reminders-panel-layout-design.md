# HA Reminders — ESPHome-style Panel Layout Design

**Date:** 2026-07-24
**Status:** Approved

## Problem

The current Reminders sidebar panel ([2026-07-24-reminders-sidebar-panel-design.md](2026-07-24-reminders-sidebar-panel-design.md)) is a single flat list in a centered ~600px column. The user wants a richer, full-width, ESPHome-Builder-style layout: a toolbar (search / layout switch / filters / columns) driving two views — a **card grid** and a **table** — with a status badge per item.

## Goal

Replace the flat-list rendering in `ha-reminders-panel.js` with a full-width, toolbar-driven UI offering a card-grid view and a table view. **Frontend only** — the panel registration, static path, sensor, and services are unchanged. Scope stays view + Mark-Done (no add/edit/delete).

## Decisions

- **Replace, don't dual-maintain.** The new layout replaces the current flat list. Same panel, same `ha-reminders-panel.js` file, same backend registration.
- **Vanilla JS + HA theme variables.** No build step, no npm, no reliance on HA-internal web components (robust across HA versions). Continue the existing Shadow-DOM `innerHTML` approach, reorganized.
- **View + Mark Done only.** Add/edit/delete stay in Settings → Devices & Services.
- **Default view: card grid.**
- **Binary status badge:** `Overdue` (red) when `is_overdue`, else `Not Due` (green). "Due today" (`days_until == 0`) reads as Not Due.

## Architecture

Single file `custom_components/ha_reminders/ha-reminders-panel.js`, reorganized into:

- **State object** on the element instance: `{ layout: 'grid'|'table', search: string, filter: {...}, columns: {...}, sort: {key, dir} }`.
- **Pure helpers** (no DOM): `_getReminderEntities()` (unchanged discovery), `_applySearchAndFilters(list)`, `_applySort(list)`, `escapeHtml(str)`, status/date text helpers (reused from current file).
- **Render methods:** `_render()` (top-level: builds toolbar + active view), `_renderToolbar()`, `_renderGrid(list)`, `_renderCard(entity)`, `_renderTable(list)`, plus popover renderers for Filters and Columns.
- **Event wiring** re-attached after each `innerHTML` write (search input, layout buttons, filter controls, column toggles, sort headers, Mark Done buttons, hamburger).

`set hass` / `set narrow` continue to trigger `_render()`. `set route` / `set panel` remain no-ops.

### Data available per reminder (from the sensor, unchanged)

`friendly_name`, `days_until` (signed int), `is_overdue` (bool), `due_date` (ISO), `last_changed` (ISO), `interval` (int), `days_since` (int), plus the sensor state string. Discovery: any `hass.states` entry carrying all of `days_until`, `is_overdue`, `due_date`, `interval`.

## Components

### Toolbar (always visible, full-width, sticky top under the app bar)

Layout: `[ search… ]  [▦ grid | ≣ table]  [ Filters ▾ ]  [ Columns ▾ ]`

- **Search** — live `<input>`; case-insensitive substring match on `friendly_name`. Not persisted.
- **Layout switch** — two-button segmented toggle; sets `state.layout`; persisted.
- **Filters ▾** — a popover, combined with AND:
  - **Status** picker: `All` | `Overdue` | `Due today` | `Upcoming`. `Overdue` = `is_overdue`; `Due today` = `days_until == 0`; `Upcoming` = `days_until > 0`.
  - **Overdue only** toggle: when on, restricts to `is_overdue` (equivalent shortcut to Status=Overdue; if both set they intersect, still just overdue).
  - **Due within N days** number field: when set to N (>0), keep reminders with `days_until <= N` (includes overdue, since they are `<= N`). Empty = no restriction.
  - Filters are **not persisted** (reset each load).
- **Columns ▾** — present **only when `state.layout == 'table'`**; a popover of checkboxes toggling visibility of Status, Due date, Last done, Due in. Name is always shown (not listed). Column visibility **is persisted**.

Empty state within a view:
- No reminders discovered at all → "No reminders configured — add one from Settings → Devices & Services."
- Reminders exist but none match search/filters → "No reminders match your search or filters."

### Card grid view (default)

Full-width responsive grid: `display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap`. Cards sorted by urgency (`days_until` ascending — most overdue first).

Each card (`_renderCard`) preserves the current card's content and adds a badge + footer:
- **Header row:** reminder **name** (left) + **status badge** (top-right): `Overdue` (red) or `Not Due` (green).
- **Status text line:** the existing human string — `Overdue by N days` / `Due today` / `Due in N days` (reuse `_statusText`).
- **Last done line:** `Last done  <formatted date>` (reuse `_lastChangedText`), when `last_changed` present.
- **Divider** (`<hr>`).
- **Footer:** right-aligned `[ Mark Done ]` button (moved below the divider).

All interpolated text (name especially) passes through `escapeHtml`.

### Table view

A full-width `<table>`. Columns: **Name** (always) · **Status** (badge) · **Due date** · **Last done** · **Due in** — each of the last four hideable via Columns. An always-present trailing **actions** cell with `[ Mark Done ]`.

- **Status** cell: same binary badge as the card.
- **Due date** cell: formatted `due_date` (e.g. `Aug 15, 2026`).
- **Last done** cell: formatted `last_changed`.
- **Due in** cell: signed day count from `days_until` (e.g. `5` / `-2`), right-aligned; this is the numeric urgency value.
- **Sorting:** clicking a column header sorts by that key and toggles asc/desc; header shows a ▲/▼ indicator. Sort keys: Name (alpha on `friendly_name`), Due date (`due_date`), Last done (`last_changed`), Due in (`days_until`), Status (by `is_overdue` then `days_until`). **Default sort: Due in ascending** (most overdue first). Sort state is not persisted (resets to default each load).
- Cell values pass through `escapeHtml`.

### Status badge (shared)

A small rounded chip with a **soft-tinted** background (the HA state-badge look), two states driven by `is_overdue`:
- Overdue → color `--error-color` (fallback `#db4437`).
- Not Due → color `--success-color` (fallback `#43a047`).

The chip uses the saturated color as its **text** color and a ~12%-opacity version of that color as its **background** (pale tint), not a solid fill. Achieve the tint theme-awarely with `background: color-mix(in srgb, <color> 12%, transparent)` and `color: <color>`, where `<color>` is the theme variable above. `color-mix` is supported by the evergreen browsers HA targets; the variable fallbacks cover the default palette. Styling: `border-radius` pill (e.g. `999px`), small horizontal padding, `font-size` ~0.75em, `font-weight` 500.

Rendered via one `_statusBadge(attrs)` helper used in both the card header and the table Status cell (DRY).

## State Persistence

`localStorage` key `ha-reminders-panel`, a JSON object `{ layout, columns }`:
- `layout`: `'grid'` | `'table'`.
- `columns`: `{ status: bool, due_date: bool, last_done: bool, due_in: bool }` (all default `true`).

Read once on first `_render` (lazy-init into `state`), written whenever layout or a column toggle changes. Search, filters, and sort are transient (default each load). Guard `localStorage` access in try/catch (private-mode / disabled storage must not break the panel).

## Error / Edge Handling

- Corrupt or missing `localStorage` value → fall back to defaults: `layout = grid`, and all **table** columns visible. (Column visibility affects only the table view; the card grid always shows the same fixed card content.)
- `due_date` / `last_changed` missing on an entity → render an em dash `—` in that cell/line rather than a broken date.
- `escapeHtml` applied to every user-derived string interpolated into `innerHTML` (fixes the previously-noted self-XSS via reminder names).
- Empty search + `All` status + empty N + overdue-toggle off ⇒ no filtering (all reminders shown).

## Testing

This is a frontend-only change and the repo has **no JavaScript test harness** (tests run only inside a HA-core checkout and cover Python). Therefore:
- No automated JS tests are added.
- The existing Python tests (panel registration, sensor, config flow) must remain **unchanged and green** — this change touches only `ha-reminders-panel.js`, so they should be unaffected. Verified by the maintainer running `pytest tests/components/ha_reminders/` in their HA-core env.
- Manual verification checklist (in a running HA):
  1. Panel loads; toolbar visible; default view is the card grid.
  2. Cards show name + binary badge (correct color), status text, last-done, and a Mark Done button below a divider; Mark Done resets the reminder.
  3. Search filters by name live; clearing restores all.
  4. Filters popover: Status buckets, Overdue-only, and Due-within-N each narrow the list correctly and combine.
  5. Layout switch flips to the table; Columns control appears only there; toggling columns hides/shows them; clicking headers sorts and toggles direction.
  6. Reload HA/browser: layout + column visibility are remembered; search/filters/sort reset.
  7. A reminder named with HTML (e.g. `<b>x</b>`) renders as literal text, not markup.
  8. Empty states: no reminders vs. no matches show the right message.

## Out of Scope

- Add / edit / delete reminders from the panel.
- Persisting search, filters, or sort across reloads.
- More than two status states (kept binary Overdue / Not Due).
- Any backend, sensor, service, or panel-registration change.
- Server-side pagination (client-side render of all reminders is fine at expected counts).

## Release Note

Bump `manifest.json` `version` on release — it is the panel JS cache-buster (see [bump-manifest-version-each-release] project note) and required for HACS recognition.
