import { describe, expect, it } from 'vitest';
import { TorqueMockClient } from './mock-client.js';

describe('TorqueMockClient', () => {
  it('returns the seven canonical fields for a well-formed VIN', async () => {
    const client = new TorqueMockClient();
    const v = await client.getVehicleByVin('1HD1KHM18MB678901');
    expect(v).not.toBeNull();
    expect(v?.vin).toBe('1HD1KHM18MB678901');
    expect(v?.engine).toBe('Milwaukee-Eight 114 · 1868 cc');
    expect(v?.modelName).toBe('Street Glide Special');
    expect(v?.modelFamily).toBe('Grand American Touring');
    expect(v?.colour).toBe('Vivid Black');
    expect(v?.customerName).toMatch(/\w+ \w+/);
    // ISO 8601 yyyy-mm-dd
    expect(v?.dateOfInvoice).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Operational metadata still present
    expect(v?.dealerId).toBe('TQ-DEALER-8901');
    expect(v?.status).toBe('AVAILABLE');
  });

  it('returns null only for malformed VINs (wrong length / forbidden chars)', async () => {
    const client = new TorqueMockClient();
    expect(await client.getVehicleByVin('invalid')).toBeNull();
    // Forbidden chars I/O/Q
    expect(await client.getVehicleByVin('1IO1KHM18MB678901')).toBeNull();
    // Wrong length
    expect(await client.getVehicleByVin('1HD1KHM18MB67890')).toBeNull();
  });

  it('accepts any well-formed 17-char VIN with a default profile', async () => {
    const client = new TorqueMockClient();
    const v = await client.getVehicleByVin('12121212121212121');
    expect(v).not.toBeNull();
    expect(v?.modelFamily).toBe('Cruiser'); // default profile
    expect(v?.dealerId).toBe('TQ-DEALER-2121');
  });

  it('persists status updates across calls', async () => {
    const client = new TorqueMockClient();
    const vin = '1HD1KHM18MB678901';
    await client.updateVehicleStatus(vin, 'SOLD');
    const v = await client.getVehicleByVin(vin);
    expect(v?.status).toBe('SOLD');
  });

  it('returns CPO kit URLs', async () => {
    const client = new TorqueMockClient();
    const kit = await client.getCpoKit('1HD1KHM18MB678901');
    expect(kit.cpoCertUrl).toBeTruthy();
    expect(kit.serviceHistoryUrl).toBeTruthy();
  });
});
