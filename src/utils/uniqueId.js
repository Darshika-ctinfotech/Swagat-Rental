export const generatePrefixedId = async (conn, table, column, prefix) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");

    const base = `${prefix}-${year}${month}`;

    const [rows] = await conn.query(
        `SELECT ${column} 
     FROM ${table} 
     WHERE ${column} LIKE ? 
     ORDER BY ${column} DESC 
     LIMIT 1`,
        [`${base}-%`]
    );

    let sequence = 1;

    if (rows.length > 0) {
        const lastId = rows[0][column];
        const lastSeq = parseInt(lastId.split("-").pop(), 10);
        sequence = lastSeq + 1;
    }

    const paddedSeq = String(sequence).padStart(4, "0");

    return `${base}-${paddedSeq}`;
};