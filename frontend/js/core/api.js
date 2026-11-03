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

// XMLHttpRequest because fetch cannot report upload progress, and a class of
// phones on mobile data needs to see that something is happening.
export function uploadForm(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${path}`);
    xhr.setRequestHeader('x-requested-with', 'paperpeer');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    xhr.onload = () => {
      try { resolve(parseResponse(xhr.status, xhr.responseText)); } catch (err) { reject(err); }
    };
    xhr.send(form);
  });
}
