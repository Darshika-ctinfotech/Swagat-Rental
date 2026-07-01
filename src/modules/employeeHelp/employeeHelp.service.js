import * as EmployeeHelpModel from "./employeeHelp.model.js";
import { pool } from "../../config/db.js";

export const createEmployeeHelp = async (helpData) => {
    const conn = await pool.getConnection();
    try {
        const helpId = await EmployeeHelpModel.createEmployeeHelp(conn, helpData);
        const help = await EmployeeHelpModel.getEmployeeHelpById(conn, helpId);
        return help;
    } finally {
        conn.release();
    }
};

export const listEmployeeHelp = async (options = {}) => {
    const conn = await pool.getConnection();
    try {
        return await EmployeeHelpModel.listEmployeeHelp(conn, options);
    } finally {
        conn.release();
    }
};

export const getEmployeeHelpById = async (id) => {
    const conn = await pool.getConnection();
    try {
        const help = await EmployeeHelpModel.getEmployeeHelpById(conn, id);
        if (!help) {
            throw new Error("Employee help record not found");
        }
        return help;
    } finally {
        conn.release();
    }
};

export const updateEmployeeHelp = async (id, helpData) => {
    const conn = await pool.getConnection();
    try {
        const success = await EmployeeHelpModel.updateEmployeeHelp(conn, id, helpData);
        if (!success) {
            throw new Error("Employee help record not found");
        }
        const help = await EmployeeHelpModel.getEmployeeHelpById(conn, id);
        return help;
    } finally {
        conn.release();
    }
};

export const deleteEmployeeHelp = async (id) => {
    const conn = await pool.getConnection();
    try {
        const success = await EmployeeHelpModel.deleteEmployeeHelp(conn, id);
        if (!success) {
            throw new Error("Employee help record not found");
        }
        return { message: "Employee help record deleted successfully" };
    } finally {
        conn.release();
    }
};
