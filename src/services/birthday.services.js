import { pool } from "../config/db.js";

export const getTodayBirthdays = async () => {
    const [rows] = await pool.query(`
        SELECT
            id,
            full_name,
            email
        FROM clients
        WHERE
            DAY(dob)=DAY(CURDATE())
            AND MONTH(dob)=MONTH(CURDATE())
            AND is_deleted=0
            AND (
                birthday_mail_sent_date IS NULL
                OR birthday_mail_sent_date <> CURDATE()
            )
    `);

    return rows;
};

export const markBirthdayMailSent = async (clientId) => {
    await pool.query(
        `
        UPDATE clients
        SET birthday_mail_sent_date = CURDATE()
        WHERE id = ?
    `,
        [clientId]
    );
};