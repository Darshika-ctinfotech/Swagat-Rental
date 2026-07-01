export const createEmployeeHelp = async (conn, employeeHelp) => {
    const [result] = await conn.query(
        `INSERT INTO employees_help (employee_id, name, email, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [employeeHelp.employee_id, employeeHelp.name, employeeHelp.email, employeeHelp.description]
    );

    return result.insertId;
};

export const listEmployeeHelp = async (conn, options = {}) => {
    const { search = "", page = 1, limit = 20, employee_id } = options;
    const offset = (page - 1) * limit;

    let query = `SELECT * FROM employees_help WHERE 1=1`;
    const params = [];

    if (employee_id) {
        query += ` AND employee_id = ?`;
        params.push(employee_id);
    }

    if (search) {
        query += ` AND (name LIKE ? OR email LIKE ? OR description LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(Number(limit), offset);

    const [data] = await conn.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM employees_help WHERE 1=1`;
    const countParams = [];

    if (employee_id) {
        countQuery += ` AND employee_id = ?`;
        countParams.push(employee_id);
    }

    if (search) {
        countQuery += ` AND (name LIKE ? OR email LIKE ? OR description LIKE ?)`;
        countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const [countResult] = await conn.query(countQuery, countParams);
    const total = countResult[0].total;

    return {
        data,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
        },
    };
};

export const getEmployeeHelpById = async (conn, id) => {
    const [result] = await conn.query(
        `SELECT * FROM employees_help WHERE id = ?`,
        [id]
    );

    return result[0] || null;
};

export const updateEmployeeHelp = async (conn, id, employeeHelp) => {
    const [result] = await conn.query(
        `UPDATE employees_help SET name = ?, email = ?, description = ?, updated_at = NOW() WHERE id = ?`,
        [employeeHelp.name, employeeHelp.email, employeeHelp.description, id]
    );

    return result.affectedRows > 0;
};

export const deleteEmployeeHelp = async (conn, id) => {
    const [result] = await conn.query(
        `DELETE FROM employees_help WHERE id = ?`,
        [id]
    );

    return result.affectedRows > 0;
};
