import { pool } from "../../config/db.js";
import * as CommissionsModel from "./commissions.model.js";

const normalizeCommissionPayload = (payload = {}) => {
  const data = { ...payload };
  const baseAmount = Number(data.base_amount || 0);
  const percentage = Number(data.commission_percentage || 0);

  if (
    (data.commission_amount === undefined ||
      data.commission_amount === null ||
      data.commission_amount === "") &&
    baseAmount > 0 &&
    percentage > 0
  ) {
    data.commission_amount = Number(((baseAmount * percentage) / 100).toFixed(2));
  }

  return data;
};

export const createCommission = async (payload) => {
  const conn = await pool.getConnection();
  try {
    const commissionId = await CommissionsModel.createCommission(
      conn,
      normalizeCommissionPayload(payload)
    );
    return await CommissionsModel.getCommissionById(conn, commissionId);
  } finally {
    conn.release();
  }
};

export const listCommissions = async (query = {}) => {
  const conn = await pool.getConnection();
  try {
    return await CommissionsModel.listCommissions(conn, query);
  } finally {
    conn.release();
  }
};

export const getCommissionById = async (commissionId) => {
  const conn = await pool.getConnection();
  try {
    const commission = await CommissionsModel.getCommissionById(conn, commissionId);
    if (!commission) {
      throw new Error("Commission not found");
    }
    return commission;
  } finally {
    conn.release();
  }
};

export const updateCommission = async (commissionId, payload) => {
  const conn = await pool.getConnection();
  try {
    const updated = await CommissionsModel.updateCommission(
      conn,
      commissionId,
      normalizeCommissionPayload(payload)
    );
    if (!updated) {
      throw new Error("Commission not found");
    }
    return await CommissionsModel.getCommissionById(conn, commissionId);
  } finally {
    conn.release();
  }
};

export const updateCommissionStatus = async (commissionId, payload) => {
  const conn = await pool.getConnection();
  try {
    const updated = await CommissionsModel.updateCommissionStatus(
      conn,
      commissionId,
      payload
    );
    if (!updated) {
      throw new Error("Commission not found");
    }
    return await CommissionsModel.getCommissionById(conn, commissionId);
  } finally {
    conn.release();
  }
};

export const markCommissionPaid = async (commissionId, payload = {}) => {
  const conn = await pool.getConnection();
  try {
    const updated = await CommissionsModel.markCommissionPaid(
      conn,
      commissionId,
      payload
    );
    if (!updated) {
      throw new Error("Commission not found");
    }
    return await CommissionsModel.getCommissionById(conn, commissionId);
  } finally {
    conn.release();
  }
};

export const deleteCommission = async (commissionId) => {
  const conn = await pool.getConnection();
  try {
    const deleted = await CommissionsModel.deleteCommission(conn, commissionId);
    if (!deleted) {
      throw new Error("Commission not found");
    }
    return { message: "Commission deleted successfully" };
  } finally {
    conn.release();
  }
};

export const getCommissionSummary = async (query = {}) => {
  const conn = await pool.getConnection();
  try {
    return await CommissionsModel.getCommissionSummary(conn, query);
  } finally {
    conn.release();
  }
};
