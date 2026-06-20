-- ============================================================
-- Phase 2 Database Migration
-- Engineering Command Center — Nourish Group Indonesia
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 2.1  Supabase Storage bucket for work order photos
-- ────────────────────────────────────────────────────────────
-- Run these in the Supabase dashboard → Storage, or via the API.
-- Cannot be created via SQL. Instructions:
--
--  1. Dashboard → Storage → New Bucket
--     Name:   wo-photos
--     Public: true   (allows direct URL access for photo display)
--
--  2. Storage → Policies → wo-photos → New policy
--     Operation : INSERT
--     Target    : authenticated
--     Expression: true
--
--  3. Storage → Policies → wo-photos → New policy
--     Operation : SELECT
--     Target    : public
--     Expression: true


-- ────────────────────────────────────────────────────────────
-- 2.2  PM → WO linkage
-- ────────────────────────────────────────────────────────────
ALTER TABLE work_orders
    ADD COLUMN IF NOT EXISTS schedule_id INTEGER
        REFERENCES maintenance_schedule(id) ON DELETE SET NULL;


-- ────────────────────────────────────────────────────────────
-- 2.8  Work Order type field
-- ────────────────────────────────────────────────────────────
ALTER TABLE work_orders
    ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'Corrective'
        CHECK (type IN ('Corrective', 'Preventive', 'Emergency', 'Project'));


-- ────────────────────────────────────────────────────────────
-- 2.6  Engineering Requests table
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS engineering_requests (
    id            VARCHAR(20)  PRIMARY KEY,          -- e.g. ER-0001
    outlet        VARCHAR(100) NOT NULL,
    department    VARCHAR(100),
    location      VARCHAR(200),
    description   TEXT         NOT NULL,
    priority      VARCHAR(20)  DEFAULT 'Medium'
                      CHECK (priority IN ('Low', 'Medium', 'High', 'Emergency')),
    status        VARCHAR(30)  DEFAULT 'Pending'
                      CHECK (status IN ('Pending', 'In Review', 'Converted to WO', 'Rejected', 'Closed')),
    created_by    VARCHAR(100) NOT NULL,
    user_id       UUID         REFERENCES users(id) ON DELETE SET NULL,
    assigned_wo_id VARCHAR(20) REFERENCES work_orders(id) ON DELETE SET NULL,
    notes         TEXT,
    created_at    TIMESTAMPTZ  DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────
-- 2.9  Outlets master table
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outlets (
    id         SERIAL       PRIMARY KEY,
    name       VARCHAR(100) NOT NULL UNIQUE,
    code       VARCHAR(20),
    active     BOOLEAN      DEFAULT TRUE,
    sort_order INTEGER      DEFAULT 0
);

-- Seed with current outlet list
INSERT INTO outlets (name, code, sort_order) VALUES
    ('Nourish Ungasan',         'NGI-UNG',  1),
    ('Nourish Uluwatu',         'NGI-ULW',  2),
    ('Nourish Berawa',          'NGI-BRW',  3),
    ('Nourish Central Kitchen', 'NGI-CK',   4),
    ('The Bakery Uluwatu',      'TBK-ULW',  5),
    ('The Bakery Kitchen',      'TBK-K',    6),
    ('Nourish Office',          'NGI-OFF',  7),
    ('Engineering Dept',        'NGI-ENG',  8)
ON CONFLICT (name) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- Missing indexes (from audit report)
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wo_status      ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_wo_outlet      ON work_orders(outlet);
CREATE INDEX IF NOT EXISTS idx_wo_created_at  ON work_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wo_asset_id    ON work_orders(asset_id);
CREATE INDEX IF NOT EXISTS idx_wo_schedule_id ON work_orders(schedule_id);

CREATE INDEX IF NOT EXISTS idx_pm_next_date   ON maintenance_schedule(next_date);
CREATE INDEX IF NOT EXISTS idx_pm_status      ON maintenance_schedule(status);

CREATE INDEX IF NOT EXISTS idx_audit_ts       ON audit_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user     ON audit_log(user_id);

CREATE INDEX IF NOT EXISTS idx_assets_outlet  ON assets(outlet);
CREATE INDEX IF NOT EXISTS idx_assets_status  ON assets(status);

CREATE INDEX IF NOT EXISTS idx_er_status      ON engineering_requests(status);
CREATE INDEX IF NOT EXISTS idx_er_created_at  ON engineering_requests(created_at DESC);


-- ────────────────────────────────────────────────────────────
-- Row Level Security — minimum viable policies
-- (Adjust to match your exact role model)
-- ────────────────────────────────────────────────────────────

-- Enable RLS on new tables
ALTER TABLE engineering_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlets               ENABLE ROW LEVEL SECURITY;

-- engineering_requests: authenticated users can read all; only owner can insert
CREATE POLICY "er_select_authenticated"
    ON engineering_requests FOR SELECT
    TO authenticated USING (true);

CREATE POLICY "er_insert_authenticated"
    ON engineering_requests FOR INSERT
    TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "er_update_authenticated"
    ON engineering_requests FOR UPDATE
    TO authenticated USING (true);

-- outlets: public read, admin write only
CREATE POLICY "outlets_select_all"
    ON outlets FOR SELECT
    USING (true);
