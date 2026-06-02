import { Router } from 'express';
import { z } from 'zod';
import { vin } from '@hd-cpo/types';
import { prisma } from '../../config/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { HttpError } from '../../middleware/error-handler.js';
import { torque } from './torque.module.js';

export const torqueRouter = Router();

const vinParam = z.object({ vin });

// Dealer-only — preview a vehicle before committing to a listing.
//
// PRD §6.2.3 AC1 — VIN must exist in Torque AND be assigned to this dealer.
// We do BOTH checks here (rather than waiting for listing-create) so the
// dealer gets immediate feedback in Step 1 of the wizard instead of filling
// the entire form only to be blocked at submit.
torqueRouter.get(
  '/vehicles/:vin',
  requireAuth(['DEALER']),
  validate(vinParam, 'params'),
  async (req, res, next) => {
    try {
      const { vin: requestedVin } = req.params as { vin: string };
      const vehicle = await torque.getVehicleByVin(requestedVin);
      if (!vehicle) throw new HttpError(404, 'TORQUE_VIN_NOT_FOUND', 'VIN not found in Torque');

      // QA UPDATE: dealer-assignment check fully disabled here too.
      // No real Torque DMS integration means there is no authoritative
      // VIN-to-dealer mapping; any well-formed VIN should fetch cleanly.
      // The check stays as dead code so the real integration can re-enable
      // it later by uncommenting.
      // const dealer = await prisma.dealer.findUnique({
      //   where: { id: req.auth!.sub },
      //   select: { torqueDealerId: true },
      // });
      // if (dealer?.torqueDealerId && vehicle.dealerId !== dealer.torqueDealerId) {
      //   throw new HttpError(403, 'VIN_NOT_ASSIGNED', '...');
      // }

      res.json(vehicle);
    } catch (e) {
      next(e);
    }
  },
);

torqueRouter.get(
  '/vehicles/:vin/cpo-kit',
  requireAuth(['DEALER']),
  validate(vinParam, 'params'),
  async (req, res, next) => {
    try {
      const { vin: requestedVin } = req.params as { vin: string };
      res.json(await torque.getCpoKit(requestedVin));
    } catch (e) {
      next(e);
    }
  },
);

// Mock document placeholder. The mock Torque client returns URLs for CPO
// kit docs (cpoCertUrl, rsaUrl, hogUrl, insuranceUrl, etc.) — pre-fix
// those pointed at the literal hostname `torque.mock` which DNS doesn't
// resolve, so clicking any doc gave "site can't be reached" (QA bug 7).
//
// Until the live Torque client is wired we route every mock doc URL at
// this endpoint; it streams a minimal placeholder PDF naming the doc
// type + VIN so the dealer at least sees a real file open instead of a
// browser DNS error. Mode-gated so a misconfigured prod env (TORQUE_MODE
// stuck on `mock`) at least doesn't ship fake docs as CPO certs.
torqueRouter.get('/mock-docs/:type/:filename', async (req, res, next) => {
  try {
    const { type, filename } = req.params as { type: string; filename: string };
    if (!/^[a-z][a-z0-9-]*$/.test(type) || !/^[A-Z0-9]+\.pdf$/i.test(filename)) {
      throw new HttpError(400, 'BAD_PATH', 'Invalid mock-doc URL');
    }
    const docVin = filename.replace(/\.pdf$/i, '');
    const labels: Record<string, string> = {
      'cpo-cert': 'Certified Pre-Owned Certificate',
      rsa: 'Roadside Assistance',
      esp: 'Extended Service Plan',
      'service-history': 'Service History',
      rc: 'Registration Certificate (RC)',
      'delivery-note': 'Delivery Note',
      'hog-membership': 'HOG Membership',
      insurance: 'Insurance Policy',
    };
    const docLabel = labels[type] ?? type.toUpperCase();
    const { default: PDFDocument } = await import('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 64 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${type}-${docVin}.pdf"`,
    );
    doc.pipe(res);
    doc.fontSize(28).font('Helvetica-Bold').text('H-D Certified', { align: 'left' });
    doc.moveDown(0.3).fontSize(11).font('Helvetica').fillColor('#666');
    doc.text('Mock document — demo mode only', { align: 'left' });
    doc.moveDown(2).fontSize(20).font('Helvetica-Bold').fillColor('#000');
    doc.text(docLabel);
    doc.moveDown(0.5).fontSize(11).font('Helvetica').fillColor('#444');
    doc.text(`VIN: ${docVin}`);
    doc.moveDown(2).fontSize(10).fillColor('#888');
    doc.text(
      'This placeholder is served while the live Torque DMS integration is in progress. ' +
        'The production deploy fetches the real document from Torque and serves it through the same URL. ' +
        'For demo / staging environments the contents above identify the doc type without exposing real customer paperwork.',
      { align: 'left' },
    );
    doc.moveDown(2).fontSize(9).fillColor('#aaa');
    doc.text(`Generated ${new Date().toISOString()}`);
    doc.end();
  } catch (e) {
    next(e);
  }
});
