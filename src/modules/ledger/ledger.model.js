import { pool } from "../../config/db.js";

export const getClientRemainingBalance = async (conn, clientId) => {
  const [rows] = await conn.query(
    `SELECT 
      COALESCE(SUM(CASE WHEN entry_type='debit' THEN amount ELSE 0 END),0) -
      COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount ELSE 0 END),0)
      AS balance
     FROM payment_ledger
     WHERE client_id = ?`,
    [clientId]
  );

  return rows[0]?.balance || 0;
};

export const getClientBalance = async (conn, clientId) => {
  const [rows] = await conn.query(
    `SELECT 
      COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount END), 0) AS total_debit,
      COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount END), 0) AS total_credit
     FROM payment_ledger
     WHERE client_id = ?`,
    [clientId]
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

const getPaymentLedgerColumnSet = async (conn) => {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'payment_ledger'`
  );
  return new Set(rows.map((row) => row.COLUMN_NAME));
};

export const insertLedgerEntry = async (conn, data) => {
  const columns = await getPaymentLedgerColumnSet(conn);

  const insertData = {
    client_id: data.client_id,
    invoice_id: data.invoice_id ?? null,
    entry_type: data.entry_type,
    amount: data.amount,
    description: data.description ?? null,
    reference_type: data.reference_type ?? null,
    reference_id: data.reference_id ?? null,
  };

  const keys = Object.keys(insertData).filter((key) => columns.has(key));
  const placeholders = keys.map(() => "?").join(", ");

  await conn.query(
    `INSERT INTO payment_ledger (${keys.join(", ")}) VALUES (${placeholders})`,
    keys.map((key) => insertData[key])
  );
};

export const getLedgerByClient = async (conn, clientId) => {
  const [rows] = await conn.query(
    `SELECT 
      pl.ledger_id,
      pl.client_id,
      pl.invoice_id,
      pl.entry_type,
      pl.amount,
      pl.description,
      pl.reference_type,
      pl.reference_id,
      pl.created_at,

      i.invoice_month,

      c.u_unique_id,
      c.full_name,
      c.email

    FROM payment_ledger pl
    LEFT JOIN invoices i ON i.invoice_id = pl.invoice_id
    LEFT JOIN clients c ON c.id = pl.client_id
    WHERE pl.client_id = ?
    ORDER BY pl.created_at ASC`,
    [clientId]
  );

  return rows;
};