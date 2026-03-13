"""Sensor platform for HA Reminders."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, timedelta
from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_platform
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import HaRemindersConfigEntry

PARALLEL_UPDATES = 0


async def async_setup_entry(
    hass: HomeAssistant,
    entry: HaRemindersConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up HA Reminders sensor from a config entry."""
    entity = ReminderSensor(entry)
    async_add_entities([entity])

    async def _update_listener(hass: HomeAssistant, entry: HaRemindersConfigEntry) -> None:
        entity.async_write_ha_state()

    entry.async_on_unload(entry.add_update_listener(_update_listener))

    platform = entity_platform.async_get_current_platform()
    platform.async_register_entity_service("mark_done", {}, "mark_done")


class ReminderSensor(SensorEntity):
    """Representation of a Reminder sensor."""

    _attr_has_entity_name = True
    _attr_translation_key = "reminder"

    def __init__(self, entry: HaRemindersConfigEntry) -> None:
        """Initialize the sensor."""
        self._entry = entry
        self._attr_unique_id = entry.entry_id
        self._attr_name = entry.data["name"]

    @property
    def state(self) -> str:
        """Return the state of the sensor."""
        days = self.days_until
        if days > 1:
            return f"Due in {days} days"
        if days == 1:
            return "Due in 1 day"
        if days == 0:
            return "Due today"
        if days == -1:
            return "Overdue by 1 day"
        return f"Overdue by {abs(days)} days"

    @property
    def days_until(self) -> int:
        """Calculate days until due."""
        last_changed = date.fromisoformat(self._entry.data["last_changed"])
        interval = self._entry.data["interval"]
        due_date = last_changed + timedelta(days=interval)
        return (due_date - date.today()).days

    async def mark_done(self) -> None:
        """Mark this reminder as done and refresh state."""
        self._entry.runtime_data.mark_done()
        self.async_write_ha_state()

    @property
    def extra_state_attributes(self) -> Mapping[str, Any]:
        """Return additional attributes."""
        last_changed = date.fromisoformat(self._entry.data["last_changed"])
        interval = self._entry.data["interval"]
        due_date = last_changed + timedelta(days=interval)
        days_until = self.days_until
        days_since = (date.today() - last_changed).days

        return {
            "last_changed": last_changed.isoformat(),
            "days_since": days_since,
            "days_until": days_until,
            "interval": interval,
            "due_date": due_date.isoformat(),
            "is_overdue": days_until < 0,
            "friendly_name": self._entry.data["name"],
        }
