-- ═══════════════════════════════════════════
-- DANCE STUDIO MANAGER — DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════

-- 1. STUDENTS
CREATE TABLE students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  telegram TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. GROUPS
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  direction_id TEXT NOT NULL,
  schedule JSONB DEFAULT '[]'::jsonb,
  trainer_pct INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SUBSCRIPTIONS
CREATE TABLE subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL DEFAULT '8pack',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_trainings INTEGER NOT NULL DEFAULT 8,
  used_trainings INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL DEFAULT 0,
  base_price INTEGER DEFAULT 0,
  discount_pct INTEGER DEFAULT 0,
  discount_source TEXT DEFAULT 'studio',
  paid BOOLEAN DEFAULT FALSE,
  pay_method TEXT DEFAULT 'card',
  notification_sent BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. ATTENDANCE
CREATE TABLE attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sub_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  guest_name TEXT,
  guest_type TEXT,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CANCELLED TRAININGS
CREATE TABLE cancelled_trainings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. MODIFICATION LOG
CREATE TABLE mod_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sub_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════
-- INSERT DEFAULT GROUPS
-- ═══════════════════════════════════════════
INSERT INTO groups (id, name, direction_id, schedule, trainer_pct) VALUES
  ('lat-base-am', 'Latin base (ранкова)', 'latina', '[{"day":2,"time":"09:50"},{"day":4,"time":"09:50"}]', 50),
  ('lat-base-pm', 'Latin base (вечірня)', 'latina', '[{"day":1,"time":"16:50"},{"day":5,"time":"16:50"}]', 50),
  ('lat-mix-am', 'Latin mix (ранкова)', 'latina', '[{"day":1,"time":"10:00"},{"day":3,"time":"10:00"},{"day":5,"time":"10:00"}]', 50),
  ('lat-mix-pm1', 'Latin mix (вечірня 18:00)', 'latina', '[{"day":1,"time":"18:00"},{"day":3,"time":"18:00"},{"day":5,"time":"18:00"}]', 50),
  ('lat-mix-pm2', 'Latin mix (вечірня 19:10)', 'latina', '[{"day":1,"time":"19:10"},{"day":3,"time":"19:10"},{"day":5,"time":"19:10"}]', 50),
  ('bach-base', 'Bachata base', 'bachata', '[{"day":2,"time":"18:05"},{"day":4,"time":"18:05"}]', 50),
  ('bach-mix2', 'Bachata mix 2', 'bachata', '[{"day":2,"time":"11:00"},{"day":4,"time":"11:00"}]', 50),
  ('bach-mix1', 'Bachata mix 1', 'bachata', '[{"day":1,"time":"11:00"},{"day":5,"time":"11:00"}]', 50),
  ('heels-base', 'High Heels base', 'heels', '[{"day":2,"time":"20:20"},{"day":4,"time":"20:20"}]', 50),
  ('heels-mix', 'High Heels mix', 'heels', '[{"day":2,"time":"19:15"},{"day":4,"time":"19:15"}]', 50),
  ('kpop1', 'K-pop Cover Dance', 'kpop', '[{"day":6,"time":"15:00"},{"day":0,"time":"15:00"}]', 50),
  ('jazz1', 'Jazz Funk mix', 'jazzfunk', '[{"day":6,"time":"14:00"},{"day":0,"time":"14:00"}]', 50),
  ('dance1', 'Dancehall Female', 'dancehall', '[{"day":2,"time":"17:00"},{"day":4,"time":"17:00"}]', 50);

-- ═══════════════════════════════════════════
-- ROW LEVEL SECURITY (public access via anon key)
-- For now: allow all operations (single-user app)
-- Later: add auth and restrict per user/role
-- ═══════════════════════════════════════════
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE cancelled_trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE mod_log ENABLE ROW LEVEL SECURITY;

-- Public policies (will tighten when auth is added)
CREATE POLICY "Allow all on students" ON students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on groups" ON groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on subscriptions" ON subscriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on attendance" ON attendance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on cancelled_trainings" ON cancelled_trainings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on mod_log" ON mod_log FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════
-- INDEXES for performance
-- ═══════════════════════════════════════════
CREATE INDEX idx_subs_student ON subscriptions(student_id);
CREATE INDEX idx_subs_group ON subscriptions(group_id);
CREATE INDEX idx_subs_dates ON subscriptions(start_date, end_date);
CREATE INDEX idx_attn_date ON attendance(date);
CREATE INDEX idx_attn_sub ON attendance(sub_id);
CREATE INDEX idx_cancelled_group_date ON cancelled_trainings(group_id, date);
