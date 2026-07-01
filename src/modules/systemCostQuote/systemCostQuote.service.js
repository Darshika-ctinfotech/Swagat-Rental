import { pool } from "../../config/db.js";
import * as SystemCostQuoteModel from "./systemCostQuote.model.js";

const enrichFromAgreement = async (conn, payload = {}) => {
  const data = { ...payload };

  if (!data.system_id) {
    return data;
  }

  if (
    data.client_quote !== undefined &&
    data.client_quote !== null &&
    data.client_quote !== ""
  ) {
    return data;
  }

  const agreementQuote = await SystemCostQuoteModel.getAgreementSystemQuote(
    conn,
    data
  );

  if (agreementQuote) {
    data.client_quote = agreementQuote.client_quote;
    data.client_id = data.client_id || agreementQuote.client_id;
    data.agreement_id = data.agreement_id || agreementQuote.agreement_id;
  }

  return data;
};

export const createSystemCostQuote = async (payload) => {
  const conn = await pool.getConnection();
  try {
    const data = await enrichFromAgreement(conn, payload);
    const id = await SystemCostQuoteModel.createSystemCostQuote(conn, data);
    return await SystemCostQuoteModel.getSystemCostQuoteById(conn, id);
  } finally {
    conn.release();
  }
};

export const listSystemCostQuotes = async (query = {}) => {
  const conn = await pool.getConnection();
  try {
    return await SystemCostQuoteModel.listSystemCostQuotes(conn, query);
  } finally {
    conn.release();
  }
};

export const getSystemCostQuoteById = async (id) => {
  const conn = await pool.getConnection();
  try {
    const record = await SystemCostQuoteModel.getSystemCostQuoteById(conn, id);
    if (!record) {
      throw new Error("System cost quote record not found");
    }
    return record;
  } finally {
    conn.release();
  }
};

export const updateSystemCostQuote = async (id, payload) => {
  const conn = await pool.getConnection();
  try {
    const data = await enrichFromAgreement(conn, payload);
    const updated = await SystemCostQuoteModel.updateSystemCostQuote(
      conn,
      id,
      data
    );
    if (!updated) {
      throw new Error("System cost quote record not found");
    }
    return await SystemCostQuoteModel.getSystemCostQuoteById(conn, id);
  } finally {
    conn.release();
  }
};

export const deleteSystemCostQuote = async (id) => {
  const conn = await pool.getConnection();
  try {
    const deleted = await SystemCostQuoteModel.deleteSystemCostQuote(conn, id);
    if (!deleted) {
      throw new Error("System cost quote record not found");
    }
    return { message: "System cost quote record deleted successfully" };
  } finally {
    conn.release();
  }
};

export const getSystemCostQuoteSummary = async (query = {}) => {
  const conn = await pool.getConnection();
  try {
    return await SystemCostQuoteModel.getSystemCostQuoteSummary(conn, query);
  } finally {
    conn.release();
  }
};
