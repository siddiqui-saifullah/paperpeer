export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = { 'x-requested-with': 'paperpeer' };
  const init = { method, headers };
  if (form) init.body = form;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new Error('Could not reach the server. Check your connection.');
  }
  return parseResponse(res.status, await res.text());
}

function parseResponse(status, text) {
  let data = {};
  try { data = JSON.parse(text); } catch { /* handled by the status check */ }
  if (status >= 200 && status < 300) return data;
  throw Object.assign(new Error(data.error || 'Something went wrong.'), { status });
}

// The host refuses request bodies over 4.5 MB, so files go in batches under 4 MB.
// Photos are already shrunk on the phone, so this mostly affects large PDFs.
export const MAX_UPLOAD_MB = 4;
const BATCH_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

function batches(files) {
  const out = [];
  let current = [];
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
function send(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${path}`);
    xhr.setRequestHeader('x-requested-with', 'paperpeer');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded);
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    xhr.onload = () => {
      if (xhr.status === 413) return reject(new Error(`Each file must be under ${MAX_UPLOAD_MB} MB.`));
      try { resolve(parseResponse(xhr.status, xhr.responseText)); } catch (err) { reject(err); }
    };
    xhr.send(form);
  });
}

// Sends the form's files in as many requests as needed. The server adds files
// to what is already there, so batches add up to one upload.
export async function uploadForm(path, form, onProgress) {
  const files = form.getAll('files');
  const tooBig = files.find((f) => f.size > BATCH_BYTES);
  if (tooBig) throw new Error(`"${tooBig.name}" is over ${MAX_UPLOAD_MB} MB. Upload photos of the pages, or a smaller PDF.`);
  const total = files.reduce((n, f) => n + f.size, 0) || 1;
  let sent = 0;
  let done = 0;
  let result;
  for (const group of batches(files)) {
    const part = new FormData();
    group.forEach((f) => part.append('files', f));
    try {
      result = await send(path, part, (loaded) => onProgress?.(Math.min(1, (sent + loaded) / total)));
    } catch (err) {
      if (done) err.message = `Uploaded ${done} of ${files.length} files. ${err.message}`;
      throw err;
    }
    sent += group.reduce((n, f) => n + f.size, 0);
    done += group.length;
  }
  return result;
}
