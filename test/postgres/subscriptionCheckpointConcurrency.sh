#!/usr/bin/env bash
# Run only against a fresh disposable PostgreSQL container.
set -euo pipefail
container=${CHECKPOINT_PG_CONTAINER:?Set CHECKPOINT_PG_CONTAINER to a fresh disposable PostgreSQL container}
root=$(cd "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < "$root/test/postgres/subscriptionCheckpointFixture.sql" > /dev/null
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < "$root/supabase/migrations/20261118090000_subscription_usage_checkpoint.sql" > /dev/null
sub=10000000-0000-0000-0000-000000000001
docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -c "insert into subscriptions(id,group_id,plan_type,end_date,original_end_date,total_trainings,used_trainings) values ('$sub','g','4pack','2026-02-01','2026-02-01',2,0)" > /dev/null
docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -c "begin; insert into attendance(sub_id,date,quantity) values ('$sub','2026-01-10',1); select pg_sleep(3); commit" > "$tmp/first" 2>&1 &
first=$!
sleep 0.5
docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -c "insert into attendance(sub_id,date,quantity) values ('$sub','2026-01-11',1)" > "$tmp/second" 2>&1 &
second=$!
wait "$first"
wait "$second"
result=$(docker exec "$container" psql -U postgres -At -c "select used_trainings,end_date,usage_expiry_checkpoint,usage_expiry_state from subscriptions where id='$sub'")
if [ "$result" != '2|2026-01-11|2026-02-01|captured' ]; then echo "Unexpected state: $result" >&2; exit 1; fi
echo 'Concurrent mutations preserve canonical usage and expiry.'
