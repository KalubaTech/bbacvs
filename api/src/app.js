import express from "express";
import cookieParser from "cookie-parser";
import {
  helmetMw,
  corsMw,
  rateLimiter,
  errorHandler,
} from "./middleware/security.js";

import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import heaRoutes from "./routes/hea.routes.js";
import tevetaRoutes from "./routes/teveta.routes.js";
import zaqaRoutes from "./routes/zaqa.routes.js";
import eczRoutes from "./routes/ecz.routes.js";
import programmesRoutes from "./routes/programmes.routes.js";
import institutionsRoutes from "./routes/institutions.routes.js";
import activityRoutes from "./routes/activity.routes.js";
import usersRoutes from "./routes/users.routes.js";
import applicationsRoutes from "./routes/applications.routes.js";
import disputesRoutes from "./routes/disputes.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js";
import credentialsRoutes from "./routes/credentials.routes.js";
import verifyRoutes from "./routes/verify.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import nqfRoutes from "./routes/nqf.routes.js";
import qualificationsRoutes from "./routes/qualifications.routes.js";
import billingRoutes from "./routes/billing.routes.js";

export function createApp() {
  const app = express();

  // Behind the nginx reverse proxy — trust exactly one hop so req.ip and the
  // rate limiter key off the real client IP (X-Forwarded-For), not nginx's.
  app.set("trust proxy", 1);

  // Security middleware stack (L7/L8).
  app.use(helmetMw);
  app.use(corsMw);
  app.use(cookieParser());
  app.use(rateLimiter);

  // These carry a base64 document upload — parse with a larger limit BEFORE the tight global
  // JSON limit below (the global parser then skips the already-consumed body).
  app.use("/api/institutions", express.json({ limit: "8mb" }), institutionsRoutes);
  app.use("/api/applications", express.json({ limit: "8mb" }), applicationsRoutes);

  // Tight global JSON limit for every other endpoint.
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", (_req, res) => res.json({ ok: true, service: "bbacvs-api" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/hea", heaRoutes);
  app.use("/api/teveta", tevetaRoutes);
  app.use("/api/zaqa", zaqaRoutes);
  app.use("/api/ecz", eczRoutes);
  app.use("/api/programmes", programmesRoutes);
  app.use("/api/activity", activityRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/disputes", disputesRoutes);
  app.use("/api/notifications", notificationsRoutes);
  app.use("/api/credentials", credentialsRoutes);
  app.use("/api/verify", verifyRoutes);
  app.use("/api/audit", auditRoutes);
  app.use("/api/nqf", nqfRoutes);
  app.use("/api/qualifications", qualificationsRoutes);
  app.use("/api/billing", billingRoutes);

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use(errorHandler);

  return app;
}
