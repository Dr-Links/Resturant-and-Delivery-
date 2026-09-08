import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mapGenStatus, threedgenConfigured, threedgenConfigFrom, startImageTo3d, getGenJob } from './index';

type Body = Record<string, unknown>;
function res(body: Body, init: { ok?: boolean; status?: number } = {}) {
  return { ok: init.ok ?? true, status: init.status ?? 200, json: async () => body } as unknown as Response;
}

const cfg = { provider: 'meshy', base: 'https://api.meshy.ai/openapi/v1', apiKey: 'k' };

describe('mapGenStatus', () => {
  const cases: [string, string][] = [
    ['SUCCEEDED', 'succeeded'],
    ['FAILED', 'failed'],
    ['EXPIRED', 'failed'],
    ['CANCELED', 'failed'],
    ['PENDING', 'processing'],
    ['IN_PROGRESS', 'processing'],
    ['', 'processing'],
  ];
  for (const [g, e] of cases) it(`maps ${g || '(empty)'} -> ${e}`, () => expect(mapGenStatus(g)).toBe(e));
});

describe('threedgen config', () => {
  it('is configured only with an api key', () => {
    expect(threedgenConfigured(cfg)).toBe(true);
    expect(threedgenConfigured({ ...cfg, apiKey: '' })).toBe(false);
  });
  it('builds config from a resolver with defaults', () => {
    const c = threedgenConfigFrom((k, d) => (k === 'THREEDGEN_API_KEY' ? 'secret' : d ?? ''));
    expect(c).toEqual({ provider: 'meshy', base: 'https://api.meshy.ai/openapi/v1', apiKey: 'secret' });
  });
});

describe('startImageTo3d / getGenJob', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => vi.unstubAllGlobals());

  it('starts a job and returns the task id', async () => {
    fetchMock.mockResolvedValueOnce(res({ result: 'TASK-1' }));
    const id = await startImageTo3d(cfg, 'https://img/photo.jpg');
    expect(id).toBe('TASK-1');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.meshy.ai/openapi/v1/image-to-3d');
    expect(JSON.parse((opts as RequestInit).body as string)).toMatchObject({ image_url: 'https://img/photo.jpg' });
  });

  it('reads a succeeded job with its glb url', async () => {
    fetchMock.mockResolvedValueOnce(res({ status: 'SUCCEEDED', progress: 100, model_urls: { glb: 'https://cdn/model.glb' } }));
    const r = await getGenJob(cfg, 'TASK-1');
    expect(r).toEqual({ status: 'succeeded', glbUrl: 'https://cdn/model.glb', progress: 100 });
  });

  it('throws when the gateway errors', async () => {
    fetchMock.mockResolvedValueOnce(res({}, { ok: false, status: 500 }));
    await expect(getGenJob(cfg, 'x')).rejects.toThrow();
  });
});
