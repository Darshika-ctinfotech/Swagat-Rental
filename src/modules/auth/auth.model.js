const CLIENT_ID_PREFIX = "SR";
const CLIENT_ID_TOTAL = 5;
const CLIENT_ID_DIGITS = 2;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";

const generateClientUniqueId = () => {
  const positions = new Set();
  while (positions.size < CLIENT_ID_DIGITS) {
    positions.add(Math.floor(Math.random() * CLIENT_ID_TOTAL));
  }

  let body = "";
  for (let i = 0; i < CLIENT_ID_TOTAL; i++) {
    if (positions.has(i)) {
      body += DIGITS[Math.floor(Math.random() * DIGITS.length)];
    } else {
      body += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    }
  }

  return `${CLIENT_ID_PREFIX}${body}`;
};

const generateUniqueClientId = async (conn, attempts = 10) => {
  for (let i = 0; i < attempts; i++) {
    const candidate = generateClientUniqueId();
    const [rows] = await conn.query(
      `SELECT id FROM clients WHERE u_unique_id = ? LIMIT 1`,
      [candidate]
    );
    if (!rows.length) {
      return candidate;
    }
  }
  throw new Error("Failed to generate unique client id");
};

export const getClientByEmail = async (conn, email) => {
  const [rows] = await conn.query(
    "SELECT * FROM clients WHERE email = ? AND is_deleted = 0",
    [email]
  );
  return rows[0];
};

export const createClient = async (conn, client) => {
  const finalId = client.u_unique_id || (await generateUniqueClientId(conn));

  const [columns] = await conn.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'clients'`
  );
  const columnSet = new Set(columns.map((row) => row.COLUMN_NAME));

  const payload = {
    u_unique_id: finalId,
    full_name: client.full_name,
    email: client.email,
    password: client.password,
    show_password: client.show_password ?? null,
    email_otp: client.email_otp ?? null,
    is_verified: client.is_verified ?? 0,
    role: client.role,
    created_by: client.created_by ?? null,
    created_by_role: client.created_by_role ?? null,
    kyc_status: client.kyc_status ?? null,
    country_code: client.country_code ?? null,
    phone_number: client.phone_number ?? null,
    company_name: client.company_name ?? null,
    company_address: client.company_address ?? null,
    gst_number: client.gst_number ?? null,
    it_person_name: client.it_person_name ?? null,
    it_person_contact_number: client.it_person_contact_number ?? null,
    total_computers: client.total_computers ?? 0,
    total_laptops: client.total_laptops ?? 0,
    total_servers: client.total_servers ?? 0,
    total_gsm_gateways: client.total_gsm_gateways ?? 0,
    administration_contact_name: client.administration_contact_name ?? null,
    administration_contact_number: client.administration_contact_number ?? null,
    is_initial_password_changed: client.is_initial_password_changed ?? "true",
    client_type: client.client_type ?? "swagat",
  };

  const keys = Object.keys(payload).filter((key) => columnSet.has(key));
  const placeholders = keys.map(() => "?").join(", ");

  const [result] = await conn.query(
    `INSERT INTO clients (${keys.join(", ")}) VALUES (${placeholders})`,
    keys.map((key) => payload[key])
  );
  return result.insertId;
};

export const getClientForEmailVerification = async (conn, email) => {
  const [rows] = await conn.query(
    `SELECT id, email_otp, is_verified
     FROM clients
     WHERE email = ? AND is_deleted = 0`,
    [email]
  );

  return rows[0];
};

export const markEmailVerified = async (conn, clientId) => {
  await conn.query(
    `UPDATE clients
     SET is_verified = 1,
         email_otp = NULL,
         updated_at = NOW()
     WHERE id = ?`,
    [clientId]
  );
};

export const updateEmailOtp = async (conn, clientId, otp) => {
  await conn.query(
    `UPDATE clients
     SET email_otp = ?, updated_at = NOW()
     WHERE id = ?`,
    [otp, clientId]
  );
};

export const getClientForLogin = async (conn, email) => {
  const [rows] = await conn.query(
    `SELECT
        id,
        u_unique_id,
        full_name,
        email,
        kyc_step,
        profile_image,
        password,
        role,
        is_verified,
        is_disabled,
        is_deleted,
        is_initial_password_changed
     FROM clients
     WHERE email = ?
     LIMIT 1`,
    [email]
  );

  return rows[0];
};

export const saveForgotToken = async (conn, clientId, token, expiresAt) => {
  await conn.query(
    `UPDATE clients
     SET forgot_code = ?, forgot_code_expires_at = ?
     WHERE id = ?`,
    [token, expiresAt, clientId]
  );
};

export const findClientByResetToken = async (conn, token) => {
  const [rows] = await conn.query(
    `SELECT id, forgot_code_expires_at
     FROM clients
     WHERE forgot_code = ?`,
    [token]
  );
  return rows[0];
};

export const updatePasswordAfterReset = async (
  conn,
  clientId,
  password,
  showPassword = null
) => {
  await conn.query(
    `UPDATE clients
     SET password = ?, show_password = ?, forgot_code = NULL, forgot_code_expires_at = NULL
     WHERE id = ?`,
    [password, showPassword, clientId]
  );
};
