"""Test the HA Reminders config flow."""

from datetime import date
from unittest.mock import AsyncMock, patch

from custom_components.ha_reminders.const import DOMAIN

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from tests.common import MockConfigEntry  # noqa: TID251

VALID_INPUT = {
    "name": "Air Filter",
    "last_changed": "2026-01-01",
    "interval": 90,
}


async def test_form(hass: HomeAssistant, mock_setup_entry: AsyncMock) -> None:
    """Test we get the form."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"
    assert result["errors"] == {}


async def test_create_entry(hass: HomeAssistant, mock_setup_entry: AsyncMock) -> None:
    """Test successful entry creation."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], VALID_INPUT
    )
    await hass.async_block_till_done()

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Air Filter"
    assert result["data"] == VALID_INPUT
    assert len(mock_setup_entry.mock_calls) == 1


async def test_name_empty(hass: HomeAssistant, mock_setup_entry: AsyncMock) -> None:
    """Test error when name is blank."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {**VALID_INPUT, "name": "   "}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"base": "name_empty"}

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], VALID_INPUT
    )
    await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY


async def test_date_in_future(hass: HomeAssistant, mock_setup_entry: AsyncMock) -> None:
    """Test error when last_changed is in the future."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    with patch(
        "custom_components.ha_reminders.config_flow.date",
    ) as mock_date:
        mock_date.today.return_value = date(2026, 1, 1)
        mock_date.fromisoformat = date.fromisoformat
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"], {**VALID_INPUT, "last_changed": "2026-01-02"}
        )
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"base": "date_in_future"}

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], VALID_INPUT
    )
    await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY


async def test_invalid_interval(
    hass: HomeAssistant, mock_setup_entry: AsyncMock
) -> None:
    """Test error when interval is zero or negative."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {**VALID_INPUT, "interval": 0}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"base": "invalid_interval"}

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], VALID_INPUT
    )
    await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY


async def test_duplicate_name(hass: HomeAssistant, mock_setup_entry: AsyncMock) -> None:
    """Test error when a reminder with the same name already exists."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], VALID_INPUT
    )
    await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], VALID_INPUT
    )
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"name": "duplicate_name"}


async def test_options_flow(hass: HomeAssistant, mock_setup_entry: AsyncMock) -> None:
    """Test the options flow pre-populates and saves edits."""
    entry = MockConfigEntry(domain=DOMAIN, data=VALID_INPUT)
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "init"

    updated = {"name": "New Filter", "last_changed": "2026-02-01", "interval": 30}
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], user_input=updated
    )
    await hass.async_block_till_done()

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.data["name"] == "New Filter"
    assert entry.data["interval"] == 30
    assert entry.title == "New Filter"
