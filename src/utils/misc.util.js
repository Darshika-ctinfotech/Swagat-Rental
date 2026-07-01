import fs from "fs";
import { AWS_REGION, IMAGE_PATH, S3_BUCKET_NAME } from "../constants.js";
import path from 'path';
import mime from 'mime-types';

export const CustomImagePath = (fileName) => {
  return fileName
    ? `https://${S3_BUCKET_NAME}.${AWS_REGION}.digitaloceanspaces.com/${fileName}`
    : null;
};


export const isEmpty = (value) =>
  value === null ||
  value === undefined ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === "string" && value.trim().length === 0) ||
  (typeof value === "object" &&
    Object.values(value).every((val) => isEmpty(val)));

export const generateID = (IDlength = 12) => {
  const numbers = "123456789";
  let uid = "";
  for (let i = 0; i < IDlength; i++) {
    uid += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  return parseInt(uid, 10);
};

export const round = (value, digits) => {
  return parseFloat(value.toFixed(digits));
};

export const split = (value) => {
  let splits = 3;
  if (value.length > 3 && value.length <= 8) {
    splits = 2;
  } else if (value.length <= 3) {
    splits = 1;
  }

  const partLength = Math.ceil(value.length / splits);
  const result = [];

  for (let i = 0; i < value.length; i += partLength) {
    result.push(value.slice(i, i + partLength));
  }

  return result;
};

export const setDate = (days) => {
  const date = new Date();
  if (!isEmpty(days)) {
    date.setDate(date.getDate() + days);
  }
  return date.toISOString().substring(0, 10);
};

export const getCurrentDateTime = () => {
  const date = new Date();
  return date.toISOString();
};

export const applyFloor = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map((element) => applyFloor(element));
  } else if (typeof obj === "object" && obj !== null) {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        obj[key] = applyFloor(obj[key]);
      }
    }
    return obj;
  } else if (typeof obj === "number") {
    return Math.floor(obj);
  } else {
    return obj;
  }
};

export const createBatches = (array, batchSize) => {
  const batches = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
};


export const formatImagePath = (path) =>
  !path ? null : path.startsWith('http') ? path : `${APP_URL}/${path}`;

export const deleteImage = (fileName) => {
  return new Promise((resolve, reject) => {
    const filePath = path.join('backend/public', fileName);

    fs.unlink(filePath, (err) => {
      if (err) {
        if (err.code === 'ENOENT') {
          // File doesn't exist
          console.warn(`File not found: ${filePath}`);
          return resolve();
        }
        return reject(err);
      }
      resolve();
    });
  });
};


export const generateUnique5Digit = () => {
  // Get current timestamp in milliseconds
  const timestamp = Date.now(); // e.g., 1691923456789

  // Combine with a random number to avoid collisions in the same ms
  const uniqueNum = timestamp.toString() + Math.floor(Math.random() * 1000);

  // Take the last 5 digits
  return uniqueNum.slice(-5);
}

export const getMimeType = (file) => {
  const ext = path.extname(file.originalname).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".mp4":
      return file.mimetype === "application/octet-stream" ? "video/mp4" : "video/mp4";
    case ".avi":
      return "video/x-msvideo";
    case ".mov":
      return "video/quicktime";
    case ".pdf":
      return "application/pdf";
    case ".txt":
      return "text/plain";
    case ".csv":
      return "text/csv";
    default:
      return mime.lookup(ext) || "application/octet-stream";
  }
};

export const cleanSpeakers =(bootcamp) => {
  if (!Array.isArray(bootcamp.program_days)) return bootcamp;

  bootcamp.program_days = bootcamp.program_days.map(programDay => {

    if (Array.isArray(programDay.sessions)) {
      programDay.sessions = programDay.sessions.map(session => {

        if (Array.isArray(session.speakers)) {
          session.speakers = session.speakers.filter(sp =>
            sp && (
              (sp.name && sp.name !== "") ||
              (sp.role && sp.role !== "") ||
              (sp.session_speaker_id && sp.session_speaker_id !== "") ||
              (sp.image && sp.image !== "")
            )
          );
        }

        return session;
      });
    }

    return programDay;
  });

  return bootcamp;
}
