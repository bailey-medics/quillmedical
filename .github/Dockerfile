# The shell script test suite, on the platform the scripts actually run on.
#
# The suite under .github/scripts and .claude/hooks runs on ubuntu-24.04 GitHub
# runners. Running it on a developer's Mac tests a different bash, a different
# coreutils and a different sha256sum, so a local result — green or red — is not
# evidence about CI. This image is the runner, near enough: same base, same bats,
# and only the tools the suite genuinely calls.
#
# Pin by digest for reproducible builds. To update, run:
#   docker pull ubuntu:24.04 && docker inspect --format='{{index .RepoDigests 0}}' ubuntu:24.04
FROM ubuntu@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517

# This list is deliberately short, and adding to it is a decision rather than a
# convenience. The tests stub gh, gcloud, gsutil and python (as distinct from
# python3) onto PATH; installing any of those here would let a real binary
# shadow a stub, and the tests would quietly stop exercising what they claim to.
#
#   git      — called for real in the tests, which build throwaway repositories
#   python3  — called for real to generate test fixtures
#   jq       — called for real by check-version-consistency.sh
#   curl, ca-certificates — only to fetch bats below
#
# coreutils is already in the base image, and being GNU's rather than Darwin's
# is one of the differences this image exists to capture.
#
# The base layer lags the archive by a few weeks, so it carries security updates
# that have already shipped — upgrading here clears them, and moves the image
# closer to the GitHub runner, which is patched rather than frozen at release.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get upgrade --yes \
    && DEBIAN_FRONTEND=noninteractive apt-get install --no-install-recommends --yes \
        ca-certificates \
        curl \
        git \
        jq \
        python3 \
    && rm -rf /var/lib/apt/lists/*

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
