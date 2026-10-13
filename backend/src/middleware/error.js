import mongoose from 'mongoose';
import { HttpError } from '../utils/httpError.js';
import { config } from '../config.js';

export function notFound(req, _res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let status = err.status || 500;
  let message = err.message || 'Internal server error';
  if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = 'Invalid identifier';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body too large';
  }
  if (status >= 500) {
    if (!config.isTest) console.error(err);
    message = 'Internal server error';
  }
  const body = { error: message };
  if (err instanceof HttpError && err.details) Object.assign(body, err.details);
  res.status(status).json(body);
}
