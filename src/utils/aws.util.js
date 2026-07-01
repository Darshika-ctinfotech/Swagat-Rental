// import multer from "multer";
// import multerS3 from "multer-s3";
// import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
// import admin from "firebase-admin";
// import { v4 as uuidv4 } from "uuid";
// import { getMimeType } from "./misc.util.js";

// // ------------------------------
// // S3 (commented for now)
// // ------------------------------
// const s3 = new S3Client({
//   region: process.env.AWS_REGION,
//   endpoint: "https://sfo3.digitaloceanspaces.com",
//   forcePathStyle: false,
//   credentials: {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//   },
// });

// const generateS3Key = (file, folder = "temp") => {
//   const mimeType = getMimeType(file);
//   let subFolder = folder;

//   if (mimeType.startsWith("image/")) {
//     subFolder = "images";
//   } else if (mimeType.startsWith("video/")) {
//     subFolder = "videos";
//   } else if (
//     mimeType === "application/zip" ||
//     mimeType === "application/x-zip-compressed"
//   ) {
//     subFolder = "zips";
//   }

//   const ext = file.originalname.split(".").pop();
//   const name = file.originalname
//     .replace(/\s+/g, "_")
//     .replace(/[^a-zA-Z0-9._-]/g, "");
//   const uniqueId = uuidv4().split("-")[0];
//   return `${subFolder}/${Date.now()}-${uniqueId}-${name}`;
// };

// const getS3MulterInstance = (folder = "temp") =>
//   multer({
//     storage: multerS3({
//       s3,
//       bucket: process.env.S3_BUCKET_NAME,
//       acl: "public-read",
//       contentType: (req, file, cb) => {
//         const mimeType = getMimeType(file);
//         cb(null, mimeType);
//       },
//       key: (req, file, cb) => {
//         const s3Key = generateS3Key(file, folder);
//         cb(null, s3Key);
//       },
//     }),
//   });

// const getAWSPublicUrl = (fileKey) =>
//   `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;

// const deleteFileFromS3 = async (fileUrl) => {
//   if (!fileUrl) return;
//   const fileKey = fileUrl;
//   const params = {
//     Bucket: process.env.S3_BUCKET_NAME,
//     Key: fileKey,
//   };
//   try {
//     const data = await s3.send(new DeleteObjectCommand(params));
//     console.log(`??? Deleted from S3: ${fileKey}`);
//     console.log(" data:", data);
//     return data;
//   } catch (error) {
//     console.error("? Error deleting file from S3:", error);
//   }
// };

// const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

// const getS3MulterInstanceChat = (folder = "temp") =>
//   multer({
//     limits: {
//       fileSize: MAX_SIZE,
//     },
//     storage: multerS3({
//       s3,
//       bucket: process.env.S3_BUCKET_NAME,
//       acl: "public-read",
//       contentType: (req, file, cb) => {
//         const mimeType = getMimeType(file);
//         cb(null, mimeType);
//       },
//       key: (req, file, cb) => {
//         const s3Key = generateS3Key(file, folder);
//         cb(null, s3Key);
//       },
//     }),
//   });

// export const singleAWS = (folder, fieldName) =>
//   getS3MulterInstance(folder).single(fieldName);
// export const arrayAWS = (folder, fieldName, maxCount = 5) =>
//   getS3MulterInstance(folder).array(fieldName, maxCount);
// export const fieldsAWS = (folder, fieldsArray) =>
//   getS3MulterInstance(folder).fields(fieldsArray);

// export const singleAWSChat = (folder, fieldName) =>
//   getS3MulterInstanceChat(folder).single(fieldName);
// export const arrayAWSChat = (folder, fieldName, maxCount = 5) =>
//   getS3MulterInstanceChat(folder).array(fieldName, maxCount);

// export { getAWSPublicUrl, deleteFileFromS3 };

// // ------------------------------
// // Firebase Storage (active)
// // ------------------------------

// // const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY
// //   ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
// //   : undefined;

// // if (!admin.apps.length) {
// //   admin.initializeApp({
// //     credential: admin.credential.cert({
// //       projectId: process.env.FIREBASE_PROJECT_ID,
// //       clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
// //       privateKey: firebasePrivateKey,
// //     }),
// //     storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
// //   });
// // }

// // const bucket = admin.storage().bucket();

// // const generateStorageKey = (file, folder = "temp") => {
// //   const mimeType = getMimeType(file);
// //   let subFolder = folder;

// //   if (mimeType.startsWith("image/")) {
// //     subFolder = "images";
// //   } else if (mimeType.startsWith("video/")) {
// //     subFolder = "videos";
// //   } else if (
// //     mimeType === "application/zip" ||
// //     mimeType === "application/x-zip-compressed"
// //   ) {
// //     subFolder = "zips";
// //   }

// //   const name = file.originalname.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "");
// //   const uniqueId = uuidv4().split("-")[0];
// //   return `${subFolder}/${Date.now()}-${uniqueId}-${name}`;
// // };

// // const getFirebasePublicUrl = (fileKey) =>
// //   `https://storage.googleapis.com/${bucket.name}/${fileKey}`;

// // const normalizeFirebaseKey = (fileUrl) => {
// //   if (!fileUrl) return null;

// //   const gcsPrefix = `https://storage.googleapis.com/${bucket.name}/`;
// //   if (fileUrl.startsWith(gcsPrefix)) {
// //     return fileUrl.replace(gcsPrefix, "");
// //   }

// //   const fbMatch = fileUrl.match(/\/o\/([^?]+)/);
// //   if (fileUrl.includes("firebasestorage.googleapis.com") && fbMatch) {
// //     return decodeURIComponent(fbMatch[1]);
// //   }

// //   return fileUrl;
// // };

// // const uploadToFirebase = async (file, folder = "temp") => {
// //   const fileKey = generateStorageKey(file, folder);
// //   const mimeType = getMimeType(file);
// //   const fileRef = bucket.file(fileKey);

// //   await fileRef.save(file.buffer, {
// //     metadata: {
// //       contentType: mimeType,
// //     },
// //   });

// //   // Make public to mimic S3 public-read behavior
// //   await fileRef.makePublic();

// //   return {
// //     key: fileKey,
// //     url: getFirebasePublicUrl(fileKey),
// //   };
// // };

// // const deleteFileFromFirebase = async (fileUrl) => {
// //   if (!fileUrl) return;
// //   const fileKey = normalizeFirebaseKey(fileUrl);
// //   if (!fileKey) return;
// //   try {
// //     await bucket.file(fileKey).delete({ ignoreNotFound: true });
// //     console.log(`??? Deleted from Firebase: ${fileKey}`);
// //   } catch (error) {
// //     console.error("? Error deleting file from Firebase:", error);
// //   }
// // };

// // const attachUpload = async (file, folder) => {
// //   const uploaded = await uploadToFirebase(file, folder);
// //   file.location = uploaded.url;
// //   file.key = uploaded.key;
// // };

// // const handleFirebaseUpload = (folder, multerHandler) => (req, res, next) => {
// //   multerHandler(req, res, async (err) => {
// //     if (err) return next(err);
// //     try {
// //       if (req.file) {
// //         await attachUpload(req.file, folder);
// //       }
// //       if (req.files) {
// //         if (Array.isArray(req.files)) {
// //           for (const file of req.files) {
// //             await attachUpload(file, folder);
// //           }
// //         } else {
// //           for (const fieldName of Object.keys(req.files)) {
// //             for (const file of req.files[fieldName]) {
// //               await attachUpload(file, folder);
// //             }
// //           }
// //         }
// //       }
// //       return next();
// //     } catch (uploadErr) {
// //       return next(uploadErr);
// //     }
// //   });
// // };

// // const getFirebaseMulter = (limits = {}) =>
// //   multer({ storage: multer.memoryStorage(), limits });

// // const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

// // export const singleAWS = (folder, fieldName) =>
// //   handleFirebaseUpload(folder, getFirebaseMulter().single(fieldName));

// // export const arrayAWS = (folder, fieldName, maxCount = 5) =>
// //   handleFirebaseUpload(folder, getFirebaseMulter().array(fieldName, maxCount));

// // export const fieldsAWS = (folder, fieldsArray) =>
// //   handleFirebaseUpload(folder, getFirebaseMulter().fields(fieldsArray));

// // export const singleAWSChat = (folder, fieldName) =>
// //   handleFirebaseUpload(folder, getFirebaseMulter({ fileSize: MAX_SIZE }).single(fieldName));

// // export const arrayAWSChat = (folder, fieldName, maxCount = 5) =>
// //   handleFirebaseUpload(folder, getFirebaseMulter({ fileSize: MAX_SIZE }).array(fieldName, maxCount));

// // Keep same exports to avoid changing other files
// // export const getAWSPublicUrl = (fileKey) => getFirebasePublicUrl(fileKey);
// // export const deleteFileFromS3 = async (fileUrl) => deleteFileFromFirebase(fileUrl);


import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { getMimeType } from "./misc.util.js";

// import multerS3 from "multer-s3";
// import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_UPLOADS_ROOT = path.join(__dirname, "../public/uploads");
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const normalizeForPath = (value = "") =>
  String(value)
    .trim()
    .replace(/^[/\\]+|[/\\]+$/g, "")
    .replace(/\.\./g, "")
    .replace(/\\/g, "/");

const resolveSubFolder = (file, folder = "temp") => {
  if (folder && folder.trim()) {
    return normalizeForPath(folder);
  }

  const mimeType = getMimeType(file);
  if (mimeType.startsWith("image/")) return "images";
  if (mimeType.startsWith("video/")) return "videos";
  if (
    mimeType === "application/zip" ||
    mimeType === "application/x-zip-compressed"
  ) {
    return "zips";
  }
  return "temp";
};

const makeFileName = (file) => {
  const safeName = (file.originalname || "file")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");
  const uniqueId = uuidv4().split("-")[0];
  return `${Date.now()}-${uniqueId}-${safeName}`;
};

const attachLocalMeta = (file, folder) => {
  if (!file) return;
  const subFolder = resolveSubFolder(file, folder);
  const fileName = path.basename(file.filename || "");
  const key = normalizeForPath(path.posix.join("uploads", subFolder, fileName));
  const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");

  file.key = key;
  file.location = appUrl ? `${appUrl}/${key}` : `/${key}`;
};

const withLocalUploadMeta = (folder, multerHandler) => (req, res, next) => {
  multerHandler(req, res, (err) => {
    if (err) return next(err);

    if (req.file) {
      attachLocalMeta(req.file, folder);
    }

    if (req.files) {
      if (Array.isArray(req.files)) {
        req.files.forEach((file) => attachLocalMeta(file, folder));
      } else {
        Object.keys(req.files).forEach((fieldName) => {
          req.files[fieldName].forEach((file) => attachLocalMeta(file, folder));
        });
      }
    }

    // Support clients that send array fields as `field[0]`, `field[1]` or `field[]`.
    // Multer will store these under the exact field name, so normalize them back
    // to the base field name to match controllers that expect `req.files[field]`.
    if (req.files && !Array.isArray(req.files)) {
      const entries = Object.entries(req.files);
      for (const [fieldName, files] of entries) {
        const bracketIndexMatch = /^(.+)\[(\d+)\]$/.exec(fieldName);
        const bracketArrayMatch = /^(.+)\[\]$/.exec(fieldName);
        const baseField = bracketIndexMatch?.[1] || bracketArrayMatch?.[1];
        if (!baseField || baseField === fieldName) continue;

        const normalizedFiles = Array.isArray(files) ? files : [files];
        normalizedFiles.forEach((file) => {
          if (file && typeof file === "object") {
            file.fieldname = baseField;
          }
        });

        if (!Array.isArray(req.files[baseField])) {
          req.files[baseField] = [];
        }
        req.files[baseField].push(...normalizedFiles);
        delete req.files[fieldName];
      }
    }

    return next();
  });
};

const createDiskStorage = (folder = "temp") =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      const subFolder = resolveSubFolder(file, folder);
      const targetDir = path.join(PUBLIC_UPLOADS_ROOT, subFolder);
      ensureDir(targetDir);
      cb(null, targetDir);
    },
    filename: (req, file, cb) => {
      cb(null, makeFileName(file));
    },
  });

const getLocalMulterInstance = (folder = "temp", limits = undefined) =>
  multer({
    storage: createDiskStorage(folder),
    limits,
  });

const getAWSPublicUrl = (fileKey) => {
  const key = normalizeForPath(fileKey || "");
  if (!key) return null;
  const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");
  return appUrl ? `${appUrl}/${key}` : `/${key}`;
};

const extractLocalKey = (fileUrlOrKey) => {
  if (!fileUrlOrKey) return null;
  const value = String(fileUrlOrKey).trim();
  if (!value) return null;

  const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");
  if (appUrl && value.startsWith(`${appUrl}/`)) {
    return normalizeForPath(value.replace(`${appUrl}/`, ""));
  }

  return normalizeForPath(value.replace(/^\/+/, ""));
};

const deleteFileFromS3 = async (fileUrlOrKey) => {
  const key = extractLocalKey(fileUrlOrKey);
  if (!key) return;
  if (!key.startsWith("uploads/")) return;

  const absolutePath = path.join(__dirname, "../public", key);
  try {
    await fs.promises.unlink(absolutePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Error deleting local file:", error);
    }
  }
};

export const singleAWS = (folder, fieldName) =>
  withLocalUploadMeta(
    folder,
    getLocalMulterInstance(folder).single(fieldName)
  );

export const arrayAWS = (folder, fieldName, maxCount = 5) =>
  withLocalUploadMeta(
    folder,
    getLocalMulterInstance(folder).array(fieldName, maxCount)
  );

const expandBracketedFields = (fieldsArray = []) => {
  if (!Array.isArray(fieldsArray)) return fieldsArray;

  const expanded = [];
  for (const field of fieldsArray) {
    if (!field?.name) continue;
    const name = String(field.name);
    const maxCount = Number(field.maxCount) || 1;

    expanded.push({ ...field, name });

    // `field[]` (common for multi-upload inputs)
    expanded.push({ ...field, name: `${name}[]` });

    // `field[0]`, `field[1]`, ...
    for (let i = 0; i < maxCount; i += 1) {
      expanded.push({ name: `${name}[${i}]`, maxCount: 1 });
    }
  }

  // Dedupe by field name, keeping the first maxCount we saw for that name.
  const seen = new Set();
  return expanded.filter((f) => {
    if (!f?.name) return false;
    if (seen.has(f.name)) return false;
    seen.add(f.name);
    return true;
  });
};

export const fieldsAWS = (folder, fieldsArray) =>
  withLocalUploadMeta(
    folder,
    getLocalMulterInstance(folder).fields(expandBracketedFields(fieldsArray))
  );

export const singleAWSChat = (folder, fieldName) =>
  withLocalUploadMeta(
    folder,
    getLocalMulterInstance(folder, { fileSize: MAX_SIZE }).single(fieldName)
  );

export const arrayAWSChat = (folder, fieldName, maxCount = 5) =>
  withLocalUploadMeta(
    folder,
    getLocalMulterInstance(folder, { fileSize: MAX_SIZE }).array(fieldName, maxCount)
  );

export { getAWSPublicUrl, deleteFileFromS3 };

