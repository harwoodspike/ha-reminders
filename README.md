# HA Reminders

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![GitHub Release](https://img.shields.io/github/release/harwoodspike/ha-reminders.svg)](https://github.com/harwoodspike/ha-reminders/releases)
[![License](https://img.shields.io/github/license/harwoodspike/ha-reminders.svg)](LICENSE)

A Home Assistant integration for tracking recurring maintenance reminders — change the HVAC filter, water the plants, replace the smoke-alarm batteries. Each reminder is a sensor that tells you how many days until (or since) a task is due, and a built-in sidebar panel lets you see them all and mark them done in one place.

---

## Features

- **Dedicated sidebar panel** — view every reminder as a card grid or a table, search and filter, and mark tasks done with one click
- **Human-readable state** — e.g. `Due in 3 days`, `Due today`, `Overdue by 2 days`
- **Notification-ready** — each reminder exposes `is_overdue`, `days_until`, and more, so you can alert however you like
- **Edit any time** — change a reminder's name, last-done date, or interval whenever you need
- **No cloud** — purely calculated from dates on your own machine; works fully offline

---

## Installation

### HACS (recommended)

1. Open **HACS** in Home Assistant
2. Go to **Integrations**
3. Three-dot menu → **Custom repositories**
4. Add `https://github.com/harwoodspike/ha-reminders` with category **Integration**
5. Find **HA Reminders** in the list and click **Download**
6. Restart Home Assistant

### Manual

1. Copy the `custom_components/ha_reminders` folder into your Home Assistant `config/custom_components/` directory
2. Restart Home Assistant

---

## Configuration

Each reminder is its own entry. Adding the **first** one also sets up the integration; every reminder after that is added from the integration's page.

### Adding your first reminder

1. Go to **Settings → Devices & Services → Add Integration**
2. Search for **HA Reminders**
3. Fill in the fields:

   | Field | Description |
   |---|---|
   | **Name** | A descriptive label, e.g. `Change HVAC Filter` |
   | **Last Changed** | The date the task was last completed (`YYYY-MM-DD`) |
   | **Interval (days)** | How many days between each occurrence |

4. Click **Submit** — a new reminder sensor appears immediately

### Adding more reminders

Once the integration is installed, add each additional reminder from its page:

1. Go to **Settings → Devices & Services**
2. Open the **HA Reminders** integration
3. Click **+ Add Entry**
4. Fill in the same fields and click **Submit**

### Editing a reminder

To change a reminder's name, last-changed date, or interval:

1. Go to **Settings → Devices & Services**
2. Find your reminder under **HA Reminders**
3. Click **Configure**
4. Update the fields and click **Submit**

---

## Setting up notifications

HA Reminders does **not** send notifications on its own — it exposes each reminder's status so you can be alerted however you prefer. The natural alert today is an **overdue** notification, and there are two ways to set one up.

Both recipes use the automation editor. In Home Assistant, go to **Settings → Automations & Scenes → Create Automation → Create new automation**, then open the **⋮** menu (top-right) and choose **Edit in YAML**. Paste the snippet over whatever's there.

Before you start, find your notification target: go to **Developer Tools → Actions**, search `notify`, and note your device's action (e.g. `notify.mobile_app_pixel_8`). Replace `notify.mobile_app_your_phone` in the snippets below with it.

### Option A — Daily overdue digest (recommended)

One automation that checks every morning and sends a single notification listing everything that's overdue. It covers **all** your reminders and won't ping you at midnight.

1. Paste this into the YAML editor:

   ```yaml
   alias: Daily overdue reminders
   triggers:
     - trigger: time
       at: "08:00:00"
   conditions:
     - condition: template
       value_template: >
         {{ states.sensor
            | selectattr('attributes.is_overdue', 'defined')
            | selectattr('attributes.is_overdue', 'equalto', true)
            | list | count > 0 }}
   actions:
     - action: notify.mobile_app_your_phone
       data:
         title: Reminders overdue
         message: >
           {% set items = states.sensor
              | selectattr('attributes.is_overdue', 'defined')
              | selectattr('attributes.is_overdue', 'equalto', true)
              | map(attribute='name') | list %}
           {{ items | count }} reminder{{ 's' if items | count != 1 else '' }} overdue:
           {{ items | join(', ') }}
   mode: single
   ```

2. Replace `notify.mobile_app_your_phone` with your notification action.
3. Adjust `08:00:00` to whatever time you'd like the digest.
4. Click **Save** and name the automation.

### Option B — Instant alert for one reminder

Fires the moment a specific reminder goes overdue. Simple, but you add one per reminder, and the alert lands whenever the reminder crosses its due date (which may be at midnight).

1. Paste this into the YAML editor:

   ```yaml
   alias: HVAC filter overdue
   triggers:
     - trigger: state
       entity_id: sensor.change_hvac_filter
       attribute: is_overdue
       to: true
   actions:
     - action: notify.mobile_app_your_phone
       data:
         title: Reminder overdue
         message: The HVAC filter is overdue — time to change it.
   mode: single
   ```

2. Replace `sensor.change_hvac_filter` with your reminder's entity (find it under **Settings → Devices & Services → HA Reminders**, or **Developer Tools → States**).
3. Replace `notify.mobile_app_your_phone` with your notification action, and tweak the message.
4. Click **Save**. Repeat for each reminder you want an instant alert for.

---

## The Reminders panel

After installation, a **Reminders** entry appears in the Home Assistant sidebar. It's the easiest way to work with your reminders — no dashboard setup required.

- **Two views** — switch between a **card grid** and a **table** from the toolbar. Your choice (and, in the table, which columns are shown) is remembered.
- **At a glance** — every reminder shows a status badge (**Overdue** or **Not Due**), how long until/since it's due, and when it was last done.
- **Search & filter** — find a reminder by name, or filter by status, overdue-only, or "due within N days."
- **Mark Done** — one click resets a reminder to today and restarts its countdown.

Adding, editing, and removing reminders still happens in **Settings → Devices & Services** (see [Configuration](#configuration)).

---

## Reference

### Sensor state

Each reminder's sensor state is a human-readable string:

| State | Meaning |
|---|---|
| `Due in N days` | Task is upcoming |
| `Due in 1 day` | Task is due tomorrow |
| `Due today` | Task is due today |
| `Overdue by 1 day` | Task is 1 day past due |
| `Overdue by N days` | Task is N days past due |

#### Attributes

| Attribute | Description |
|---|---|
| `last_changed` | Date the task was last completed (`YYYY-MM-DD`) |
| `due_date` | Calculated next due date (`YYYY-MM-DD`) |
| `days_since` | Days since last completion |
| `days_until` | Days until due (negative if overdue) |
| `interval` | Configured interval in days |
| `is_overdue` | `true` if past the due date |

### `ha_reminders.mark_done` service

Resets a reminder's `last_changed` date to today, restarting the interval countdown.

| Parameter | Required | Description |
|---|---|---|
| `entity_id` | Yes | The reminder sensor to reset |

```yaml
action: ha_reminders.mark_done
target:
  entity_id: sensor.change_hvac_filter
```

The panel's **Mark Done** button calls this service for you.

---

## Contributing

Pull requests are welcome! Please open an issue first to discuss any major changes.

---

## Appendix: Mark a reminder done from a physical button

If you'd rather not open the panel — say you keep a Zigbee button by the HVAC unit, or a button on a dashboard — you can wire it to the `mark_done` service so pressing it resets the reminder.

This example marks the HVAC filter reminder done whenever an [input button helper](https://www.home-assistant.io/integrations/input_button/) is pressed. Swap the helper for any button entity (a physical Zigbee/Z-Wave button, a dashboard button card, etc.).

```yaml
alias: Mark HVAC filter done
triggers:
  - trigger: state
    entity_id: input_button.hvac_filter_done
actions:
  - action: ha_reminders.mark_done
    target:
      entity_id: sensor.change_hvac_filter
mode: single
```
