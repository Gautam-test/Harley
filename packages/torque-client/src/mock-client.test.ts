import { describe, expect, it } from 'vitest';
import { TorqueMockClient } from './mock-client.js';

describe('TorqueMockClient', () => {
  it('returns the seven canonical fields for a well-formed VIN', async () => {
    const client = new TorqueMockClient();
    const v = await client.getVehicleByVin('1HD1KHM18MB678901');
    expect(v).not.toBeNull();
    expect(v?.vin).toBe('1HD1KHM18MB678901');
    // QA: profile + colour are hash-picked per VIN so every fetch
    // returns a different bike. Assert shape, not specific values.
    expect(typeof v?.engine).toBe('string');
    expect(v?.engine?.length).toBeGreaterThan(0);
    expect(typeof v?.modelName).toBe('string');
    expect(v?.modelName?.length).toBeGreaterThan(0);
    expect(typeof v?.modelFamily).toBe('string');
    expect(v?.modelFamily?.length).toBeGreaterThan(0);
    expect(typeof v?.colour).toBe('string');
    expect(v?.colour?.length).toBeGreaterThan(0);
    expect(v?.customerName).toMatch(/\w+ \w+/);
    // ISO 8601 yyyy-mm-dd
    expect(v?.dateOfInvoice).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Operational metadata still present
    expect(v?.dealerId).toBe('TQ-DEALER-8901');
    expect(v?.status).toBe('AVAILABLE');
  });

  it('is deterministic — same VIN returns the same bike + colour', async () => {
    const client = new TorqueMockClient();
    const a = await client.getVehicleByVin('1HD1KHM18MB678901');
    const b = await client.getVehicleByVin('1HD1KHM18MB678901');
    expect(a?.modelName).toBe(b?.modelName);
    expect(a?.modelFamily).toBe(b?.modelFamily);
    expect(a?.colour).toBe(b?.colour);
    expect(a?.engine).toBe(b?.engine);
  });

  it('different VINs return different bikes (sample 5 distinct picks)', async () => {
    const client = new TorqueMockClient();
    const vins = [
      '1HD1KHM18MB678901',
      '2ABCDEF99NN111222',
      'MEGAVIN999XX33344',
      '5HD1FBK33EB123456',
      'JH2RC4406FM789012',
    ];
    const models = new Set<string>();
    for (const vin of vins) {
      const v = await client.getVehicleByVin(vin);
      if (v?.modelName) models.add(v.modelName);
    }
    // At least 3 of the 5 should land on different models — proves the
    // hash actually distributes across the pool (not always the same row).
    expect(models.size).toBeGreaterThanOrEqual(3);
  });

  it('returns null only for malformed VINs (wrong length)', async () => {
    const client = new TorqueMockClient();
    expect(await client.getVehicleByVin('invalid')).toBeNull();
    // Wrong length
    expect(await client.getVehicleByVin('1HD1KHM18MB67890')).toBeNull();
    // QA: I/O/Q are intentionally accepted in the mock so demo VINs
    // can be any 17 alphanumeric chars (the comment on VIN_FORMAT in
    // the implementation explains this — demo-friendly).
  });

  it('accepts any well-formed 17-char VIN with a hash-picked profile', async () => {
    const client = new TorqueMockClient();
    const v = await client.getVehicleByVin('12121212121212121');
    expect(v).not.toBeNull();
    // modelFamily comes from a fixed pool; whatever the picker chose
    // must be one of the known families.
    expect([
      'Grand American Touring',
      'Cruiser',
      'Sport',
      'Adventure Touring',
      'Street',
    ]).toContain(v?.modelFamily);
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
