import { pool } from "../../config/db.js";
import { randomUUID } from "crypto";

const generateTempEmployeeId = () => `EID-TMP-${randomUUID()}`;
const formatEmployeeUniqueId = (id) => `EID${String(id).padStart(6, "0")}`;

export const getEmployeeByEmail = async (conn, email) => {
  const [rows] = await conn.query(
    "SELECT * FROM employees WHERE email = ? AND is_deleted = 0 LIMIT 1",
    [email]
  );

  return rows[0];
};

export const changePassword = async (conn, employeeId, hashedPassword, showPassword = null) => {
  return await conn.query(
    "UPDATE employees SET password = ?, show_password = ?, updated_at = NOW() WHERE id = ?",
    [hashedPassword, showPassword, employeeId]
  );
}
export const createEmployee = async (conn, employee) => {
  const tempId = employee.e_unique_id || generateTempEmployeeId();
  const [result] = await conn.query(
    `INSERT INTO employees
     (e_unique_id, full_name, email, password, show_password, profile_image, country_code, phone_number, fcm_token, status, role, date_of_birth, gender, current_address, permanent_address, designation, employment_from, employment_to, ctc_breakdown, bank_name, ifsc_code, bank_account_number, email_otp, is_verified, is_disabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tempId,
      employee.full_name,
      employee.email,
      employee.password,
      employee.show_password,
      employee.profile_image,
      employee.country_code,
      employee.phone_number,
      employee.fcm_token,
      employee.status,
      employee.role,
      employee.date_of_birth,
      employee.gender,
      employee.current_address,
      employee.permanent_address,
      employee.designation,
      employee.employment_from,
      employee.employment_to,
      employee.ctc_breakdown,
      employee.bank_name,
      employee.ifsc_code,
      employee.bank_account_number,
      employee.email_otp,
      employee.is_verified,
      employee.is_disabled,
    ]
  );

  const insertId = result.insertId;

  if (!employee.e_unique_id) {
    const finalId = formatEmployeeUniqueId(insertId);
    await conn.query(
      `UPDATE employees SET e_unique_id = ?, updated_at = NOW() WHERE id = ?`,
      [finalId, insertId]
    );
  }

  return insertId;
};

export const getEmployeeById = async (employeeId) => {
  const [rows] = await pool.query(
    `SELECT id, is_deleted, is_disabled, status
     FROM employees
     WHERE id = ?`,
    [employeeId]
  );

  return rows[0];
};

export const getEmployeeByIdTx = async (conn, employeeId) => {
  const [rows] = await conn.query(
    `SELECT
        id,
        e_unique_id,
        full_name,
        email,
        profile_image,
        country_code,
        phone_number,
        fcm_token,
        status,
        role,
        show_password,
        date_of_birth,
        gender,
        current_address,
        permanent_address,
        designation,
        employment_from,
        employment_to,
        ctc_breakdown,
        bank_name,
        ifsc_code,
        bank_account_number,
        is_verified,
        is_disabled,
        created_at,
        updated_at,
        document_status,
        document_reject_reason,
        document_updated_by_admin,
        (
          SELECT COUNT(*)
          FROM systems s
          WHERE s.installed_by_employee_id = employees.id
            AND s.is_deleted = 0
        ) AS assigned_devices,
        (
          SELECT COUNT(*)
          FROM client_service_requests csr
          WHERE csr.employee_id = employees.id
        ) AS total_service_requests
     FROM employees
     WHERE id = ? AND is_deleted = 0
     LIMIT 1`,
    [employeeId]
  );

  return rows[0];
};

export const getEmployeeByUniqueIdTx = async (conn, employeeUniqueId) => {
  const [rows] = await conn.query(
    `SELECT
        id,
        e_unique_id,
        full_name,
        email,
        profile_image,
        country_code,
        phone_number,
        fcm_token,
        status,
        role,
        show_password,
        date_of_birth,
        gender,
        current_address,
        permanent_address,
        designation,
        employment_from,
        employment_to,
        ctc_breakdown,
        bank_name,
        ifsc_code,
        bank_account_number,
        is_verified,
        is_disabled,
        created_at,
        updated_at
     FROM employees
     WHERE e_unique_id = ? AND is_deleted = 0
     LIMIT 1`,
    [employeeUniqueId]
  );

  return rows[0];
};

export const updateEmployeeDynamic = async (conn, employeeId, data) => {
  const fields = [];
  const values = [];

  for (const key in data) {
    fields.push(`${key} = ?`);
    values.push(data[key]);
  }

  if (!fields.length) return;

  values.push(employeeId);

  const sql = `
    UPDATE employees
    SET ${fields.join(", ")}, updated_at = NOW()
    WHERE id = ?
  `;

  await conn.query(sql, values);
};

export const listEmployees = async (conn, { search, document_status, is_disabled, page, limit }) => {
  const where = ["e.is_deleted = 0"];
  const params = [];

  if (search) {
    where.push(`(
      e.e_unique_id LIKE ?
      OR e.full_name LIKE ?
      OR e.email LIKE ?
      OR e.phone_number LIKE ?
    )`);
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  if (document_status) {
    where.push("e.document_status = ?");
    params.push(document_status);
  }

  if (typeof is_disabled === "boolean") {
    where.push("e.is_disabled = ?");
    params.push(is_disabled ? 1 : 0);
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await conn.query(
    `
    SELECT
      e.id,
      e.e_unique_id,
      e.full_name,
      e.email,
      e.profile_image,
      e.country_code,
      e.phone_number,
      e.status,
      e.role,
      e.show_password,
      e.date_of_birth,
      e.gender,
      e.current_address,
      e.permanent_address,
      e.designation,
      e.employment_from,
      e.employment_to,
      e.ctc_breakdown,
      e.bank_name,
      e.ifsc_code,
      e.bank_account_number,
      e.is_verified,
      e.is_disabled,
      e.created_at,
      e.document_status,
      e.document_updated_by_admin,
      (
        SELECT COUNT(*)
        FROM systems s
        WHERE s.installed_by_employee_id = e.id
          AND s.is_deleted = 0
      ) AS assigned_devices,
      (
        SELECT COUNT(*)
        FROM client_service_requests csr
        WHERE csr.employee_id = e.id
      ) AS total_service_requests
    FROM employees e
    WHERE ${where.join(" AND ")}
    ORDER BY e.id DESC
    LIMIT ? OFFSET ?
    `,
    [...params, safeLimit, offset]
  );

  const [[{ total }]] = await conn.query(
    `
    SELECT COUNT(*) AS total
    FROM employees e
    WHERE ${where.join(" AND ")}
    `,
    params
  );

  return {
    rows,
    total,
    page: safePage,
    limit: safeLimit,
  };
};

export const getEmployeeForEmailVerification = async (conn, email) => {
  const [rows] = await conn.query(
    `SELECT id, email_otp, is_verified
     FROM employees
     WHERE email = ? AND is_deleted = 0`,
    [email]
  );

  return rows[0];
};

export const markEmployeeEmailVerified = async (conn, employeeId) => {
  await conn.query(
    `UPDATE employees
     SET is_verified = 1,
         email_otp = NULL,
         updated_at = NOW()
     WHERE id = ?`,
    [employeeId]
  );
};

export const updateEmployeeEmailOtp = async (conn, employeeId, otp) => {
  await conn.query(
    `UPDATE employees
     SET email_otp = ?, updated_at = NOW()
     WHERE id = ?`,
    [otp, employeeId]
  );
};

export const getEmployeeForLoginByEmail = async (conn, email) => {
  const [rows] = await conn.query(
    `SELECT
        id,
        e_unique_id,
        full_name,
        email,
        profile_image,
        password,
        role,
        is_verified,
        is_disabled,
        is_deleted
     FROM employees
     WHERE email = ? 
     LIMIT 1`,
    [email]
  );

  return rows[0];
};

export const getEmployeeForLogin = async (conn, e_unique_id) => {
  const [rows] = await conn.query(
    `SELECT
        id,
        e_unique_id,
        full_name,
        email,
        profile_image,
        password,
        role,
        is_verified,
        is_disabled,
        is_deleted
     FROM employees
     WHERE e_unique_id = ?
     LIMIT 1`,
    [e_unique_id]
  );

  return rows[0];
};

export const getEmployeePasswordByIdTx = async (conn, employeeId) => {
  const [rows] = await conn.query(
    `SELECT
      id,
        password,
        is_verified,
        is_disabled,
        is_deleted
     FROM employees
     WHERE id = ?
     LIMIT 1`,
    [employeeId]
  );

  return rows[0];
};

export const saveEmployeeForgotToken = async (conn, employeeId, token, expiresAt) => {
  await conn.query(
    `UPDATE employees
     SET forgot_code = ?, forgot_code_expires_at = ?
     WHERE id = ?`,
    [token, expiresAt, employeeId]
  );
};

export const findEmployeeByResetToken = async (conn, token) => {
  const [rows] = await conn.query(
    `SELECT id, forgot_code_expires_at
     FROM employees
     WHERE forgot_code = ?`,
    [token]
  );
  return rows[0];
};

export const updateEmployeePasswordAfterReset = async (
  conn,
  employeeId,
  password,
  showPassword = null
) => {
  await conn.query(
    `UPDATE employees
     SET password = ?, show_password = ?, forgot_code = NULL, forgot_code_expires_at = NULL
     WHERE id = ?`,
    [password, showPassword, employeeId]
  );
};

const normalizeEmployeeDocType = (value) => {
  const mapping = {
    aadhar_card: "Aadhar_Card",
    selfie: "Selfie",
    other_documents: "Other_Documents",
    police_verifications: "Police_Verifications",
  };

  if (!value) return null;
  const normalized = String(value).trim();
  const key = normalized.toLowerCase();
  return mapping[key] || normalized;
};

export const addEmployeeDocuments = async (conn, employeeId, docs = []) => {
  const normalizedDocs = docs
    .map((doc) => ({
      doc_type: normalizeEmployeeDocType(doc?.doc_type),
      doc_path: doc?.doc_path ? String(doc.doc_path).trim() : null,
    }))
    .filter((doc) => doc.doc_type && doc.doc_path);

  if (!normalizedDocs.length) return;

  for (const doc of normalizedDocs) {
    await conn.query(
      `INSERT INTO employee_documents
       (employee_id, doc_type, doc_path, submitted_at)
       VALUES (?, ?, ?, ?)`,
      [employeeId, doc.doc_type, doc.doc_path, new Date()]
    );
  }
};

export const listEmployeeDocumentsByEmployeeId = async (conn, employeeId) => {
  const [rows] = await conn.query(
    `SELECT
      id,
      employee_id,
      doc_type,
      doc_path,
      submitted_at,
      created_at,
      updated_at
     FROM employee_documents
     WHERE employee_id = ?
     ORDER BY id ASC`,
    [employeeId]
  );

  return rows;
};

export const getEmployeeDocumentsByIds = async (
  conn,
  employeeId,
  docIds = []
) => {
  if (!docIds.length) return [];

  const [rows] = await conn.query(
    `SELECT id, employee_id, doc_type, doc_path
     FROM employee_documents
     WHERE employee_id = ? AND id IN (?)`,
    [employeeId, docIds]
  );

  return rows;
};

export const deleteEmployeeDocumentsByIds = async (
  conn,
  employeeId,
  docIds = []
) => {
  if (!docIds.length) return 0;

  const [result] = await conn.query(
    `DELETE FROM employee_documents
     WHERE employee_id = ? AND id IN (?)`,
    [employeeId, docIds]
  );

  return result.affectedRows || 0;
};

export const createEmployeeVisitRecord = async (conn, data) => {
  const [result] = await conn.query(
    `INSERT INTO employee_visit_records
      (employee_id, client_id, short_description, video_proof, visited_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      data.employee_id,
      data.client_id ?? null,
      data.short_description ?? null,
      data.video_proof,
      data.visited_at,
    ]
  );

  return result.insertId;
};

export const getEmployeeVisitRecordById = async (conn, recordId) => {
  const [rows] = await conn.query(
    `SELECT
      id,
      employee_id,
      client_id,
      short_description,
      video_proof,
      visited_at,
      created_at,
      updated_at
     FROM employee_visit_records
     WHERE id = ?
     LIMIT 1`,
    [recordId]
  );

  return rows[0];
};


