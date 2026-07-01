import { pool } from "../config/db.js";

/**
 * Runs queries inside a transaction
 * @param {Function} callback - receives connection
 */
export const withTransaction = async (callback) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const result = await callback(conn);

    await conn.commit();
    return result;

  } catch (err) {
    await conn.rollback();
    throw err;

  } finally {
    conn.release();
  }
};
