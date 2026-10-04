"""The words for feedback's stored values, where the server has to say them.

The frontend has its own copies for its screens. These are for what the
server writes itself: the notice emailed to an operator, and the lines of
the inbox.
"""

#: What each category reads as. The same words the sender chose from, in
#: ``sendFeedback.ts``.
CATEGORY_LABELS: dict[str, str] = {
    "broken": "Something is broken",
    "inaccurate": "Something is wrong or inaccurate",
    "suggestion": "Suggestion",
    "other": "Something else",
}

#: Where a piece of feedback has got to, as an operator reads it. The
#: same words as ``FEEDBACK_STATUS_LABELS`` in ``feedbackAdmin.ts``.
STATUS_LABELS: dict[str, str] = {
    "new": "New",
    "acknowledged": "Acknowledged",
    "resolved": "Resolved",
    "wont_fix": "Won't fix",
}
