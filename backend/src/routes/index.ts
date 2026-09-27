import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import * as auth from "../controllers/auth.controller.js";
import * as estimates from "../controllers/estimate.controller.js";
import { requireAuth, allow } from "../middleware/auth.js";
export const routes = Router();
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many sign-in attempts. Try again later." },
});
const exportLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Please wait before exporting again." },
});
routes.get("/auth/session", auth.session);
routes.post("/auth/login", authLimit, auth.login);
routes.post("/auth/logout", requireAuth, auth.logout);
routes.use(requireAuth);
routes.get("/estimates", estimates.list);
routes.post("/estimates", allow("ADMIN", "ESTIMATOR"), estimates.create);
routes.get("/estimates/:id", estimates.get);
routes.put("/estimates/:id", allow("ADMIN", "ESTIMATOR"), estimates.update);
routes.patch(
  "/estimates/:id/status",
  allow("ADMIN", "ESTIMATOR"),
  estimates.status,
);
routes.get("/estimates/:id/export/:format", exportLimit, estimates.download);
routes.get("/audit", allow("ADMIN"), estimates.audit);
