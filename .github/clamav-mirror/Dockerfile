# The clamav-mirror image: ClamAV's packages and one day's definitions,
# as files.
#
# Built daily by .github/workflows/clamav-mirror.yml from what
# .github/scripts/clamav-mirror/build-mirror.sh fetched, and pushed to
# ghcr.io/<owner>/clamav-mirror. Read back by fetch-mirror.sh, by the
# deploy before it builds the scan job's image, and by the teaching content
# check. So ClamAV's servers are asked once a day, from one job, and never
# by a build, an upload or a content pull request.
#
# FROM scratch, with nothing to run: an image is used here only as the way
# to keep files in GHCR beside the other mirrored images, private like
# them.
FROM scratch

COPY . /clamav/
