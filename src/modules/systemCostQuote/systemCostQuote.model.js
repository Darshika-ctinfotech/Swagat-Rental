const ALLOWED_FIELDS = [
  "system_id",
  "client_id",
  "agreement_id",
  "system_cost",
  "client_quote",
  "notes",
];

const pickFields = (payload = {}) => {
  const data = {};

  for (const field of ALLOWED_FIELDS) {
    if (payload[field] !== undefined) {
      data[field] = payload[field] === "" ? null : payload[field];
    }
  }

  return data;
};

export const getAgreementSystemQuote = async (
  conn,
  { system_id, agreement_id }
) => {
  const params = [system_id];
  let agreementFilter = "";

  if (agreement_id) {
    agreementFilter = "AND ags.agreement_id = ?";
    params.push(agreement_id);
  }

  const [rows] = await conn.query(
    `
    SELECT
      ags.system_id,
      ags.agreement_id,
      ags.system_price AS client_quote,
      a.client_id
    FROM agreement_systems ags
    JOIN agreements a ON a.agreement_id = ags.agreement_id
    WHERE ags.system_id = ?
      ${agreementFilter}
      AND COALESCE(ags.is_active, 1) = 1
      AND ags.effective_to IS NULL
    ORDER BY ags.id DESC
    LIMIT 1
    `,
    params
  );

  return rows[0] || null;
};

export const createSystemCostQuote = async (conn, payload) => {
  const data = pickFields(payload);
  const keys = Object.keys(data);
  const values = keys.map((key) => data[key]);
  const placeholders = keys.map(() => "?").join(", ");

  const [result] = await conn.query(
    `INSERT INTO system_cost_quotes (${keys.join(", ")}, created_at, updated_at)
     VALUES (${placeholders}, NOW(), NOW())`,
    values
  );

  return result.insertId;
};

export const listSystemCostQuotes = async (conn, options = {}) => {
  const {
    search = "",
    system_id,
    client_id,
    agreement_id,
    page = 1,
    limit = 20,
  } = options;
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const offset = (safePage - 1) * safeLimit;
  const where = ["scq.is_deleted = 0"];
  const params = [];

  if (search) {
    where.push(
      "(s.system_uid LIKE ? OR c.full_name LIKE ? OR c.email LIKE ? OR scq.notes LIKE ?)"
    );
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (system_id) {
    where.push("scq.system_id = ?");
    params.push(Number(system_id));
  }

  if (client_id) {
    where.push("scq.client_id = ?");
    params.push(Number(client_id));
  }

  if (agreement_id) {
    where.push("scq.agreement_id = ?");
    params.push(Number(agreement_id));
  }

  const whereClause = `WHERE ${where.join(" AND ")}`;

  const [data] = await conn.query(
    `
    SELECT
      scq.*,
      s.system_uid,
      s.system_uuid,
      s.device_type,
      c.full_name AS client_name,
      c.email AS client_email,
      c.u_unique_id AS client_unique_id,
      (COALESCE(scq.client_quote, 0) - COALESCE(scq.system_cost, 0)) AS margin_amount,
      CASE
        WHEN COALESCE(scq.client_quote, 0) = 0 THEN 0
        ELSE ROUND(((COALESCE(scq.client_quote, 0) - COALESCE(scq.system_cost, 0)) / scq.client_quote) * 100, 2)
      END AS margin_percentage
    FROM system_cost_quotes scq
    LEFT JOIN systems s ON s.id = scq.system_id
    LEFT JOIN clients c ON c.id = scq.client_id
    ${whereClause}
    ORDER BY scq.created_at DESC
    LIMIT ? OFFSET ?
    `,
    [...params, safeLimit, offset]
  );

  const [countResult] = await conn.query(
    `
    SELECT COUNT(*) AS total
    FROM system_cost_quotes scq
    LEFT JOIN systems s ON s.id = scq.system_id
    LEFT JOIN clients c ON c.id = scq.client_id
    ${whereClause}
    `,
    params
  );

  const total = countResult[0]?.total || 0;

  return {
    data,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit),
    },
  };
};

export const getSystemCostQuoteById = async (conn, id) => {
  const [rows] = await conn.query(
    `
    SELECT
      scq.*,
      s.system_uid,
      s.system_uuid,
      s.device_type,
      c.full_name AS client_name,
      c.email AS client_email,
      c.u_unique_id AS client_unique_id,
      (COALESCE(scq.client_quote, 0) - COALESCE(scq.system_cost, 0)) AS margin_amount,
      CASE
        WHEN COALESCE(scq.client_quote, 0) = 0 THEN 0
        ELSE ROUND(((COALESCE(scq.client_quote, 0) - COALESCE(scq.system_cost, 0)) / scq.client_quote) * 100, 2)
      END AS margin_percentage
    FROM system_cost_quotes scq
    LEFT JOIN systems s ON s.id = scq.system_id
    LEFT JOIN clients c ON c.id = scq.client_id
    WHERE scq.id = ? AND scq.is_deleted = 0
    LIMIT 1
    `,
    [id]
  );

  return rows[0] || null;
};

export const updateSystemCostQuote = async (conn, id, payload) => {
  const data = pickFields(payload);
  const keys = Object.keys(data);

  if (!keys.length) {
    return false;
  }

  const updates = keys.map((key) => `${key} = ?`).join(", ");
  const values = keys.map((key) => data[key]);

  const [result] = await conn.query(
    `UPDATE system_cost_quotes
     SET ${updates}, updated_at = NOW()
     WHERE id = ? AND is_deleted = 0`,
    [...values, id]
  );

  return result.affectedRows > 0;
};

export const deleteSystemCostQuote = async (conn, id) => {
  const [result] = await conn.query(
    `UPDATE system_cost_quotes
     SET is_deleted = 1, updated_at = NOW()
     WHERE id = ? AND is_deleted = 0`,
    [id]
  );

  return result.affectedRows > 0;
};

export const getSystemCostQuoteSummary = async (conn, options = {}) => {
  const { client_id, agreement_id } = options;
  const where = ["is_deleted = 0"];
  const params = [];

  if (client_id) {
    where.push("client_id = ?");
    params.push(Number(client_id));
  }

  if (agreement_id) {
    where.push("agreement_id = ?");
    params.push(Number(agreement_id));
  }

  const [rows] = await conn.query(
    `
    SELECT
      COUNT(*) AS total_systems,
      COALESCE(SUM(system_cost), 0) AS total_system_cost,
      COALESCE(SUM(client_quote), 0) AS total_client_quote,
      COALESCE(SUM(client_quote - system_cost), 0) AS total_margin,
      CASE
        WHEN COALESCE(SUM(client_quote), 0) = 0 THEN 0
        ELSE ROUND((COALESCE(SUM(client_quote - system_cost), 0) / SUM(client_quote)) * 100, 2)
      END AS margin_percentage
    FROM system_cost_quotes
    WHERE ${where.join(" AND ")}
    `,
    params
  );

  return rows[0];
};
