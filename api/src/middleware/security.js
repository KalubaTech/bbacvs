// Security layers L7/L8: Helmet, CORS, rate limiting, Joi validation, central error handler.
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "../config/index.js";

export const helmetMw = helmet({
  contentSecurityPolicy: config.env === "production" ? undefined : false,
  hsts: config.env === "production",
});

export const corsMw = cors({
  origin: config.corsOrigin,
  credentials: true,
});

// 100 requests/min general limiter (proposal §3.9, L7).
export const rateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, slow down." },
});

/** Validate req[source] against a Joi schema. */
export function validate(schema, source = "body") {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.details.map((d) => d.message),
      });
    }
    req[source] = value;
    next();
  };
}

/** Central error handler — never leak stack traces in production. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) console.error(`[error] ${req.method} ${req.path}:`, err);
  const body = { error: err.expose ? err.message : "Internal server error" };
  if (config.env !== "production") body.detail = err.message;
  res.status(status).json(body);
}
