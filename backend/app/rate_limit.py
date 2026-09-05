"""The application's shared rate limiter.

Lives here rather than in ``main`` so routers in their own modules can apply
``@limiter.limit`` without importing ``main`` and creating a cycle. The
deferred-import trick used elsewhere for ``get_current_user`` does not work
for a decorator, which is evaluated when the module is first imported.

``main`` still owns registering it on the app and installing the exception
handler; this module only creates it.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

#: Disabled in development so local work is not throttled.
limiter = Limiter(
    key_func=get_remote_address,
    enabled=settings.BACKEND_ENV != "development",
)
