# backend/app/email/broadcast.py
"""Export the newsletter layout as a Resend broadcast template.

Mailing lists run in Resend Audiences and Broadcasts, not in Quill (see
Phase 7 of docs/docs/plans/2026-09-25-email-branding-plan.md). Resend still
needs the layout, so a newsletter looks like it comes from the same place as
a password reset. This renders ``newsletter_broadcast.html.j2`` in a theme,
with live image links and Resend's own unsubscribe placeholder, ready to paste
into Resend's HTML editor.

Run with ``just email-export <theme>``.
"""

import sys
from typing import get_args

from app.email.brand import EmailThemeName
from app.email.render import render_email

#: What Resend replaces with each recipient's own unsubscribe link.
RESEND_UNSUBSCRIBE_URL = "{{{RESEND_UNSUBSCRIBE_URL}}}"


def export(theme: EmailThemeName) -> str:
    """The broadcast template for *theme*, as HTML.

    Args:
        theme: ``"quill"`` or ``"ldd"``.

    Returns:
        The HTML to paste into Resend.
    """
    rendered = render_email(
        "newsletter_broadcast.html.j2",
        theme,
        {
            "unsubscribe_url": RESEND_UNSUBSCRIBE_URL,
            # Resend's unsubscribe page is also where a recipient manages
            # which topics they get, so both links go to it.
            "preferences_url": RESEND_UNSUBSCRIBE_URL,
        },
    )
    return rendered["html_body"]


def main(argv: list[str]) -> int:
    """Print the broadcast template for the theme named in *argv*.

    Args:
        argv: The command line, the theme first.

    Returns:
        The exit status.
    """
    themes = get_args(EmailThemeName)
    if len(argv) != 1 or argv[0] not in themes:
        print(
            f"Usage: python -m app.email.broadcast <{'|'.join(themes)}>",
            file=sys.stderr,
        )
        return 1
    print(export(argv[0]))  # type: ignore[arg-type]
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
