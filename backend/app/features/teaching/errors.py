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


class TimeLimitExceeded(TeachingError):
    """The attempt's time has run out, so no answer is taken or changed.

    Asked only when an answer is sent. Finishing the attempt does not
    ask it.
    """

    status_code = 409
    message = "Time limit exceeded"


class AllItemsAlreadyAnswered(TeachingError):
    """Every question of the attempt has an answer, so there is no next.

    An answer already given is changed by naming it, not by answering
    again.
    """

    status_code = 409
    message = "All items already answered"


class AnswerNotFound(TeachingError):
    """The attempt has no answer row by the id asked for.

    The same words for a row that does not exist and for one that is
    another attempt's, so an id is never confirmed.
    """

    status_code = 404
    message = "Answer not found"


class AssessmentNotComplete(TeachingError):
    """The attempt is still under way, so its marked answers are not given.

    Said before anything of the attempt is read: mid-attempt, the marks
    would say which of the answers so far are right.
    """

    status_code = 409
    message = "Assessment is not complete"


class CertificateNotEarned(TeachingError):
    """The attempt has no certificate, because it was not passed.

    The same words for an attempt still under way, one that failed, and
    one finished with no verdict stored.
    """

    status_code = 400
    message = "Certificate only available for passed assessments"


class CertificatesNotEnabled(TeachingError):
    """The bank the attempt was sat on does not issue certificates."""

    status_code = 404
    message = "Certificates not enabled for this bank"


class NoCertificateBackground(TeachingError):
    """The bank issues certificates and has no blank one to print on.

    Neither the content path nor the bucket holds the image, or neither
    is set.
    """

    status_code = 404
    message = "No certificate background found for this bank"


class BankIdRequired(TeachingError):
    """A sync or a dry run was asked for without saying of which bank.

    The body names no ``bank_id``, or an empty one. Asked before
    anything is looked for.
    """

    status_code = 400
    message = "bank_id is required"


class SyncRecordedNothing(TeachingError):
    """The sync of one bank by hand came back with no record of it.

    The same words whichever it is: a draft turned away for its
    version, and a live bank whose version has not moved on, which has
    nothing new to load and is not a failure at all.
    """

    status_code = 500
    message = "Sync failed unexpectedly"


class BankNotHeldHere(TeachingError):
    """The administrator's organisation holds no synced copy of the bank.

    The same words for a bank nobody holds and for one that only
    another organisation holds, so an id is never confirmed. They are
    the words of :class:`QuestionBankNotFound`, which is the learner's
    refusal and asks different questions.
    """

    status_code = 404
    message = "Question bank not found"


class NoModuleToUploadTo(TeachingError):
    """An upload was asked for where there is nowhere to file it.

    The same words for an organisation with no storage prefix and, where
    uploads go to disk, for a module that is not on the content path.
    They are the words of :class:`ModuleNotFound`, which is the
    learner's refusal and asks different questions.
    """

    status_code = 404
    message = "Module not found"


class MediaUploadNotConfigured(TeachingError):
    """Neither a source bucket nor a content path is set for uploads."""

    status_code = 503
    message = "Media upload is not configured"


class LocalUploadNotOffered(TeachingError):
    """An upload was sent through this application where a bucket is set.

    Uploads come through the application only where there is no source
    bucket. Where there is one, the route answers as if it were not
    there.
    """

    status_code = 404
    message = "Not found"


class InvalidAssetId(TeachingError):
    """An upload was named by something that cannot be an asset id.

    Letters, digits, hyphens and underscores only. Asked before the id
    becomes a file name.
    """

    status_code = 400
    message = "Invalid asset id"


class MediaAssetNotHeldHere(TeachingError):
    """The administrator's organisation holds no such upload of the module.

    The same words for an upload nobody holds and for one that only
    another organisation holds, so an id is never confirmed. They are
    the words of :class:`MediaAssetNotFound`, which is the refusal a
    video job is given.
    """

    status_code = 404
    message = "No such media asset"


class CaptionsNotWebVTT(TeachingError):
    """The corrected captions do not begin with the line a track must."""

    status_code = 400
    message = "Captions must be WebVTT, beginning with the line WEBVTT"


class CaptionsCannotBeSaved(TeachingError):
    """No bucket of processed video is set, so there is nowhere to save."""

    status_code = 503
    message = "No video bucket configured; captions cannot be saved"
