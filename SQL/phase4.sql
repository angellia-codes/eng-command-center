-- ============================================================
-- Phase 4 Database Migration
-- Engineering Command Center — Nourish Group Indonesia
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 4.3  PM Compliance RPC
-- Returns compliance % per outlet for WOs generated from PM schedules.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_pm_compliance(
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to   TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    outlet          TEXT,
    total_pm        BIGINT,
    completed       BIGINT,
    on_time         BIGINT,
    compliance_pct  NUMERIC
)
LANGUAGE SQL
STABLE
AS $$
    SELECT
        wo.outlet::TEXT,
        COUNT(*)                                                        AS total_pm,
        COUNT(CASE WHEN wo.status = 'Completed' THEN 1 END)            AS completed,
        COUNT(
            CASE WHEN wo.status = 'Completed'
                      AND wo.completed_at IS NOT NULL
                      AND wo.target_date  IS NOT NULL
                      AND wo.completed_at::date <= wo.target_date::date
                 THEN 1 END
        )                                                               AS on_time,
        ROUND(
            100.0 * COUNT(
                CASE WHEN wo.status = 'Completed'
                          AND wo.completed_at IS NOT NULL
                          AND wo.target_date  IS NOT NULL
                          AND wo.completed_at::date <= wo.target_date::date
                     THEN 1 END
            ) / NULLIF(COUNT(CASE WHEN wo.status = 'Completed' THEN 1 END), 0),
        1)                                                              AS compliance_pct
    FROM work_orders wo
    WHERE wo.schedule_id IS NOT NULL
      AND (p_from IS NULL OR wo.created_at >= p_from)
      AND (p_to   IS NULL OR wo.created_at <= p_to)
    GROUP BY wo.outlet
    ORDER BY compliance_pct DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION get_pm_compliance TO authenticated;


-- ────────────────────────────────────────────────────────────
-- 4.7  Financial summary view (optional — used as fallback if
--       client-side aggregation is insufficient)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_cost_by_category AS
SELECT
    COALESCE(a.category, 'Non-Registered') AS category,
    SUM(wo.cost)                            AS total_cost,
    COUNT(*)                                AS wo_count
FROM work_orders wo
LEFT JOIN assets a ON a.id = wo.asset_id
WHERE wo.cost IS NOT NULL AND wo.cost > 0
GROUP BY COALESCE(a.category, 'Non-Registered')
ORDER BY total_cost DESC;
