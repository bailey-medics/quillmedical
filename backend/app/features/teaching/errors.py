"""Why something asked of teaching content was refused.

The same shape as ``UserAdminError`` in :mod:`app.users.errors`. Each
refusal is a class that fixes its own words and status, so nothing can
reach a caller that somebody did not write for them to read.

Every refusal here takes no arguments. None repeats a value: no storage
path, no object name, no file name, no id and nothing an exception
said. Should one ever need to, the only values it may take are a
catalogue id (a module id among them) or an integer id the caller
themselves sent in the request, handed back and never looked up to
build the words.

``app.main`` registers one handler for :class:`TeachingError`, which
answers with the class's status and ``{"detail": message}``. That is the
body an ``HTTPException`` gives, so a rule moved out of a route answers
exactly as it did inside it.
"""


class TeachingError(Exception):
    """Something asked of teaching content that may not, or cannot, be done.

    A subclass fixes ``message`` as a class attribute and is raised with
    no arguments.
    """

    status_code: int = 400
    message: str = "The request could not be completed"

    def __init__(self, message: str | None = None) -> None:
        if message is not None:
            self.message = message

        super().__init__(self.message)


class MediaAssetNotFound(TeachingError):
    """No upload is recorded under the three ids a job reported on.

    Either the ids are wrong, or the row was deleted while the job ran.
    The words do not say which, and name none of the ids.
    """

    status_code = 404
    message = "No such media asset"
