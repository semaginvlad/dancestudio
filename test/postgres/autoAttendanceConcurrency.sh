#!/usr/bin/env bash
# Run against a fresh disposable PostgreSQL container, never a shared database.
set -euo pipefail
container_name=${AUTO_ATTENDANCE_PG_CONTAINER:?Set AUTO_ATTENDANCE_PG_CONTAINER to a fresh disposable PostgreSQL container}
root=$(cd "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
python3 - "$root" "$tmp/setup.sql" <<'PY'
import pathlib, sys
root = pathlib.Path(sys.argv[1]); output = pathlib.Path(sys.argv[2])
rls = (root / 'supabase/migrations/20260916090000_fix_attendance_trainer_group_rls.sql').read_text()
output.write_text((root / 'test/postgres/autoAttendanceFixture.sql').read_text() + rls[rls.index('create or replace function public.rls_owns_group'):rls.index('revoke execute')] + (root / 'supabase/migrations/20261113090000_subscription_queue_resolver.sql').read_text() + (root / 'supabase/migrations/20261113100000_auto_attendance_queue.sql').read_text())
PY
docker exec -i "$container_name" psql -U postgres -v ON_ERROR_STOP=1 < "$tmp/setup.sql" > /dev/null
student=10000000-0000-0000-0000-000000000001
docker exec "$container_name" psql -U postgres -v ON_ERROR_STOP=1 -c "begin; select pg_advisory_xact_lock(hashtextextended('$student:a',0)); select pg_sleep(5); select id from crm_create_auto_attendance('$student','a','2026-11-02'); commit;" > "$tmp/first" 2>&1 &
first=$!
locked=false
for attempt in {1..50}; do
  available=$(docker exec "$container_name" psql -U postgres -At -c "select pg_try_advisory_lock(hashtextextended('$student:a',0))")
  if [ "$available" = f ]; then locked=true; break; fi
  sleep 0.1
done
if [ "$locked" != true ]; then echo 'First transaction did not acquire the queue lock' >&2; exit 1; fi
docker exec "$container_name" psql -U postgres -v ON_ERROR_STOP=1 -c "select id from crm_create_auto_attendance('$student','a','2026-11-02');" > "$tmp/second" 2>&1 &
second=$!
wait "$first"
if wait "$second"; then echo 'Duplicate unexpectedly succeeded' >&2; exit 1; fi
if ! rg -q 'Відмітка вже існує' "$tmp/second"; then cat "$tmp/second" >&2; exit 1; fi
result=$(docker exec "$container_name" psql -U postgres -At -c 'select (select count(*) from attendance), (select used_trainings from subscriptions limit 1)')
if [ "$result" != '1|1' ]; then echo "Unexpected attendance/usage: $result" >&2; exit 1; fi
echo 'Concurrent Auto attempts produced one attendance and one debit.'
