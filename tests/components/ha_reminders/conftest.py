"""Common fixtures for the HA Reminders tests."""

from collections.abc import Generator
from unittest.mock import AsyncMock, patch

import pytest

# Import the integration submodules up front so that `mock.patch` string targets
# like "custom_components.ha_reminders.sensor.date" resolve. Under the
# `custom_components` namespace package, pkgutil.resolve_name (used by mock on
# Python 3.13) can only traverse to a submodule that has already been imported.
import custom_components.ha_reminders  # noqa: E402, F401
import custom_components.ha_reminders.sensor  # noqa: E402, F401


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Enable loading the ha_reminders custom integration in all tests."""
    yield


@pytest.fixture
def mock_setup_entry() -> Generator[AsyncMock]:
    """Override async_setup_entry."""
    with patch(
        "custom_components.ha_reminders.async_setup_entry", return_value=True
    ) as mock_setup_entry:
        yield mock_setup_entry
