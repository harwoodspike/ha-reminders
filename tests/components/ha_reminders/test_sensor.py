"""Tests for the HA Reminders sensor platform."""

from datetime import date
from unittest.mock import patch

import pytest

from homeassistant.core import HomeAssistant
from tests.common import MockConfigEntry  # noqa: TID251

DOMAIN = "ha_reminders"

FROZEN_TODAY = date(2026, 3, 9)
FROZEN_TODAY_STR = "2026-03-09"


def _entry_for(last_changed: str, interval: int) -> MockConfigEntry:
    return MockConfigEntry(
        domain=DOMAIN,
        data={
            "name": "Test Reminder",
            "last_changed": last_changed,
            "interval": interval,
        },
    )


async def _setup(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


@pytest.fixture(autouse=True)
def freeze_today():
    """Freeze date.today() to a known value."""
    with patch("custom_components.ha_reminders.sensor.date") as mock_date:
        mock_date.today.return_value = FROZEN_TODAY
        mock_date.fromisoformat.side_effect = date.fromisoformat
        yield mock_date


async def test_state_due_in_multiple_days(hass: HomeAssistant) -> None:
    """State is 'Due in N days' when days_until > 1."""
    # 2026-02-09 + 30 days = 2026-03-11 → 2 days from 2026-03-09
    entry = _entry_for("2026-02-09", 30)
    await _setup(hass, entry)

    state = hass.states.get("sensor.test_reminder")
    assert state is not None
    assert state.state == "Due in 2 days"


async def test_state_due_in_one_day(hass: HomeAssistant) -> None:
    """State is 'Due in 1 day' when days_until == 1."""
    # 2026-02-08 + 30 days = 2026-03-10 → 1 day from 2026-03-09
    entry = _entry_for("2026-02-08", 30)
    await _setup(hass, entry)

    state = hass.states.get("sensor.test_reminder")
    assert state is not None
    assert state.state == "Due in 1 day"


async def test_state_due_today(hass: HomeAssistant) -> None:
    """State is 'Due today' when days_until == 0."""
    # 2026-02-07 + 30 days = 2026-03-09 → 0 days from 2026-03-09
    entry = _entry_for("2026-02-07", 30)
    await _setup(hass, entry)

    state = hass.states.get("sensor.test_reminder")
    assert state is not None
    assert state.state == "Due today"


async def test_state_overdue_by_one_day(hass: HomeAssistant) -> None:
    """State is 'Overdue by 1 day' when days_until == -1."""
    # 2026-02-06 + 30 days = 2026-03-08 → -1 from 2026-03-09
    entry = _entry_for("2026-02-06", 30)
    await _setup(hass, entry)

    state = hass.states.get("sensor.test_reminder")
    assert state is not None
    assert state.state == "Overdue by 1 day"


async def test_state_overdue_by_multiple_days(hass: HomeAssistant) -> None:
    """State is 'Overdue by N days' when days_until < -1."""
    # 2026-02-04 + 30 days = 2026-03-06 → -3 from 2026-03-09
    entry = _entry_for("2026-02-04", 30)
    await _setup(hass, entry)

    state = hass.states.get("sensor.test_reminder")
    assert state is not None
    assert state.state == "Overdue by 3 days"


async def test_extra_state_attributes(hass: HomeAssistant) -> None:
    """Attributes contain expected keys and values."""
    # 2026-02-07 + 30 days = 2026-03-09 (due today)
    entry = _entry_for("2026-02-07", 30)
    await _setup(hass, entry)

    state = hass.states.get("sensor.test_reminder")
    assert state is not None
    attrs = state.attributes

    assert attrs["last_changed"] == "2026-02-07"
    assert attrs["days_since"] == 30
    assert attrs["days_until"] == 0
    assert attrs["interval"] == 30
    assert attrs["due_date"] == "2026-03-09"
    assert attrs["is_overdue"] is False
    assert attrs["friendly_name"] == "Test Reminder"


async def test_extra_state_attributes_overdue(hass: HomeAssistant) -> None:
    """is_overdue is True when past due date."""
    # 2026-02-06 + 30 days = 2026-03-08 → overdue
    entry = _entry_for("2026-02-06", 30)
    await _setup(hass, entry)

    state = hass.states.get("sensor.test_reminder")
    assert state is not None
    assert state.attributes["is_overdue"] is True
    assert state.attributes["days_until"] == -1


async def test_update_listener_refreshes_state(hass: HomeAssistant) -> None:
    """State updates when config entry data changes."""
    # Start "Due in 2 days"
    entry = _entry_for("2026-02-09", 30)
    await _setup(hass, entry)

    state = hass.states.get("sensor.test_reminder")
    assert state.state == "Due in 2 days"

    # Simulate mark_done: update last_changed to today → "Due in 30 days"
    hass.config_entries.async_update_entry(
        entry,
        data={**entry.data, "last_changed": FROZEN_TODAY_STR},
    )
    await hass.async_block_till_done()

    state = hass.states.get("sensor.test_reminder")
    assert state.state == "Due in 30 days"
