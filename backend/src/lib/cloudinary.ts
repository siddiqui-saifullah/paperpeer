import crypto from 'node:crypto';

// A minimal Cloudinary client for private raw files: upload, download, delete.
// Files are stored as type "private", so they cannot be fetched by URL alone;
// the backend downloads them with a signed, short-lived request after its own
// permission check. "raw" keeps PDFs deliverable on free accounts.

// CLOUDINARY_URL looks like cloudinary://<api_key>:<api_secret>@<cloud_name>
export interface CloudinaryCredentials {
  apiKey: string;
  apiSecret: string;
  cloudName: string;
}

export function parseCloudinaryUrl(value: string): CloudinaryCredentials {
  const url = new URL(value);
  if (url.protocol !== 'cloudinary:' || !url.username || !url.password || !url.hostname) {
    throw new Error('CLOUDINARY_URL must look like cloudinary://<api_key>:<api_secret>@<cloud_name>');
  }
  return { apiKey: decodeURIComponent(url.username), apiSecret: decodeURIComponent(url.password), cloudName: url.hostname };
}

// Cloudinary's signature: parameters sorted by name, joined as a=1&b=2, then the
// secret appended, SHA-1 in hex. Empty values are left out.
type Params = Record<string, string | number | undefined>;

export function sign(params: Params, apiSecret: string): string {
  const text = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(text + apiSecret).digest('hex');
}

export function cloudinaryClient({ apiKey, apiSecret, cloudName, apiBase = 'https://api.cloudinary.com' }: CloudinaryCredentials & { apiBase?: string }) {
  const endpoint = (action: string) => `${apiBase}/v1_1/${encodeURIComponent(cloudName)}/raw/${action}`;
  const now = () => Math.floor(Date.now() / 1000);
  const signed = (params: Params): Record<string, string> => {
    const out: Record<string, string> = { api_key: apiKey, signature: sign(params, apiSecret) };
    for (const [k, v] of Object.entries(params)) if (v !== undefined) out[k] = String(v);
    return out;
  };

  const fail = async (res: Response, what: string) => {
    let detail = '';
    try {
      detail = ((await res.json()) as { error?: { message?: string } })?.error?.message || '';
    } catch {
      /* not JSON */
    }
    return new Error(`Cloudinary ${what} failed (${res.status})${detail ? `: ${detail}` : ''}`);
  };

  return {
    async upload(publicId: string, buffer: Buffer): Promise<void> {
      const form = new FormData();
      for (const [k, v] of Object.entries(signed({ public_id: publicId, timestamp: now(), type: 'private' }))) form.append(k, v);
      form.append('file', new Blob([new Uint8Array(buffer)]));
      const res = await fetch(endpoint('upload'), { method: 'POST', body: form });
      if (!res.ok) throw await fail(res, 'upload');
    },

    // null when the file does not exist.
    async download(publicId: string): Promise<Buffer | null> {
      const params = signed({ public_id: publicId, type: 'private', expires_at: now() + 60, timestamp: now() });
      const res = await fetch(`${endpoint('download')}?${new URLSearchParams(params)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw await fail(res, 'download');
      return Buffer.from(await res.arrayBuffer());
    },

    async destroy(publicId: string): Promise<void> {
      const res = await fetch(endpoint('destroy'), {
        method: 'POST',
        body: new URLSearchParams(signed({ public_id: publicId, timestamp: now(), type: 'private', invalidate: 'true' })),
      });
      if (!res.ok) throw await fail(res, 'delete');
    },
  };
}
