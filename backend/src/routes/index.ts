import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import * as auth from "../controllers/auth.controller.js";
import * as estimates from "../controllers/estimate.controller.js";
import * as clients from "../controllers/client.controller.js";
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
const passwordLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many attempts. Try again later." },
});
routes.get("/auth/session", auth.session);
routes.post("/auth/login", authLimit, auth.login);
routes.post("/auth/logout", requireAuth, auth.logout);
routes.use(requireAuth);
routes.post("/auth/change-password", passwordLimit, auth.changePassword);
routes.get("/dashboard", clients.dashboard);
routes.get("/clients", clients.list);
routes.post("/clients", allow("ADMIN", "ESTIMATOR"), clients.create);
routes.get("/clients/:id", clients.get);
routes.put("/clients/:id", allow("ADMIN", "ESTIMATOR"), clients.update);
routes.patch(
  "/clients/:id/status",
  allow("ADMIN", "ESTIMATOR"),
  clients.status,
);
routes.get("/clients/:id/projects", clients.projects);
routes.post(
  "/clients/:clientId/projects",
  allow("ADMIN", "ESTIMATOR"),
  clients.createProject,
);
routes.get("/clients/:id/estimates", clients.estimates);
routes.get("/clients/:id/activity", allow("ADMIN"), clients.activity);
routes.get("/projects/:id", clients.getProject);
routes.get("/projects/:projectId/estimates", estimates.listForProject);
routes.post(
  "/projects/:projectId/estimates",
  allow("ADMIN", "ESTIMATOR"),
  estimates.createForProject,
);
routes.put("/projects/:id", allow("ADMIN", "ESTIMATOR"), clients.updateProject);
routes.patch(
  "/projects/:id/status",
  allow("ADMIN", "ESTIMATOR"),
  clients.statusProject,
);
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
