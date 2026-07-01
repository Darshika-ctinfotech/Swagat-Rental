import { pool } from "../../config/db.js";
import * as ClientFeedbackModel from "./clientFeedback.model.js";

export const createClientFeedback = async (feedbackData) => {
  const conn = await pool.getConnection();
  try {
    const feedbackId = await ClientFeedbackModel.createClientFeedback(
      conn,
      feedbackData
    );
    return await ClientFeedbackModel.getClientFeedbackById(conn, feedbackId);
  } finally {
    conn.release();
  }
};

export const listClientFeedback = async (options = {}) => {
  const conn = await pool.getConnection();
  try {
    return await ClientFeedbackModel.listClientFeedback(conn, options);
  } finally {
    conn.release();
  }
};

export const getClientFeedbackById = async (id) => {
  const conn = await pool.getConnection();
  try {
    const feedback = await ClientFeedbackModel.getClientFeedbackById(conn, id);
    if (!feedback) {
      throw new Error("Client feedback not found");
    }
    return feedback;
  } finally {
    conn.release();
  }
};

export const deleteClientFeedback = async (id) => {
  const conn = await pool.getConnection();
  try {
    const deleted = await ClientFeedbackModel.deleteClientFeedback(conn, id);
    if (!deleted) {
      throw new Error("Client feedback not found");
    }
    return { message: "Client feedback deleted successfully" };
  } finally {
    conn.release();
  }
};
