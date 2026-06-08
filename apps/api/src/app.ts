import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';
import swaggerUi from 'swagger-ui-express';
import { getEnv } from './config/env.js';
import { corsOrigins } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { listingsRouter } from './modules/listings/listings.routes.js';
import { dealerListingsRouter } from './modules/dealer-listings/dealer-listings.routes.js';
import { torqueRouter } from './modules/torque/torque.routes.js';
import { otpRouter } from './modules/otp/otp.routes.js';
import { dealerLeadsRouter, publicLeadsRouter } from './modules/leads/leads.routes.js';
import { dealerLeadCommentsRouter } from './modules/leads/lead-comments.routes.js';
import { dealerOrdersRouter, publicOrdersRouter } from './modules/orders/orders.routes.js';
import { dealersRouter } from './modules/dealers/dealers.routes.js';
import { adminMetricsRouter } from './modules/admin/admin-metrics.routes.js';
import { adminDealersRouter } from './modules/admin/admin-dealers.routes.js';
import { adminListingsRouter } from './modules/admin/admin-listings.routes.js';
import { adminLeadsRouter } from './modules/admin/admin-leads.routes.js';
// BUG-054: adminContentRouter + adminAuditRouter intentionally NOT
// imported — both modules were removed from the Admin UI and the
// matching API endpoints are now deprecated. Replaced below by a
// "410 Gone" handler so any direct curl/Postman call returns a
// clean deprecation response instead of serving stale functionality.
// publicContentRouter stays — it's the public-facing /api/v1/static
// endpoint the buyer SPA's privacy/terms/cookies pages still hit.
import { publicContentRouter } from './modules/admin/admin-content.routes.js';
import { seoRouter } from './modules/seo/seo.routes.js';
import { inspectionRouter } from './modules/inspection/inspection.routes.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';
import { certificateRouter } from './modules/certificate/certificate.routes.js';
import { openApiDocument } from './openapi.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins(),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));

  // Public-route rate limiter — protects /listings (search), /leads/track,
  // /orders/track, /dealers, /static from a single IP hammering with no
  // session or cost.  /auth and /otp have their own (tighter) limiters
  // applied within their routers, so they're not gated again here.
  // Production caps tight; dev raises ceiling so e2e suites + local
  // testing don't trip the limit.
  const isProd = getEnv().NODE_ENV === 'production';
  const publicLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: isProd ? 60 : 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' } },
  });

  // API surface — every public route lives under /api/v1
  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/otp', otpRouter);
  app.use('/api/v1/listings', publicLimiter, listingsRouter);
  app.use('/api/v1/listings', publicLimiter, certificateRouter);
  app.use('/api/v1/leads', publicLimiter, publicLeadsRouter);
  app.use('/api/v1/orders', publicLimiter, publicOrdersRouter);
  app.use('/api/v1/dealers', publicLimiter, dealersRouter);
  app.use('/api/v1/static', publicLimiter, publicContentRouter);
  app.use('/api/v1/dealer/listings', dealerListingsRouter);
  app.use('/api/v1/dealer/leads', dealerLeadsRouter);
  app.use('/api/v1/dealer/leads', dealerLeadCommentsRouter);
  app.use('/api/v1/dealer/orders', dealerOrdersRouter);
  app.use('/api/v1/torque', torqueRouter);
  app.use('/api/v1/inspection', inspectionRouter);
  app.use('/api/v1/uploads', uploadsRouter);
  app.use('/api/v1/admin/metrics', adminMetricsRouter);
  app.use('/api/v1/admin/dealers', adminDealersRouter);
  app.use('/api/v1/admin/listings', adminListingsRouter);
  app.use('/api/v1/admin/leads', adminLeadsRouter);
  // BUG-054: Deprecated. Both modules removed from the Admin UI.
  // Any direct API call (curl / Postman / scripts) now gets a
  // structured 410 Gone — no controller code path is reachable, so
  // there is no risk of stale data leak or unintended writes.
  const goneHandler = (_req: import('express').Request, res: import('express').Response) => {
    res.status(410).json({
      error: {
        code: 'ENDPOINT_DEPRECATED',
        message:
          'This endpoint has been retired. The Audit and Content modules are no longer part of the H-D Certified admin scope.',
      },
    });
  };
  app.all('/api/v1/admin/content', goneHandler);
  app.all('/api/v1/admin/content/*', goneHandler);
  app.all('/api/v1/admin/audit', goneHandler);
  app.all('/api/v1/admin/audit/*', goneHandler);

  // SEO endpoints — buyer site reverse-proxies /sitemap.xml + /robots.txt → here.
  app.use('/', seoRouter);

  // OpenAPI docs
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.get('/api/openapi.json', (_req, res) => res.json(openApiDocument));

  // Root → friendly redirect
  app.get('/', (_req, res) => res.redirect('/api/docs'));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
