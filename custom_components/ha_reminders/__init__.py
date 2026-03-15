"""The HA Reminders integration."""

from __future__ import annotations

from datetime import date
import logging
from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED, Platform
from homeassistant.core import Event, HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)
_PLATFORMS: list[Platform] = [Platform.SENSOR]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

_CARD_URL = "/ha_reminders/ha-reminders-card.js"
_CARD_PATH = Path(__file__).parent / "ha-reminders-card.js"


async def _async_register_lovelace_resource(hass: HomeAssistant) -> None:
    """Add the card to Lovelace's resource registry if not already present."""
    try:
        lovelace = hass.data.get("lovelace")
        if lovelace is None:
            _LOGGER.warning("ha-reminders: lovelace not found in hass.data")
            return
        resources = getattr(lovelace, "resources", None)
        if resources is None:
            _LOGGER.warning("ha-reminders: lovelace resources not found")
            return
        await resources.async_load()
        if any(r.get("url") == _CARD_URL for r in resources.async_items()):
            return
        await resources.async_create_item({"res_type": "module", "url": _CARD_URL})
        _LOGGER.info("Registered ha-reminders-card as Lovelace resource")
    except Exception:  # noqa: BLE001
        _LOGGER.exception("ha-reminders: failed to register Lovelace resource")


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the custom Lovelace card as a frontend resource."""
    await hass.http.async_register_static_paths(
        [StaticPathConfig(_CARD_URL, str(_CARD_PATH), cache_headers=False)]
    )
    async def _on_ha_started(_event: Event) -> None:
        await _async_register_lovelace_resource(hass)

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _on_ha_started)
    return True


class HaRemindersClient:
    """Domain logic for a single HA Reminders entry."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Initialise the client."""
        self._hass = hass
        self._entry = entry

    def mark_done(self) -> None:
        """Reset last_changed to today and persist via config entry."""
        self._hass.config_entries.async_update_entry(
            self._entry,
            data={**self._entry.data, "last_changed": date.today().isoformat()},
        )


type HaRemindersConfigEntry = ConfigEntry[HaRemindersClient]


async def async_setup_entry(hass: HomeAssistant, entry: HaRemindersConfigEntry) -> bool:
    """Set up HA Reminders from a config entry."""
    entry.runtime_data = HaRemindersClient(hass, entry)
    await hass.config_entries.async_forward_entry_setups(entry, _PLATFORMS)
    return True


async def async_unload_entry(
    hass: HomeAssistant, entry: HaRemindersConfigEntry
) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, _PLATFORMS)
