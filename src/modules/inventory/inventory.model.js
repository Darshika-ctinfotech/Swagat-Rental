// export const listInventoryTypes = async (conn) => {
//   const [rows] = await conn.query(
//     `SELECT id AS asset_category_id, name, display_name, is_active
//      FROM asset_category
//      WHERE is_deleted = 0
//      ORDER BY name ASC`
//   );
//   return rows;
// };

export const listAssetCategories = async (
  conn,
  { search, is_active, page, limit }
) => {
  const where = ["is_deleted = 0"];
  const params = [];

  if (search) {
    const trimmed = String(search).trim();
    if (trimmed) {
      const normalized = trimmed.replace(/^#/, "");
      const like = `%${normalized}%`;
      const numericValue = Number(normalized);
      if (!Number.isNaN(numericValue)) {
        where.push("(id = ? OR name LIKE ?)");
        params.push(numericValue, like);
      } else {
        where.push("name LIKE ?");
        params.push(like);
      }
    }
  }

  if (is_active !== undefined) {
    where.push("is_active = ?");
    params.push(is_active ? 1 : 0);
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await conn.query(
    `
    SELECT id AS asset_category_id, name, display_name, is_active, created_at, updated_at
    FROM asset_category
    WHERE ${where.join(" AND ")}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
    `,
    [...params, safeLimit, offset]
  );

  const [[{ total }]] = await conn.query(
    `
    SELECT COUNT(*) AS total
    FROM asset_category
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

export const getAssetCategoryMap = async (conn) => {
  const [rows] = await conn.query(
    `SELECT id, name, display_name
     FROM asset_category
     WHERE is_deleted = 0`
  );
  const map = new Map();
  rows.forEach((row) => {
    map.set(row.name.toLowerCase(), row.id);
  });
  return map;
};

export const getAssetCategoryByNameTx = async (conn, name) => {
  const [rows] = await conn.query(
    `SELECT id AS asset_category_id, name, display_name, is_active, is_deleted
     FROM asset_category
     WHERE name = ?
     LIMIT 1`,
    [name]
  );

  return rows[0];
};

export const getInventoryTypeByIdTx = async (conn, inventoryTypeId) => {
  const [rows] = await conn.query(
    `SELECT id AS asset_category_id, name, display_name, is_active, is_deleted
     FROM asset_category
     WHERE id = ?
     LIMIT 1`,
    [inventoryTypeId]
  );

  return rows[0];
};

export const hasAssetsForCategoryTx = async (conn, assetCategoryId) => {
  const [rows] = await conn.query(
    `SELECT 1 AS has_asset
     FROM assets
     WHERE asset_category_id = ?
       AND is_deleted = 0
     LIMIT 1`,
    [assetCategoryId]
  );

  return rows.length > 0;
};

export const listInventories = async (
  conn,
  { asset_category_id, status, search, page, limit }
) => {
  const where = ["i.is_deleted = 0"];
  const params = [];

  if (asset_category_id) {
    where.push("i.asset_category_id = ?");
    params.push(asset_category_id);
  }

  if (status) {
    where.push("i.status = ?");
    params.push(status);
  }

  if (search) {
    const like = `%${String(search)}%`;
    where.push(
      [
        "(",
        "t.name LIKE ?",
        "OR i.brand LIKE ?",
        "OR i.model LIKE ?",
        "OR i.serial_number LIKE ?",
        "OR i.status LIKE ?",
        ")",
      ].join(" ")
    );
    params.push(like, like, like, like, like);
  }

  const isPaginationRequested = limit !== undefined || page !== undefined;

  if (!isPaginationRequested) {
    const [rows] = await conn.query(
      `
      SELECT
        i.asset_id,
        i.asset_category_id,
        t.name AS asset_category_name,
        i.brand,
        i.model,
        i.size,
        i.serial_number,
        i.manufacturer,
        i.spec_json,
        i.is_available,
        i.status,
        i.created_at,
        i.updated_at
      FROM assets i
      JOIN asset_category t ON t.id = i.asset_category_id
      WHERE ${where.join(" AND ")}
      ORDER BY i.asset_id DESC
      `,
      params
    );

    return {
      rows,
      total: rows.length,
      page: undefined,
      limit: undefined,
    };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await conn.query(
    `
    SELECT
      i.asset_id,
      i.asset_category_id,
      t.name AS asset_category_name,
      i.brand,
      i.model,
      i.size,
      i.serial_number,
      i.manufacturer,
      i.spec_json,
      i.is_available,
      i.status,
      i.created_at,
      i.updated_at
    FROM assets i
    JOIN asset_category t ON t.id = i.asset_category_id
    WHERE ${where.join(" AND ")}
    ORDER BY i.asset_id DESC
    LIMIT ? OFFSET ?
    `,
    [...params, safeLimit, offset]
  );

  const [[{ total }]] = await conn.query(
    `
    SELECT COUNT(*) AS total
    FROM assets i
    JOIN asset_category t ON t.id = i.asset_category_id
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

export const getInventoryByIdTx = async (conn, inventoryId) => {
  const [rows] = await conn.query(
    `
    SELECT
      i.asset_id,
      i.asset_category_id,
      t.name AS asset_category_name,
      i.brand,
      i.model,
      i.size,
      i.serial_number,
      i.manufacturer,
      i.spec_json,
      i.is_available,
      i.status,
      i.is_deleted,
      i.created_at,
      i.updated_at
    FROM assets i
    JOIN asset_category t ON t.id = i.asset_category_id
    WHERE i.asset_id = ?
    LIMIT 1
    `,
    [inventoryId]
  );

  return rows[0];
};

export const getInventoryByIdForUpdate = async (conn, inventoryId) => {
  const [rows] = await conn.query(
    `SELECT asset_id, asset_category_id, is_deleted
     FROM assets
     WHERE asset_id = ?
     LIMIT 1`,
    [inventoryId]
  );

  return rows[0];
};

export const getAssetsColumnSetTx = async (conn) => {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'assets'`
  );

  return new Set(rows.map((row) => row.COLUMN_NAME));
};

export const createInventory = async (conn, inventory, columns) => {
  const columnSet = columns || (await getAssetsColumnSetTx(conn));

  const insertData = {
    asset_category_id: inventory.asset_category_id,
    brand: inventory.brand || null,
    model: inventory.model || null,
    serial_number: inventory.serial_number || null,
    manufacturer: inventory.manufacturer || null,
    spec_json: inventory.spec_json || null,
    size: inventory.size || null,
    is_available: inventory.is_available ?? 1,
    status: inventory.status || "in_stock",
    added_by: inventory.added_by ?? null,
    added_by_role: inventory.added_by_role ?? null,
  };

  const keys = Object.keys(insertData).filter((key) => columnSet.has(key));
  const placeholders = keys.map(() => "?").join(", ");

  const [result] = await conn.query(
    `INSERT INTO assets (${keys.join(", ")}) VALUES (${placeholders})`,
    keys.map((key) => insertData[key])
  );

  return result.insertId;
};

export const createAssetCategory = async (conn, name, display_name, isActive = 1) => {
  const [result] = await conn.query(
    `INSERT INTO asset_category (name, display_name, is_active)
     VALUES (?, ?, ?)`,
    [name, display_name, isActive ? 1 : 0]
  );
  return result.insertId;
};

export const updateAssetCategoryDynamic = async (conn, categoryId, data) => {
  const fields = [];
  const values = [];

  for (const key in data) {
    fields.push(`${key} = ?`);
    values.push(data[key]);
  }

  if (!fields.length) return;

  values.push(categoryId);

  await conn.query(
    `UPDATE asset_category SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`,
    values
  );
};

export const findAssetByIdentity = async (
  conn,
  { asset_category_id, serial_number, brand, model, manufacturer }
) => {
  if (!serial_number) return null;

  const where = ["asset_category_id = ?", "serial_number = ?", "is_deleted = 0"];
  const params = [asset_category_id, serial_number];

  if (brand !== undefined && brand !== null) {
    where.push("brand = ?");
    params.push(brand);
  }
  if (model !== undefined && model !== null) {
    where.push("model = ?");
    params.push(model);
  }
  if (manufacturer !== undefined && manufacturer !== null) {
    where.push("manufacturer = ?");
    params.push(manufacturer);
  }

  const [rows] = await conn.query(
    `SELECT asset_id
     FROM assets
     WHERE ${where.join(" AND ")}
     LIMIT 1`,
    params
  );

  return rows[0];
};

export const findAvailableAssetByProfile = async (
  conn,
  { asset_category_id, brand, model, manufacturer }
) => {
  const where = [
    "asset_category_id = ?",
    "is_deleted = 0",
    "is_available = 1",
    "status = 'in_stock'",
  ];
  const params = [asset_category_id];

  if (brand !== undefined && brand !== null) {
    where.push("brand = ?");
    params.push(brand);
  }
  if (model !== undefined && model !== null) {
    where.push("model = ?");
    params.push(model);
  }
  if (manufacturer !== undefined && manufacturer !== null) {
    where.push("manufacturer = ?");
    params.push(manufacturer);
  }

  const [rows] = await conn.query(
    `SELECT asset_id
     FROM assets
     WHERE ${where.join(" AND ")}
     ORDER BY asset_id ASC
     LIMIT 1`,
    params
  );

  return rows[0];
};

export const listAssetsBySerials = async (
  conn,
  categoryIds = [],
  serialNumbers = []
) => {
  if (!categoryIds.length || !serialNumbers.length) return [];

  const [rows] = await conn.query(
    `SELECT asset_id, asset_category_id, serial_number, brand, model, manufacturer
     FROM assets
     WHERE is_deleted = 0
       AND asset_category_id IN (?)
       AND serial_number IN (?)`,
    [categoryIds, serialNumbers]
  );

  return rows;
};

export const listAvailableAssetsByCategories = async (
  conn,
  categoryIds = []
) => {
  if (!categoryIds.length) return [];

  const [rows] = await conn.query(
    `SELECT asset_id, asset_category_id, brand, model, manufacturer
     FROM assets
     WHERE asset_category_id IN (?)
       AND is_deleted = 0
       AND is_available = 1
       AND status = 'in_stock'
     ORDER BY asset_id ASC`,
    [categoryIds]
  );

  return rows;
};

export const updateAssetAvailability = async (conn, assetId, isAvailable) => {
  await conn.query(
    `UPDATE assets SET is_available = ?, updated_at = NOW() WHERE asset_id = ?`,
    [isAvailable ? 1 : 0, assetId]
  );
};

export const updateAssetAvailabilityBulk = async (
  conn,
  assetIds = [],
  isAvailable
) => {
  if (!assetIds.length) return 0;

  const [result] = await conn.query(
    `UPDATE assets SET is_available = ?, updated_at = NOW() WHERE asset_id IN (?)`,
    [isAvailable ? 1 : 0, assetIds]
  );

  return result.affectedRows || 0;
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
