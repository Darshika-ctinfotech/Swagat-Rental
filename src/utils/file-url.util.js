import { APP_URL } from "../constants.js";

const normalizeKey = (value) => {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  return raw.replace(/^\/+/, "");
};

export const buildPublicFileUrl = (value) => {
  const normalized = normalizeKey(value);
  if (!normalized) return null;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  const appUrl = String(APP_URL || "").replace(/\/+$/, "");
  if (!appUrl) return `/${normalized}`;
  return `${appUrl}/${normalized}`;
};

export const buildPublicUploadUrl = (folder, value) => {
  const normalized = normalizeKey(value);
  if (!normalized) return null;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.includes("/")) return buildPublicFileUrl(normalized);

  const folderKey = normalizeKey(folder);
  const key = folderKey ? `uploads/${folderKey}/${normalized}` : `uploads/${normalized}`;
  return buildPublicFileUrl(key);
};

export const mapDocumentsWithUrl = (documents = []) =>
  documents.map((doc) => ({
    ...doc,
    doc_url: buildPublicFileUrl(doc?.doc_path),
  }));

