export const createHelp = async (conn, help) => {
    const [result] = await conn.query(
        `INSERT INTO client_help (name, email, description, created_at, updated_at)
     VALUES (?, ?, ?, NOW(), NOW())`,
        [help.name, help.email, help.description]
    );

    return result.insertId;
};  

export const listHelp = async (conn, options = {}) => {
    const { search = "", page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    let query = `SELECT * FROM client_help WHERE 1=1`;
    const params = [];

    if (search) {
        query += ` AND (name LIKE ? OR email LIKE ? OR description LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(Number(limit), offset);

    const [data] = await conn.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM client_help WHERE 1=1`;
    const countParams = [];

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

export const getHelpById = async (conn, id) => {
    const [result] = await conn.query(
        `SELECT * FROM client_help WHERE id = ?`,
        [id]
    );

    return result[0] || null;
};

export const updateHelp = async (conn, id, help) => {
    const [result] = await conn.query(
        `UPDATE client_help SET name = ?, email = ?, description = ?, updated_at = NOW() WHERE id = ?`,
        [help.name, help.email, help.description, id]
    );

    return result.affectedRows > 0;
};

export const deleteHelp = async (conn, id) => {
    const [result] = await conn.query(
        `DELETE FROM client_help WHERE id = ?`,
        [id]
    );

    return result.affectedRows > 0;
};
