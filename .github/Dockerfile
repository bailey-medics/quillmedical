# The shell script test suite, on Linux and on the Python this repository
# is pinned to.
#
# The suite under .github/scripts, .claude/hooks and scripts/tests runs on
# ubuntu-24.04 GitHub runners. Running it on a developer's Mac tests a
# different bash, a different coreutils and a different sha256sum, so a
# local result - green or red - is not evidence about CI. This image has
# GNU's versions of all three, the same bats, and only the tools the suite
# genuinely calls.
#
# It is Debian and not Ubuntu, so it is like the runner and not a copy of
# it: the two share bash, coreutils and the rest, and CI runs the same
# suite on the runner itself, which has the last word. What this base
# gives in return is the Python. The tests call python3 for real: to
# generate fixtures, and to run the scripts in scripts/, which are
# formatted for the pinned Python and which an older one cannot read.
# Ubuntu 24.04's own python3 is 3.12 and it has no package for a newer
# one. This is the image backend/Dockerfile builds on, so the tests run
# on the Python the backend runs on, and there is no second copy of it
# to keep up to date.
#
# Pinned by digest, and the same digest as PYTHON_IMAGE in
# backend/Dockerfile: Renovate moves the two together, and
# check-version-consistency.sh fails when this one names another Python
# than .python-version does. Not an ARG as it is there: nothing builds
# this image but `just ts` and `just test-coverage`, on a developer's
# machine, so there is no mirror to point it at.
FROM public.ecr.aws/docker/library/python:3.14-slim@sha256:51dafde81dbdb6ebde285137a295cf18a47ca95234fe388a343719cb97305b3d

# This list is deliberately short, and adding to it is a decision rather than a
# convenience. The tests stub gh, gcloud, gsutil and python (as distinct from
# python3) onto PATH; installing any of those here would let a real binary
# shadow a stub, and the tests would quietly stop exercising what they claim to.
#
#   git      - called for real in the tests, which build throwaway repositories
#   jq       - called for real by check-version-consistency.sh
#   curl, ca-certificates - only to fetch bats below
#
# coreutils is already in the base image, and being GNU's rather than Darwin's
# is one of the differences this image exists to capture.
#
# The base layer lags the archive by a few weeks, so it carries security updates
# that have already shipped - upgrading here clears them.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get upgrade --yes \
    && DEBIAN_FRONTEND=noninteractive apt-get install --no-install-recommends --yes \
        ca-certificates \
        curl \
        git \
        jq \
    && rm -rf /var/lib/apt/lists/*

# The base image ships `python` as well as `python3`. The tests stub
# `python`, and on a machine with no real one a test that forgot its stub
# fails at once. Left here, the real one would answer in its place and the
# test would pass without exercising what it claims to. python3 stays.
RUN rm /usr/local/bin/python \
    && ! command -v python \
    && python3 --version

# Must match the bats-version pinned for bats-core/bats-action in ci.yml, so a
# bats release cannot change one side of the comparison without the other.
ARG BATS_VERSION=1.14.0
RUN curl -fsSL "https://github.com/bats-core/bats-core/archive/refs/tags/v${BATS_VERSION}.tar.gz" \
        | tar xz -C /tmp \
    && "/tmp/bats-core-${BATS_VERSION}/install.sh" /usr/local \
    && rm -rf "/tmp/bats-core-${BATS_VERSION}" \
    && bats --version

# The repository is bind-mounted at run time and is owned by the host user, which
# git otherwise refuses to look at.
RUN git config --global --add safe.directory '*'

WORKDIR /repo
