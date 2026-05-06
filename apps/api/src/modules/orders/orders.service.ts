import { prisma } from '../../config/prisma.js';
import { encryptPii } from '../../utils/crypto.js';
import { HttpError } from '../../middleware/error-handler.js';

export const ORDER_PIPELINE = [
  'ORDER_CONFIRMED',
  'QUALITY_INSPECTION',
  'DOCUMENTATION',
  'IN_TRANSIT',
  'READY_FOR_DELIVERY',
  'DELIVERED',
] as const;

export type OrderStatus = (typeof ORDER_PIPELINE)[number];

const PRETTY_LABEL: Record<OrderStatus, string> = {
  ORDER_CONFIRMED: 'Order Confirmed',
  QUALITY_INSPECTION: 'Quality Inspection',
  DOCUMENTATION: 'Documentation',
  IN_TRANSIT: 'In Transit',
  READY_FOR_DELIVERY: 'Ready for Delivery',
  DELIVERED: 'Delivered',
};

const STAGE_NOTE: Record<OrderStatus, string> = {
  ORDER_CONFIRMED: 'Your order is confirmed and is being prepared.',
  QUALITY_INSPECTION: '110-point inspection completed successfully.',
  DOCUMENTATION: 'Registration and documentation in progress.',
  IN_TRANSIT: 'Bike is on its way to the dealership.',
  READY_FOR_DELIVERY: 'Your bike is ready for pickup or delivery.',
  DELIVERED: 'Delivered. Welcome to H-D ownership.',
};

// Public — anyone with the orderId can see the timeline (no PII).
export async function trackOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { orderId },
    include: {
      events: { orderBy: { occurredAt: 'asc' } },
      dealer: { select: { name: true, city: true } },
    },
  });
  if (!order) throw new HttpError(404, 'NOT_FOUND', 'No order with that tracking number');

  const reachedSet = new Set(order.events.map((e) => e.status));
  const currentIndex = ORDER_PIPELINE.indexOf(order.status as OrderStatus);

  const stages = ORDER_PIPELINE.map((status, idx) => {
    const event = order.events.find((e) => e.status === status);
    const reached = reachedSet.has(status) || idx < currentIndex;
    const isCurrent = status === order.status;
    return {
      status,
      label: PRETTY_LABEL[status],
      note: STAGE_NOTE[status],
      reached,
      isCurrent,
      occurredAt: event?.occurredAt ?? null,
    };
  });

  return {
    orderId: order.orderId,
    bikeLabel: order.bikeLabel,
    estimatedDelivery: order.estimatedDelivery,
    currentStatus: order.status,
    currentLabel: PRETTY_LABEL[order.status as OrderStatus],
    dealerName: order.dealer.name,
    dealerCity: order.dealer.city,
    createdAt: order.createdAt,
    stages,
  };
}

// Dealer — list own orders.
export async function listDealerOrders(dealerId: string) {
  return prisma.order.findMany({
    where: { dealerId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      orderId: true,
      buyerName: true,
      bikeLabel: true,
      status: true,
      estimatedDelivery: true,
      createdAt: true,
    },
  });
}

interface CreateOrderInput {
  orderId: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string;
  bikeLabel: string;
  listingId?: string;
  estimatedDelivery?: string;
}

export async function createOrder(dealerId: string, input: CreateOrderInput) {
  const exists = await prisma.order.findUnique({
    where: { orderId: input.orderId },
    select: { id: true },
  });
  if (exists) throw new HttpError(409, 'CONFLICT', 'Order ID already in use');

  return prisma.order.create({
    data: {
      orderId: input.orderId,
      buyerName: input.buyerName,
      buyerPhoneEnc: encryptPii(input.buyerPhone),
      buyerEmailEnc: encryptPii(input.buyerEmail),
      bikeLabel: input.bikeLabel,
      listingId: input.listingId,
      dealerId,
      estimatedDelivery: input.estimatedDelivery ? new Date(input.estimatedDelivery) : null,
      events: {
        create: { status: 'ORDER_CONFIRMED' },
      },
    },
  });
}

// Dealer — advance an order to a later stage. Appends an OrderEvent.
export async function advanceOrderStatus(
  dealerId: string,
  id: string,
  newStatus: OrderStatus,
  note?: string,
) {
  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, dealerId: true, status: true },
  });
  if (!order) throw new HttpError(404, 'NOT_FOUND', 'Order not found');
  if (order.dealerId !== dealerId) throw new HttpError(403, 'FORBIDDEN', 'Not your order');

  const fromIdx = ORDER_PIPELINE.indexOf(order.status as OrderStatus);
  const toIdx = ORDER_PIPELINE.indexOf(newStatus);
  if (toIdx < 0) throw new HttpError(400, 'BAD_REQUEST', 'Unknown order status');
  if (toIdx <= fromIdx)
    throw new HttpError(400, 'BAD_REQUEST', 'Status can only move forward in the pipeline');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id },
      data: { status: newStatus },
    });
    await tx.orderEvent.create({
      data: { orderId: id, status: newStatus, note: note ?? null },
    });
    return updated;
  });
}
