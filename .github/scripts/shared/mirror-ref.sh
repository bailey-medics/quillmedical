#!/usr/bin/env bash
# Shared helpers for naming an image's copy in this repository's own mirror.
# For use in GitHub Actions workflows only.
#
# CI's public images are copied into GitHub's registry, under the owner of
# this repository, so a job pulls them with its own login and is not turned
# away by a public registry's limit on anonymous callers. The copy keeps the
# image's name and tag, and its contents exactly, so its digest is the same.
#
#   public.ecr.aws/docker/library/postgres:18-alpine
#   ghcr.io/<owner>/mirror/postgres:18-alpine
#
# Sourced by the script that makes the copies and the script that decides
# whether to use them, so the two cannot disagree about the name.
#
# Usage: source "$(dirname "${BASH_SOURCE[0]}")/../shared/mirror-ref.sh"

# Prints the digest an image reference is pinned to, or nothing.
_digest_of() {
  local ref="$1"

  if [[ "$ref" == *@* ]]; then
    echo "${ref#*@}"
  fi
}

# Prints the last part of an image's path, without tag or digest:
# postgres from public.ecr.aws/docker/library/postgres:18-alpine.
_name_of() {
  local ref="$1"
  local without_digest="${ref%%@*}"
  local last="${without_digest##*/}"

  echo "${last%%:*}"
}

# Prints an image reference's tag, or "latest" when it names none.
_tag_of() {
  local ref="$1"
  local without_digest="${ref%%@*}"
  local last="${without_digest##*/}"

  if [[ "$last" == *:* ]]; then
    echo "${last##*:}"
  else
    echo "latest"
  fi
}

# Prints where an image's copy is pushed: always by tag.
mirror_push_ref() {
  local owner="$1"
  local ref="$2"
  local lower_owner=""
  lower_owner="$(tr '[:upper:]' '[:lower:]' <<<"$owner")"

  echo "ghcr.io/${lower_owner}/mirror/$(_name_of "$ref"):$(_tag_of "$ref")"
}

# Prints the reference to pull an image's copy by. An image pinned to a
# digest is pulled by that digest, so the copy has to be the very same
# image and not just whatever the tag points at today.
mirror_pull_ref() {
  local owner="$1"
  local ref="$2"
  local digest=""
  digest="$(_digest_of "$ref")"

  if [ -n "$digest" ]; then
    local pushed=""
    pushed="$(mirror_push_ref "$owner" "$ref")"

    echo "${pushed%:*}@${digest}"
  else
    mirror_push_ref "$owner" "$ref"
  fi
}

# Prints the reference to copy an image from. One pinned to a digest is
# copied by the digest alone: the tag may have moved on since it was pinned.
mirror_source_ref() {
  local ref="$1"
  local digest=""
  digest="$(_digest_of "$ref")"

  if [ -n "$digest" ]; then
    local without_digest="${ref%%@*}"
    local last="${without_digest##*/}"

    echo "${without_digest%"$last"}${last%%:*}@${digest}"
  else
    echo "$ref"
  fi
}
