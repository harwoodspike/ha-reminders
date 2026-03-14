# HA Reminders

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![GitHub Release](https://img.shields.io/github/release/harwoodspike/ha-reminders.svg)](https://github.com/harwoodspike/ha-reminders/releases)
[![License](https://img.shields.io/github/license/harwoodspike/ha-reminders.svg)](LICENSE)

A Home Assistant integration for tracking maintenance reminders. Each reminder is a sensor that tells you how many days until (or since) a task is due, based on the last time it was completed and a configurable interval.

---

## Features

- **One sensor per reminder** — clean, automatable entities
- **Human-readable state** — e.g. `Due in 3 days`, `Due today`, `Overdue by 2 days`
- **Rich attributes** — `last_changed`, `due_date`, `days_since`, `days_until`, `is_overdue`
- **`ha_reminders.mark_done` service** — reset the reminder to today with one action
- **Reconfigure support** — edit name, last changed date, or interval at any time
- **No cloud, no polling** — purely calculated, works fully offline

---

## Installation

### HACS (Recommended)

1. Open HACS in your Home Assistant instance
2. Go to **Integrations**
3. Click the three-dot menu → **Custom repositories**
4. Add `https://github.com/harwoodspike/ha-reminders` with category **Integration**
5. Find **HA Reminders** in the list and click **Download**
6. Restart Home Assistant

### Manual

1. Copy the `custom_components/ha_reminders` folder into your HA `config/custom_components/` directory
2. Restart Home Assistant

---

## Configuration

Each reminder is added through the UI as a separate config entry.

1. Go to **Settings → Devices & Services → Add Integration**
2. Search for **HA Reminders**
3. Fill in the fields:

| Field | Description |
|---|---|
| **Name** | A descriptive label, e.g. `Change HVAC Filter` |
| **Last Changed** | The date the task was last completed (ISO format: `YYYY-MM-DD`) |
| **Interval (days)** | How many days between each occurrence |

4. Click **Submit** — a new sensor entity will appear immediately

Repeat for each reminder you want to track.

---

## Sensor State

The sensor state is a human-readable string:

| State | Meaning |
|---|---|
| `Due in N days` | Task is upcoming |
| `Due in 1 day` | Task is due tomorrow |
| `Due today` | Task is due today |
| `Overdue by 1 day` | Task is 1 day past due |
| `Overdue by N days` | Task is N days past due |

### Attributes

| Attribute | Description |
|---|---|
| `last_changed` | Date the task was last completed (`YYYY-MM-DD`) |
| `due_date` | Calculated next due date (`YYYY-MM-DD`) |
| `days_since` | Days since last completion |
| `days_until` | Days until due (negative if overdue) |
| `interval` | Configured interval in days |
| `is_overdue` | `true` if past due date |

---

## Service: `ha_reminders.mark_done`

Resets a reminder's `last_changed` date to today, restarting the interval countdown.

### Service Data

| Parameter | Required | Description |
|---|---|---|
| `entry_id` | Yes | The config entry ID of the reminder to reset |

### Example

```yaml
service: ha_reminders.mark_done
data:
  entry_id: "abc123def456"
```

You can find the `entry_id` in **Settings → Devices & Services → HA Reminders** → click the reminder → the URL contains the entry ID.

---

## Automation Examples

### Notify when overdue

```yaml
automation:
  - alias: "Notify when HVAC filter is overdue"
    trigger:
      - platform: template
        value_template: "{{ state_attr('sensor.change_hvac_filter', 'is_overdue') }}"
    action:
      - service: notify.mobile_app
        data:
          message: "HVAC filter is overdue — change it today!"
```

### Mark done via button helper

```yaml
automation:
  - alias: "Mark HVAC filter done"
    trigger:
      - platform: state
        entity_id: input_button.hvac_filter_done
    action:
      - service: ha_reminders.mark_done
        data:
          entry_id: "abc123def456"
```

---

## Reconfiguring a Reminder

To change the name, last changed date, or interval of an existing reminder:

1. Go to **Settings → Devices & Services**
2. Find your reminder under **HA Reminders**
3. Click **Configure**
4. Update the fields and click **Submit**

---

## Contributing

Pull requests are welcome! Please open an issue first to discuss any major changes.

---

## License

MIT License — see [LICENSE](LICENSE) for details.
