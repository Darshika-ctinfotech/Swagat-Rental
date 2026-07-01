const ALLOWED_LEAD_FIELDS = [
  "name",
  "email",
  "phone_number",
  "company_name",
  "requirement",
  "source",
  "status",
  "assigned_to",
  "follow_up_date",
  "notes",
];

const pickLeadFields = (payload = {}) => {
  const data = {};

  for (const field of ALLOWED_LEAD_FIELDS) {
    if (payload[field] !== undefined) {
      data[field] = payload[field] === "" ? null : payload[field];
    }
  }

  return data;
};

export const createLead = async (conn, payload) => {
  const lead = pickLeadFields(payload);
  const keys = Object.keys(lead);
  const values = keys.map((key) => lead[key]);
  const placeholders = keys.map(() => "?").join(", ");

  const [result] = await conn.query(
    `INSERT INTO leads (${keys.join(", ")}, created_at, updated_at)
     VALUES (${placeholders}, NOW(), NOW())`,
    values
  );

  return result.insertId;
};

export const listLeads = async (conn, options = {}) => {
  const {
    search = "",
    status = "",
    source = "",
    assigned_to,
    page = 1,
    limit = 20,
  } = options;
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const offset = (safePage - 1) * safeLimit;
  const where = ["is_deleted = 0"];
  const params = [];

  if (search) {
    where.push(
      "(name LIKE ? OR email LIKE ? OR phone_number LIKE ? OR company_name LIKE ? OR requirement LIKE ?)"
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
    where.push("status = ?");
    params.push(status);
  }

  if (source) {
    where.push("source = ?");
    params.push(source);
  }

  if (assigned_to !== undefined && assigned_to !== null && assigned_to !== "") {
    where.push("assigned_to = ?");
    params.push(Number(assigned_to));
  }

  const whereClause = `WHERE ${where.join(" AND ")}`;

  const [data] = await conn.query(
    `SELECT * FROM leads
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  const [countResult] = await conn.query(
    `SELECT COUNT(*) as total FROM leads ${whereClause}`,
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

export const getLeadById = async (conn, leadId) => {
  const [rows] = await conn.query(
    `SELECT * FROM leads WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [leadId]
  );

  return rows[0] || null;
};

export const updateLead = async (conn, leadId, payload) => {
  const lead = pickLeadFields(payload);
  const keys = Object.keys(lead);

  if (!keys.length) {
    return false;
  }

  const updates = keys.map((key) => `${key} = ?`).join(", ");
  const values = keys.map((key) => lead[key]);

  const [result] = await conn.query(
    `UPDATE leads
     SET ${updates}, updated_at = NOW()
     WHERE id = ? AND is_deleted = 0`,
    [...values, leadId]
  );

  return result.affectedRows > 0;
};

export const updateLeadStatus = async (conn, leadId, status) => {
  const [result] = await conn.query(
    `UPDATE leads
     SET status = ?, updated_at = NOW()
     WHERE id = ? AND is_deleted = 0`,
    [status, leadId]
  );

  return result.affectedRows > 0;
};

export const deleteLead = async (conn, leadId) => {
  const [result] = await conn.query(
    `UPDATE leads
     SET is_deleted = 1, updated_at = NOW()
     WHERE id = ? AND is_deleted = 0`,
    [leadId]
  );

  return result.affectedRows > 0;
};
