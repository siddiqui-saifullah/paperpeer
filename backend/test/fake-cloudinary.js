// A stand-in for Cloudinary's upload, download and destroy endpoints, so the
// suite can run with TEST_STORAGE=cloudinary offline. Signatures are checked
// here independently of src/lib/cloudinary.js, the way Cloudinary checks them.
import crypto from 'node:crypto';
import http from 'node:http';

export const FAKE = { apiKey: 'test-key', apiSecret: 'test-secret', cloudName: 'test-cloud' };

function validSignature(params) {
  const { signature, api_key: key, file, resource_type: _rt, ...rest } = params;
  if (key !== FAKE.apiKey) return false;
  const text = Object.keys(rest).sort().map((k) => `${k}=${rest[k]}`).join('&');
  return signature === crypto.createHash('sha1').update(text + FAKE.apiSecret).digest('hex');
}

export async function startFakeCloudinary() {
  const files = new Map(); // public_id -> Buffer
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const reply = (status, body) => {
      res.writeHead(status, { 'content-type': typeof body === 'string' ? 'application/json' : 'application/octet-stream' });
      res.end(body);
    };
    const prefix = `/v1_1/${FAKE.cloudName}/raw/`;
    if (!url.pathname.startsWith(prefix)) return reply(404, '{"error":{"message":"unknown route"}}');
    const action = url.pathname.slice(prefix.length);
    const request = new Request(url, { method: req.method, headers: req.headers, body: req.method === 'GET' ? undefined : req, duplex: 'half' });
    const params = {};
    let upload;
    if (req.method === 'GET') url.searchParams.forEach((v, k) => { params[k] = v; });
    else for (const [k, v] of await request.formData()) { if (k === 'file') upload = v; else params[k] = v; }
    if (!validSignature(params)) return reply(401, '{"error":{"message":"Invalid Signature"}}');
    if (params.type !== 'private') return reply(400, '{"error":{"message":"expected private"}}');

    if (action === 'upload' && req.method === 'POST') {
      files.set(params.public_id, Buffer.from(await upload.arrayBuffer()));
      return reply(200, JSON.stringify({ public_id: params.public_id }));
    }
    if (action === 'download' && req.method === 'GET') {
      if (Number(params.expires_at) < Date.now() / 1000) return reply(401, '{"error":{"message":"expired"}}');
      const data = files.get(params.public_id);
      return data ? reply(200, data) : reply(404, '{"error":{"message":"not found"}}');
    }
    if (action === 'destroy' && req.method === 'POST') {
      files.delete(params.public_id);
      return reply(200, '{"result":"ok"}');
    }
    return reply(404, '{"error":{"message":"unknown action"}}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    files,
    config: {
      url: `cloudinary://${FAKE.apiKey}:${FAKE.apiSecret}@${FAKE.cloudName}`,
      apiBase: `http://127.0.0.1:${server.address().port}`,
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
