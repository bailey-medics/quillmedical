"""Whether a reply to somebody's feedback is waiting on them.

An operator's comment is a reply the sender has to open their feedback
page to read. It is waiting on them from when it is written, or changed,
until they next open that page. Kept in one place because the route that
stamps it and the inbox that counts it must agree.
"""

from sqlalchemy import ColumnElement, and_, or_

from app.models import Feedback


def reply_is_unseen() -> ColumnElement[bool]:
    """Rows carrying a comment written since the sender last looked."""
    return and_(
        Feedback.operator_comment.is_not(None),
        or_(
            Feedback.comment_seen_at.is_(None),
            and_(
                Feedback.operator_comment_at.is_not(None),
                Feedback.comment_seen_at < Feedback.operator_comment_at,
            ),
        ),
    )
