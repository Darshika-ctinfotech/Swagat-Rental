import { pool } from "../../config/db.js";
import { randomUUID } from "crypto";
import { ApiError } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";

export const getClientById = async (clientId) => {
  const [rows] = await pool.query(
    `SELECT
        id,
        role,
        is_deleted,
        is_disabled,
        status
     FROM clients
     WHERE id = ?`,
    [clientId],
  );

  return rows[0];
};

export const getClientByIdTx = async (conn, clientId) => {
  const [rows] = await conn.query(
    `SELECT *
     FROM clients
     WHERE id = ? AND is_deleted = 0
     LIMIT 1`,
    [clientId],
  );

  return rows[0];
};

export const getClientByUniqueIdTx = async (conn, uniqueId) => {
  const [rows] = await conn.query(
    `SELECT *
     FROM clients
     WHERE u_unique_id = ? AND is_deleted = 0
     LIMIT 1`,
    [uniqueId]
  );

  return rows[0];
};

export const getClientByPhoneNumberTx = async (
  conn,
  phoneNumber,
  excludeClientId = null
) => {
  const where = ["phone_number = ?", "is_deleted = 0"];
  const params = [phoneNumber];

  if (excludeClientId) {
    where.push("id != ?");
    params.push(excludeClientId);
  }

  const [rows] = await conn.query(
    `SELECT id, phone_number
     FROM clients
     WHERE ${where.join(" AND ")}
     LIMIT 1`,
    params
  );

  return rows[0];
};

export const getPublicClientByIdTx = async (conn, clientId) => {
  const [rows] = await conn.query(
    `SELECT
        id,
        u_unique_id,
        full_name,
        email,
        dob,
        country,
        country_code,
        phone_number,
        profile_image,
        status
     FROM clients
     WHERE id = ? AND is_deleted = 0
     LIMIT 1`,
    [clientId],
  );

  return rows[0];
};

export const updateClientDynamic = async (conn, clientId, data) => {
  const fields = [];
  const values = [];

  for (const key in data) {
    fields.push(`${key} = ?`);
    values.push(data[key]);
  }

  values.push(clientId);

  const sql = `
    UPDATE clients
    SET ${fields.join(", ")}, updated_at = NOW()
    WHERE id = ?
  `;

  await conn.query(sql, values);
};

export const getClientColumnSet = async (conn) => {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'clients'`
  );
  return new Set(rows.map((row) => row.COLUMN_NAME));
};

export const replaceClientGsmGatewayAllocations = async (
  conn,
  clientId,
  allocations = []
) => {
  await conn.query(
    `DELETE FROM client_gsm_gateway_allocations WHERE client_id = ?`,
    [clientId]
  );

  if (!allocations.length) return 0;

  const values = allocations.map((item) => [
    clientId,
    item.gateway_id,
    item.allocated_quantity,
  ]);

  const [result] = await conn.query(
    `INSERT INTO client_gsm_gateway_allocations
      (client_id, gateway_id, allocated_quantity)
     VALUES ?`,
    [values]
  );

  return result.affectedRows || 0;
};

export const replaceClientServerAllocations = async (
  conn,
  clientId,
  allocations = []
) => {
  await conn.query(
    `DELETE FROM client_server_allocations WHERE client_id = ?`,
    [clientId]
  );

  if (!allocations.length) return 0;

  const values = allocations.map((item) => [
    clientId,
    item.server_id,
    item.allocated_quantity,
  ]);

  const [result] = await conn.query(
    `INSERT INTO client_server_allocations
      (client_id, server_id, allocated_quantity)
     VALUES ?`,
    [values]
  );

  return result.affectedRows || 0;
};

export const listClientGatewayAllocationsForAdmin = async (conn, clientId) => {
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
      CASE
        WHEN g.id IS NULL THEN NULL
        ELSE GREATEST(
          g.total_quantity - (
            SELECT COALESCE(SUM(cga.allocated_quantity), 0)
            FROM client_gsm_gateway_allocations cga
            WHERE cga.gateway_id = g.id
          ) - (
            SELECT
              COALESCE(SUM(CASE WHEN im.movement_type = 'sale' THEN im.qty ELSE 0 END), 0) -
              COALESCE(SUM(CASE WHEN im.movement_type = 'sale_void' THEN im.qty ELSE 0 END), 0)
            FROM inventory_movements im
            WHERE im.item_type = 'gsm_gateway'
              AND im.item_id = g.id
          ),
          0
        )
      END AS total_left
    FROM client_gsm_gateway_allocations a
    LEFT JOIN gsm_gateways g
      ON g.id = a.gateway_id
     AND g.is_deleted = 0
    WHERE a.client_id = ?
    ORDER BY a.gateway_id ASC
    `,
    [clientId]
  );

  return rows;
};

export const listClientServerAllocationsForAdmin = async (conn, clientId) => {
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
      CASE
        WHEN s.id IS NULL THEN NULL
        ELSE GREATEST(
          s.total_quantity - (
            SELECT COALESCE(SUM(csa.allocated_quantity), 0)
            FROM client_server_allocations csa
            WHERE csa.server_id = s.id
          ) - (
            SELECT
              COALESCE(SUM(CASE WHEN im.movement_type = 'sale' THEN im.qty ELSE 0 END), 0) -
              COALESCE(SUM(CASE WHEN im.movement_type = 'sale_void' THEN im.qty ELSE 0 END), 0)
            FROM inventory_movements im
            WHERE im.item_type = 'server'
              AND im.item_id = s.id
          ),
          0
        )
      END AS total_left
    FROM client_server_allocations a
    LEFT JOIN servers s
      ON s.id = a.server_id
     AND s.is_deleted = 0
    WHERE a.client_id = ?
    ORDER BY a.server_id ASC
    `,
    [clientId]
  );

  return rows;
};

export const listClientAssetAllocationsForAdmin = async (conn, clientId) => {
  const [rows] = await conn.query(
    `
    SELECT
      ca.asset_id,
      ca.allocated_at,
      i.asset_category_id,
      t.name AS asset_category_name,
      i.brand,
      i.model,
      i.size,
      i.serial_number,
      i.manufacturer,
      i.is_available,
      i.status,
      i.created_at,
      i.updated_at
    FROM client_asset_allocations ca
    LEFT JOIN assets i
      ON i.asset_id = ca.asset_id
     AND i.is_deleted = 0
    LEFT JOIN asset_category t
      ON t.id = i.asset_category_id
     AND t.is_deleted = 0
    WHERE ca.client_id = ?
      AND ca.is_deleted = 0
      AND ca.deallocated_at IS NULL
    ORDER BY ca.asset_id ASC
    `,
    [clientId]
  );

  return rows;
};

export const getChatClients = async (conn, clientId) => {
  const [rows] = await conn.query(
    `
    SELECT
      c.id,
      c.u_unique_id,
      c.full_name,
      c.email,
      c.profile_image
    FROM clients c
    WHERE c.id != ?
      AND c.is_deleted = 0
      AND c.is_disabled = 0
      AND c.is_verified = 1
      AND c.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks b
        WHERE
          (b.blocker_id = ? AND b.blocked_id = c.id)
          OR
          (b.blocker_id = c.id AND b.blocked_id = ?)
      )
    ORDER BY c.full_name ASC
    `,
    [clientId, clientId, clientId]
  );

  return rows;
};

export const getClientKycByClientId = async (conn, clientId) => {
  const [rows] = await conn.query(
    `SELECT
        id,
        client_id,
        doc_type,
        doc_path,
        submitted_at,
        created_at,
        updated_at
     FROM client_kyc
     WHERE client_id = ?
     LIMIT 1`,
    [clientId]
  );

  return rows[0];
};

export const upsertClientKyc = async (conn, data) => {
  const [existing] = await conn.query(
    `SELECT id FROM client_kyc WHERE client_id = ? LIMIT 1`,
    [data.client_id]
  );

  if (existing.length) {
    await conn.query(
      `UPDATE client_kyc
       SET doc_id = ?, doc_type = ?, doc_path = ?, selfie_path = ?,
           submitted_at = ?, updated_at = NOW()
       WHERE client_id = ?`,
      [
        data.doc_id,
        data.doc_type,
        data.doc_path,
        data.selfie_path,
        data.submitted_at,
        data.client_id,
      ]
    );
    return existing[0].id;
  }

  const [result] = await conn.query(
    `INSERT INTO client_kyc
     (client_id, doc_id, doc_type, doc_path, selfie_path, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.client_id,
      data.doc_id,
      data.doc_type,
      data.doc_path,
      data.selfie_path,
      data.submitted_at,
    ]
  );

  return result.insertId;
};

const normalizeKycDocType = (value) => {
  const mapping = {
    aadhaar_card: "Aadhar_Card",
    pan_card: "PAN_Card",
    office_rent_agreement: "Office_Rent_Agreement",
    gst_certificate: "GST_Certificate",
    gumasta: "Gumasta",
    security_cheque: "Security_Cheque",
    verification_video: "Verification_Video",
    selfie: "Selfie",
  };

  if (!value) return null;
  const normalized = String(value).trim();
  const key = normalized.toLowerCase();
  return mapping[key] || normalized;
};

export const replaceClientKycDocuments = async (conn, clientId, docs = []) => {
  const normalizedDocs = docs
    .map((doc) => ({
      doc_type: normalizeKycDocType(doc?.doc_type),
      doc_path: doc?.doc_path ? String(doc.doc_path).trim() : null,
    }))
    .filter((doc) => doc.doc_type && doc.doc_path);

  if (!normalizedDocs.length) return;

  const [columnRows] = await conn.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'client_kyc'`
  );

  const columns = new Set(columnRows.map((row) => row.COLUMN_NAME));

  await conn.query(`DELETE FROM client_kyc WHERE client_id = ?`, [clientId]);

  for (const doc of normalizedDocs) {
    const insertData = {
      client_id: clientId,
      doc_type: doc.doc_type,
      doc_path: doc.doc_path,
      submitted_at: new Date(),
    };

    if (columns.has("doc_id")) {
      insertData.doc_id = randomUUID();
    }
    if (columns.has("selfie_path")) {
      insertData.selfie_path = doc.doc_path;
    }

    const keys = Object.keys(insertData).filter((key) => columns.has(key));
    if (!keys.length) continue;

    const placeholders = keys.map(() => "?").join(", ");
    await conn.query(
      `INSERT INTO client_kyc (${keys.join(", ")}) VALUES (${placeholders})`,
      keys.map((key) => insertData[key])
    );
  }
};

export const upsertClientKycDocumentsByType = async (
  conn,
  clientId,
  docs = []
) => {
  const normalizedDocs = docs
    .map((doc) => ({
      doc_type: normalizeKycDocType(doc?.doc_type),
      doc_path: doc?.doc_path ? String(doc.doc_path).trim() : null,
    }))
    .filter((doc) => doc.doc_type && doc.doc_path);

  if (!normalizedDocs.length) return;

  const [columnRows] = await conn.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'client_kyc'`
  );
  const columns = new Set(columnRows.map((row) => row.COLUMN_NAME));

  for (const doc of normalizedDocs) {
    const [existingRows] = await conn.query(
      `SELECT id FROM client_kyc WHERE client_id = ? AND doc_type = ? LIMIT 1`,
      [clientId, doc.doc_type]
    );

    if (existingRows.length) {
      const updates = [];
      const values = [];

      if (columns.has("doc_path")) {
        updates.push("doc_path = ?");
        values.push(doc.doc_path);
      }
      if (columns.has("selfie_path")) {
        updates.push("selfie_path = ?");
        values.push(doc.doc_path);
      }
      if (columns.has("submitted_at")) {
        updates.push("submitted_at = ?");
        values.push(new Date());
      }

      if (!updates.length) continue;
      values.push(existingRows[0].id);
      await conn.query(
        `UPDATE client_kyc SET ${updates.join(", ")}, updated_at = NOW() WHERE id = ?`,
        values
      );
      continue;
    }

    const insertData = {
      client_id: clientId,
      doc_type: doc.doc_type,
      doc_path: doc.doc_path,
      submitted_at: new Date(),
    };

    if (columns.has("doc_id")) {
      insertData.doc_id = randomUUID();
    }
    if (columns.has("selfie_path")) {
      insertData.selfie_path = doc.doc_path;
    }

    const keys = Object.keys(insertData).filter((key) => columns.has(key));
    if (!keys.length) continue;

    const placeholders = keys.map(() => "?").join(", ");
    await conn.query(
      `INSERT INTO client_kyc (${keys.join(", ")}) VALUES (${placeholders})`,
      keys.map((key) => insertData[key])
    );
  }
};

export const addClientKycDocuments = async (conn, clientId, docs = []) => {
  const normalizedDocs = docs
    .map((doc) => ({
      doc_type: normalizeKycDocType(doc?.doc_type),
      doc_path: doc?.doc_path ? String(doc.doc_path).trim() : null,
    }))
    .filter((doc) => doc.doc_type && doc.doc_path);

  if (!normalizedDocs.length) return;

  const [columnRows] = await conn.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'client_kyc'`
  );
  const columns = new Set(columnRows.map((row) => row.COLUMN_NAME));

  for (const doc of normalizedDocs) {
    const insertData = {
      client_id: clientId,
      doc_type: doc.doc_type,
      doc_path: doc.doc_path,
      submitted_at: new Date(),
    };

    if (columns.has("doc_id")) {
      insertData.doc_id = randomUUID();
    }
    if (columns.has("selfie_path")) {
      insertData.selfie_path = doc.doc_path;
    }

    const keys = Object.keys(insertData).filter((key) => columns.has(key));
    if (!keys.length) continue;

    const placeholders = keys.map(() => "?").join(", ");
    await conn.query(
      `INSERT INTO client_kyc (${keys.join(", ")}) VALUES (${placeholders})`,
      keys.map((key) => insertData[key])
    );
  }
};

export const getClientKycDocumentsByIds = async (
  conn,
  clientId,
  kycIds = []
) => {
  if (!kycIds.length) return [];

  const [rows] = await conn.query(
    `SELECT id, client_id, doc_type, doc_path
     FROM client_kyc
     WHERE client_id = ? AND id IN (?)`,
    [clientId, kycIds]
  );

  return rows;
};

export const deleteClientKycDocumentsByIds = async (
  conn,
  clientId,
  kycIds = []
) => {
  if (!kycIds.length) return 0;

  const [result] = await conn.query(
    `DELETE FROM client_kyc
     WHERE client_id = ? AND id IN (?)`,
    [clientId, kycIds]
  );

  return result.affectedRows || 0;
};

export const listClientsForAdmin = async (
  conn,
  { search, kyc_status, date_from, date_to, page, limit, created_by_role, created_by }
) => {
  const where = ["c.is_deleted = 0"];
  const params = [];

  if (search) {
    where.push(
      `(c.u_unique_id LIKE ? OR c.full_name LIKE ? OR c.email LIKE ?)`
    );
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  if (kyc_status) {
    where.push("c.kyc_status = ?");
    params.push(kyc_status);
  }

  if (date_from) {
    where.push("DATE(c.created_at) >= ?");
    params.push(date_from);
  }

  if (date_to) {
    where.push("DATE(c.created_at) <= ?");
    params.push(date_to);
  }

  if (created_by_role && created_by) {
    where.push("c.created_by_role = ?");
    params.push(created_by_role);
    where.push("c.created_by = ?");
    params.push(created_by);
  }

  const hasLimit = limit !== null && limit !== undefined && String(limit).trim() !== "";
  const safeLimit = hasLimit ? Math.min(Math.max(Number(limit) || 20, 1), 100) : null;
  const safePage = hasLimit ? Math.max(Number(page) || 1, 1) : 1;
  const offset = hasLimit ? (safePage - 1) * safeLimit : 0;

  const paginationClause = hasLimit ? "LIMIT ? OFFSET ?" : "";
  const paginationParams = hasLimit ? [safeLimit, offset] : [];

  const [rows] = await conn.query(
    `
    SELECT
      c.id,
      c.u_unique_id,
      c.full_name,
      c.email,
      c.show_password,
      c.kyc_status,
      c.created_at,
      c.is_relocated,
      a.agreement_id AS current_agreement_id,
      CASE
        WHEN a.agreement_id IS NULL THEN NULL
        WHEN LOWER(a.status) = 'active' AND a.agreement_end_date IS NOT NULL AND a.agreement_end_date < NOW() THEN 'expired'
        WHEN LOWER(a.status) = 'active' AND EXISTS (
          SELECT 1
          FROM agreements a2
          WHERE a2.client_id = c.id
            AND a2.agreement_id <> a.agreement_id
            AND a2.agreement_start_date IS NOT NULL
            AND a2.agreement_start_date > NOW()
          LIMIT 1
        ) THEN 'scheduled'
        ELSE a.status
      END AS agreement_status,
      a.agreement_start_date AS current_agreement_start_date,
      a.agreement_end_date AS current_agreement_end_date,
      a.billing_cycle_day AS agreement_billing_cycle_day,
      a.rent_amount,
      CASE
        WHEN a.agreement_id IS NULL THEN 0
        WHEN a.agreement_end_date IS NULL THEN 0
        WHEN a.agreement_end_date < NOW() THEN 1
        ELSE 0
      END AS agreement_is_expired,
      CASE
        WHEN a.agreement_id IS NULL THEN 0
        WHEN LOWER(a.status) <> 'active' THEN 0
        WHEN a.agreement_end_date IS NOT NULL AND a.agreement_end_date < NOW() THEN 0
        ELSE 1
      END AS agreement_is_active,
      CASE
        WHEN (
          SELECT COUNT(DISTINCT LOWER(ck.doc_type))
          FROM client_kyc ck
          WHERE ck.client_id = c.id
            AND ck.doc_path IS NOT NULL
            AND LOWER(ck.doc_type) IN (
              'aadhar_card',
              'pan_card',
              'office_rent_agreement',
              'gst_certificate',
              'gumasta',
              'security_cheque',
              'verification_video'
            )
        ) = 7 THEN 'Yes'
        ELSE 'No'
      END AS is_document_completed,
      (
        SELECT COUNT(*)
        FROM systems s
        WHERE s.client_id = c.id AND s.is_deleted = 0 AND s.is_block = 0
      ) AS device_count
    FROM clients c
    LEFT JOIN agreements a ON a.agreement_id = (
      SELECT a2.agreement_id
      FROM agreements a2
      WHERE a2.client_id = c.id
      ORDER BY
        FIELD(LOWER(a2.status), 'active', 'scheduled', 'expired', 'terminated'),
        a2.agreement_start_date DESC,
        a2.agreement_id DESC
      LIMIT 1
    )
    WHERE ${where.join(" AND ")}
    ORDER BY c.id DESC
    ${paginationClause}
    `,
    [...params, ...paginationParams]
  );

  const [[{ total }]] = await conn.query(
    `
    SELECT COUNT(*) AS total
    FROM clients c
    WHERE ${where.join(" AND ")}
    `,
    params
  );

  return {
    rows,
    total,
    page: safePage,
    limit: safeLimit,
  };
};

export const listKycApprovalsForAdmin = async (
  conn,
  { search, kyc_status, date_from, date_to, page, limit, created_by_role }
) => {
  const where = ["c.is_deleted = 0"];
  const params = [];

  if (search) {
    const like = `%${search}%`;
    where.push(
      `(c.u_unique_id LIKE ? OR c.full_name LIKE ? OR c.email LIKE ? OR c.phone_number LIKE ?)`
    );
    params.push(like, like, like, like);
  }

  if (kyc_status) {
    where.push("c.kyc_status = ?");
    params.push(kyc_status);
  }

  if (date_from) {
    where.push("DATE(c.kyc_submitted_at) >= ?");
    params.push(date_from);
  }

  if (date_to) {
    where.push("DATE(c.kyc_submitted_at) <= ?");
    params.push(date_to);
  }

  if (created_by_role) {
    where.push("c.created_by_role = ?");
    params.push(created_by_role);
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await conn.query(
    `
    SELECT
      c.id,
      c.u_unique_id,
      c.full_name,
      c.email,
      c.country_code,
      c.phone_number,
      c.show_password,
      c.kyc_status,
      c.kyc_submitted_at,
      c.kyc_approved_at,
      c.kyc_rejected_at,
      c.kyc_reject_reason,
      c.kyc_verified_by_admin_id,
      c.created_at,
      a.full_name AS kyc_verified_by_admin_name,
      c.created_by,
      c.created_by_role,
      CASE
        WHEN c.created_by_role = 'admin' THEN a_creator.full_name
        WHEN c.created_by_role = 'sub_admin' THEN e_creator.full_name
        ELSE NULL
      END AS created_by_name,
      (
        SELECT COUNT(*)
        FROM systems s
        WHERE s.client_id = c.id AND s.is_deleted = 0 AND s.is_block = 0
      ) AS device_count
    FROM clients c
    LEFT JOIN admins a ON a.id = c.kyc_verified_by_admin_id
    LEFT JOIN admins a_creator ON a_creator.id = c.created_by
      AND c.created_by_role = 'admin'
    LEFT JOIN employees e_creator ON e_creator.id = c.created_by
      AND c.created_by_role = 'sub_admin'
    WHERE ${where.join(" AND ")}
    ORDER BY c.kyc_submitted_at DESC, c.id DESC
    LIMIT ? OFFSET ?
    `,
    [...params, safeLimit, offset]
  );

  const [[{ total }]] = await conn.query(
    `
    SELECT COUNT(*) AS total
    FROM clients c
    WHERE ${where.join(" AND ")}
    `,
    params
  );

  return {
    rows,
    total,
    page: safePage,
    limit: safeLimit,
  };
};

export const getClientDetailsForAdmin = async (conn, clientId) => {
  const [rows] = await conn.query(
    `
    SELECT
      c.*,
      CASE
        WHEN a.agreement_id IS NULL THEN NULL
        WHEN LOWER(a.status) = 'active' AND a.agreement_end_date IS NOT NULL AND a.agreement_end_date < NOW() THEN 'expired'
        WHEN LOWER(a.status) = 'active' AND EXISTS (
          SELECT 1
          FROM agreements a2
          WHERE a2.client_id = c.id
            AND a2.agreement_id <> a.agreement_id
            AND a2.agreement_start_date IS NOT NULL
            AND a2.agreement_start_date > NOW()
          LIMIT 1
        ) THEN 'scheduled'
        ELSE a.status
      END AS agreement_status,
      a.agreement_start_date AS current_agreement_start_date,
      a.agreement_end_date AS current_agreement_end_date,
      a.billing_cycle_day AS agreement_billing_cycle_day,
      a.rent_amount,
      CASE
        WHEN a.agreement_id IS NULL THEN 0
        WHEN a.agreement_end_date IS NULL THEN 0
        WHEN a.agreement_end_date < NOW() THEN 1
        ELSE 0
      END AS agreement_is_expired,
      CASE
        WHEN a.agreement_id IS NULL THEN 0
        WHEN LOWER(a.status) <> 'active' THEN 0
        WHEN a.agreement_end_date IS NOT NULL AND a.agreement_end_date < NOW() THEN 0
        ELSE 1
      END AS agreement_is_active,
      (
        SELECT COUNT(*)
        FROM systems s
        WHERE s.client_id = c.id AND s.is_deleted = 0
      ) AS device_count,
       a.payment_type
    FROM clients c
    LEFT JOIN agreements a ON a.agreement_id = (
      SELECT a2.agreement_id
      FROM agreements a2
      WHERE a2.client_id = c.id
      ORDER BY
        FIELD(LOWER(a2.status), 'active', 'scheduled', 'expired', 'terminated'),
        a2.agreement_start_date DESC,
        a2.agreement_id DESC
      LIMIT 1
    )
    WHERE c.id = ? AND c.is_deleted = 0
    LIMIT 1
    `,
    [clientId]
  );

  return rows[0];
};

export const listClientKycDocumentsByClientId = async (conn, clientId) => {
  const [rows] = await conn.query(
    `
    SELECT
      id,
      client_id,
      doc_type,
      doc_path,
      submitted_at,
      created_at,
      updated_at
    FROM client_kyc
    WHERE client_id = ?
    ORDER BY id ASC
    `,
    [clientId]
  );

  return rows;
};

export const createClientServiceRequest = async (conn, data) => {
  const columns = [
    "client_id",
    "system_id",
    "employee_id",
    "asset_category_id",
    "request_title",
    "request_description",
    "status",
  ];
  const values = [
    data.client_id,
    data.system_id ?? null,
    data.employee_id ?? null,
    data.asset_category_id ?? null,
    data.request_title,
    data.request_description,
    data.status ?? 0,
  ];

  if (data.mark_as_urgent !== undefined) {
    columns.push("mark_as_urgent");
    values.push(data.mark_as_urgent ? 1 : 0);
  }

  const placeholders = columns.map(() => "?").join(", ");

  const [result] = await conn.query(
    `INSERT INTO client_service_requests
      (${columns.join(", ")})
     VALUES (${placeholders})`,
    values
  );

  return result.insertId;
};

export const getClientServiceRequestById = async (conn, requestId) => {
  const [rows] = await conn.query(
    `SELECT
      csr.id,
      csr.client_id,
      c.full_name AS client_name,
      c.u_unique_id AS client_unique_id,
      c.email AS client_email,
      c.profile_image AS client_profile_image,
      csr.system_id,
      s.system_uid,
      s.device_type AS system_type,
      ac.display_name AS asset_category_name,
      (
        SELECT a.brand
        FROM system_assets sa
        JOIN assets a ON a.asset_id = sa.asset_id
        WHERE sa.system_id = csr.system_id
          AND sa.is_deleted = 0
          AND sa.removed_at IS NULL
        ORDER BY a.asset_id ASC
        LIMIT 1
      ) AS system_brand,
      (
        SELECT a.model
        FROM system_assets sa
        JOIN assets a ON a.asset_id = sa.asset_id
        WHERE sa.system_id = csr.system_id
          AND sa.is_deleted = 0
          AND sa.removed_at IS NULL
        ORDER BY a.asset_id ASC
        LIMIT 1
      ) AS system_model,
      csr.employee_id,
      e.full_name AS employee_name,
      csr.asset_category_id,
      csr.request_title,
      csr.request_description,
      csr.resolved_description,
      csr.resolved_video_proof,
      csr.mark_as_urgent,
      csr.admin_assigned_at,
      csr.employee_resolved_at,
      csr.status,
      csr.created_at,
      csr.updated_at
     FROM client_service_requests csr
     LEFT JOIN clients c ON c.id = csr.client_id
     LEFT JOIN employees e ON e.id = csr.employee_id
     LEFT JOIN systems s ON s.id = csr.system_id
     LEFT JOIN asset_category ac ON ac.id = csr.asset_category_id
     WHERE csr.id = ?
     LIMIT 1`,
    [requestId]
  );

  return rows[0];
};

export const listClientServiceRequests = async (
  conn,
  { clientId, status, search, page = 1, limit = 20 }
) => {
  const where = ["csr.client_id = ?"];
  const params = [clientId];

  if (status !== undefined && status !== null && status !== "") {
    where.push("csr.status = ?");
    params.push(Number(status));
  }

  if (search) {
    const trimmed = String(search).trim();
    if (trimmed) {
      const like = `%${trimmed}%`;
      where.push(`(
        s.system_uid LIKE ?
        OR c.full_name LIKE ?
        OR c.u_unique_id LIKE ?
        OR e.full_name LIKE ?
        OR EXISTS (
          SELECT 1
          FROM system_assets sa
          JOIN assets a ON a.asset_id = sa.asset_id
          WHERE sa.system_id = csr.system_id
            AND sa.is_deleted = 0
            AND sa.removed_at IS NULL
            AND (a.brand LIKE ? OR a.model LIKE ?)
        )
      )`);
      params.push(like, like, like, like, like, like);
    }
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await conn.query(
    `
    SELECT
      csr.id,
      csr.client_id,
      c.full_name AS client_name,
      c.u_unique_id AS client_unique_id,
      csr.system_id,
      s.system_uid,
      s.device_type AS system_type,
      ac.display_name AS asset_category_name,
      (
        SELECT a.brand
        FROM system_assets sa
        JOIN assets a ON a.asset_id = sa.asset_id
        WHERE sa.system_id = csr.system_id
          AND sa.is_deleted = 0
          AND sa.removed_at IS NULL
        ORDER BY a.asset_id ASC
        LIMIT 1
      ) AS system_brand,
      (
        SELECT a.model
        FROM system_assets sa
        JOIN assets a ON a.asset_id = sa.asset_id
        WHERE sa.system_id = csr.system_id
          AND sa.is_deleted = 0
          AND sa.removed_at IS NULL
        ORDER BY a.asset_id ASC
        LIMIT 1
      ) AS system_model,
      csr.employee_id,
      e.full_name AS employee_name,
      csr.asset_category_id,
      csr.request_title,
      csr.request_description,
      csr.mark_as_urgent,
      csr.admin_assigned_at,
      csr.employee_resolved_at,
      csr.status,
      csr.created_at,
      csr.updated_at
    FROM client_service_requests csr
    LEFT JOIN clients c ON c.id = csr.client_id
    LEFT JOIN employees e ON e.id = csr.employee_id
    LEFT JOIN systems s ON s.id = csr.system_id
    LEFT JOIN asset_category ac ON ac.id = csr.asset_category_id
    WHERE ${where.join(" AND ")}
    ORDER BY csr.id DESC
    LIMIT ? OFFSET ?
    `,
    [...params, safeLimit, offset]
  );

  const [[{ total }]] = await conn.query(
    `
    SELECT COUNT(*) AS total
    FROM client_service_requests csr
    LEFT JOIN clients c ON c.id = csr.client_id
    LEFT JOIN employees e ON e.id = csr.employee_id
    LEFT JOIN systems s ON s.id = csr.system_id
    WHERE ${where.join(" AND ")}
    `,
    params
  );

  return {
    rows,
    total,
    page: safePage,
    limit: safeLimit,
  };
};

export const listServiceRequestsForAdmin = async (
  conn,
  { status, client_id, system_id, employee_id, search, page = 1, limit = 20 }
) => {
  const where = ["1 = 1"];
  const params = [];

  if (client_id) {
    where.push("csr.client_id = ?");
    params.push(Number(client_id));
  }
  if (system_id) {
    where.push("csr.system_id = ?");
    params.push(Number(system_id));
  }
  if (employee_id) {
    where.push("csr.employee_id = ?");
    params.push(Number(employee_id));
  }
  if (status !== undefined && status !== null && status !== "") {
    where.push("csr.status = ?");
    params.push(Number(status));
  }

  if (search) {
    const trimmed = String(search).trim();
    if (trimmed) {
      const like = `%${trimmed}%`;
      where.push(`(
        s.system_uid LIKE ?
        OR c.full_name LIKE ?
        OR c.u_unique_id LIKE ?
        OR e.full_name LIKE ?
        OR EXISTS (
          SELECT 1
          FROM system_assets sa
          JOIN assets a ON a.asset_id = sa.asset_id
          WHERE sa.system_id = csr.system_id
            AND sa.is_deleted = 0
            AND sa.removed_at IS NULL
            AND (a.brand LIKE ? OR a.model LIKE ?)
        )
      )`);
      params.push(like, like, like, like, like, like);
    }
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await conn.query(
    `
    SELECT
      csr.id,
      csr.client_id,
      c.full_name AS client_name,
      c.u_unique_id AS client_unique_id,
      csr.system_id,
      s.system_uid,
      s.device_type AS system_type,
      (
        SELECT a.brand
        FROM system_assets sa
        JOIN assets a ON a.asset_id = sa.asset_id
        WHERE sa.system_id = csr.system_id
          AND sa.is_deleted = 0
          AND sa.removed_at IS NULL
        ORDER BY a.asset_id ASC
        LIMIT 1
      ) AS system_brand,
      (
        SELECT a.model
        FROM system_assets sa
        JOIN assets a ON a.asset_id = sa.asset_id
        WHERE sa.system_id = csr.system_id
          AND sa.is_deleted = 0
          AND sa.removed_at IS NULL
        ORDER BY a.asset_id ASC
        LIMIT 1
      ) AS system_model,
      csr.employee_id,
      e.full_name AS employee_name,
      csr.asset_category_id,
      csr.request_title,
      csr.request_description,
      csr.resolved_description,
      csr.resolved_video_proof,
      csr.mark_as_urgent,
      csr.admin_assigned_at,
      csr.employee_resolved_at,
      csr.status,
      csr.created_at,
      csr.updated_at
    FROM client_service_requests csr
    LEFT JOIN clients c ON c.id = csr.client_id
    LEFT JOIN employees e ON e.id = csr.employee_id
    LEFT JOIN systems s ON s.id = csr.system_id
    WHERE ${where.join(" AND ")}
    ORDER BY csr.id DESC
    LIMIT ? OFFSET ?
    `,
    [...params, safeLimit, offset]
  );

  const [[{ total }]] = await conn.query(
    `
    SELECT COUNT(*) AS total
    FROM client_service_requests csr
    LEFT JOIN clients c ON c.id = csr.client_id
    LEFT JOIN employees e ON e.id = csr.employee_id
    LEFT JOIN systems s ON s.id = csr.system_id
    WHERE ${where.join(" AND ")}
    `,
    params
  );

  return {
    rows,
    total,
    page: safePage,
    limit: safeLimit,
  };
};

export const listServiceRequestsForEmployee = async (
  conn,
  { employee_id, status, search, page = 1, limit = 20 }
) => {
  const where = ["csr.employee_id = ?"];
  const params = [employee_id];

  if (status !== undefined && status !== null && status !== "") {
    where.push("csr.status = ?");
    params.push(Number(status));
  }

  if (search) {
    const trimmed = String(search).trim();
    if (trimmed) {
      const like = `%${trimmed}%`;
      where.push(`(
        s.system_uid LIKE ?
        OR c.full_name LIKE ?
        OR c.u_unique_id LIKE ?
        OR e.full_name LIKE ?
        OR EXISTS (
          SELECT 1
          FROM system_assets sa
          JOIN assets a ON a.asset_id = sa.asset_id
          WHERE sa.system_id = csr.system_id
            AND sa.is_deleted = 0
            AND sa.removed_at IS NULL
            AND (a.brand LIKE ? OR a.model LIKE ?)
        )
      )`);
      params.push(like, like, like, like, like, like);
    }
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await conn.query(
    `
    SELECT
      csr.id,
      csr.client_id,
      c.full_name AS client_name,
      c.u_unique_id AS client_unique_id,
      csr.system_id,
      s.system_uid,
      s.device_type AS system_type,
      ac.display_name AS asset_category_name,
      (
        SELECT a.brand
        FROM system_assets sa
        JOIN assets a ON a.asset_id = sa.asset_id
        WHERE sa.system_id = csr.system_id
          AND sa.is_deleted = 0
          AND sa.removed_at IS NULL
        ORDER BY a.asset_id ASC
        LIMIT 1
      ) AS system_brand,
      (
        SELECT a.model
        FROM system_assets sa
        JOIN assets a ON a.asset_id = sa.asset_id
        WHERE sa.system_id = csr.system_id
          AND sa.is_deleted = 0
          AND sa.removed_at IS NULL
        ORDER BY a.asset_id ASC
        LIMIT 1
      ) AS system_model,
      csr.employee_id,
      e.full_name AS employee_name,
      csr.asset_category_id,
      csr.request_title,
      csr.request_description,
      csr.mark_as_urgent,
      csr.admin_assigned_at,
      csr.employee_resolved_at,
      csr.status,
      csr.created_at,
      csr.updated_at
    FROM client_service_requests csr
    LEFT JOIN clients c ON c.id = csr.client_id
    LEFT JOIN employees e ON e.id = csr.employee_id
    LEFT JOIN systems s ON s.id = csr.system_id
    LEFT JOIN asset_category ac ON ac.id = csr.asset_category_id
    WHERE ${where.join(" AND ")}
    ORDER BY csr.id DESC
    LIMIT ? OFFSET ?
    `,
    [...params, safeLimit, offset]
  );

  const [[{ total }]] = await conn.query(
    `
    SELECT COUNT(*) AS total
    FROM client_service_requests csr
    LEFT JOIN clients c ON c.id = csr.client_id
    LEFT JOIN employees e ON e.id = csr.employee_id
    LEFT JOIN systems s ON s.id = csr.system_id
    WHERE ${where.join(" AND ")}
    `,
    params
  );

  return {
    rows,
    total,
    page: safePage,
    limit: hasLimit ? safeLimit : total,
  };
};

export const getServiceRequestAnalyticsByMonthTx = async (
  conn,
  fromDate,
  toDateExclusive
) => {
  const [rows] = await conn.query(
    `
    SELECT
      DATE_FORMAT(csr.created_at, '%Y-%m') AS month,
      COUNT(*) AS total_count,
      SUM(CASE WHEN csr.status = 0 THEN 1 ELSE 0 END) AS pending_count,
      SUM(
        CASE
          WHEN csr.admin_assigned_at IS NOT NULL AND csr.status <> 4 THEN 1
          ELSE 0
        END
      ) AS assigned_count,
      SUM(CASE WHEN csr.status = 1 THEN 1 ELSE 0 END) AS in_process_count,
      SUM(CASE WHEN csr.status = 4 THEN 1 ELSE 0 END) AS completed_count
    FROM client_service_requests csr
    WHERE csr.created_at >= ? AND csr.created_at < ?
    GROUP BY DATE_FORMAT(csr.created_at, '%Y-%m')
    ORDER BY month ASC
    `,
    [fromDate, toDateExclusive]
  );

  return rows;
};

export const getActiveClientAssetIds = async (conn, clientId) => {
  const [rows] = await conn.query(
    `SELECT asset_id
     FROM client_asset_allocations
     WHERE client_id = ?
       AND is_deleted = 0
       AND deallocated_at IS NULL`,
    [clientId]
  );

  return rows.map((row) => row.asset_id);
};

export const replaceClientAssetAllocations = async (
  conn,
  clientId,
  desiredAssetIds = []
) => {
  const desired = [...new Set(desiredAssetIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
  )];

  const current = await getActiveClientAssetIds(conn, clientId);
  const currentSet = new Set(current);
  const desiredSet = new Set(desired);

  const toAllocate = desired.filter((id) => !currentSet.has(id));
  const toDeallocate = current.filter((id) => !desiredSet.has(id));

  if (toAllocate.length) {
    const [assets] = await conn.query(
      `SELECT asset_id, is_available, status, is_deleted
       FROM assets
       WHERE asset_id IN (?)
       FOR UPDATE`,
      [toAllocate]
    );

    const byId = new Map(assets.map((row) => [row.asset_id, row]));
    const missing = toAllocate.filter((id) => !byId.has(id));
    if (missing.length) {
      throw new ApiError([
        STATUS_CODES.BAD_REQUEST,
        `Assets not found: ${missing.join(", ")}`,
      ]);
    }

    const invalid = assets.filter(
      (a) =>
        a.is_deleted ||
        Number(a.is_available) !== 1 ||
        String(a.status) !== "in_stock"
    );
    if (invalid.length) {
      throw new ApiError([
        STATUS_CODES.BAD_REQUEST,
        `Assets not allocatable (must be in_stock & is_available=1): ${invalid
          .map((a) => a.asset_id)
          .join(", ")}`,
      ]);
    }

    const [busy] = await conn.query(
      `SELECT asset_id
       FROM client_asset_allocations
       WHERE asset_id IN (?)
         AND is_deleted = 0
         AND deallocated_at IS NULL
       LIMIT 1`,
      [toAllocate]
    );
    if (busy.length) {
      throw new ApiError([
        STATUS_CODES.BAD_REQUEST,
        `Some assets are already allocated to another client: ${busy
          .map((r) => r.asset_id)
          .join(", ")}`,
      ]);
    }

    for (const assetId of toAllocate) {
      const [rows] = await conn.query(
        `SELECT id, is_deleted, deallocated_at
         FROM client_asset_allocations
         WHERE client_id = ? AND asset_id = ?
         LIMIT 1`,
        [clientId, assetId]
      );

      const existing = rows[0];
      if (!existing) {
        await conn.query(
          `INSERT INTO client_asset_allocations
           (client_id, asset_id, allocated_at)
           VALUES (?, ?, NOW())`,
          [clientId, assetId]
        );
      } else {
        await conn.query(
          `UPDATE client_asset_allocations
           SET allocated_at = NOW(),
               deallocated_at = NULL,
               is_deleted = 0,
               updated_at = NOW()
           WHERE id = ?`,
          [existing.id]
        );
      }
    }

    const [result] = await conn.query(
      `UPDATE assets
       SET status = 'rented',
           is_available = 0,
           updated_at = NOW()
       WHERE asset_id IN (?)
         AND is_deleted = 0
         AND status = 'in_stock'
         AND is_available = 1`,
      [toAllocate]
    );

    if ((result.affectedRows || 0) !== toAllocate.length) {
      throw new ApiError([
        STATUS_CODES.CONFLICT,
        "Failed to mark all allocated assets as rented",
      ]);
    }
  }

  if (toDeallocate.length) {
    await conn.query(
      `UPDATE client_asset_allocations
       SET deallocated_at = NOW(),
           is_deleted = 1,
           updated_at = NOW()
       WHERE client_id = ?
         AND asset_id IN (?)
         AND deallocated_at IS NULL`,
      [clientId, toDeallocate]
    );

    await conn.query(
      `UPDATE assets
       SET status = 'in_stock',
           is_available = 1,
           updated_at = NOW()
       WHERE asset_id IN (?)
         AND is_deleted = 0`,
      [toDeallocate]
    );
  }

  return { allocated: toAllocate.length, deallocated: toDeallocate.length };
};

export const listClientsForEmployee = async (conn) => {
  const [rows] = await conn.query(
    `
    SELECT
      id,
      u_unique_id,
      full_name,
      phone_number,
      company_name,
      company_address
    FROM clients
    WHERE is_deleted = 0
    ORDER BY id DESC
    `
  );

  return rows;
};

export const getServiceRequestByIdForUpdate = async (conn, requestId) => {
  const [rows] = await conn.query(
    `SELECT id, client_id, status, employee_id
     FROM client_service_requests
     WHERE id = ?
     LIMIT 1`,
    [requestId]
  );

  return rows[0];
};

export const updateServiceRequestDynamic = async (conn, requestId, data) => {
  const fields = [];
  const values = [];

  for (const key in data) {
    fields.push(`${key} = ?`);
    values.push(data[key]);
  }

  if (!fields.length) return;

  values.push(requestId);

  const sql = `
    UPDATE client_service_requests
    SET ${fields.join(", ")}, updated_at = NOW()
    WHERE id = ?
  `;

  await conn.query(sql, values);
};
