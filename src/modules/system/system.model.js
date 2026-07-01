import { randomUUID } from "crypto";

const SYSTEM_ID_PREFIX = "SR";
const SYSTEM_ID_TOTAL = 5;
const SYSTEM_ID_DIGITS = 2;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";

const generateSystemUid = () => {
  const positions = new Set();
  while (positions.size < SYSTEM_ID_DIGITS) {
    positions.add(Math.floor(Math.random() * SYSTEM_ID_TOTAL));
  }

  let body = "";
  for (let i = 0; i < SYSTEM_ID_TOTAL; i++) {
    if (positions.has(i)) {
      body += DIGITS[Math.floor(Math.random() * DIGITS.length)];
    } else {
      body += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    }
  }

  return `${SYSTEM_ID_PREFIX}${body}`;
};

const generateUniqueSystemUid = async (conn, attempts = 10) => {
  for (let i = 0; i < attempts; i++) {
    const candidate = generateSystemUid();
    const [rows] = await conn.query(
      `SELECT id FROM systems WHERE system_uid = ? LIMIT 1`,
      [candidate]
    );
    if (!rows.length) {
      return candidate;
    }
  }
  throw new Error("Failed to generate unique system uid");
};

export const createSystem = async (conn, system) => {
  const systemUid = system.system_uid || (await generateUniqueSystemUid(conn));
  const systemUuid = system.system_uuid || randomUUID();
  const [result] = await conn.query(
    `INSERT INTO systems
     (system_uid, system_uuid, hardware_fingerprint, device_type, client_id, installed_by_employee_id, installation_date, status, is_active, system_info)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      systemUid,
      systemUuid,
      system.hardware_fingerprint || null,
      system.device_type || null,
      system.client_id,
      system.installed_by_employee_id || null,
      system.installation_date || null,
      system.status || "active",
      system.is_active ?? 1,
      system.system_info || null,
    ]
  );
  return { id: result.insertId, system_uid: systemUid, system_uuid: systemUuid };
};

export const ensureSystemUid = async (conn, systemId, currentUid) => {
  if (currentUid) return currentUid;
  const systemUid = await generateUniqueSystemUid(conn);
  await conn.query(
    `UPDATE systems
     SET system_uid = ?, updated_at = NOW()
     WHERE id = ?`,
    [systemUid, systemId]
  );
  return systemUid;
};

export const getSystemByUidTx = async (conn, systemUid) => {
  const [rows] = await conn.query(
    `SELECT id, system_uid, system_uuid, hardware_fingerprint, client_id, is_deleted
     FROM systems
     WHERE system_uid = ?
     LIMIT 1`,
    [systemUid]
  );
  return rows[0];
};

export const getSystemStatusByUidTx = async (conn, systemUid) => {
  const [rows] = await conn.query(
    `SELECT id, system_uid, status, approval_status, is_active, is_block, is_deleted
     FROM systems
     WHERE system_uid = ?
     LIMIT 1`,
    [systemUid]
  );
  return rows[0];
};

export const getSystemHeartbeatByUuidTx = async (conn, systemUuid) => {
  const [rows] = await conn.query(
    `SELECT id, system_uuid, hardware_fingerprint, status,
            COALESCE(restart_interval, 10) AS restart_interval,
            is_deleted
     FROM systems
     WHERE system_uuid = ?
     LIMIT 1`,
    [systemUuid]
  );
  return rows[0] || null;
};

export const getSystemHeartbeatByHardwareFingerprintTx = async (
  conn,
  hardwareFingerprint
) => {
  const [rows] = await conn.query(
    `SELECT id, system_uuid, hardware_fingerprint, status,
            COALESCE(restart_interval, 10) AS restart_interval,
            is_deleted
     FROM systems
     WHERE hardware_fingerprint = ?
     LIMIT 1`,
    [hardwareFingerprint]
  );
  return rows[0] || null;
};

export const getSystemByUuidTx = async (conn, systemUuid) => {
  const [rows] = await conn.query(
    `SELECT id, system_uid, system_uuid, hardware_fingerprint, client_id, device_type, is_deleted
     FROM systems
     WHERE system_uuid = ?
     LIMIT 1`,
    [systemUuid]
  );
  return rows[0];
};

export const getSystemByHardwareFingerprintTx = async (
  conn,
  hardwareFingerprint
) => {
  const [rows] = await conn.query(
    `SELECT id, system_uid, system_uuid, hardware_fingerprint, client_id, is_deleted
     FROM systems
     WHERE hardware_fingerprint = ?
     LIMIT 1`,
    [hardwareFingerprint]
  );
  return rows[0];
};

export const getSystemByIdTx = async (conn, systemId) => {
  const [rows] = await conn.query(
    `SELECT *
     FROM systems
     WHERE id = ?
     LIMIT 1`,
    [systemId]
  );
  return rows[0];
};

export const getSystemByIdForUpdate = async (conn, systemId) => {
  const [rows] = await conn.query(
    `SELECT id, client_id, installed_by_employee_id, is_deleted, device_type
     FROM systems
     WHERE id = ?
     LIMIT 1`,
    [systemId]
  );

  return rows[0];
};

export const getSystemsByIdsTx = async (conn, systemIds = []) => {
  if (!systemIds.length) return [];

  const [rows] = await conn.query(
    `SELECT id, is_deleted, client_id
     FROM systems
     WHERE id IN (?)`,
    [systemIds]
  );

  return rows;
};

export const bulkAssignSystemsToClient = async (conn, systemIds, clientId) => {
  if (!systemIds.length) return 0;

  const [columns] = await conn.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'systems'`
  );
  const columnSet = new Set(columns.map((row) => row.COLUMN_NAME));
  const hasAvailabilityType = columnSet.has("availability_type");

  const [result] = await conn.query(
    `UPDATE systems
     SET client_id = ?${hasAvailabilityType ? ", availability_type = 'rented'" : ""}, updated_at = NOW()
     WHERE id IN (?) AND is_deleted = 0`,
    [clientId, systemIds]
  );

  return result.affectedRows || 0;
};

export const getSystemDetailsByIdTx = async (conn, systemId) => {
  const [rows] = await conn.query(
    `SELECT
        s.id,
        s.system_uid,
        s.system_uuid,
        s.device_type,
        s.hardware_fingerprint,
        s.client_id,
        c.u_unique_id AS client_unique_id,
        c.full_name AS client_name,
        s.installed_by_employee_id,
        e.e_unique_id AS employee_unique_id,
        e.full_name AS employee_name,
        s.installation_date,
        s.status,
        s.is_active,
        s.approval_status,
        NULL AS device_name,
        NULL AS os_name,
        NULL AS ip_address,
        NULL AS mac_address,
        s.system_info AS full_response,
        s.created_at,
        s.is_block,
        s.updated_at
     FROM systems s
     JOIN clients c ON c.id = s.client_id
     LEFT JOIN employees e ON e.id = s.installed_by_employee_id
     WHERE s.id = ? AND s.is_deleted = 0
     LIMIT 1`,
    [systemId]
  );

  return rows[0];
};

export const updateSystemDynamic = async (conn, systemId, data) => {
  console.log('data', data);

  const fields = [];
  const values = [];

  for (const key in data) {
    fields.push(`${key} = ?`);
    values.push(data[key]);
  }

  if (!fields.length) return;

  values.push(systemId);

  await conn.query(
    `UPDATE systems SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`,
    values
  );
};

export const softDeleteSystem = async (conn, systemId) => {
  await conn.query(
    `UPDATE systems SET is_deleted = 1, updated_at = NOW() WHERE id = ?`,
    [systemId]
  );
};

export const listSystems = async (
  conn,
  { search, status, client_id, employee_id, device_type, page, limit }
) => {
  const where = ["s.is_deleted = 0"];
  const params = [];

  if (search) {
    const trimmed = String(search).trim();
    if (trimmed) {
      const normalizedSearch = trimmed.replace(/^#/, "");
      const like = `%${normalizedSearch}%`;
      const numericValue = Number(normalizedSearch);
      const searchClauses = [
        "s.system_uid LIKE ?",
        "s.system_uuid LIKE ?",
        "s.device_type LIKE ?",
        "s.hardware_fingerprint LIKE ?",
        "s.status LIKE ?",
        "c.full_name LIKE ?",
        "c.u_unique_id LIKE ?",
        "e.full_name LIKE ?",
        "e.e_unique_id LIKE ?",
      ];
      const searchParams = [like, like, like, like, like, like, like, like, like];

      if (!Number.isNaN(numericValue)) {
        searchClauses.push("s.id = ?", "s.client_id = ?", "s.installed_by_employee_id = ?");
        searchParams.push(numericValue, numericValue, numericValue);
      }

      where.push(`(${searchClauses.join(" OR ")})`);
      params.push(...searchParams);
    }
  }

  if (status) {
    where.push("s.status = ?");
    params.push(status);
  }

  if (client_id) {
    where.push("s.client_id = ?");
    params.push(client_id);
  }

  if (employee_id) {
    where.push("s.installed_by_employee_id = ?");
    params.push(employee_id);
  }

  if (device_type) {
    const normalized = String(device_type).trim().toLowerCase();
    if (normalized) {
      where.push("LOWER(s.device_type) = ?");
      params.push(normalized);
    }
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await conn.query(
    `
    SELECT
      s.id,
      s.system_uid,
      s.system_uuid,
      s.device_type,
      s.hardware_fingerprint,
      s.client_id,
      c.u_unique_id AS client_unique_id,
      c.full_name AS client_name,
      s.installed_by_employee_id,
      e.e_unique_id AS employee_unique_id,
      e.full_name AS employee_name,
      s.installation_date,
      s.status,
      s.is_active,
      s.approval_status,
      NULL AS device_name,
      NULL AS os_name,
      NULL AS ip_address,
      NULL AS mac_address,
      NULL AS model,
      s.system_info AS full_response,
      s.created_at,
      s.is_block
    FROM systems s
    JOIN clients c ON c.id = s.client_id
    LEFT JOIN employees e ON e.id = s.installed_by_employee_id
    WHERE ${where.join(" AND ")}
    ORDER BY
      CASE
        WHEN s.device_type IS NULL THEN 3
        WHEN LOWER(s.device_type) LIKE '%laptop%' THEN 1
        WHEN LOWER(s.device_type) LIKE '%desktop%' THEN 2
        ELSE 3
      END,
      s.id DESC
    LIMIT ? OFFSET ?
    `,
    [...params, safeLimit, offset]
  );

  const [[{ total }]] = await conn.query(
    `
    SELECT COUNT(*) AS total
    FROM systems s
    JOIN clients c ON c.id = s.client_id
    LEFT JOIN employees e ON e.id = s.installed_by_employee_id
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

export const getSystemsByEmployeeId = async (conn, employeeId) => {
  const [rows] = await conn.query(
    `
    SELECT
      s.id,
      s.system_uid,
      s.system_uuid,
      s.device_type,
      s.hardware_fingerprint,
      s.client_id,
      c.u_unique_id AS client_unique_id,
      c.full_name AS client_name,
      (
        SELECT COUNT(*)
        FROM systems s2
        WHERE s2.client_id = s.client_id
          AND s2.is_deleted = 0
      ) AS no_of_systems,
      s.installation_date,
      s.status,
      s.is_active,
      s.approval_status,
      COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.hostname')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.hostname'))
      ) AS device_name,
      COALESCE(
        s.device_type,
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.os')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.os'))
      ) AS device_type,
      COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.ip_address')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.ip_address'))
      ) AS ip_address,
      COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.mac_address')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.mac_address'))
      ) AS mac_address,
      s.system_info AS full_response,
      s.created_at
    FROM systems s
    JOIN clients c ON c.id = s.client_id
    WHERE s.installed_by_employee_id = ?
      AND s.is_deleted = 0
    ORDER BY s.id DESC
    `,
    [employeeId]
  );

  return rows;
};

export const getSystemsByEmployeeAndClientId = async (
  conn,
  employeeId,
  clientId
) => {
  const [rows] = await conn.query(
    `
    SELECT
      s.id,
      s.system_uid,
      s.system_uuid,
      s.device_type,
      s.hardware_fingerprint,
      s.client_id,
      c.u_unique_id AS client_unique_id,
      c.full_name AS client_name,
      s.installation_date,
      s.status,
      s.is_active,
      s.approval_status,
      COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.hostname')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.hostname'))
      ) AS device_name,
      COALESCE(
        s.device_type,
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.os')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.os'))
      ) AS device_type,
      COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.ip_address')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.ip_address'))
      ) AS ip_address,
      COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.mac_address')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.mac_address'))
      ) AS mac_address,
      s.system_info AS full_response,
      s.created_at
    FROM systems s
    JOIN clients c ON c.id = s.client_id
    WHERE s.installed_by_employee_id = ?
      AND s.client_id = ?
      AND s.is_deleted = 0
    ORDER BY s.id DESC
    `,
    [employeeId, clientId]
  );

  return rows;
};

export const getSystemsByClientId = async (conn, clientId) => {
  const [rows] = await conn.query(
    `
    SELECT
      s.id,
      s.system_uid,
      s.system_uuid,
      s.device_type,
      s.hardware_fingerprint,
      s.client_id,
      c.u_unique_id AS client_unique_id,
      c.full_name AS client_name,
      s.installed_by_employee_id,
      e.e_unique_id AS employee_unique_id,
      e.full_name AS employee_name,
      s.installation_date,
      s.status,
      s.is_active,
      s.approval_status,
      COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.hostname')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.hostname'))
      ) AS device_name,
      COALESCE(
        s.device_type,
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.os')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.os'))
      ) AS device_type,
      COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.ip_address')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.ip_address'))
      ) AS ip_address,
      COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.mac_address')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.mac_address'))
      ) AS mac_address,
      s.system_info AS full_response,
      s.created_at
    FROM systems s
    JOIN clients c ON c.id = s.client_id
    LEFT JOIN employees e ON e.id = s.installed_by_employee_id
    WHERE s.client_id = ?
      AND s.is_deleted = 0
    ORDER BY s.id DESC
    `,
    [clientId]
  );

  return rows;
};

export const getSystemAssetByCategory = async (
  conn,
  systemId,
  assetCategoryId
) => {
  const [rows] = await conn.query(
    `SELECT sa.asset_id
     FROM system_assets sa
     JOIN assets a ON a.asset_id = sa.asset_id
     WHERE sa.system_id = ?
       AND a.asset_category_id = ?
       AND sa.is_deleted = 0
       AND sa.removed_at IS NULL
     LIMIT 1`,
    [systemId, assetCategoryId]
  );
  return rows[0];
};

export const getSystemByMacAddressTx = async (conn, macAddress) => {
  const mac = macAddress === undefined || macAddress === null ? "" : String(macAddress).trim();
  if (!mac) return null;

  const [rows] = await conn.query(
    `SELECT id, system_uid, system_uuid, hardware_fingerprint, client_id, is_deleted
     FROM systems
     WHERE is_deleted = 0
       AND LOWER(COALESCE(
         JSON_UNQUOTE(JSON_EXTRACT(system_info, '$.system_info.mac_address')),
         JSON_UNQUOTE(JSON_EXTRACT(system_info, '$.mac_address')),
         JSON_UNQUOTE(JSON_EXTRACT(system_info, '$.system_info.mac_addres')),
         JSON_UNQUOTE(JSON_EXTRACT(system_info, '$.mac_addres'))
       )) = LOWER(?)
     LIMIT 1`,
    [mac]
  );

  return rows[0] || null;
};

export const getSystemAssetsByCategories = async (
  conn,
  systemId,
  assetCategoryIds = []
) => {
  if (!assetCategoryIds.length) return [];

  const [rows] = await conn.query(
    `SELECT a.asset_category_id, sa.asset_id
     FROM system_assets sa
     JOIN assets a ON a.asset_id = sa.asset_id
     WHERE sa.system_id = ?
       AND sa.is_deleted = 0
       AND sa.removed_at IS NULL
       AND a.asset_category_id IN (?)
     ORDER BY sa.asset_id ASC`,
    [systemId, assetCategoryIds]
  );

  return rows;
};

export const upsertSystemAsset = async (
  conn,
  { system_id, asset_id, installed_at }
) => {
  const [rows] = await conn.query(
    `SELECT id, removed_at, is_deleted
     FROM system_assets
     WHERE system_id = ? AND asset_id = ?
     LIMIT 1`,
    [system_id, asset_id]
  );

  const existing = rows[0];
  if (!existing) {
    await conn.query(
      `INSERT INTO system_assets
       (system_id, asset_id, installed_at)
       VALUES (?, ?, ?)`,
      [system_id, asset_id, installed_at || new Date()]
    );
    return;
  }

  if (existing.is_deleted || existing.removed_at) {
    await conn.query(
      `UPDATE system_assets
       SET removed_at = NULL,
           is_deleted = 0,
           installed_at = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [installed_at || new Date(), existing.id]
    );
  }
};

export const getActiveSystemAssetIds = async (conn, systemId) => {
  const [rows] = await conn.query(
    `SELECT asset_id
     FROM system_assets
     WHERE system_id = ?
       AND is_deleted = 0
       AND removed_at IS NULL`,
    [systemId]
  );
  return rows.map((row) => row.asset_id);
};

export const markSystemAssetsRemoved = async (conn, systemId, assetIds = []) => {
  if (!assetIds.length) return;
  await conn.query(
    `UPDATE system_assets
     SET removed_at = NOW(), is_deleted = 1, updated_at = NOW()
     WHERE system_id = ? AND asset_id IN (?) AND removed_at IS NULL`,
    [systemId, assetIds]
  );
};

export const getSystemAssetsBySystemIds = async (conn, systemIds = []) => {
  if (!systemIds.length) return [];
  const [rows] = await conn.query(
    `SELECT
       sa.system_id,
       a.asset_id,
       t.name AS asset_category_name,
       a.brand,
       a.model,
       a.size,
       a.serial_number,
       a.manufacturer,
       a.spec_json,
       a.status
     FROM system_assets sa
     JOIN assets a ON a.asset_id = sa.asset_id
     JOIN asset_category t ON t.id = a.asset_category_id
     WHERE sa.system_id IN (?)
       AND sa.is_deleted = 0
       AND sa.removed_at IS NULL
     ORDER BY sa.system_id ASC, a.asset_id ASC`,
    [systemIds]
  );
  return rows;
};

export const getSystemSnapshotBySystemId = async (conn, systemId) => {
  const [rows] = await conn.query(
    `SELECT id, system_id, system_uuid, original_snapshot_json, latest_snapshot_json,
            diff_json, changed_at, is_changed
     FROM system_snapshots
     WHERE system_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [systemId]
  );

  return rows[0];
};

export const insertSystemSnapshot = async (
  conn,
  {
    system_id,
    system_uuid,
    original_snapshot_json,
    latest_snapshot_json,
    diff_json,
    changed_at,
    is_changed,
  }
) => {
  await conn.query(
    `INSERT INTO system_snapshots
     (system_id, system_uuid, original_snapshot_json, latest_snapshot_json, diff_json, changed_at, is_changed)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      system_id,
      system_uuid,
      original_snapshot_json || null,
      latest_snapshot_json || null,
      diff_json || null,
      changed_at || null,
      is_changed ? 1 : 0,
    ]
  );

  return { changed: true };
};

