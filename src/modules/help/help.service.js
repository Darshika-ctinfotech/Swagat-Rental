import * as HelpModel from "./help.model.js";
import { pool } from "../../config/db.js";

export const createHelp = async (helpData) => {
    const conn = await pool.getConnection();
    try {
        const helpId = await HelpModel.createHelp(conn, helpData);
        const help = await HelpModel.getHelpById(conn, helpId);
        return help;
    } finally {
        conn.release();
    }
};

export const listHelp = async (options = {}) => {
    const conn = await pool.getConnection();
    try {
        return await HelpModel.listHelp(conn, options);
    } finally {
        conn.release();
    }
};

export const getHelpById = async (id) => {
    const conn = await pool.getConnection();
    try {
        const help = await HelpModel.getHelpById(conn, id);
        if (!help) {
            throw new Error("Help record not found");
        }
        return help;
    } finally {
        conn.release();
    }
};

export const updateHelp = async (id, helpData) => {
    const conn = await pool.getConnection();
    try {
        const success = await HelpModel.updateHelp(conn, id, helpData);
        if (!success) {
            throw new Error("Help record not found");
        }
        const help = await HelpModel.getHelpById(conn, id);
        return help;
    } finally {
        conn.release();
    }
};

export const deleteHelp = async (id) => {
    const conn = await pool.getConnection();
    try {
        const success = await HelpModel.deleteHelp(conn, id);
        if (!success) {
            throw new Error("Help record not found");
        }
        return { message: "Help record deleted successfully" };
    } finally {
        conn.release();
    }
};
