#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
STATE_DIR="$REPO_ROOT/.dev-watch"
mkdir -p "$STATE_DIR"

# Confirms $pid is still the process we started, not just any process that
# happens to hold that PID (Linux recycles PIDs, so a dead sync/watch process
# can leave its number free for something unrelated to reuse). Compares the
# live process's command line against what start_one actually launched.
pid_matches() {
	local pid="$1" npm_script="$2" cmd
	if [[ -r "/proc/$pid/cmdline" ]]; then
		cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)"
	else
		cmd="$(ps -o command= -p "$pid" 2>/dev/null)"
	fi
	[[ -n "$cmd" && "$cmd" == *"npm"* && "$cmd" == *"run"* && "$cmd" == *"$npm_script"* ]]
}

is_alive() {
	local pid_file="$1" npm_script="$2" pid
	[[ -f "$pid_file" ]] || return 1
	pid="$(cat "$pid_file")"
	kill -0 "$pid" 2>/dev/null && pid_matches "$pid" "$npm_script"
}

start_one() {
	local name="$1" npm_script="$2"
	local pid_file="$STATE_DIR/$name.pid"
	local log_file="$STATE_DIR/$name.log"

	if is_alive "$pid_file" "$npm_script"; then
		echo "$name: already running (pid $(cat "$pid_file"))"
		return
	fi

	cd "$REPO_ROOT"
	nohup npm run "$npm_script" > "$log_file" 2>&1 < /dev/null &
	local pid=$!
	disown "$pid" 2>/dev/null || true
	echo "$pid" > "$pid_file"

	sleep 1
	if kill -0 "$pid" 2>/dev/null; then
		echo "$name: started (pid $pid), logging to $log_file"
	else
		echo "$name: FAILED to start - check $log_file"
	fi
}

stop_one() {
	local name="$1" npm_script="$2"
	local pid_file="$STATE_DIR/$name.pid"

	if is_alive "$pid_file" "$npm_script"; then
		kill "$(cat "$pid_file")" 2>/dev/null || true
		rm -f "$pid_file"
		echo "$name: stopped"
	else
		echo "$name: not running"
		rm -f "$pid_file"
	fi
}

status_one() {
	local name="$1" npm_script="$2"
	local pid_file="$STATE_DIR/$name.pid"

	if is_alive "$pid_file" "$npm_script"; then
		echo "$name: running (pid $(cat "$pid_file"))"
	else
		echo "$name: not running"
	fi
}

case "${1:-start}" in
	start)
		start_one "watch" "watch"
		start_one "sync" "sync"
		;;
	stop)
		stop_one "watch" "watch"
		stop_one "sync" "sync"
		;;
	status)
		status_one "watch" "watch"
		status_one "sync" "sync"
		;;
	*)
		echo "usage: dev-watch.sh [start|stop|status]" >&2
		exit 1
		;;
esac
