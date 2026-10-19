"""What is done to every upload, whichever feature it belongs to.

Passport evidence and teaching videos are uploaded by different people
to different buckets, and each feature keeps its own record of them.
What they share is here: the malware scan every object goes through
before anyone can open it. See Phase 4 of
``docs/docs/plans/2026-10-18-upload-safety-plan.md``.
"""
