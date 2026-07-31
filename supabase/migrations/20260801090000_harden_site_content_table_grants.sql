begin;

revoke all privileges on table public.site_pages
from anon, public;

revoke all privileges on table public.site_direction_profiles
from anon, public;

revoke all privileges on table public.site_trainer_profiles
from anon, public;

commit;
