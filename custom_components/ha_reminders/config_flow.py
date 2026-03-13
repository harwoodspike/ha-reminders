"""Config flow for the HA Reminders integration."""

from __future__ import annotations

from datetime import date, datetime
import logging
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import (
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import selector

from . import HaRemindersConfigEntry
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

STEP_USER_DATA_SCHEMA = vol.Schema(
    {
        vol.Required("name"): str,
        vol.Required("last_changed"): selector.DateSelector(),
        vol.Required("interval"): int,
    }
)


async def validate_input(hass: HomeAssistant, data: dict[str, Any]) -> dict[str, Any]:
    """Validate the user input allows us to connect.

    Data has the keys from STEP_USER_DATA_SCHEMA with values provided by the user.
    """
    # Validate name
    name = data["name"].strip()
    if not name:
        raise ValueError("name_empty")

    # Validate last_changed
    try:
        last_changed = datetime.fromisoformat(data["last_changed"]).date()
    except ValueError as err:
        raise ValueError("invalid_date") from err

    if last_changed > date.today():
        raise ValueError("date_in_future")

    # Validate interval
    interval = data["interval"]
    if interval < 1:
        raise ValueError("invalid_interval")

    # Return info that you want to store in the config entry.
    return {"title": name}


class HaRemindersOptionsFlow(OptionsFlow):
    """Manage the options."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Manage the options."""
        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                info = await validate_input(self.hass, user_input)
            except ValueError as err:
                errors["base"] = str(err)
            except Exception:
                _LOGGER.exception("Unexpected exception in ha_reminders options flow")
                errors["base"] = "unknown"
            else:
                self.hass.config_entries.async_update_entry(
                    self.config_entry,
                    data=user_input,
                    title=info["title"],
                )
                return self.async_create_entry(data={})

        return self.async_show_form(
            step_id="init",
            data_schema=self.add_suggested_values_to_schema(
                STEP_USER_DATA_SCHEMA, user_input or self.config_entry.data
            ),
            errors=errors,
        )


class HaRemindersConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for HA Reminders."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: HaRemindersConfigEntry,
    ) -> HaRemindersOptionsFlow:
        """Create the options flow."""
        return HaRemindersOptionsFlow()

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle the initial step."""
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                info = await validate_input(self.hass, user_input)
            except ValueError as err:
                errors["base"] = str(err)
            except Exception:
                _LOGGER.exception("Unexpected exception in ha_reminders config flow")
                errors["base"] = "unknown"
            else:
                existing_names = {
                    entry.data["name"].strip().lower()
                    for entry in self._async_current_entries()
                }
                if user_input["name"].strip().lower() in existing_names:
                    errors["name"] = "duplicate_name"
                else:
                    return self.async_create_entry(title=info["title"], data=user_input)

        return self.async_show_form(
            step_id="user",
            data_schema=self.add_suggested_values_to_schema(
                STEP_USER_DATA_SCHEMA, user_input or {}
            ),
            errors=errors,
        )

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle reconfiguration of an existing reminder."""
        errors: dict[str, str] = {}
        reconfig_entry = self._get_reconfigure_entry()

        if user_input is not None:
            try:
                info = await validate_input(self.hass, user_input)
            except ValueError as err:
                errors["base"] = str(err)
            except Exception:
                _LOGGER.exception("Unexpected exception in ha_reminders reconfigure flow")
                errors["base"] = "unknown"
            else:
                existing_names = {
                    entry.data["name"].strip().lower()
                    for entry in self._async_current_entries()
                    if entry.entry_id != reconfig_entry.entry_id
                }
                if user_input["name"].strip().lower() in existing_names:
                    errors["name"] = "duplicate_name"
                else:
                    return self.async_update_reload_and_abort(
                        reconfig_entry,
                        data=user_input,
                        title=info["title"],
                    )

        return self.async_show_form(
            step_id="reconfigure",
            data_schema=self.add_suggested_values_to_schema(
                STEP_USER_DATA_SCHEMA,
                user_input or reconfig_entry.data,
            ),
            errors=errors,
        )
