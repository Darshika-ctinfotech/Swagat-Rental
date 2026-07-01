import { pool } from "../../config/db.js";

const getInvoiceColumnSet = async (conn) => {
    const [rows] = await conn.query(
        `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'invoices'`
    );
    return new Set(rows.map((row) => row.COLUMN_NAME));
};

export const listInvoices = async ({
    search,
    status,
    client_id,
    page,
    limit,
}) => {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    const safePage = !isNaN(pageNum) && pageNum > 0 ? pageNum : 1;
    const safeLimit = !isNaN(limitNum) && limitNum > 0 ? limitNum : 20;
    const offset = (safePage - 1) * safeLimit;

    let where = `WHERE 1=1`;
    const values = [];

    if (search) {
        where += ` AND (c.full_name LIKE ? OR c.email LIKE ? OR c.phone_number LIKE ? OR i.invoice_unique_id LIKE ?)`;
        values.push(
            `%${search}%`,
            `%${search}%`,
            `%${search}%`,
            `%${search}%`
        );
    }

    if (status) {
        where += ` AND i.status = ?`;
        values.push(status);
    }

    if (client_id) {
        where += ` AND i.client_id = ?`;
        values.push(client_id);
    }

    const [count] = await pool.query(
        `SELECT COUNT(*) as total
        FROM invoices i
        LEFT JOIN clients c ON c.id = i.client_id
        ${where}`,
        values
    );

    const total = count[0].total;

    const [rows] = await pool.query(
        `SELECT 
        i.*,
        c.u_unique_id,
        c.full_name AS full_name,
        c.email AS email,
        COALESCE(pl.total_paid, 0) AS total_paid,
        GREATEST(0, (i.total_amount - COALESCE(pl.total_paid, 0))) AS remaining_amount,
        CASE
          WHEN LOWER(i.status) = 'paid' THEN 'paid'
          WHEN LOWER(p.status) = 'pending' THEN 'processing'
          WHEN LOWER(p.status) = 'rejected' THEN 'rejected'
          ELSE i.status
        END AS status
        FROM invoices i
        LEFT JOIN clients c ON c.id = i.client_id
        LEFT JOIN (
          SELECT invoice_id, SUM(amount) AS total_paid
          FROM payment_ledger
          WHERE entry_type = 'credit'
          GROUP BY invoice_id
        ) pl ON pl.invoice_id = i.invoice_id
        LEFT JOIN (
          SELECT invoice_id, MAX(payment_id) AS latest_payment_id
          FROM payments
          GROUP BY invoice_id
        ) lp ON lp.invoice_id = i.invoice_id
        LEFT JOIN payments p ON p.payment_id = lp.latest_payment_id
        ${where}
        ORDER BY i.is_urgent DESC, i.invoice_id DESC
        LIMIT ? OFFSET ?`,
        [...values, safeLimit, offset]
    );

    return {
        data: rows,
        pagination: {
            total,
            page: safePage,
            limit: safeLimit,
            total_pages: Math.ceil(total / safeLimit),
        },
    };
};

export const getInvoiceById = async (conn, invoiceId) => {
    const [rows] = await conn.query(
        `SELECT i.*, c.u_unique_id, c.full_name, c.email FROM invoices i
        LEFT JOIN clients c ON c.id = i.client_id
        WHERE i.invoice_id = ?`,
        [invoiceId]
    );
    return rows[0];
};

export const updateInvoiceUrgencyTx = async (conn, invoiceId, isUrgent) => {
    await conn.query(
        `UPDATE invoices
         SET is_urgent = ?, updated_at = NOW()
         WHERE invoice_id = ?`,
        [isUrgent, invoiceId]
    );
};

export const insertInvoice = async (conn, data) => {
    const columns = await getInvoiceColumnSet(conn);

    const insertData = {
        invoice_unique_id: data.invoice_unique_id,
        client_id: data.client_id,
        agreement_id: data.agreement_id,
        invoice_type: data.invoice_type,
        buyer_type: data.buyer_type,
        created_by_role: data.created_by_role,
        created_by: data.created_by,
        rent_amount: data.rent_amount,
        carried_forward_amount: data.carried_forward_amount ?? 0,
        total_amount: data.total_amount,
        due_date: data.due_date,
        invoice_month: data.invoice_month,
        status: data.status ?? "pending",
    };

    const keys = Object.keys(insertData).filter((key) => columns.has(key));
    const placeholders = keys.map(() => "?").join(", ");

    const [result] = await conn.query(
        `INSERT INTO invoices (${keys.join(", ")}) VALUES (${placeholders})`,
        keys.map((key) => insertData[key])
    );

    return result.insertId;
};

export const getInvoicePayments = async (conn, invoiceId) => {
    const [rows] = await conn.query(
        `SELECT * FROM payments WHERE invoice_id = ?`,
        [invoiceId]
    );
    return rows;
};

export const getInvoiceLedger = async (conn, invoiceId) => {
    const [rows] = await conn.query(
        `SELECT * FROM payment_ledger WHERE invoice_id = ?`,
        [invoiceId]
    );
    return rows;
};

export const insertInvoiceLog = async (conn, data) => {
    await conn.query(
        `INSERT INTO invoice_logs
        (invoice_id, action, changed_by, note)
        VALUES (?, ?, ?, ?)`,
        [
            data.invoice_id,
            data.action,
            data.changed_by,
            data.note,
        ]
    );
};

export const getInvoiceLogs = async (invoiceId) => {
    const [rows] = await pool.query(
        `SELECT * FROM invoice_logs WHERE invoice_id = ? ORDER BY created_at DESC`,
        [invoiceId]
    );
    return rows;
};

const getInvoiceLineItemColumnSet = async (conn) => {
    const [rows] = await conn.query(
        `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'invoice_line_items'`
    );
    return new Set(rows.map((row) => row.COLUMN_NAME));
};

export const insertInvoiceLineItemsTx = async (conn, lineItems = []) => {
    if (!lineItems.length) return 0;

    const columns = await getInvoiceLineItemColumnSet(conn);

    const prepared = lineItems.map((item) => ({
        invoice_id: item.invoice_id,
        agreement_id: item.agreement_id,
        item_type: item.item_type,
        item_ref_id: item.item_ref_id ?? null,
        description: item.description,
        quantity: item.quantity ?? 1,
        unit_price: item.unit_price ?? 0,
        amount: item.amount ?? 0,
        proration_start: item.proration_start ?? null,
        proration_end: item.proration_end ?? null,
    }));

    const keys = Object.keys(prepared[0]).filter((key) => columns.has(key));
    const placeholders = `(${keys.map(() => "?").join(", ")})`;

    const values = prepared.flatMap((row) => keys.map((k) => row[k]));
    const allPlaceholders = prepared.map(() => placeholders).join(", ");

    const [result] = await conn.query(
        `INSERT INTO invoice_line_items (${keys.join(", ")}) VALUES ${allPlaceholders}`,
        values
    );

    return result.affectedRows || 0;
};

export const listInvoiceLineItemsTx = async (conn, invoiceId) => {
    const [rows] = await conn.query(
        `SELECT *
         FROM invoice_line_items
         WHERE invoice_id = ?
         ORDER BY invoice_line_item_id ASC`,
        [invoiceId]
    );
    return rows;
};

export const deleteInvoiceLineItemsTx = async (conn, invoiceId) => {
    await conn.query(`DELETE FROM invoice_line_items WHERE invoice_id = ?`, [
        invoiceId,
    ]);
};

export const updateInvoiceTotalsTx = async (
    conn,
    invoiceId,
    { rent_amount, carried_forward_amount, total_amount }
) => {
    await conn.query(
        `UPDATE invoices
         SET rent_amount = ?,
             carried_forward_amount = ?,
             total_amount = ?,
             updated_at = NOW()
         WHERE invoice_id = ?`,
        [rent_amount, carried_forward_amount, total_amount, invoiceId]
    );
};
