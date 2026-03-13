"""Tests for the HA Reminders integration (__init__.py)."""

from datetime import date
from unittest.mock import patch

import pytest

from homeassistant.core import HomeAssistant
from tests.common import MockConfigEntry  # noqa: TID251

DOMAIN = "ha_reminders"

FROZEN_TODAY = date(2026, 3, 9)
FROZEN_TODAY_STR = "2026-03-09"


def _make_entry(**kwargs) -> MockConfigEntry:
    data = {
        "name": kwargs.pop("name", "Oil Change"),
        "last_changed": kwargs.pop("last_changed", "2026-02-09"),
        "interval": kwargs.pop("interval", 30),
        **kwargs,
    }
    return MockConfigEntry(domain=DOMAIN, data=data)


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


async def test_service_registered_after_setup(hass: HomeAssistant) -> None:
    """mark_done entity service is registered after setup."""
    entry = _make_entry()
    await _setup(hass, entry)

    assert hass.services.has_service(DOMAIN, "mark_done")


async def test_mark_done_updates_last_changed(hass: HomeAssistant) -> None:
    """mark_done entity service sets last_changed to today."""
    entry = _make_entry()
    await _setup(hass, entry)

    assert entry.data["last_changed"] != FROZEN_TODAY_STR

    with patch("custom_components.ha_reminders.date") as mock_date:
        mock_date.today.return_value = FROZEN_TODAY

        await hass.services.async_call(
            DOMAIN,
            "mark_done",
            {},
            target={"entity_id": "sensor.oil_change"},
            blocking=True,
        )

    assert entry.data["last_changed"] == FROZEN_TODAY_STR


async def test_remove_entry_cleans_up_sensor(hass: HomeAssistant) -> None:
    """Removing a config entry removes the sensor entity and all reminder data."""
    entry = _make_entry()
    await _setup(hass, entry)

    assert hass.states.get("sensor.oil_change") is not None

    await hass.config_entries.async_remove(entry.entry_id)
    await hass.async_block_till_done()

    assert hass.states.get("sensor.oil_change") is None
    assert hass.config_entries.async_get_entry(entry.entry_id) is None
