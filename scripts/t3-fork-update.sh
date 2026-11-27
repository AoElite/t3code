#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf '%s\n' 'Usage: bash scripts/t3-fork-update.sh [--check | --install]' \
    'Check the AoElite Linux x64 release channel, or explicitly hand off an install to t3 update.' \
    'Use --install when the server has no active runs. T3 will prompt before restarting.'
}

case "${1:---check}" in
  -h|--help) usage; exit 0 ;;
  --check|--install) mode=${1:---check} ;;
  *) usage >&2; exit 2 ;;
esac
if [[ $# -gt 1 ]] || [[ "$(uname -s)-$(uname -m)" != Linux-x86_64 ]]; then
  usage >&2
  exit 2
fi

repo=AoElite/t3code
index="https://api.github.com/repos/$repo/releases"
version=$(
  for page in {1..10}; do
    releases=$(curl --fail --silent --show-error --retry 2 --max-time 15 "$index?per_page=100&page=$page") || exit 1
    jq -e 'type == "array"' <<<"$releases" >/dev/null || exit 1
    if [[ "$(jq length <<<"$releases")" == 0 ]]; then break; fi
    jq -r '
      .[] | select(.draft == false)
      | .tag_name as $tag
      | select($tag | test("^v(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)-aoelite\\.[1-9][0-9]*$"))
      | ($tag | ltrimstr("v")) as $version
      | select(any(.assets[]; .name == "SHA256SUMS"))
      | select(any(.assets[]; .name == "t3-\($version)-linux-x64.tar.gz"))
      | $version
    ' <<<"$releases" || exit 1
    if [[ "$(jq length <<<"$releases")" -lt 100 ]]; then break; fi
  done | sort -V | tail -n1
)
if [[ -z "$version" ]]; then
  printf '%s\n' 'No published AoElite Linux x64 runtime was found.' >&2
  exit 1
fi
if [[ "$mode" == --check ]]; then
  printf '%s\n' "$version"
else
  T3CODE_RELEASE_BASE_URL="https://github.com/$repo/releases/download" exec t3 update "$version"
fi
