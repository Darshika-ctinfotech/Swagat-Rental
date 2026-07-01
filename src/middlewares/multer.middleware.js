import multer from "multer";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sanitize file name
const sanitizeFilename = (originalName) => {
  const name = originalName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "");
  const timestamp = Date.now();
  const shortId = uuidv4().split("-")[0];
  return `${timestamp}-${shortId}-${name}`;
};

const getMulterInstance = (folderName = "temp") => {
  const uploadPath = path.join(__dirname, "..", "public", folderName);

  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, uploadPath),
    filename: (_, file, cb) => cb(null, sanitizeFilename(file.originalname)),
  });

  return multer({ storage });
};

// Export in ESM style
export const single = (folder, fieldName) => getMulterInstance(folder).single(fieldName);
export const array = (folder, fieldName, maxCount = 5) => getMulterInstance(folder).array(fieldName, maxCount);
export const fields = (folder, fieldsArray) => getMulterInstance(folder).fields(fieldsArray);
