export const createEmployeeFeedback = async (conn, feedback) => {
  const [result] = await conn.query(
    `INSERT INTO employee_feedbacks (name, email, description, created_at, updated_at)
     VALUES (?, ?, ?, NOW(), NOW())`,
    [feedback.name, feedback.email, feedback.description]
  );

  return result.insertId;
};

export const listEmployeeFeedback = async (conn, options = {}) => {
  const { search = "", page = 1, limit = 20 } = options;
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const offset = (safePage - 1) * safeLimit;

  let query = `SELECT * FROM employee_feedbacks WHERE 1=1`;
  const params = [];

  if (search) {
    query += ` AND (name LIKE ? OR email LIKE ? OR description LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(safeLimit, offset);

  const [data] = await conn.query(query, params);

  let countQuery = `SELECT COUNT(*) as total FROM employee_feedbacks WHERE 1=1`;
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

export const getEmployeeFeedbackById = async (conn, id) => {
  const [result] = await conn.query(
    `SELECT * FROM employee_feedbacks WHERE id = ?`,
    [id]
  );

  return result[0] || null;
};

export const deleteEmployeeFeedback = async (conn, id) => {
  const [result] = await conn.query(
    `DELETE FROM employee_feedbacks WHERE id = ?`,
    [id]
  );

  return result.affectedRows > 0;
};
