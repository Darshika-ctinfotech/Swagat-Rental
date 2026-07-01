import { pool } from "../../config/db.js";

export const getDashboardData = async (conn) => {
  const [rows] = await conn.query(`
    SELECT 

      -- Total invoice amount
      COALESCE(SUM(i.total_amount), 0) AS total_receivable,

      -- Total received (credit in ledger)
      COALESCE((
        SELECT SUM(amount)
        FROM payment_ledger
        WHERE entry_type = 'credit'
      ), 0) AS total_received,

      -- Total overdue amount (remaining amount of overdue invoices)
      COALESCE((
        SELECT SUM(i2.total_amount - IFNULL(paid.total_paid, 0))
        FROM invoices i2
        LEFT JOIN (
          SELECT invoice_id, SUM(amount) as total_paid
          FROM payment_ledger
          WHERE entry_type = 'credit'
          GROUP BY invoice_id
        ) paid ON paid.invoice_id = i2.invoice_id
        WHERE i2.status = 'overdue'
      ), 0) AS total_overdue

    FROM invoices i
  `);

  return rows[0];
};

export const getInvoiceTotalsByMonthTx = async (conn, fromDate, toDateExclusive) => {
  const [rows] = await conn.query(
    `
    SELECT
      DATE_FORMAT(created_at, '%Y-%m') AS month,
      COALESCE(SUM(total_amount), 0) AS total_amount
    FROM invoices
    WHERE created_at >= ? AND created_at < ?
    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
    ORDER BY month ASC
    `,
    [fromDate, toDateExclusive]
  );

  return rows;
};

export const getPaidCreditsByMonthTx = async (conn, fromDate, toDateExclusive) => {
  const [rows] = await conn.query(
    `
    SELECT
      DATE_FORMAT(created_at, '%Y-%m') AS month,
      COALESCE(SUM(amount), 0) AS paid_amount
    FROM payment_ledger
    WHERE entry_type = 'credit'
      AND created_at >= ? AND created_at < ?
    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
    ORDER BY month ASC
    `,
    [fromDate, toDateExclusive]
  );

  return rows;
};

export const getInvoiceById = async (conn, invoiceId, clientId) => {
  const [rows] = await conn.query(
    `SELECT 
      i.*,
      a.payment_type
     FROM invoices i
     LEFT JOIN agreements a ON a.agreement_id = i.agreement_id
     WHERE i.invoice_id = ? AND i.client_id = ?`,
    [invoiceId, clientId]
  );
  return rows[0];
};

export const insertPayment = async (conn, data) => {
  const [result] = await conn.query(
    `INSERT INTO payments
        (invoice_id, client_id, amount_paid, payment_date, payment_type, payment_mode, transaction_reference, screenshot, status)
        VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, 'pending')`,
    [
      data.invoice_id,
      data.client_id,
      data.amount_paid,
      data.payment_type,
      data.payment_mode,
      data.transaction_reference,
      data.screenshot,
    ]
  );

  return result.insertId;
};

export const insertPaymentLog = async (
  conn,
  paymentId,
  action,
  actionBy,
  note
) => {
  await conn.query(
    `INSERT INTO payment_logs
        (payment_id, action, action_by, note)
        VALUES (?, ?, ?, ?)`,
    [paymentId, action, actionBy, note]
  );
};

export const listPayments = async ({
  search,
  status,
  client_id,
  page,
  limit,
}) => {
  const offset = (page - 1) * limit;

  let where = `WHERE 1=1`;
  const values = [];

  // 🔍 Search (name/email/transaction)
  if (search) {
    where += ` AND (
      c.full_name LIKE ? 
      OR c.email LIKE ? 
      OR p.transaction_reference LIKE ?
    )`;
    values.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  // 🔍 Status filter
  if (status) {
    where += ` AND p.status = ?`;
    values.push(status);
  }

  // 🔍 Client filter
  if (client_id) {
    where += ` AND p.client_id = ?`;
    values.push(client_id);
  }

  // ✅ Total count
  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total
     FROM payments p
     JOIN clients c ON c.id = p.client_id
     ${where}`,
    values
  );

  const total = countResult[0].total;

  // ✅ Data query
  const [rows] = await pool.query(
    `SELECT 
      p.payment_id,
      p.amount_paid,
      p.payment_mode,
      p.payment_type,
      p.transaction_reference,
      p.screenshot,
      p.status AS payment_status,
      p.created_at,

      c.id AS client_id,
      c.full_name,
      c.email,
      c.u_unique_id,

      i.invoice_id,
      i.total_amount,
      i.due_date,
      i.invoice_pdf,
      i.status AS invoice_status

    FROM payments p
    JOIN clients c ON c.id = p.client_id
    JOIN invoices i ON i.invoice_id = p.invoice_id

    ${where}

    ORDER BY p.payment_id DESC
    LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );

  return {
    data: rows,
    pagination: {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    },
  };
};

export const listMyPayments = async ({
  clientId,
  page,
  limit,
}) => {

  const offset = (page - 1) * limit;

  // COUNT QUERY
  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total
     FROM payments
     WHERE client_id = ?`,
    [clientId]
  );

  const total = countResult[0]?.total || 0;

  // ✅ DATA QUERY
  const [rows] = await pool.query(
    `SELECT 
      p.payment_id,
      p.amount_paid,
      p.payment_mode,
      p.payment_type,
      p.status,
      p.created_at,

      i.invoice_id,
      i.total_amount,
      i.due_date,
      i.invoice_pdf,
      i.status AS invoice_status

    FROM payments p
    JOIN invoices i ON i.invoice_id = p.invoice_id
    WHERE p.client_id = ?
    ORDER BY p.payment_id DESC
    LIMIT ? OFFSET ?`,
    [clientId, limit, offset]
  );

  return {
    data: rows,
    pagination: {
      total,
      page: page,
      limit: limit,
      total_pages: Math.ceil(total / limit),
    },
  };
};

export const getPaymentByIdForUpdate = async (conn, paymentId) => {
  const [rows] = await conn.query(
    `SELECT * FROM payments WHERE payment_id = ? FOR UPDATE`,
    [paymentId]
  );
  return rows[0];
};

export const getTotalPaidForInvoice = async (conn, invoiceId) => {
  const [rows] = await conn.query(
    `SELECT 
      COALESCE(SUM(amount), 0) AS total_paid
     FROM payment_ledger
     WHERE invoice_id = ?
     AND entry_type = 'credit'`,
    [invoiceId]
  );

  return rows[0]?.total_paid || 0;
};

export const getInvoiceByIdTx = async (conn, invoiceId) => {
  const [rows] = await conn.query(
    `SELECT * FROM invoices WHERE invoice_id = ? LIMIT 1`,
    [invoiceId]
  );
  return rows[0];
};

const getPaymentColumnSet = async (conn) => {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'payments'`
  );
  return new Set(rows.map((row) => row.COLUMN_NAME));
};

export const updatePaymentStatusModel = async (
  conn,
  paymentId,
  { status, verifiedBy, screenshot, note }
) => {
  const columns = await getPaymentColumnSet(conn);
  const updates = [];
  const values = [];

  if (columns.has("status")) {
    updates.push("status = ?");
    values.push(status);
  }
  if (columns.has("verified_by")) {
    updates.push("verified_by = ?");
    values.push(verifiedBy ?? null);
  }
  if (columns.has("screenshot")) {
    updates.push("screenshot = ?");
    values.push(screenshot ?? null);
  }
  if (columns.has("note")) {
    updates.push("transaction_reference = ?");
    values.push(note ?? null);
  }
  if (columns.has("verified_at")) {
    updates.push("verified_at = NOW()");
  }
  if (columns.has("updated_at")) {
    updates.push("updated_at = NOW()");
  }

  if (!updates.length) return;

  values.push(paymentId);
  await conn.query(
    `UPDATE payments SET ${updates.join(", ")} WHERE payment_id = ?`,
    values
  );
};

const getInvoiceColumnSet = async (conn) => {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'invoices'`
  );
  return new Set(rows.map((row) => row.COLUMN_NAME));
};

export const updateInvoiceStatus = async (conn, invoiceId, status) => {
  const columns = await getInvoiceColumnSet(conn);
  const updates = [];
  const values = [];

  if (columns.has("status")) {
    updates.push("status = ?");
    values.push(status);
  }
  if (String(status).toLowerCase() === "paid" && columns.has("is_urgent")) {
    updates.push("is_urgent = 0");
  }
  if (columns.has("updated_at")) {
    updates.push("updated_at = NOW()");
  }

  if (!updates.length) return;

  values.push(invoiceId);
  await conn.query(
    `UPDATE invoices SET ${updates.join(", ")} WHERE invoice_id = ?`,
    values
  );
};

export const updateInvoicePaymentSummary = async (
  conn,
  invoiceId,
  { totalPaid, remainingAmount }
) => {
  const columns = await getInvoiceColumnSet(conn);
  const updates = [];
  const values = [];

  const paidValue = Number(totalPaid || 0);
  const remainingValue = Number(remainingAmount || 0);

  const paidColumns = [
    "paid_amount",
    "amount_paid",
    "total_paid",
    "received_amount",
  ];
  const remainingColumns = [
    "remaining_amount",
    "due_amount",
    "pending_amount",
    "balance_amount",
    "outstanding_amount",
  ];

  for (const col of paidColumns) {
    if (columns.has(col)) {
      updates.push(`${col} = ?`);
      values.push(paidValue);
      break;
    }
  }

  for (const col of remainingColumns) {
    if (columns.has(col)) {
      updates.push(`${col} = ?`);
      values.push(remainingValue);
      break;
    }
  }

  if (columns.has("updated_at")) {
    updates.push("updated_at = NOW()");
  }

  if (!updates.length) return;

  values.push(invoiceId);
  await conn.query(
    `UPDATE invoices SET ${updates.join(", ")} WHERE invoice_id = ?`,
    values
  );
};

export const getPendingPaymentByInvoice = async (
  conn,
  invoiceId,
  clientId
) => {
  const [[row]] = await conn.query(
    `SELECT payment_id 
     FROM payments 
     WHERE invoice_id = ? 
     AND client_id = ? 
     AND status = 'pending'
     LIMIT 1`,
    [invoiceId, clientId]
  );

  return row || null;
};

export const getTotalPaidAmountByInvoice = async (
  conn,
  invoiceId,
  clientId
) => {
  const [[row]] = await conn.query(
    `SELECT COALESCE(SUM(amount_paid),0) as total_paid
     FROM payments
     WHERE invoice_id = ?
     AND client_id = ?
     AND status = 'approved'`,
    [invoiceId, clientId]
  );

  return row?.total_paid || 0;
};
