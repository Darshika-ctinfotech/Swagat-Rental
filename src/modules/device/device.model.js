import { randomUUID } from "crypto";

const generateTempDeviceId = () => `DID-TMP-${randomUUID()}`;
const formatDeviceUniqueId = (id) => `DID${String(id).padStart(6, "0")}`;

export const createDevice = async (conn, device) => {
  const tempId = device.device_uid || generateTempDeviceId();
  const [result] = await conn.query(
    `INSERT INTO devices
     (device_uid, device_uuid, device_name, inventory_ids, device_type, client_id, installed_by_employee_id, installation_date, status,
      warranty_start_date, warranty_end_date, is_warranty_active, processor, motherboard, mac_address,
      ip_address, ram_gb, ram_serial_no, ram_brand, ssd_gb, ssd_serial_no, full_response)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tempId,
      device.device_uuid,
      device.device_name,
      device.inventory_ids || null,
      device.device_type,
      device.client_id,
      device.installed_by_employee_id,
      device.installation_date,
      device.status,
      device.warranty_start_date,
      device.warranty_end_date,
      device.is_warranty_active,
      device.processor,
      device.motherboard,
      device.mac_address,
      device.ip_address,
      device.ram_gb,
      device.ram_serial_no,
      device.ram_brand,
      device.ssd_gb,
      device.ssd_serial_no,
      device.full_response,
    ]
  );

  const insertId = result.insertId;

  if (!device.device_uid) {
    const finalId = formatDeviceUniqueId(insertId);
    await conn.query(
      `UPDATE devices SET device_uid = ?, updated_at = NOW() WHERE id = ?`,
      [finalId, insertId]
    );
  }

  return insertId;
};

export const getDeviceByIdTx = async (conn, deviceId) => {
  const [rows] = await conn.query(
    `SELECT
        d.id,
        d.device_uid,
        d.device_uuid,
        d.device_name,
        d.inventory_ids,
        d.device_type,
        d.status,
        d.client_id,
        c.u_unique_id AS client_unique_id,
        c.full_name AS client_name,
        d.installed_by_employee_id,
        e.e_unique_id AS employee_unique_id,
        e.full_name AS employee_name,
        d.installation_date,
        d.warranty_start_date,
        d.warranty_end_date,
        d.is_warranty_active,
        d.processor,
        d.motherboard,
        d.mac_address,
        d.ip_address,
        d.ram_gb,
        d.ram_serial_no,
        d.ram_brand,
        d.ssd_gb,
        d.ssd_serial_no,
        d.created_at,
        d.updated_at
     FROM devices d
     JOIN clients c ON c.id = d.client_id
     LEFT JOIN employees e ON e.id = d.installed_by_employee_id
     WHERE d.id = ? AND d.is_deleted = 0
     LIMIT 1`,
    [deviceId]
  );

  return rows[0];
};

export const getDeviceByIdForUpdate = async (conn, deviceId) => {
  const [rows] = await conn.query(
    `SELECT id, client_id, installed_by_employee_id, is_deleted, device_uuid
     FROM devices
     WHERE id = ?
     LIMIT 1`,
    [deviceId]
  );

  return rows[0];
};

export const getDeviceInventoryMappingTx = async (conn, deviceId) => {
  const [rows] = await conn.query(
    `SELECT
       id,
       inventory_ids,
       processor,
       motherboard,
       mac_address,
       ip_address,
       ram_gb,
       ram_serial_no,
       ram_brand,
       ssd_gb,
       ssd_serial_no
     FROM devices
     WHERE id = ?
     LIMIT 1`,
    [deviceId]
  );

  return rows[0];
};

export const getDeviceByUidTx = async (conn, deviceUid) => {
  const [rows] = await conn.query(
    `SELECT id, client_id, installed_by_employee_id, is_deleted, device_uuid
     FROM devices
     WHERE device_uid = ?
     LIMIT 1`,
    [deviceUid]
  );

  return rows[0];
};

export const getDeviceByMacTx = async (conn, clientId, macAddress) => {
  const [rows] = await conn.query(
    `SELECT id, client_id, installed_by_employee_id, is_deleted, device_uuid
     FROM devices
     WHERE client_id = ? AND mac_address = ? AND is_deleted = 0
     LIMIT 1`,
    [clientId, macAddress]
  );

  return rows[0];
};

export const updateDeviceDynamic = async (conn, deviceId, data) => {
  const fields = [];
  const values = [];

  for (const key in data) {
    fields.push(`${key} = ?`);
    values.push(data[key]);
  }

  if (!fields.length) return;

  values.push(deviceId);

  const sql = `
    UPDATE devices
    SET ${fields.join(", ")}, updated_at = NOW()
    WHERE id = ?
  `;

  await conn.query(sql, values);
};

export const listDevices = async (conn, { search, status, client_id, employee_id, page, limit }) => {
  const where = ["d.is_deleted = 0"];
  const params = [];

  if (search) {
    where.push(`(
      d.device_uid LIKE ?
      OR d.device_type LIKE ?
      OR c.full_name LIKE ?
      OR c.u_unique_id LIKE ?
      OR d.ip_address LIKE ?
    )`);
    const like = `%${search}%`;
    params.push(like, like, like, like, like);
  }

  if (status) {
    where.push("d.status = ?");
    params.push(status);
  }

  if (client_id) {
    where.push("d.client_id = ?");
    params.push(client_id);
  }

  if (employee_id) {
    where.push("d.installed_by_employee_id = ?");
    params.push(employee_id);
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await conn.query(
    `
    SELECT
      d.id,
      d.device_uid,
      d.device_uuid,
      d.device_name,
      d.inventory_ids,
      d.device_type,
      d.ip_address,
      d.status,
      d.installation_date,
      d.client_id,
      c.u_unique_id AS client_unique_id,
      c.full_name AS client_name,
      d.installed_by_employee_id,
      e.e_unique_id AS employee_unique_id,
      e.full_name AS employee_name,
      d.created_at
    FROM devices d
    JOIN clients c ON c.id = d.client_id
    LEFT JOIN employees e ON e.id = d.installed_by_employee_id
    WHERE ${where.join(" AND ")}
    ORDER BY d.id DESC
    LIMIT ? OFFSET ?
    `,
    [...params, safeLimit, offset]
  );

  const [[{ total }]] = await conn.query(
    `
    SELECT COUNT(*) AS total
    FROM devices d
    JOIN clients c ON c.id = d.client_id
    LEFT JOIN employees e ON e.id = d.installed_by_employee_id
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

export const getDevicesByEmployeeId = async (conn, employeeId) => {
  const [rows] = await conn.query(
    `
    SELECT
      d.id,
      d.device_uid,
      d.device_uuid,
      d.device_name,
      d.inventory_ids,
      d.device_type,
      d.ip_address,
      d.status,
      d.installation_date,
      d.client_id,
      c.u_unique_id AS client_unique_id,
      c.full_name AS client_name
    FROM devices d
    JOIN clients c ON c.id = d.client_id
    WHERE d.installed_by_employee_id = ?
      AND d.is_deleted = 0
    ORDER BY d.id DESC
    `,
    [employeeId]
  );

  return rows;
};

export const softDeleteDevice = async (conn, deviceId) => {
  await conn.query(
    `UPDATE devices SET is_deleted = 1, updated_at = NOW() WHERE id = ?`,
    [deviceId]
  );
};


export const getDeviceByUuidTx = async (conn, deviceUuid) => {
  const [rows] = await conn.query(
    `SELECT id, client_id, installed_by_employee_id, is_deleted, device_uuid
     FROM devices
     WHERE device_uuid = ?
     LIMIT 1`,
    [deviceUuid]
  );

  return rows[0];
};

export const getInventoryTypeMap = async (conn) => {
  const [rows] = await conn.query(
    `SELECT id AS inventory_type_id, name AS inventory_type_name
     FROM asset_category
     WHERE is_deleted = 0`
  );
  const map = new Map();
  rows.forEach((row) => {
    map.set(row.inventory_type_name, row.inventory_type_id);
  });
  return map;
};

export const getInventoryDetailsByIds = async (conn, inventoryIds) => {
  if (!inventoryIds || !inventoryIds.length) return [];
  const [rows] = await conn.query(
    `SELECT
       a.asset_id,
       t.name AS asset_category_name,
       a.brand,
       a.model,
       a.serial_number,
       a.manufacturer,
       a.spec_json,
       a.status
     FROM assets a
     JOIN asset_category t ON t.id = a.asset_category_id
     WHERE a.asset_id IN (?)
     ORDER BY a.asset_id ASC`,
    [inventoryIds]
  );
  return rows;
};

export const createInventory = async (conn, inventory) => {
  const [result] = await conn.query(
    `INSERT INTO assets (asset_category_id, brand, model, serial_number, manufacturer, spec_json, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      inventory.asset_category_id,
      inventory.brand || null,
      inventory.model || null,
      inventory.serial_number || null,
      inventory.manufacturer || null,
      inventory.spec_json || null,
      inventory.status || "in_stock",
    ]
  );
  return result.insertId;
};

export const updateInventoryDynamic = async (conn, inventoryId, data) => {
  const fields = [];
  const values = [];

  for (const key in data) {
    fields.push(`${key} = ?`);
    values.push(data[key]);
  }

  if (!fields.length) return;

  values.push(inventoryId);

  const sql = `
    UPDATE assets
    SET ${fields.join(", ")}, updated_at = NOW()
    WHERE asset_id = ?
  `;

  await conn.query(sql, values);
};
