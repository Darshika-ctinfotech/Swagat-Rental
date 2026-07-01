import dotenv from "dotenv";
dotenv.config();

export const env = {
  PORT: process.env.PORT || 5000,

  DB_HOST: process.env.DB_HOST,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_NAME: process.env.DB_NAME,
  DB_PORT: process.env.DB_PORT || 3306,

  JWT_SECRET: process.env.JWT_SECRET,

  APP_NAME: process.env.APP_NAME || "CTI Talk",
  APP_URL: process.env.APP_URL || "http://localhost:5000",
};
