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


class InvalidBankId(TeachingError):
    """A question bank was named by something that cannot be an id.

    Letters, digits, hyphens and underscores only. Asked before anything
    is looked up, so the words say nothing of what exists.
    """

    status_code = 400
    message = "Invalid bank_id"


class QuestionBankNotFound(TeachingError):
    """No question bank by that id is there for this learner to be shown.

    The same words whichever it is: no such bank, one that is not
    theirs, one with no version promoted, one whose promoted version
    was never synced, or one whose media is incomplete. The caller
    cannot tell them apart, which is the point.
    """

    status_code = 404
    message = "Question bank not found"


class ModuleNotFound(TeachingError):
    """No module by that id is there for this learner to be given.

    The words a module that is not theirs is refused with, so a module
    whose media is incomplete, or which is missing from the content
    path, cannot be told from one that was never open to them.
    """

    status_code = 404
    message = "Module not found"


class NoLearningContent(TeachingError):
    """The module is open to the learner and has no learning pages."""

    status_code = 404
    message = "No learning content for this module"


class TeachingContentNotConfigured(TeachingError):
    """Neither a bucket nor a content path is set, so nothing can be read."""

    status_code = 404
    message = "Teaching content not configured"


class AssessmentNotOpen(TeachingError):
    """The question bank is not one this learner may start an attempt on.

    The same words whichever it is: no such bank, one that is not
    theirs, one they are not enrolled on, one closed to new attempts,
    or one with no version promoted.
    """

    status_code = 403
    message = "This assessment is not currently open"


class AssessmentNotFound(TeachingError):
    """No attempt by that id is this learner's.

    The same words for an attempt that does not exist and for one that
    is somebody else's, so an id is never confirmed.
    """

    status_code = 404
    message = "Assessment not found"


class AssessmentAlreadyCompleted(TeachingError):
    """The attempt is finished, so its questions are no longer handed out."""

    status_code = 409
    message = "Assessment already completed"


class ItemNotFound(TeachingError):
    """The attempt has no question at the position asked for."""

    status_code = 404
    message = "Item not found"


class AssessmentConfigNotFound(TeachingError):
    """The version of the bank an attempt was started on is no longer there.

    Not something the learner did: the synced copy the attempt names
    has gone, so its questions cannot be laid out.
    """

    status_code = 500
    message = "Config not found for assessment"
