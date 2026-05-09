create table if not exists attendance_warned_students (
  group_id text not null,
  student_id text not null,
  warned boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (group_id, student_id)
);

create index if not exists attendance_warned_students_warned_idx
  on attendance_warned_students (warned);
