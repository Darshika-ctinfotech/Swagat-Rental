import { pool } from "../../config/db.js";

export const createAgreement = async (conn, data) => {
    const [result] = await conn.query(
        `INSERT INTO agreements
        (agreement_unique_id, client_id, rent_amount, billing_cycle_day, agreement_start_date, agreement_end_date, payment_type, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            data.agreement_unique_id,
            data.client_id,
            data.rent_amount,
            data.billing_cycle_day,
            data.agreement_start_date,
            data.agreement_end_date,
            data.payment_type || "prepaid",
            data.status,
            data.created_by,
        ]
    );

    return result.insertId;
};

export const deactivateClientAgreements = async (conn, clientId) => {
    await conn.query(
        `UPDATE agreements 
        SET status = 'terminated' 
        WHERE client_id = ? AND status = 'active'`,
        [clientId]
    );
};

export const listAgreements = async ({ search, status, client_id, page, limit }) => {
    const offset = (page - 1) * limit;

    let where = `WHERE 1=1`;
    const values = [];

    if (client_id) {
        where += ` AND a.client_id = ?`;
        values.push(client_id);
    }

    if (search) {
        where += ` AND (c.full_name LIKE ? OR c.email LIKE ?)`;
        values.push(`%${search}%`, `%${search}%`);
    }

    if (status) {
        where += ` AND a.status = ?`;
        values.push(status);
    }

    const [countResult] = await pool.query(
        `SELECT COUNT(*) as total
     FROM agreements a
     JOIN clients c ON c.id = a.client_id
     ${where}`,
        values
    );

    const total = countResult[0].total;

    const [rows] = await pool.query(
        `SELECT 
        a.*,
        c.full_name,
        c.email,
        c.u_unique_id
        FROM agreements a
        JOIN clients c ON c.id = a.client_id
        ${where}
        ORDER BY a.agreement_id DESC
        LIMIT ? OFFSET ?`,
        [...values, limit, offset]
    );

    return {
        data: rows,
        pagination: {
            total,
            page,
            limit,
            total_pages: Math.ceil(total / limit),
        },
    };
};

export const getAgreementById = async (agreementId) => {
    const [rows] = await pool.query(
        `SELECT a.*, c.full_name, c.email
        FROM agreements a
        JOIN clients c ON c.id = a.client_id
        WHERE a.agreement_id = ?`,
        [agreementId]
    );

    return rows[0];
};

export const getAgreementByIdTx = async (conn, agreementId) => {
    const [rows] = await conn.query(
        `SELECT a.*, c.full_name, c.email, c.u_unique_id FROM agreements a
        JOIN clients c ON c.id = a.client_id
        WHERE a.agreement_id = ?`,
        [agreementId]
    );

    return rows[0];
};

export const getActiveAgreementForClientTx = async (
    conn,
    clientId,
    excludeAgreementId = null
) => {
    const params = [clientId];
    let excludeClause = "";
    if (excludeAgreementId !== null && excludeAgreementId !== undefined) {
        excludeClause = " AND agreement_id <> ?";
        params.push(excludeAgreementId);
    }

    const [rows] = await conn.query(
        `
        SELECT agreement_id, client_id, status, terminated_at
        FROM agreements
        WHERE client_id = ?
          AND LOWER(status) = 'active'
          AND terminated_at IS NULL
          ${excludeClause}
        ORDER BY agreement_id DESC
        LIMIT 1
        `,
        params
    );

    return rows[0] || null;
};

export const updateAgreementStatusTx = async (conn, agreementId, status) => {
    await conn.query(
        `UPDATE agreements SET status = ? WHERE agreement_id = ?`,
        [status, agreementId]
    );
};

export const setAgreementTerminationTx = async (
    conn,
    agreementId,
    { terminated_at, status }
) => {
    await conn.query(
        `UPDATE agreements
         SET status = ?, terminated_at = ?
         WHERE agreement_id = ?`,
        [status, terminated_at, agreementId]
    );
};

export const updateAgreementTx = async (conn, agreementId, data) => {
    const fields = Object.keys(data)
        .map((key) => `${key} = ?`)
        .join(", ");

    const values = [...Object.values(data), agreementId];

    await conn.query(
        `UPDATE agreements SET ${fields} WHERE agreement_id = ?`,
        values
    );
};
//========================================================================
//Code By Darshika 
//For Updating Agreements Price 
// ─── Price Update Transactions ───────────────────────────────────────────────

export const updateSystemPriceTx = async (conn, agreementId, systemId, price) => {
    const [result] = await conn.query(
        `UPDATE agreement_systems
         SET system_price = ?
         WHERE agreement_id = ?
           AND system_id = ?
           AND COALESCE(is_active, 1) = 1
           AND effective_to IS NULL`,
        [price, agreementId, systemId]
    );
    return result.affectedRows;
};

export const updateAssetPriceTx = async (conn, agreementId, assetId, price) => {
    const [result] = await conn.query(
        `UPDATE agreement_assets
         SET asset_price = ?
         WHERE agreement_id = ?
           AND asset_id = ?
           AND COALESCE(is_active, 1) = 1
           AND effective_to IS NULL`,
        [price, agreementId, assetId]
    );
    return result.affectedRows;
};

export const updateGatewayPriceTx = async (conn, agreementId, gatewayId, pricePerUnit) => {
    // fetch allocated_quantity first to calculate total_price
    const [[row]] = await conn.query(
        `SELECT allocated_quantity
         FROM agreement_gsm_gateways
         WHERE agreement_id = ?
           AND gateway_id = ?
           AND COALESCE(is_active, 1) = 1
           AND effective_to IS NULL`,
        [agreementId, gatewayId]
    );

    if (!row) return 0;

    const totalPrice = Number(row.allocated_quantity) * Number(pricePerUnit);

    const [result] = await conn.query(
        `UPDATE agreement_gsm_gateways
         SET price_per_unit = ?
         WHERE agreement_id = ?
           AND gateway_id   = ?
           AND COALESCE(is_active, 1) = 1
           AND effective_to IS NULL`,
        [pricePerUnit, agreementId, gatewayId]
    );
    return result.affectedRows;
};

export const updateServerPriceTx = async (conn, agreementId, serverId, pricePerUnit) => {
    const [[row]] = await conn.query(
        `SELECT allocated_quantity
         FROM agreement_servers
         WHERE agreement_id = ?
           AND server_id = ?
           AND COALESCE(is_active, 1) = 1
           AND effective_to IS NULL`,
        [agreementId, serverId]
    );

    if (!row) return 0;

    const totalPrice = Number(row.allocated_quantity) * Number(pricePerUnit);

    const [result] = await conn.query(
        `UPDATE agreement_servers
         SET price_per_unit = ?
         WHERE agreement_id = ?
           AND server_id    = ?
           AND COALESCE(is_active, 1) = 1
           AND effective_to IS NULL`,
        [pricePerUnit, agreementId, serverId]
    );
    return result.affectedRows;
};

// ─── Recalculate rent_amount from all 4 tables ───────────────────────────────

export const recalculateRentAmountTx = async (conn, agreementId) => {
    const [[result]] = await conn.query(
        `SELECT
            COALESCE((
                SELECT SUM(system_price)
                FROM agreement_systems
                WHERE agreement_id = ?
                  AND COALESCE(is_active, 1) = 1
                  AND effective_to IS NULL
            ), 0) +
            COALESCE((
                SELECT SUM(asset_price)
                FROM agreement_assets
                WHERE agreement_id = ?
                  AND COALESCE(is_active, 1) = 1
                  AND effective_to IS NULL
            ), 0) +
            COALESCE((
                SELECT SUM(total_price)
                FROM agreement_gsm_gateways
                WHERE agreement_id = ?
                  AND COALESCE(is_active, 1) = 1
                  AND effective_to IS NULL
            ), 0) +
            COALESCE((
                SELECT SUM(total_price)
                FROM agreement_servers
                WHERE agreement_id = ?
                  AND COALESCE(is_active, 1) = 1
                  AND effective_to IS NULL
            ), 0) AS total_rent`,
        [agreementId, agreementId, agreementId, agreementId]
    );

    const newRent = Number(result.total_rent || 0);

    await conn.query(
        `UPDATE agreements SET rent_amount = ? WHERE agreement_id = ?`,
        [newRent, agreementId]
    );

    return newRent;
};

export const getAgreementByIdTxx = async (conn, agreementId) => {
    const [[row]] = await conn.query(
        `SELECT agreement_id, status FROM agreements WHERE agreement_id = ?`,
        [agreementId]
    );
    return row || null;

};
//========================================================================
export const deleteAgreementSystemsTx = async (conn, agreementId) => {
    await conn.query(`DELETE FROM agreement_systems WHERE agreement_id = ?`, [
        agreementId,
    ]);
};

export const deleteAgreementGsmGatewaysTx = async (conn, agreementId) => {
    await conn.query(
        `DELETE FROM agreement_gsm_gateways WHERE agreement_id = ?`,
        [agreementId]
    );
};

export const deleteAgreementServersTx = async (conn, agreementId) => {
    await conn.query(`DELETE FROM agreement_servers WHERE agreement_id = ?`, [
        agreementId,
    ]);
};

export const deleteAgreementAssetsTx = async (conn, agreementId) => {
    await conn.query(`DELETE FROM agreement_assets WHERE agreement_id = ?`, [
        agreementId,
    ]);
};

export const getAgreementSystemsTx = async (conn, agreementId) => {
    const [rows] = await conn.query(
        `
        SELECT
          a.system_id,
          a.system_price,
          s.system_uid,
          s.system_uuid,
          s.device_type
        FROM agreement_systems a
        LEFT JOIN systems s
          ON s.id = a.system_id
         AND s.is_deleted = 0
        WHERE a.agreement_id = ?
          AND COALESCE(a.is_active, 1) = 1
          AND a.effective_to IS NULL
        ORDER BY a.id ASC
        `,
        [agreementId]
    );
    return rows;
};

export const getAgreementAssetsTx = async (conn, agreementId) => {
    const [rows] = await conn.query(
        `
        SELECT
          a.asset_id,
          a.asset_price,
          i.asset_category_id,
          t.name AS asset_category_name,
          i.brand,
          i.model,
          i.size,
          i.serial_number,
          i.manufacturer,
          i.spec_json
        FROM agreement_assets a
        LEFT JOIN assets i
          ON i.asset_id = a.asset_id
         AND i.is_deleted = 0
        LEFT JOIN asset_category t
          ON t.id = i.asset_category_id
        WHERE a.agreement_id = ?
          AND COALESCE(a.is_active, 1) = 1
          AND a.effective_to IS NULL
        ORDER BY a.id ASC
        `,
        [agreementId]
    );
    return rows;
};

export const getAgreementGsmGatewaysTx = async (conn, agreementId) => {
    const [rows] = await conn.query(
        `
        SELECT
          a.gateway_id,
          a.allocated_quantity,
          a.price_per_unit,
          a.total_price,
          g.gateway_name,
          g.model_number,
          g.manufacturer,
          g.number_of_port
        FROM agreement_gsm_gateways a
        LEFT JOIN gsm_gateways g
          ON g.id = a.gateway_id
         AND g.is_deleted = 0
        WHERE a.agreement_id = ?
          AND COALESCE(a.is_active, 1) = 1
          AND a.effective_to IS NULL
        ORDER BY a.id ASC
        `,
        [agreementId]
    );
    return rows;
};

export const getAgreementServersTx = async (conn, agreementId) => {
    const [rows] = await conn.query(
        `
        SELECT
          a.server_id,
          a.allocated_quantity,
          a.price_per_unit,
          a.total_price,
          s.server_name,
          s.processor,
          s.ram,
          s.ssd,
          s.hdd,
          s.brand
        FROM agreement_servers a
        LEFT JOIN servers s
          ON s.id = a.server_id
         AND s.is_deleted = 0
        WHERE a.agreement_id = ?
          AND COALESCE(a.is_active, 1) = 1
          AND a.effective_to IS NULL
        ORDER BY a.id ASC
        `,
        [agreementId]
    );
    return rows;
};

export const insertAgreementSystemsTx = async (conn, agreementId, systems = []) => {
    if (!systems.length) return 0;

    const placeholders = systems
        .map(() => "(?, ?, ?, NOW(), NOW(), NULL, 1)")
        .join(", ");
    const values = systems.flatMap((item) => [
        agreementId,
        item.system_id,
        item.system_price,
    ]);

    const [result] = await conn.query(
        `INSERT INTO agreement_systems
        (agreement_id, system_id, system_price, created_at, effective_from, effective_to, is_active)
        VALUES ${placeholders}`,
        values
    );

    return result.affectedRows || 0;
};

export const insertAgreementAssetsTx = async (conn, agreementId, assets = []) => {
    if (!assets.length) return 0;

    const placeholders = assets
        .map(() => "(?, ?, ?, NOW(), NOW(), NULL, 1)")
        .join(", ");
    const values = assets.flatMap((item) => [
        agreementId,
        item.asset_id,
        item.asset_price,
    ]);

    const [result] = await conn.query(
        `INSERT INTO agreement_assets
        (agreement_id, asset_id, asset_price, created_at, effective_from, effective_to, is_active)
        VALUES ${placeholders}`,
        values
    );

    return result.affectedRows || 0;
};

export const insertAgreementGsmGatewaysTx = async (
    conn,
    agreementId,
    gateways = []
) => {
    if (!gateways.length) return 0;

    // NOTE: `total_price` is a generated column in `agreement_gsm_gateways`,
    // so it must not be explicitly inserted/updated (MySQL will compute it).
    const placeholders = gateways
        .map(() => "(?, ?, ?, ?, NOW(), NOW(), NULL, 1)")
        .join(", ");
    const values = gateways.flatMap((item) => [
        agreementId,
        item.gateway_id,
        item.allocated_quantity,
        item.price_per_unit,
    ]);

    const [result] = await conn.query(
        `INSERT INTO agreement_gsm_gateways
        (agreement_id, gateway_id, allocated_quantity, price_per_unit, created_at, effective_from, effective_to, is_active)
        VALUES ${placeholders}`,
        values
    );

    return result.affectedRows || 0;
};

export const insertAgreementServersTx = async (conn, agreementId, servers = []) => {
    if (!servers.length) return 0;

    // NOTE: `total_price` is a generated column in `agreement_servers`,
    // so it must not be explicitly inserted/updated (MySQL will compute it).
    const placeholders = servers
        .map(() => "(?, ?, ?, ?, NOW(), NOW(), NULL, 1)")
        .join(", ");
    const values = servers.flatMap((item) => [
        agreementId,
        item.server_id,
        item.allocated_quantity,
        item.price_per_unit,
    ]);

    const [result] = await conn.query(
        `INSERT INTO agreement_servers
        (agreement_id, server_id, allocated_quantity, price_per_unit, created_at, effective_from, effective_to, is_active)
        VALUES ${placeholders}`,
        values
    );

    return result.affectedRows || 0;
};

export const deactivateAgreementSystemsBySystemIdsTx = async (
    conn,
    agreementId,
    systemIds = [],
    effectiveTo = new Date()
) => {
    if (!systemIds.length) return 0;
    const [result] = await conn.query(
        `
        UPDATE agreement_systems
        SET is_active = 0,
            effective_to = ?,
            updated_at = NOW()
        WHERE agreement_id = ?
          AND system_id IN (${systemIds.map(() => "?").join(", ")})
          AND COALESCE(is_active, 1) = 1
          AND effective_to IS NULL
        `,
        [effectiveTo, agreementId, ...systemIds]
    );
    return result.affectedRows || 0;
};

export const deactivateAgreementAssetsByAssetIdsTx = async (
    conn,
    agreementId,
    assetIds = [],
    effectiveTo = new Date()
) => {
    if (!assetIds.length) return 0;
    const [result] = await conn.query(
        `
        UPDATE agreement_assets
        SET is_active = 0,
            effective_to = ?,
            updated_at = NOW()
        WHERE agreement_id = ?
          AND asset_id IN (${assetIds.map(() => "?").join(", ")})
          AND COALESCE(is_active, 1) = 1
          AND effective_to IS NULL
        `,
        [effectiveTo, agreementId, ...assetIds]
    );
    return result.affectedRows || 0;
};

export const deactivateAgreementGsmGatewaysByGatewayIdsTx = async (
    conn,
    agreementId,
    gatewayIds = [],
    effectiveTo = new Date()
) => {
    if (!gatewayIds.length) return 0;
    const [result] = await conn.query(
        `
        UPDATE agreement_gsm_gateways
        SET is_active = 0,
            effective_to = ?,
            updated_at = NOW()
        WHERE agreement_id = ?
          AND gateway_id IN (${gatewayIds.map(() => "?").join(", ")})
          AND COALESCE(is_active, 1) = 1
          AND effective_to IS NULL
        `,
        [effectiveTo, agreementId, ...gatewayIds]
    );
    return result.affectedRows || 0;
};

export const deactivateAgreementServersByServerIdsTx = async (
    conn,
    agreementId,
    serverIds = [],
    effectiveTo = new Date()
) => {
    if (!serverIds.length) return 0;
    const [result] = await conn.query(
        `
        UPDATE agreement_servers
        SET is_active = 0,
            effective_to = ?,
            updated_at = NOW()
        WHERE agreement_id = ?
          AND server_id IN (${serverIds.map(() => "?").join(", ")})
          AND COALESCE(is_active, 1) = 1
          AND effective_to IS NULL
        `,
        [effectiveTo, agreementId, ...serverIds]
    );
    return result.affectedRows || 0;
};

export const listAllocatedSystemsForClientTx = async (conn, clientId) => {
    const [rows] = await conn.query(
        `
        SELECT
          s.id,
          s.system_uid,
          s.system_uuid,
          s.device_type,
          s.client_id
        FROM systems s
        WHERE s.is_deleted = 0
          AND s.client_id = ?
        ORDER BY s.id DESC
        `,
        [clientId]
    );

    return rows;
};

export const listAllocatedGsmGatewaysForClientTx = async (conn, clientId) => {
    const [rows] = await conn.query(
        `
        SELECT
          a.gateway_id,
          a.allocated_quantity,
          g.gateway_name,
          g.model_number,
          g.manufacturer,
          g.number_of_port,
          g.total_quantity,
          g.status,
          g.created_at,
          g.updated_at
        FROM client_gsm_gateway_allocations a
        INNER JOIN gsm_gateways g
          ON g.id = a.gateway_id
         AND g.is_deleted = 0
        WHERE a.client_id = ?
          AND a.allocated_quantity > 0
          AND g.status = 'active'
        ORDER BY a.gateway_id ASC
        `,
        [clientId]
    );

    return rows;
};

export const listAllocatedServersForClientTx = async (conn, clientId) => {
    const [rows] = await conn.query(
        `
        SELECT
          a.server_id,
          a.allocated_quantity,
          s.server_name,
          s.processor,
          s.ram,
          s.ssd,
          s.hdd,
          s.brand,
          s.total_quantity,
          s.status,
          s.created_at,
          s.updated_at
        FROM client_server_allocations a
        INNER JOIN servers s
          ON s.id = a.server_id
         AND s.is_deleted = 0
        WHERE a.client_id = ?
          AND a.allocated_quantity > 0
          AND s.status = 'active'
        ORDER BY a.server_id ASC
        `,
        [clientId]
    );

    return rows;
};

export const listAllocatedAssetsForClientTx = async (conn, clientId) => {
    const [rows] = await conn.query(
        `
        SELECT
          a.asset_id,
          a.asset_category_id,
          t.name AS asset_category_name,
          a.brand,
          a.model,
          a.size,
          a.serial_number,
          a.manufacturer,
          a.spec_json,
          a.is_available,
          a.status,
          ca.allocated_at
        FROM client_asset_allocations ca
        INNER JOIN assets a
          ON a.asset_id = ca.asset_id
         AND a.is_deleted = 0
        INNER JOIN asset_category t
          ON t.id = a.asset_category_id
        WHERE ca.client_id = ?
          AND ca.is_deleted = 0
          AND ca.deallocated_at IS NULL
        ORDER BY a.asset_id ASC
        `,
        [clientId]
    );

    return rows;
};
