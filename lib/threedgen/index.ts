// AI photo→3D provider. Reference implementation targets the Meshy image-to-3D
// API shape (https://docs.meshy.ai): POST /image-to-3d -> { result: taskId },
// GET /image-to-3d/:id -> { status, progress, model_urls: { glb } }.
// Base URL is configurable so a compatible provider can be pointed at it.
// Pure fetch (no server-only import) so the mapping stays unit-testable.

export type ThreeDGenConfig = { provider: string; base: string; apiKey: string };

export function threedgenConfigFrom(get: (key: string, fallback?: string) => string): ThreeDGenConfig {
  return {
    provider: get('THREEDGEN_PROVIDER', 'meshy'),
    base: get('THREEDGEN_BASE_URL', 'https://api.meshy.ai/openapi/v1'),
    apiKey: get('THREEDGEN_API_KEY'),
  };
}

export function threedgenConfigured(c: ThreeDGenConfig): boolean {
  return Boolean(c.apiKey);
}

export type GenStatus = 'processing' | 'succeeded' | 'failed';

export function mapGenStatus(s: string | undefined): GenStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'SUCCEEDED':
      return 'succeeded';
    case 'FAILED':
    case 'EXPIRED':
    case 'CANCELED':
    case 'CANCELLED':
      return 'failed';
    default:
      return 'processing'; // PENDING, IN_PROGRESS
  }
}

export async function startImageTo3d(c: ThreeDGenConfig, imageUrl: string): Promise<string> {
  const res = await fetch(`${c.base}/image-to-3d`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, enable_pbr: true, should_texture: true }),
  });
  if (!res.ok) throw new Error(`3D-gen start failed: ${res.status}`);
  const body = (await res.json()) as { result?: string; id?: string };
  const id = body.result ?? body.id;
  if (!id) throw new Error('3D-gen: no task id returned');
  return id;
}

export async function getGenJob(
  c: ThreeDGenConfig,
  taskId: string,
): Promise<{ status: GenStatus; glbUrl?: string; progress?: number }> {
  const res = await fetch(`${c.base}/image-to-3d/${taskId}`, {
    headers: { Authorization: `Bearer ${c.apiKey}` },
  });
  if (!res.ok) throw new Error(`3D-gen status failed: ${res.status}`);
  const body = (await res.json()) as { status?: string; progress?: number; model_urls?: { glb?: string } };
  return { status: mapGenStatus(body.status), glbUrl: body.model_urls?.glb, progress: body.progress };
}
