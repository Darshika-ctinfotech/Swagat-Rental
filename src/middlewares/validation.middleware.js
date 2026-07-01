import { validationResult } from "express-validator";
import { vallidationErrorHandle } from "../utils/responseHandler.js";
import { apiError } from '../utils/api.util.js';
import { CUSTOM_ERROR } from '../utils/message.util.js';
import { populateMessage } from '../utils/validator.util.js';
import { deleteFileFromS3 } from "../utils/aws.util.js";

export const validate = (schema, type) => (req, res, next) => {
  console.log(req[type], type, schema);
  if (req[type] === undefined) {
    return apiError(CUSTOM_ERROR, `${type} is missing from request`, null, res);
  }

  const { error } = schema.validate(req[type]);

  if (error) {
    return apiError(CUSTOM_ERROR, populateMessage(error), null, res);
  }

  next();
};

export const validateMultiple = (schema, types) => (req, res, next) => {
  const validationData = {};
  types.forEach((type) => {
    validationData[type] = req[type];
  });

  const { error } = schema.validate(validationData);
  if (error) {
    return apiError(CUSTOM_ERROR, populateMessage(error), null, res);
  }
  next();
};


export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const uploadedPaths = [];

    if (req.file) {
      uploadedPaths.push(req.file.key || req.file.location);
    }

    if (req.files) {
      if (Array.isArray(req.files)) {
        for (const file of req.files) {
          uploadedPaths.push(file?.key || file?.location);
        }
      } else {
        for (const fieldName of Object.keys(req.files)) {
          const files = Array.isArray(req.files[fieldName]) ? req.files[fieldName] : [];
          for (const file of files) {
            uploadedPaths.push(file?.key || file?.location);
          }
        }
      }
    }

    const pathsToDelete = [...new Set(uploadedPaths.filter(Boolean))];
    if (pathsToDelete.length) {
      Promise.all(pathsToDelete.map((filePath) => deleteFileFromS3(filePath))).catch(() => {});
    }

    return vallidationErrorHandle(res, errors);
  }

  next();
};
