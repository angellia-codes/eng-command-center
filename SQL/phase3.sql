-- ============================================================
-- Phase 3 Database Migration
-- Engineering Command Center — Nourish Group Indonesia
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 3.7  Work Order Comments / Notes
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_order_comments (
    id          SERIAL       PRIMARY KEY,
    wo_id       VARCHAR(20)  NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    comment     TEXT         NOT NULL,
    created_by  VARCHAR(100) NOT NULL,
    user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wo_comments_wo_id     ON work_order_comments(wo_id);
CREATE INDEX IF NOT EXISTS idx_wo_comments_created_at ON work_order_comments(created_at DESC);

ALTER TABLE work_order_comments ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read and write comments
CREATE POLICY "comments_select" ON work_order_comments
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "comments_insert" ON work_order_comments
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
