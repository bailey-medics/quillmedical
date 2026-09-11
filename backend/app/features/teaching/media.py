"""What media a module references, and which of it is present.

One question asked in three places — the admin card listing what is
missing, the learner gate hiding an incomplete module, and the merge gate
warning about a reference nothing has uploaded. One function answers it,
because three implementations would drift and the most permissive one
would be the one nobody noticed.

Modelled on ``ImageInventory`` in ``storage.py``, which solves the same
shape for assessment images: a "what actually exists" map, supplied when
content lives in GCS and the files are therefore not on disk.

Everything here is per organisation. Media belongs to the module, and
modules are per organisation, so "is this module complete" has no global
answer — the same shape ``QuestionBankOrgStatus`` established for
liveness.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.teaching.models import ModuleMediaLink


@dataclass(frozen=True)
class MediaReference:
    """One ``<Video ref>`` in a module's MDX, and what backs it."""

    #: The key as written in the content, e.g. ``lecture-01``.
    key: str
    #: The linked upload, or None when nothing has been uploaded yet.
    link: ModuleMediaLink | None

    @property
    def is_present(self) -> bool:
        """Whether this reference has a file behind it."""
        return self.link is not None


@dataclass(frozen=True)
class MediaInventory:
    """Every reference in a module, and every upload not referenced.

    The two halves answer different questions. ``references`` drives the
    admin card's rows and the learner gate; ``unattached`` is what a
    renamed or removed reference leaves behind, and without listing it
    those files are invisible bytes nobody can reach or remove.
    """

    references: list[MediaReference]
    unattached: list[ModuleMediaLink]

    @property
    def is_complete(self) -> bool:
        """Whether every reference has a file.

        An incomplete module is not served to learners at all — which is
        what makes plain delete safe in the admin card, since deleting
        cannot leave a learner with a broken slide.
        """
        return all(ref.is_present for ref in self.references)

    @property
    def missing_keys(self) -> list[str]:
        """References still waiting on an upload."""
        return [ref.key for ref in self.references if not ref.is_present]


def get_media_inventory(
    db: Session,
    organisation_id: int,
    module_id: str,
    referenced_keys: list[str],
) -> MediaInventory:
    """Pair a module's MDX references against its uploads.

    Args:
        db: Core database session.
        organisation_id: Whose uploads to consider. Two organisations
            running the same module hold separate copies, so this is not
            optional.
        module_id: The question bank the module belongs to.
        referenced_keys: The ``ref`` values the MDX carries, in the order
            they appear. Taken from the parser rather than read here, so
            this function has no opinion about how content is stored.

    Returns:
        Every reference with its link if any, plus uploads matching no
        reference.
    """
    rows = list(
        db.execute(
            select(ModuleMediaLink).where(
                ModuleMediaLink.organisation_id == organisation_id,
                ModuleMediaLink.question_bank_id == module_id,
            )
        )
        .scalars()
        .all()
    )

    by_key = {row.media_key: row for row in rows}
    referenced = set(referenced_keys)

    return MediaInventory(
        references=[
            MediaReference(key=key, link=by_key.get(key))
            for key in referenced_keys
        ],
        # A key removed from the MDX orphans its link rather than
        # deleting the file: that is someone's 900 MB, and the reference
        # may well return.
        unattached=[row for row in rows if row.media_key not in referenced],
    )
