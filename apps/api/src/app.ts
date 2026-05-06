import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';
import swaggerUi from 'swagger-ui-express';
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
import { adminBulkImportRouter } from './modules/admin/admin-bulk-import.routes.js';
import { adminListingsRouter } from './modules/admin/admin-listings.routes.js';
import { adminLeadsRouter } from './modules/admin/admin-leads.routes.js';
import { adminContentRouter, publicContentRouter } from './modules/admin/admin-content.routes.js';
import { adminAuditRouter } from './modules/admin/admin-audit.routes.js';
import { seoRouter } from './modules/seo/seo.routes.js';
import { inspectionRouter } from './modules/inspection/inspection.routes.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';
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

  // API surface — every public route lives under /api/v1
  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/otp', otpRouter);
  app.use('/api/v1/listings', listingsRouter);
  app.use('/api/v1/leads', publicLeadsRouter);
  app.use('/api/v1/orders', publicOrdersRouter);
  app.use('/api/v1/dealers', dealersRouter);
  app.use('/api/v1/static', publicContentRouter);
  app.use('/api/v1/dealer/listings', dealerListingsRouter);
  app.use('/api/v1/dealer/leads', dealerLeadsRouter);
  app.use('/api/v1/dealer/leads', dealerLeadCommentsRouter);
  app.use('/api/v1/dealer/orders', dealerOrdersRouter);
  app.use('/api/v1/torque', torqueRouter);
  app.use('/api/v1/inspection', inspectionRouter);
  app.use('/api/v1/uploads', uploadsRouter);
  app.use('/api/v1/admin/metrics', adminMetricsRouter);
  app.use('/api/v1/admin/dealers', adminDealersRouter);
  app.use('/api/v1/admin/import', adminBulkImportRouter);
  app.use('/api/v1/admin/listings', adminListingsRouter);
  app.use('/api/v1/admin/leads', adminLeadsRouter);
  app.use('/api/v1/admin/content', adminContentRouter);
  app.use('/api/v1/admin/audit', adminAuditRouter);

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
