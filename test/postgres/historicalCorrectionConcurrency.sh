#!/usr/bin/env bash
# Use only with a fresh disposable local PostgreSQL container.
set -euo pipefail
container=${CORRECTION_PG_CONTAINER:?Set CORRECTION_PG_CONTAINER to a fresh disposable PostgreSQL container}
root=$(cd "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < "$root/test/postgres/subscriptionCheckpointFixture.sql" > /dev/null
docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -c 'alter table subscriptions add column notes text, add column paid boolean' > /dev/null
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < "$root/supabase/migrations/20261118090000_subscription_usage_checkpoint.sql" > /dev/null
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < "$root/supabase/migrations/20261119090000_admin_historical_attendance_correction.sql" > /dev/null
sub=10000000-0000-0000-0000-000000000001
student=30000000-0000-0000-0000-000000000001
att=40000000-0000-0000-0000-000000000001
docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -c "insert into subscriptions(id,student_id,group_id,plan_type,end_date,original_end_date,total_trainings,used_trainings) values ('$sub','$student','g','4pack','2026-02-01','2026-02-01',2,0); insert into attendance(id,student_id,group_id,date,sub_id,entry_type,quantity) values ('$att','$student','g','2026-01-10','$sub','subscription',1)" > /dev/null
docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -c "begin; select crm_admin_correct_historical_attendance('$att',2); select pg_sleep(3); commit" > "$tmp/first" 2>&1 &
first=$!
sleep 0.5
docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -c "select crm_admin_correct_historical_attendance('$att',1)" > "$tmp/second" 2>&1 &
second=$!
wait "$first"
wait "$second"
result=$(docker exec "$container" psql -U postgres -At -c "select (select quantity from attendance where id='$att'),used_trainings,end_date,usage_expiry_state from subscriptions where id='$sub'")
if [ "$result" != '1|1|2026-02-01|ready' ]; then echo "Unexpected state: $result" >&2; exit 1; fi
echo 'Concurrent corrections preserve canonical usage and expiry.'
