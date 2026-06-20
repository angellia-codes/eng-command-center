-- ============================================================
-- Phase 5 Database Migration
-- Engineering Command Center — Nourish Group Indonesia
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 5.1  Inventory / Spare Parts
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spare_parts (
    id            SERIAL       PRIMARY KEY,
    part_code     VARCHAR(50)  UNIQUE,
    name          VARCHAR(200) NOT NULL,
    category      VARCHAR(100),
    unit          VARCHAR(30)  DEFAULT 'pcs',
    outlet        VARCHAR(100),
    location      VARCHAR(200),
    min_stock     INTEGER      DEFAULT 0,
    current_stock INTEGER      DEFAULT 0,
    notes         TEXT,
    active        BOOLEAN      DEFAULT TRUE,
    created_at    TIMESTAMPTZ  DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id          SERIAL       PRIMARY KEY,
    part_id     INTEGER      NOT NULL REFERENCES spare_parts(id) ON DELETE CASCADE,
    type        VARCHAR(20)  NOT NULL CHECK (type IN ('in','out','transfer','adjustment')),
    qty         INTEGER      NOT NULL CHECK (qty > 0),
    reference   VARCHAR(200),          -- WO number, PO number, or free text
    notes       TEXT,
    created_by  VARCHAR(100) NOT NULL,
    user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spare_parts_outlet  ON spare_parts(outlet);
CREATE INDEX IF NOT EXISTS idx_spare_parts_active  ON spare_parts(active);
CREATE INDEX IF NOT EXISTS idx_stock_mov_part_id   ON stock_movements(part_id);
CREATE INDEX IF NOT EXISTS idx_stock_mov_created   ON stock_movements(created_at DESC);


-- ────────────────────────────────────────────────────────────
-- 5.2  Vendor Management
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
    id                 SERIAL       PRIMARY KEY,
    name               VARCHAR(200) NOT NULL,
    category           VARCHAR(100),
    contact_person     VARCHAR(150),
    phone              VARCHAR(50),
    email              VARCHAR(150),
    address            TEXT,
    contract_start     DATE,
    contract_end       DATE,
    performance_rating SMALLINT     CHECK (performance_rating BETWEEN 1 AND 5),
    notes              TEXT,
    active             BOOLEAN      DEFAULT TRUE,
    created_at         TIMESTAMPTZ  DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_active       ON vendors(active);
CREATE INDEX IF NOT EXISTS idx_vendors_contract_end ON vendors(contract_end);


-- ────────────────────────────────────────────────────────────
-- 5.3  Daily Engineering Updates
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_updates (
    id               SERIAL       PRIMARY KEY,
    date             DATE         NOT NULL DEFAULT CURRENT_DATE,
    outlet           VARCHAR(100) NOT NULL,
    engineer_name    VARCHAR(150) NOT NULL,
    issues_found     TEXT,
    work_completed   TEXT,
    ongoing_projects TEXT,
    pending_items    TEXT,
    target_completion DATE,
    created_by       VARCHAR(100) NOT NULL,
    user_id          UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ  DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (date, outlet)   -- one update per outlet per day
);

CREATE INDEX IF NOT EXISTS idx_daily_updates_date   ON daily_updates(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_updates_outlet ON daily_updates(outlet);


-- ────────────────────────────────────────────────────────────
-- 5.4  Comprehensive Row Level Security Policies
-- ────────────────────────────────────────────────────────────
-- Enable RLS on every table that doesn't have it yet
ALTER TABLE work_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE spare_parts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_updates        ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user an admin or manager?
CREATE OR REPLACE FUNCTION is_admin_or_manager()
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid()
          AND role IN ('admin', 'manager')
          AND active = TRUE
    );
$$;

-- Helper: is the current user active?
CREATE OR REPLACE FUNCTION is_active_user()
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND active = TRUE);
$$;

-- ── work_orders ─────────────────────────────────────────────
DROP POLICY IF EXISTS "wo_select" ON work_orders;
DROP POLICY IF EXISTS "wo_insert" ON work_orders;
DROP POLICY IF EXISTS "wo_update" ON work_orders;
DROP POLICY IF EXISTS "wo_delete" ON work_orders;

CREATE POLICY "wo_select" ON work_orders FOR SELECT
    TO authenticated USING (is_active_user());

CREATE POLICY "wo_insert" ON work_orders FOR INSERT
    TO authenticated WITH CHECK (is_active_user() AND auth.uid() = user_id);

CREATE POLICY "wo_update" ON work_orders FOR UPDATE
    TO authenticated USING (is_active_user());

CREATE POLICY "wo_delete" ON work_orders FOR DELETE
    TO authenticated USING (is_admin_or_manager());

-- ── assets ──────────────────────────────────────────────────
CREATE POLICY "assets_select" ON assets FOR SELECT
    TO authenticated USING (is_active_user());

CREATE POLICY "assets_insert" ON assets FOR INSERT
    TO authenticated WITH CHECK (is_admin_or_manager());

CREATE POLICY "assets_update" ON assets FOR UPDATE
    TO authenticated USING (is_admin_or_manager());

CREATE POLICY "assets_delete" ON assets FOR DELETE
    TO authenticated USING (is_admin_or_manager());

-- ── maintenance_schedule ────────────────────────────────────
CREATE POLICY "pm_select" ON maintenance_schedule FOR SELECT
    TO authenticated USING (is_active_user());

CREATE POLICY "pm_insert" ON maintenance_schedule FOR INSERT
    TO authenticated WITH CHECK (is_admin_or_manager());

CREATE POLICY "pm_update" ON maintenance_schedule FOR UPDATE
    TO authenticated USING (is_admin_or_manager());

CREATE POLICY "pm_delete" ON maintenance_schedule FOR DELETE
    TO authenticated USING (is_admin_or_manager());

-- ── purchase_requests ───────────────────────────────────────
CREATE POLICY "pr_select" ON purchase_requests FOR SELECT
    TO authenticated USING (is_active_user());

CREATE POLICY "pr_insert" ON purchase_requests FOR INSERT
    TO authenticated WITH CHECK (is_active_user() AND auth.uid() = user_id);

CREATE POLICY "pr_update" ON purchase_requests FOR UPDATE
    TO authenticated USING (is_admin_or_manager());

-- ── audit_log ───────────────────────────────────────────────
CREATE POLICY "audit_select" ON audit_log FOR SELECT
    TO authenticated USING (is_active_user());

CREATE POLICY "audit_insert" ON audit_log FOR INSERT
    TO authenticated WITH CHECK (is_active_user());

-- No UPDATE or DELETE on audit_log — immutable trail

-- ── users ───────────────────────────────────────────────────
CREATE POLICY "users_select" ON users FOR SELECT
    TO authenticated USING (TRUE);  -- anyone can read user list for dropdowns

CREATE POLICY "users_update" ON users FOR UPDATE
    TO authenticated USING (is_admin_or_manager());

-- ── spare_parts ─────────────────────────────────────────────
CREATE POLICY "parts_select" ON spare_parts FOR SELECT
    TO authenticated USING (is_active_user());

CREATE POLICY "parts_insert" ON spare_parts FOR INSERT
    TO authenticated WITH CHECK (is_admin_or_manager());

CREATE POLICY "parts_update" ON spare_parts FOR UPDATE
    TO authenticated USING (is_admin_or_manager());

-- ── stock_movements ─────────────────────────────────────────
CREATE POLICY "movements_select" ON stock_movements FOR SELECT
    TO authenticated USING (is_active_user());

CREATE POLICY "movements_insert" ON stock_movements FOR INSERT
    TO authenticated WITH CHECK (is_active_user() AND auth.uid() = user_id);

-- ── vendors ─────────────────────────────────────────────────
CREATE POLICY "vendors_select" ON vendors FOR SELECT
    TO authenticated USING (is_active_user());

CREATE POLICY "vendors_insert" ON vendors FOR INSERT
    TO authenticated WITH CHECK (is_admin_or_manager());

CREATE POLICY "vendors_update" ON vendors FOR UPDATE
    TO authenticated USING (is_admin_or_manager());

-- ── daily_updates ───────────────────────────────────────────
CREATE POLICY "daily_select" ON daily_updates FOR SELECT
    TO authenticated USING (is_active_user());

CREATE POLICY "daily_insert" ON daily_updates FOR INSERT
    TO authenticated WITH CHECK (is_active_user() AND auth.uid() = user_id);

CREATE POLICY "daily_update" ON daily_updates FOR UPDATE
    TO authenticated USING (
        auth.uid() = user_id OR is_admin_or_manager()
    );
