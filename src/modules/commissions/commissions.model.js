const ALLOWED_COMMISSION_FIELDS = [
  "employee_id",
  "lead_id",
  "client_id",
  "commission_type",
  "base_amount",
  "commission_percentage",
  "commission_amount",
  "status",
  "due_date",
  "paid_at",
  "payment_mode",
  "transaction_reference",
  "notes",
  "approved_by",
];

const pickCommissionFields = (payload = {}) => {
  const data = {};

  for (const field of ALLOWED_COMMISSION_FIELDS) {
    if (payload[field] !== undefined) {
      data[field] = payload[field] === "" ? null : payload[field];
    }
  }

  return data;
};

export const createCommission = async (conn, payload) => {
  const commission = pickCommissionFields(payload);
  const keys = Object.keys(commission);
  const values = keys.map((key) => commission[key]);
  const placeholders = keys.map(() => "?").join(", ");

  const [result] = await conn.query(
    `INSERT INTO commissions (${keys.join(", ")}, created_at, updated_at)
     VALUES (${placeholders}, NOW(), NOW())`,
    values
  );

  return result.insertId;
};

export const listCommissions = async (conn, options = {}) => {
  const {
    search = "",
    status = "",
    employee_id,
    lead_id,
    from_date,
    to_date,
    page = 1,
    limit = 20,
  } = options;
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const offset = (safePage - 1) * safeLimit;
  const where = ["c.is_deleted = 0"];
  const params = [];

  if (search) {
    where.push(
      `(e.full_name LIKE ? OR e.email LIKE ? OR l.name LIKE ? OR c.transaction_reference LIKE ? OR c.notes LIKE ?)`
    );
    params.push(
      `%${search}%`,
      `%${search}%`,
      `%${search}%`,
      `%${search}%`,
      `%${search}%`
    );
  }

  if (status) {
    where.push("c.status = ?");
    params.push(status);
  }

  if (employee_id !== undefined && employee_id !== null && employee_id !== "") {
    where.push("c.employee_id = ?");
    params.push(Number(employee_id));
  }

  if (lead_id !== undefined && lead_id !== null && lead_id !== "") {
    where.push("c.lead_id = ?");
    params.push(Number(lead_id));
  }

  if (from_date) {
    where.push("DATE(c.created_at) >= ?");
    params.push(from_date);
  }

  if (to_date) {
    where.push("DATE(c.created_at) <= ?");
    params.push(to_date);
  }

  const whereClause = `WHERE ${where.join(" AND ")}`;
  const selectClause = `
    SELECT
      c.*,
      e.full_name AS employee_name,
      e.email AS employee_email,
      e.e_unique_id AS employee_unique_id,
      l.name AS lead_name,
      l.company_name AS lead_company_name
    FROM commissions c
    LEFT JOIN employees e ON e.id = c.employee_id
    LEFT JOIN leads l ON l.id = c.lead_id
  `;

  const [data] = await conn.query(
    `${selectClause}
     ${whereClause}
     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  const [countResult] = await conn.query(
    `SELECT COUNT(*) AS total
     FROM commissions c
     LEFT JOIN employees e ON e.id = c.employee_id
     LEFT JOIN leads l ON l.id = c.lead_id
     ${whereClause}`,
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

export const getCommissionById = async (conn, commissionId) => {
  const [rows] = await conn.query(
    `SELECT
       c.*,
       e.full_name AS employee_name,
       e.email AS employee_email,
       e.e_unique_id AS employee_unique_id,
       l.name AS lead_name,
       l.company_name AS lead_company_name
     FROM commissions c
     LEFT JOIN employees e ON e.id = c.employee_id
     LEFT JOIN leads l ON l.id = c.lead_id
     WHERE c.id = ? AND c.is_deleted = 0
     LIMIT 1`,
    [commissionId]
  );

  return rows[0] || null;
};

export const updateCommission = async (conn, commissionId, payload) => {
  const commission = pickCommissionFields(payload);
  const keys = Object.keys(commission);

  if (!keys.length) {
    return false;
  }

  const updates = keys.map((key) => `${key} = ?`).join(", ");
  const values = keys.map((key) => commission[key]);

  const [result] = await conn.query(
    `UPDATE commissions
     SET ${updates}, updated_at = NOW()
     WHERE id = ? AND is_deleted = 0`,
    [...values, commissionId]
  );

  return result.affectedRows > 0;
};

export const updateCommissionStatus = async (conn, commissionId, payload) => {
  const updates = ["status = ?"];
  const values = [payload.status];

  if (payload.approved_by !== undefined) {
    updates.push("approved_by = ?");
    values.push(payload.approved_by || null);
  }

  if (payload.status === "paid") {
    updates.push("paid_at = COALESCE(?, NOW())");
    values.push(payload.paid_at || null);
  }

  const [result] = await conn.query(
    `UPDATE commissions
     SET ${updates.join(", ")}, updated_at = NOW()
     WHERE id = ? AND is_deleted = 0`,
    [...values, commissionId]
  );

  return result.affectedRows > 0;
};

export const markCommissionPaid = async (conn, commissionId, payload = {}) => {
  const [result] = await conn.query(
    `UPDATE commissions
     SET status = 'paid',
         paid_at = COALESCE(?, NOW()),
         payment_mode = ?,
         transaction_reference = ?,
         notes = COALESCE(?, notes),
         updated_at = NOW()
     WHERE id = ? AND is_deleted = 0`,
    [
      payload.paid_at || null,
      payload.payment_mode || null,
      payload.transaction_reference || null,
      payload.notes || null,
      commissionId,
    ]
    
  );

  return result.affectedRows > 0;
};

export const deleteCommission = async (conn, commissionId) => {
  const [result] = await conn.query(
    `UPDATE commissions
     SET is_deleted = 1, updated_at = NOW()
     WHERE id = ? AND is_deleted = 0`,
    [commissionId]
  );

  return result.affectedRows > 0;
};

export const getCommissionSummary = async (conn, options = {}) => {
  const { employee_id, from_date, to_date } = options;
  const where = ["is_deleted = 0"];
  const params = [];

  if (employee_id !== undefined && employee_id !== null && employee_id !== "") {
    where.push("employee_id = ?");
    params.push(Number(employee_id));
  }

  if (from_date) {
    where.push("DATE(created_at) >= ?");
    params.push(from_date);
  }

  if (to_date) {
    where.push("DATE(created_at) <= ?");
    params.push(to_date);
  }

  const [rows] = await conn.query(
    `SELECT
       COUNT(*) AS total_records,
       COALESCE(SUM(commission_amount), 0) AS total_commission,
       COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_amount ELSE 0 END), 0) AS pending_amount,
       COALESCE(SUM(CASE WHEN status = 'approved' THEN commission_amount ELSE 0 END), 0) AS approved_amount,
       COALESCE(SUM(CASE WHEN status = 'paid' THEN commission_amount ELSE 0 END), 0) AS paid_amount,
       COALESCE(SUM(CASE WHEN status = 'rejected' THEN commission_amount ELSE 0 END), 0) AS rejected_amount
     FROM commissions
     WHERE ${where.join(" AND ")}`,
    params
  );

  return rows[0];
};
