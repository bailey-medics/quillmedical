"""Setting up the root logger: readable in development, JSON elsewhere."""

import logging
from collections.abc import Iterator

import pytest
from pythonjsonlogger.json import JsonFormatter

from app import logging_config
from app.log_context import RequestContextFilter

_NOISY = ("uvicorn.access", "httpx", "httpcore")


@pytest.fixture(autouse=True)
def restore_logging() -> Iterator[None]:
    """Put every logger this touches back, so no other test sees a change."""
    root = logging.getLogger()
    handlers, level = list(root.handlers), root.level
    noisy = {name: logging.getLogger(name).level for name in _NOISY}

    yield

    root.handlers[:] = handlers
    root.setLevel(level)
    for name, was in noisy.items():
        logging.getLogger(name).setLevel(was)


def _handler() -> logging.Handler:
    [handler] = logging.getLogger().handlers

    return handler


def test_development_gets_a_line_a_person_can_read(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(logging_config, "_DEV_MODE", True)

    logging_config.setup_logging()

    formatter = _handler().formatter
    assert formatter is not None
    assert not isinstance(formatter, JsonFormatter)


def test_anywhere_else_gets_json_for_cloud_logging(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(logging_config, "_DEV_MODE", False)

    logging_config.setup_logging()

    assert isinstance(_handler().formatter, JsonFormatter)


@pytest.mark.parametrize("dev_mode", [True, False])
def test_replaces_whatever_handlers_were_there(
    monkeypatch: pytest.MonkeyPatch, dev_mode: bool
) -> None:
    """Uvicorn installs its own; two handlers would log every line twice."""
    monkeypatch.setattr(logging_config, "_DEV_MODE", dev_mode)
    logging.getLogger().addHandler(logging.NullHandler())
    logging.getLogger().addHandler(logging.NullHandler())

    logging_config.setup_logging()

    assert len(logging.getLogger().handlers) == 1
    assert logging.getLogger().level == logging.INFO


@pytest.mark.parametrize("dev_mode", [True, False])
def test_every_line_carries_the_request_it_belongs_to(
    monkeypatch: pytest.MonkeyPatch, dev_mode: bool
) -> None:
    monkeypatch.setattr(logging_config, "_DEV_MODE", dev_mode)

    logging_config.setup_logging()

    assert any(isinstance(f, RequestContextFilter) for f in _handler().filters)


def test_noisy_libraries_are_quietened(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(logging_config, "_DEV_MODE", False)

    logging_config.setup_logging()

    for name in _NOISY:
        assert logging.getLogger(name).level == logging.WARNING
