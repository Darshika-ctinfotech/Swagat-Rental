export const createClientFeedback = async (conn, feedback) => {
  const [result] = await conn.query(
    `INSERT INTO client_feedback (name, email, description, created_at, updated_at)
     VALUES (?, ?, ?, NOW(), NOW())`,
    [feedback.name, feedback.email, feedback.description]
  );

  return result.insertId;
};
// no changes here undo cmmnd - - - - 
export const listClientFeedback = async (conn, options = {}) => {
  const { search = "", page = 1, limit = 20 } = options;
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const offset = (safePage - 1) * safeLimit;

  let query = `SELECT * FROM client_feedback WHERE 1=1`;
  const params = [];

  if (search) {
    query += ` AND (name LIKE ? OR email LIKE ? OR description LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(safeLimit, offset);

  const [data] = await conn.query(query, params);

  let countQuery = `SELECT COUNT(*) as total FROM client_feedback WHERE 1=1`;
  const countParams = [];

  if (search) {
    countQuery += ` AND (name LIKE ? OR email LIKE ? OR description LIKE ?)`;
    countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const [countResult] = await conn.query(countQuery, countParams);
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

export const getClientFeedbackById = async (conn, id) => {
  const [result] = await conn.query(
    `SELECT * FROM client_feedback WHERE id = ?`,
    [id]
  );

  return result[0] || null;
};

export const deleteClientFeedback = async (conn, id) => {
  const [result] = await conn.query(
    `DELETE FROM client_feedback WHERE id = ?`,
    [id]
  );

  return result.affectedRows > 0;
};
