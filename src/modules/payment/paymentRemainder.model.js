import { pool } from "../../config/db.js";

export const getInvoicesForReminder = async () => {

    const [rows] = await pool.query(`
        SELECT
            i.invoice_id,
            i.client_id,
            i.total_amount,
            i.due_date,
            i.status,

            c.full_name,
            c.email,

            a.agreement_id

        FROM tbl_invoices i

        INNER JOIN tbl_clients c
            ON c.id = i.client_id

        INNER JOIN tbl_agreements a
            ON a.agreement_id = i.agreement_id

        WHERE
            a.status = 'active'
            AND i.status IN ('pending','partial')
    `);

    return rows;
};

export const hasEmailBeenSent = async (
    invoiceId,
    emailType
) => {

    const [rows] = await pool.query(
        `
        SELECT id
        FROM tbl_invoice_email_logs
        WHERE invoice_id = ?
        AND email_type = ?
    `,
        [invoiceId, emailType]
    );

    return rows.length > 0;
};

export const saveEmailLog = async (
    invoiceId,
    emailType
) => {

    await pool.query(
        `
        INSERT IGNORE INTO tbl_invoice_email_logs
        (
            invoice_id,
            email_type
        )
        VALUES (?,?)
    `,
        [invoiceId, emailType]
    );
};