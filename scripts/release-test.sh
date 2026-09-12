#!/usr/bin/env bash
set -euo pipefail

npm run check
npm run lint
npm test
npm run build

release_host="127.0.0.1"
release_port="${GRADEMAXXING_RELEASE_PORT:-5180}"
release_origin="http://${release_host}:${release_port}"
release_log="$(mktemp -t grademaxxing-release.XXXXXX)"

NODE_ENV=production \
	ORIGIN="$release_origin" \
	HOST="$release_host" \
	PORT="$release_port" \
	node build >"$release_log" 2>&1 &
release_pid=$!

cleanup() {
	kill "$release_pid" 2>/dev/null || true
	wait "$release_pid" 2>/dev/null || true
	rm -f "$release_log"
}
trap cleanup EXIT INT TERM

attempt=0
until curl --fail --silent "$release_origin/api/health" >/dev/null 2>&1; do
	attempt=$((attempt + 1))
	if ! kill -0 "$release_pid" 2>/dev/null || [ "$attempt" -ge 100 ]; then
		echo "Production server failed to become healthy." >&2
		cat "$release_log" >&2
		exit 1
	fi
	sleep 0.1
done

GRADEMAXXING_URL="$release_origin" npm run test:e2e
