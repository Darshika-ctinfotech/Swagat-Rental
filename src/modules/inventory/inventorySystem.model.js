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
    if (!rows.length) return candidate;
  }
  throw new Error("Failed to generate unique system uid");
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

const getSystemsColumnSetTx = async (conn) => {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'systems'`
  );
  return new Set(rows.map((row) => row.COLUMN_NAME));
};

export const createSystemTx = async (conn, system) => {
  const columns = await getSystemsColumnSetTx(conn);

  const systemUid = system.system_uid || (await generateUniqueSystemUid(conn));
  const systemUuid = system.system_uuid || randomUUID();

  const insertData = {
    system_uid: systemUid,
    system_uuid: systemUuid,
    hardware_fingerprint: system.hardware_fingerprint ?? null,
    device_type: system.device_type ?? null,
    client_id: system.client_id,
    installed_by_employee_id: system.installed_by_employee_id ?? null,
    installation_date: system.installation_date ?? null,
    status: system.status ?? "active",
    is_active: system.is_active ?? 1,
    system_info: system.system_info ?? null,
  };

  const keys = Object.keys(insertData).filter((key) => columns.has(key));
  const placeholders = keys.map(() => "?").join(", ");

  const [result] = await conn.query(
    `INSERT INTO systems (${keys.join(", ")}) VALUES (${placeholders})`,
    keys.map((key) => insertData[key])
  );

  return { id: result.insertId, system_uid: systemUid, system_uuid: systemUuid };
};

export const ensureSystemUidTx = async (conn, systemId, currentUid) => {
  if (currentUid) return currentUid;
  const systemUid = await generateUniqueSystemUid(conn);
  await conn.query(
    `UPDATE systems SET system_uid = ?, updated_at = NOW() WHERE id = ?`,
    [systemUid, systemId]
  );
  return systemUid;
};

export const updateSystemDynamicTx = async (conn, systemId, data) => {
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

export const getSystemSnapshotBySystemIdTx = async (conn, systemId) => {
  const [rows] = await conn.query(
    `SELECT id, system_id, latest_snapshot_json
     FROM system_snapshots
     WHERE system_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [systemId]
  );
  return rows[0];
};

export const insertSystemSnapshotTx = async (
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
      original_snapshot_json ?? null,
      latest_snapshot_json ?? null,
      diff_json ?? null,
      changed_at ?? null,
      is_changed ? 1 : 0,
    ]
  );
};

export const upsertSystemAssetTx = async (
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
      `INSERT INTO system_assets (system_id, asset_id, installed_at)
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

export const getActiveSystemAssetIdsTx = async (conn, systemId) => {
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

export const markSystemAssetsRemovedTx = async (conn, systemId, assetIds = []) => {
  if (!assetIds.length) return;
  await conn.query(
    `UPDATE system_assets
     SET removed_at = NOW(), is_deleted = 1, updated_at = NOW()
     WHERE system_id = ? AND asset_id IN (?) AND removed_at IS NULL`,
    [systemId, assetIds]
  );
};

export const getActiveSystemAssetLinkByAssetIdTx = async (conn, assetId) => {
  const [rows] = await conn.query(
    `SELECT system_id
     FROM system_assets
     WHERE asset_id = ?
       AND is_deleted = 0
       AND removed_at IS NULL
     LIMIT 1`,
    [assetId]
  );

  return rows[0] || null;
};

export const getSystemInventoryListTx = async (
  conn,
  { search, status, client_id = null, device_type, page = 1, limit = 20 }
) => {
  const where = ["s.is_deleted = 0"];
  const params = [];

  const trimmedSearch = search === undefined || search === null ? "" : String(search).trim();
  if (trimmedSearch) {
    const like = `%${trimmedSearch}%`;
    where.push(`(
      s.system_uid LIKE ?
      OR s.system_uuid LIKE ?
      OR s.hardware_fingerprint LIKE ?
      OR COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.hostname')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.hostname'))
      ) LIKE ?
    )`);
    params.push(like, like, like, like);
  }

  if (status) {
    where.push("s.status = ?");
    params.push(status);
  }

  if (device_type) {
    where.push("s.device_type = ?");
    params.push(device_type);
  }

  if (client_id !== undefined) {
    if (client_id === null) {
      where.push("s.client_id IS NULL");
    } else {
      where.push("s.client_id = ?");
      params.push(client_id);
    }
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await conn.query(
    `
    SELECT
      s.id AS system_id,
      s.system_uid,
      s.system_uuid,
      s.device_type,
      s.hardware_fingerprint,
      s.client_id,
      s.installed_by_employee_id,
      s.installation_date,
      s.status,
      s.is_active,
      COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.hostname')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.hostname')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.osInfo.hostname')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.osInfo.hostname'))
      ) AS hostname,
      COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.os')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.os')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.osInfo.distro')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.osInfo.platform')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.osInfo.distro')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.osInfo.platform'))
      ) AS os,
      COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.mac_address')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.mac_address')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.mac_addres')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.mac_addres'))
      ) AS mac_address,
      c.u_unique_id AS client_unique_id,
      c.full_name AS client_name,
      e.e_unique_id AS employee_unique_id,
      e.full_name AS employee_name,
      (
        SELECT COUNT(*)
        FROM system_assets sa
        WHERE sa.system_id = s.id
          AND sa.is_deleted = 0
          AND sa.removed_at IS NULL
      ) AS asset_count,
      s.created_at,
      s.updated_at
    FROM systems s
    LEFT JOIN clients c ON c.id = s.client_id
    LEFT JOIN employees e ON e.id = s.installed_by_employee_id
    WHERE ${where.join(" AND ")}
    ORDER BY s.id DESC
    LIMIT ? OFFSET ?
    `,
    [...params, safeLimit, offset]
  );

  const [[{ total }]] = await conn.query(
    `
    SELECT COUNT(*) AS total
    FROM systems s
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

export const getSystemInventoryDetailsTx = async (conn, systemId) => {
  const [rows] = await conn.query(
    `
    SELECT
      s.id AS system_id,
      s.system_uid,
      s.system_uuid,
      s.device_type,
      s.hardware_fingerprint,
      s.client_id,
      s.installed_by_employee_id,
      s.installation_date,
      s.status,
      s.is_active,
      s.system_info,
      COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.hostname')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.hostname')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.osInfo.hostname')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.osInfo.hostname'))
      ) AS hostname,
      COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.os')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.os')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.osInfo.distro')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.osInfo.platform')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.osInfo.distro')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.osInfo.platform'))
      ) AS os,
      COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.mac_address')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.mac_address')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.system_info.mac_addres')),
        JSON_UNQUOTE(JSON_EXTRACT(s.system_info, '$.mac_addres'))
      ) AS mac_address,
      c.u_unique_id AS client_unique_id,
      c.full_name AS client_name,
      c.email AS client_email,
      e.e_unique_id AS employee_unique_id,
      e.full_name AS employee_name,
      s.created_at,
      s.updated_at
    FROM systems s
    LEFT JOIN clients c ON c.id = s.client_id
    LEFT JOIN employees e ON e.id = s.installed_by_employee_id
    WHERE s.id = ?
      AND s.is_deleted = 0
    LIMIT 1
    `,
    [systemId]
  );

  const system = rows[0] || null;
  if (!system) return null;

  const [assets] = await conn.query(
    `
    SELECT
      a.asset_id,
      a.asset_category_id,
      ac.name AS asset_category_name,
      ac.display_name AS asset_category_display_name,
      a.brand,
      a.model,
      a.serial_number,
      a.manufacturer,
      a.size,
      a.spec_json,
      a.is_available,
      a.status,
      sa.installed_at,
      sa.removed_at
    FROM system_assets sa
    JOIN assets a ON a.asset_id = sa.asset_id
    LEFT JOIN asset_category ac ON ac.id = a.asset_category_id
    WHERE sa.system_id = ?
      AND sa.is_deleted = 0
      AND sa.removed_at IS NULL
    ORDER BY a.asset_id ASC
    `,
    [systemId]
  );

  return { system, assets };
};
