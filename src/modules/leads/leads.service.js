import { pool } from "../../config/db.js";
import * as LeadsModel from "./leads.model.js";

export const createLead = async (payload) => {
  const conn = await pool.getConnection();
  try {
    const leadId = await LeadsModel.createLead(conn, payload);
    return await LeadsModel.getLeadById(conn, leadId);
  } finally {
    conn.release();
  }
};

export const listLeads = async (query = {}) => {
  const conn = await pool.getConnection();
  try {
    return await LeadsModel.listLeads(conn, query);
  } finally {
    conn.release();
  }
};

export const getLeadById = async (leadId) => {
  const conn = await pool.getConnection();
  try {
    const lead = await LeadsModel.getLeadById(conn, leadId);
    if (!lead) {
      throw new Error("Lead not found");
    }
    return lead;
  } finally {
    conn.release();
  }
};

export const updateLead = async (leadId, payload) => {
  const conn = await pool.getConnection();
  try {
    const updated = await LeadsModel.updateLead(conn, leadId, payload);
    if (!updated) {
      throw new Error("Lead not found");
    }
    return await LeadsModel.getLeadById(conn, leadId);
  } finally {
    conn.release();
  }
};

export const updateLeadStatus = async (leadId, status) => {
  const conn = await pool.getConnection();
  try {
    const updated = await LeadsModel.updateLeadStatus(conn, leadId, status);
    if (!updated) {
      throw new Error("Lead not found");
    }
    return await LeadsModel.getLeadById(conn, leadId);
  } finally {
    conn.release();
  }
};

export const deleteLead = async (leadId) => {
  const conn = await pool.getConnection();
  try {
    const deleted = await LeadsModel.deleteLead(conn, leadId);
    if (!deleted) {
      throw new Error("Lead not found");
    }
    return { message: "Lead deleted successfully" };
  } finally {
    conn.release();
  }
};
