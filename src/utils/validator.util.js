import Joi from 'joi';

export const emailValidation = Joi.string().trim().required().email();
export const stringValidation = Joi.string().trim().required();
export const idArrayValidation = Joi.array().items(stringValidation).optional();
export const numberValidation = Joi.number().required();
export const booleanValidation = Joi.boolean().required();
export const dateValidation = Joi.date().required();
export const arrayObjectValidation = Joi.array()
  .required()
  .items(Joi.object({}).unknown());
export const urlValidation = Joi.string().trim().required().uri();
export const genderValidation = Joi.string().valid('MALE', 'FEMALE', 'OTHER').required();
export const passwordValidation = Joi.string()
  .min(8)
  .max(64)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?#&^+=])[A-Za-z\d@$!%*?#&^+=]{8,}$/)
  .message(
    "Password must be 8-64 characters long, include at least one uppercase letter, one lowercase letter, one number, and one special character."
  );

export const section2CardValidation = Joi.array()
  .items(
    Joi.object({
      title: Joi.string().required(),
      description: Joi.string().required()
    })
  )
  .min(4)
  .max(4)
  .required();

export const section4CardValidation = Joi.array()
  .items(
    Joi.object({
      title: Joi.string().required(),
      description: Joi.string().required()
    })
  )
  .min(3)
  .max(3)
  .required();

export const section5Validation = Joi.array()
  .items(
    Joi.object({
      title: Joi.string().required(),
      text_1: Joi.string().required().allow('', null).optional(),
      text_2: Joi.string().required().allow('', null).optional(),
      // text_3: Joi.string().required()
    })
  )
  .min(3)
  .max(3)
  .required();



export const section6Validation = Joi.array()
  .items(
    Joi.object({
      question: Joi.string().required(),
      answer: Joi.string().required()
    })
  )
  .min(1)
  .required();

const sessionSchema = Joi.object({
  title: Joi.string().required(),
  description: Joi.string().required(),
  start_time: Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).required(), // HH:mm or HH:mm:ss
  end_time: Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).allow('', null).optional(),
  date: Joi.date().required(),
  speakers: Joi.array().items(
    Joi.object({
      name: Joi.string().allow(null, ''),
      role: Joi.string().allow(null, ''),
      session_speaker_id: Joi.number().integer().allow(null, ''),
      image: Joi.any().allow(null, ''),
    })
  ).optional()
});

// Optional: program_day schema
export const programDaySchema = Joi.object({
  day_number: Joi.number().integer().required(),
  sessions: Joi.array().items(sessionSchema).min(1).required(),
  title: Joi.string().required(),
  description: Joi.string().required()
});



export const messages = {
  'date.base': ':key must be a valid date',
  'date.empty': ':key is required',
  'date.format': ':key must be a valid date',
  'string.base': ':key must be a string',
  'string.email': 'Please enter a valid email',
  'string.uri': 'Please enter a valid URL',
  'string.empty': ':key is required',
  'number.base': ':key must be a number',
  'number.integer': ':key must be a valid number',
  'number.empty': ':key is required',
  'number.unsafe': ':key must be valid',
  'boolean.base': ':key must be true/false',
  'any.required': ':key is required',
  'any.invalid': ':key is invalid',
  'any.only': ':value is not a valid :key',
  'object.unknown': ':key is not allowed',
  'array.base': ':key must be an array',
  'array.includesRequiredUnknowns': ':key connot be empty',
};

export const populateMessage = (error) => {
  const errorDetails = error?.details?.[0];

  if (!errorDetails) return 'Validation error';

  let message = messages[errorDetails.type] || errorDetails.message || 'Validation error';

  const key =
    errorDetails.context?.key === 0
      ? errorDetails.context.label
      : errorDetails.context?.key || 'Field';

  const value = errorDetails.context?.value || '';

  message = message.replace(/:key/g, key).replace(/:value/g, value);

  return message;
};


export const nuterraSection2CardValidation = Joi.array()
  .items(
    Joi.object({
      title: Joi.string().required(),
      subtitle: Joi.string().required(),
      shortdescription: Joi.string().required(),
      description_heading: Joi.string().required(),
      description: Joi.string().required(),
      listheading: Joi.string().required(),
      listPoints: Joi.array().items(Joi.string()).required(),
      // buttonText: Joi.string().required()
    })
  )
  .min(3)
  .max(3)
  .required();