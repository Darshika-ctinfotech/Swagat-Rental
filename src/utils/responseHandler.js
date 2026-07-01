export const vallidationErrorHandle = (res, errors) => {
  const errorMessage = errors.errors[0].msg;

  return res.status(400).json({
    success: false,
    code: 400,
    message: errorMessage,
  });
};
