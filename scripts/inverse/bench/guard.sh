#!/bin/bash
# Stops a long run (PID $1 and every process under it, with SIGKILL) when the disk has less than MIN_FREE_GB
# free (default 15) or from STOP_FROM to STOP_UNTIL (default 0850 to 1930: the machine is the user's from 09:00
# to 20:00; STOP_FROM= empty turns the hours off). Checks once a minute and ends with the run.
#   node scripts/inverse/bench/run.mjs ... & scripts/inverse/bench/guard.sh $!
pid=$1; [ -n "$pid" ] || { echo "usage: $0 PID" >&2; exit 2; }
MIN_FREE_GB=${MIN_FREE_GB:-15}; STOP_FROM=${STOP_FROM-0850}; STOP_UNTIL=${STOP_UNTIL:-1930}
killtree() { for c in $(pgrep -P "$1"); do killtree "$c"; done; kill -9 "$1" 2>/dev/null; }
while kill -0 "$pid" 2>/dev/null; do
  free=$(df -Pk . | awk 'NR==2{print int($4/1048576)}')
  hm=$(date +%H%M)
  if [ "$free" -lt "$MIN_FREE_GB" ] || { [ -n "$STOP_FROM" ] && [ "$hm" -ge "$STOP_FROM" ] && [ "$hm" -lt "$STOP_UNTIL" ]; }; then
    echo "guard: stopped $pid (free ${free} GB at $hm)"; killtree "$pid"; exit
  fi
  sleep 60
done
