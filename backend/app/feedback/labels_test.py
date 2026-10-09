"""The server's words for feedback cover every value it can store."""

from app.feedback.labels import CATEGORY_LABELS, STATUS_LABELS
from app.models import FEEDBACK_CATEGORIES, FEEDBACK_STATUSES


def test_every_category_has_a_label_and_nothing_else_does() -> None:
    """A category with no label would be left out of an operator's notice."""
    assert set(CATEGORY_LABELS) == set(FEEDBACK_CATEGORIES)


def test_every_status_has_a_label_and_nothing_else_does() -> None:
    assert set(STATUS_LABELS) == set(FEEDBACK_STATUSES)


def test_no_label_is_blank() -> None:
    for label in (*CATEGORY_LABELS.values(), *STATUS_LABELS.values()):
        assert label.strip()
