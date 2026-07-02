// ─── Summary Counts ───────────────────────────────────────────────────────────

export const getActiveClientsCountTx = async (conn) => {
    const [[row]] = await conn.query(
        `SELECT COUNT(*) AS total
         FROM clients
         WHERE status = 'active'
           AND COALESCE(is_deleted, 0) = 0`
    );
    return Number(row.total);
};

export const getAssignedSystemsCountTx = async (conn) => {
    const [[row]] = await conn.query(
        `SELECT COUNT(*) AS total
         FROM agreement_systems
         WHERE is_active = 1`
    );
    return Number(row.total);
};

export const getAssignedAssetsCountTx = async (conn) => {
    const [[row]] = await conn.query(
        `SELECT COUNT(*) AS total
         FROM agreement_assets
         WHERE is_active = 1`
    );
    return Number(row.total);
};

export const getAssignedGatewaysCountTx = async (conn) => {
    const [[row]] = await conn.query(
        `SELECT COUNT(*) AS total
         FROM agreement_gsm_gateways
         WHERE is_active = 1`
    );
    return Number(row.total);
};

export const getAssignedServersCountTx = async (conn) => {
    const [[row]] = await conn.query(
        `SELECT COUNT(*) AS total
         FROM agreement_servers
         WHERE is_active = 1`
    );
    return Number(row.total);
};

// ─── Assignment Detail Lists ──────────────────────────────────────────────────

export const getSystemAssignmentsTx = async (conn) => {
    const [rows] = await conn.query(
        `SELECT
            ag_s.system_id,
            s.system_uid,
            s.device_type                    AS system_name,
            ag_s.system_price,
            ag_s.agreement_id,
            agr.status AS agreement_status,
            c.id                             AS client_id,
            c.full_name AS client_name
         FROM agreement_systems ag_s
         INNER JOIN agreements agr
            ON agr.agreement_id = ag_s.agreement_id
         INNER JOIN clients c
            ON c.id = agr.client_id
           AND COALESCE(c.is_deleted, 0) = 0
         LEFT JOIN systems s
            ON s.id = ag_s.system_id
         WHERE ag_s.is_active = 1
         ORDER BY ag_s.id ASC`
    );
    return rows;
};

export const getAssetAssignmentsTx = async (conn) => {
    const [rows] = await conn.query(
        `SELECT
            ag_a.asset_id,
            i.brand,
            i.model,
            i.serial_number,
            t.name                           AS asset_category_name,
            ag_a.asset_price,
            ag_a.agreement_id,
            agr.status AS agreement_status,
            c.id                             AS client_id,
            c.full_Name as client_name
         FROM agreement_assets ag_a
         INNER JOIN agreements agr
            ON agr.agreement_id = ag_a.agreement_id

         INNER JOIN clients c
            ON c.id = agr.client_id
           AND COALESCE(c.is_deleted, 0) = 0
         LEFT JOIN assets i
            ON i.asset_id = ag_a.asset_id
           AND COALESCE(i.is_deleted, 0) = 0
         LEFT JOIN asset_category t
            ON t.id = i.asset_category_id
         WHERE ag_a.is_active = 1
         ORDER BY ag_a.id ASC`
    );
    return rows;
};

export const getGatewayAssignmentsTx = async (conn) => {
    const [rows] = await conn.query(
        `SELECT
            ag_g.gateway_id,
            g.gateway_name,
            g.model_number,
            ag_g.allocated_quantity,
            ag_g.price_per_unit,
            ag_g.total_price,
            ag_g.agreement_id,
            agr.status AS agreement_status,
            c.id  AS client_id,
            c.full_name AS client_name

         FROM agreement_gsm_gateways ag_g
         INNER JOIN agreements agr
            ON agr.agreement_id = ag_g.agreement_id
         INNER JOIN clients c
            ON c.id = agr.client_id
           AND COALESCE(c.is_deleted, 0) = 0
         LEFT JOIN gsm_gateways g
            ON g.id = ag_g.gateway_id
           AND COALESCE(g.is_deleted, 0) = 0
         WHERE ag_g.is_active = 1
         ORDER BY ag_g.id ASC`
    );
    return rows;
};

export const getServerAssignmentsTx = async (conn) => {
    const [rows] = await conn.query(
        `SELECT
            ag_sv.server_id,
            sv.server_name,
            sv.brand,
            sv.processor,
            ag_sv.allocated_quantity,
            ag_sv.price_per_unit,
            ag_sv.total_price,
            ag_sv.agreement_id,
            agr.status AS agreement_status,
            c.id                             AS client_id,
            c.full_name AS client_name
         FROM agreement_servers ag_sv
         INNER JOIN agreements agr
            ON agr.agreement_id = ag_sv.agreement_id
         INNER JOIN clients c
            ON c.id = agr.client_id
           AND COALESCE(c.is_deleted, 0) = 0
         LEFT JOIN servers sv
            ON sv.id = ag_sv.server_id
           AND COALESCE(sv.is_deleted, 0) = 0
         WHERE ag_sv.is_active = 1
         ORDER BY ag_sv.id ASC`
    );
    return rows;
};