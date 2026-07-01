import { pool } from "../../config/db.js";
import * as EmployeeFeedbackModel from "./employeeFeedback.model.js";

export const createEmployeeFeedback = async (feedbackData) => {
  const conn = await pool.getConnection();
  try {
    const feedbackId = await EmployeeFeedbackModel.createEmployeeFeedback(
      conn,
      feedbackData
    );
    return await EmployeeFeedbackModel.getEmployeeFeedbackById(conn, feedbackId);
  } finally {
    conn.release();
  }
};

export const listEmployeeFeedback = async (options = {}) => {
  const conn = await pool.getConnection();
  try {
    return await EmployeeFeedbackModel.listEmployeeFeedback(conn, options);
  } finally {
    conn.release();
  }
};

export const getEmployeeFeedbackById = async (id) => {
  const conn = await pool.getConnection();
  try {
    const feedback = await EmployeeFeedbackModel.getEmployeeFeedbackById(
      conn,
      id
    );
    if (!feedback) {
      throw new Error("Employee feedback not found");
    }
    return feedback;
  } finally {
    conn.release();
  }
};

export const deleteEmployeeFeedback = async (id) => {
  const conn = await pool.getConnection();
  try {
    const deleted = await EmployeeFeedbackModel.deleteEmployeeFeedback(conn, id);
    if (!deleted) {
      throw new Error("Employee feedback not found");
    }
    return { message: "Employee feedback deleted successfully" };
  } finally {
    conn.release();
  }
};
