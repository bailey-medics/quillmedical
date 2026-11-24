# The BuildKit image that every workflow's Buildx runs its builds in.
#
# Never built. It is a Dockerfile only so that the mirror reads this image
# the way it reads every other one: mirror-images.yml copies the default of
# the ARG below into ghcr.io/<owner>/mirror/, check-mirrored-images.sh
# refuses it unpinned, and Renovate moves the digest. The setup-buildx
# action, in .github/actions/, hands Buildx the copy.
#
# Why: Google's mirror of Docker Hub, where this came from before, has a
# limit on requests a minute that every caller shares. It refused this
# image on 24 November 2026 and failed an end-to-end run with nothing
# wrong in it. Docker Hub itself limits anonymous pulls by address.
#
# The copy is made from Google's mirror, which serves the same image by
# the same digest as Docker Hub, and is asked only when the digest moves.
ARG BUILDKIT_IMAGE=mirror.gcr.io/moby/buildkit:buildx-stable-1@sha256:baf6138eb8c37644800c7c913fba051e840ebb9ba13eaf92d92ef9a1712d0b4c
FROM ${BUILDKIT_IMAGE}
