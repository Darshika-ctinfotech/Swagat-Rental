export const getAdminByEmail = async (conn, email) => {
  const [rows] = await conn.query(
    "SELECT * FROM admins WHERE email = ? AND is_deleted = 0 LIMIT 1",
    [email]
  );

  return rows[0];
};

export const createAdmin = async (conn, admin) => {
  const [result] = await conn.query(
    `INSERT INTO admins
     (full_name, email, password, show_password, profile_image, role, email_otp, is_verified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      admin.full_name,
      admin.email,
      admin.password,
      admin.show_password ?? null,
      admin.profile_image,
      admin.role,
      admin.email_otp,
      admin.is_verified,
    ]
  );

  return result.insertId;
};

export const getAdminForEmailVerification = async (conn, email) => {
  const [rows] = await conn.query(
    `SELECT id, email_otp, is_verified
     FROM admins
     WHERE email = ? AND is_deleted = 0`,
    [email]
  );

  return rows[0];
};

export const markEmailVerified = async (conn, adminId) => {
  await conn.query(
    `UPDATE admins
     SET is_verified = 1,
         email_otp = NULL,
         updated_at = NOW()
     WHERE id = ?`,
    [adminId]
  );
};

export const updateEmailOtp = async (conn, adminId, otp) => {
  await conn.query(
    `UPDATE admins
     SET email_otp = ?, updated_at = NOW()
     WHERE id = ?`,
    [otp, adminId]
  );
};

export const getAdminForLogin = async (conn, email) => {
  const [rows] = await conn.query(
    `SELECT
        id,
        full_name,
        email,
        password,
        show_password,
        profile_image,
        role,
        is_verified,
        is_disabled,
        is_deleted
     FROM admins
     WHERE email = ?
     LIMIT 1`,
    [email]
  );

  return rows[0];
};

export const getAdminByIdTx = async (conn, adminId) => {
  const [rows] = await conn.query(
    `SELECT
        id,
        full_name,
        email,
        show_password,
        profile_image,
        role,
        is_disabled,
        is_deleted
     FROM admins
     WHERE id = ? AND is_deleted = 0
     LIMIT 1`,
    [adminId]
  );

  return rows[0];
};

export const getAdminPasswordByIdTx = async (conn, adminId) => {
  const [rows] = await conn.query(
    `SELECT id, password, is_disabled, is_deleted
     FROM admins
     WHERE id = ?
     LIMIT 1`,
    [adminId]
  );

  return rows[0];
};

export const updateAdminDynamic = async (conn, adminId, data) => {
  const fields = [];
  const values = [];

  for (const key in data) {
    fields.push(`${key} = ?`);
    values.push(data[key]);
  }

  values.push(adminId);

  const sql = `
    UPDATE admins
    SET ${fields.join(", ")}, updated_at = NOW()
    WHERE id = ?
  `;

  await conn.query(sql, values);
};

export const saveForgotToken = async (conn, adminId, token, expiresAt) => {
  await conn.query(
    `UPDATE admins
     SET forgot_code = ?, forgot_code_expires_at = ?
     WHERE id = ?`,
    [token, expiresAt, adminId]
  );
};

export const findAdminByResetToken = async (conn, token) => {
  const [rows] = await conn.query(
    `SELECT id, forgot_code_expires_at
     FROM admins
     WHERE forgot_code = ?`,
    [token]
  );

  return rows[0];
};

export const updatePasswordAfterReset = async (
  conn,
  adminId,
  password,
  showPassword = null
) => {
  await conn.query(
    `UPDATE admins
     SET password = ?, show_password = ?, forgot_code = NULL, forgot_code_expires_at = NULL
     WHERE id = ?`,
    [password, showPassword, adminId]
  );
};

export const listGsmGateways = async (
  conn,
  { search, status, page, limit }
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
        where.push(
          "(id = ? OR number_of_port = ? OR gateway_name LIKE ? OR model_number LIKE ? OR manufacturer LIKE ?)"
        );
        params.push(numericValue, numericValue, like, like, like);
      } else {
        where.push(
          "(gateway_name LIKE ? OR model_number LIKE ? OR manufacturer LIKE ?)"
        );
        params.push(like, like, like);
      }
    }
  }

  if (status) {
    where.push("status = ?");
    params.push(status);
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await conn.query(
    `
    SELECT
      id,
      gateway_name,
      model_number,
      manufacturer,
      number_of_port,
      total_quantity,
      GREATEST(
        total_quantity - (
          SELECT COALESCE(SUM(cga.allocated_quantity), 0)
          FROM client_gsm_gateway_allocations cga
          WHERE cga.gateway_id = gsm_gateways.id
        ) - (
          SELECT
            COALESCE(SUM(CASE WHEN im.movement_type = 'sale' THEN im.qty ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN im.movement_type = 'sale_void' THEN im.qty ELSE 0 END), 0)
          FROM inventory_movements im
          WHERE im.item_type = 'gsm_gateway'
            AND im.item_id = gsm_gateways.id
        ),
        0
      ) AS total_left,
      status,
      created_by,
      updated_by,
      created_at,
      updated_at
    FROM gsm_gateways
    WHERE ${where.join(" AND ")}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
    `,
    [...params, safeLimit, offset]
  );

  const [[{ total }]] = await conn.query(
    `
    SELECT COUNT(*) AS total
    FROM gsm_gateways
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

export const getGsmGatewayByIdTx = async (conn, gatewayId) => {
  const [rows] = await conn.query(
    `
    SELECT
      id,
      gateway_name,
      model_number,
      manufacturer,
      number_of_port,
      total_quantity,
      status,
      is_deleted,
      created_by,
      updated_by,
      created_at,
      updated_at
    FROM gsm_gateways
    WHERE id = ?
    LIMIT 1
    `,
    [gatewayId]
  );

  return rows[0];
};

export const createGsmGateway = async (conn, gateway) => {
  const [result] = await conn.query(
    `
    INSERT INTO gsm_gateways
      (gateway_name, model_number, manufacturer, number_of_port, total_quantity, status, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      gateway.gateway_name,
      gateway.model_number ?? null,
      gateway.manufacturer ?? null,
      gateway.number_of_port ?? null,
      gateway.total_quantity ?? 0,
      gateway.status || "active",
      gateway.created_by ?? null,
      gateway.updated_by ?? null,
    ]
  );

  return result.insertId;
};

export const updateGsmGatewayDynamic = async (conn, gatewayId, data) => {
  const fields = [];
  const values = [];

  for (const key in data) {
    fields.push(`${key} = ?`);
    values.push(data[key]);
  }

  if (!fields.length) return;

  values.push(gatewayId);

  await conn.query(
    `
    UPDATE gsm_gateways
    SET ${fields.join(", ")}, updated_at = NOW()
    WHERE id = ?
    `,
    values
  );
};

export const softDeleteGsmGateway = async (conn, gatewayId, updatedBy) => {
  await conn.query(
    `
    UPDATE gsm_gateways
    SET is_deleted = 1,
        updated_by = ?,
        updated_at = NOW()
    WHERE id = ?
    `,
    [updatedBy ?? null, gatewayId]
  );
};

export const listServers = async (conn, { search, status, page, limit }) => {
  const where = ["is_deleted = 0"];
  const params = [];

  if (search) {
    const trimmed = String(search).trim();
    if (trimmed) {
      const normalized = trimmed.replace(/^#/, "");
      const like = `%${normalized}%`;
      const numericValue = Number(normalized);
      if (!Number.isNaN(numericValue)) {
        where.push(
          "(id = ? OR total_quantity = ? OR server_name LIKE ? OR processor LIKE ? OR ram LIKE ? OR ssd LIKE ? OR hdd LIKE ? OR brand LIKE ?)"
        );
        params.push(
          numericValue,
          numericValue,
          like,
          like,
          like,
          like,
          like,
          like
        );
      } else {
        where.push(
          "(server_name LIKE ? OR processor LIKE ? OR ram LIKE ? OR ssd LIKE ? OR hdd LIKE ? OR brand LIKE ?)"
        );
        params.push(like, like, like, like, like, like);
      }
    }
  }

  if (status) {
    where.push("status = ?");
    params.push(status);
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await conn.query(
    `
    SELECT
      id,
      server_name,
      processor,
      ram,
      ssd,
      hdd,
      brand,
      total_quantity,
      GREATEST(
        total_quantity - (
          SELECT COALESCE(SUM(csa.allocated_quantity), 0)
          FROM client_server_allocations csa
          WHERE csa.server_id = servers.id
        ) - (
          SELECT
            COALESCE(SUM(CASE WHEN im.movement_type = 'sale' THEN im.qty ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN im.movement_type = 'sale_void' THEN im.qty ELSE 0 END), 0)
          FROM inventory_movements im
          WHERE im.item_type = 'server'
            AND im.item_id = servers.id
        ),
        0
      ) AS total_left,
      status,
      created_by,
      updated_by,
      created_at,
      updated_at
    FROM servers
    WHERE ${where.join(" AND ")}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
    `,
    [...params, safeLimit, offset]
  );

  const [[{ total }]] = await conn.query(
    `
    SELECT COUNT(*) AS total
    FROM servers
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

export const getServerByIdTx = async (conn, serverId) => {
  const [rows] = await conn.query(
    `
    SELECT
      id,
      server_name,
      processor,
      ram,
      ssd,
      hdd,
      brand,
      total_quantity,
      status,
      is_deleted,
      created_by,
      updated_by,
      created_at,
      updated_at
    FROM servers
    WHERE id = ?
    LIMIT 1
    `,
    [serverId]
  );

  return rows[0];
};

export const createServer = async (conn, server) => {
  const [result] = await conn.query(
    `
    INSERT INTO servers
      (server_name, processor, ram, ssd, hdd, brand, total_quantity, status, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      server.server_name,
      server.processor ?? null,
      server.ram ?? null,
      server.ssd ?? null,
      server.hdd ?? null,
      server.brand ?? null,
      server.total_quantity ?? 0,
      server.status || "active",
      server.created_by ?? null,
      server.updated_by ?? null,
    ]
  );

  return result.insertId;
};

export const updateServerDynamic = async (conn, serverId, data) => {
  const fields = [];
  const values = [];

  for (const key in data) {
    fields.push(`${key} = ?`);
    values.push(data[key]);
  }

  if (!fields.length) return;

  values.push(serverId);

  await conn.query(
    `
    UPDATE servers
    SET ${fields.join(", ")}, updated_at = NOW()
    WHERE id = ?
    `,
    values
  );
};

export const softDeleteServer = async (conn, serverId, updatedBy) => {
  await conn.query(
    `
    UPDATE servers
    SET is_deleted = 1,
        updated_by = ?,
        updated_at = NOW()
    WHERE id = ?
    `,
    [updatedBy ?? null, serverId]
  );
};


//code by darshika 

export const getAgreementsPendingNotification = async (conn) => {
  const [rows] = await conn.query(
    `SELECT agreement_id, client_id, status, last_notified_status
     FROM agreements
     WHERE status IN ('active', 'expired')
       AND (last_notified_status IS NULL OR last_notified_status != status)`
  );
  return rows;
};

export const markAgreementNotified = async (conn, agreementId, status) => {
  await conn.query(
    "UPDATE agreements SET last_notified_status = ? WHERE agreement_id = ?",
    [status, agreementId]
  );
};