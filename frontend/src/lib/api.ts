// The only place that talks to the backend.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

interface Options {
  method?: string;
  body?: unknown;
}

function parseResponse<T>(status: number, text: string): T {
  let data: { error?: string } = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* handled by the status check */
  }
  if (status >= 200 && status < 300) return data as T;
  throw new ApiError(data.error || 'Something went wrong.', status);
}

export async function api<T = unknown>(path: string, { method = 'GET', body }: Options = {}): Promise<T> {
  const headers: Record<string, string> = { 'x-requested-with': 'paperpeer' };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError('Could not reach the server. Check your connection.', 0);
  }
  return parseResponse<T>(res.status, await res.text());
}

// The host refuses request bodies over 4.5 MB, so files go in batches under 4 MB.
// Photos are already shrunk on the phone, so this mostly affects large PDFs.
export const MAX_UPLOAD_MB = 4;
const BATCH_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

function batches(files: File[]): File[][] {
  const out: File[][] = [];
  let current: File[] = [];
  let size = 0;
  for (const file of files) {
    if (current.length && size + file.size > BATCH_BYTES) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(file);
    size += file.size;
  }
  if (current.length) out.push(current);
  return out;
}

// XMLHttpRequest because fetch cannot report upload progress, and a class of
// phones on mobile data needs to see that something is happening.
function send(path: string, form: FormData, onProgress?: (loaded: number) => void): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${path}`);
    xhr.setRequestHeader('x-requested-with', 'paperpeer');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded);
    };
    xhr.onerror = () => reject(new ApiError('Upload failed. Check your connection and try again.', 0));
    xhr.onload = () => {
      if (xhr.status === 413) return reject(new ApiError(`Each file must be under ${MAX_UPLOAD_MB} MB.`, 413));
      try {
        resolve(parseResponse(xhr.status, xhr.responseText));
      } catch (err) {
        reject(err);
      }
    };
    xhr.send(form);
  });
}

/**
 * Sends files in as many requests as needed. The server adds files to what is
 * already there, so the batches add up to one upload. onProgress gets 0 to 1.
 */
export async function uploadFiles(path: string, files: File[], onProgress?: (share: number) => void): Promise<void> {
  const tooBig = files.find((f) => f.size > BATCH_BYTES);
  if (tooBig) throw new ApiError(`"${tooBig.name}" is over ${MAX_UPLOAD_MB} MB. Upload photos of the pages, or a smaller PDF.`, 413);
  const total = files.reduce((n, f) => n + f.size, 0) || 1;
  let sent = 0;
  let done = 0;
  for (const group of batches(files)) {
    const part = new FormData();
    group.forEach((f) => part.append('files', f));
    try {
      await send(path, part, (loaded) => onProgress?.(Math.min(1, (sent + loaded) / total)));
    } catch (err) {
      if (done && err instanceof Error) err.message = `Uploaded ${done} of ${files.length} files. ${err.message}`;
      throw err;
    }
    sent += group.reduce((n, f) => n + f.size, 0);
    done += group.length;
  }
}
