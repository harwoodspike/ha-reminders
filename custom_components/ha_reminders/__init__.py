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
