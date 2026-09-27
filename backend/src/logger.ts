import pino from "pino";
export const logger = pino({
  redact: [
    "req.headers.cookie",
    "req.headers.authorization",
    "req.headers.x-csrf-token",
    "res.headers.set-cookie",
    "password",
    "passwordHash",
  ],
});
