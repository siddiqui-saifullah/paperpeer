import { useState, type DragEvent } from 'react';
import { useConfirm } from '../context/confirm';
import { useToast } from '../context/toast';
import { api } from '../lib/api';
import { ACCEPT, fileUrl, preparePhotos } from '../lib/photos';
import type { FileInfo } from '../lib/types';
import { Icon } from './Icon';

/** Asks, deletes a file, then calls done (usually a reload). */
export function useFileDelete(done: () => Promise<unknown> | void) {
  const confirm = useConfirm();
  const toast = useToast();
  return async (file: FileInfo) => {
    if (!(await confirm({ message: 'Remove this file?', confirmLabel: 'Remove', danger: true }))) return;
    try {
      await api(`/files/${encodeURIComponent(file.id)}`, { method: 'DELETE' });
      toast('File removed.');
    } catch (err) {
      toast((err as Error).message, true);
    }
    await done();
  };
}

export function FileList({ files, onRemove }: { files: FileInfo[]; onRemove?: (f: FileInfo) => void }) {
  if (!files.length) return <p className="muted small">Nothing uploaded yet.</p>;
  return (
    <ul className="file-list">
      {files.map((f) => (
        <li key={f.id}>
          <a href={fileUrl(f)} target="_blank" rel="noopener">
            {f.mime.startsWith('image/') ? <img className="thumb" src={fileUrl(f)} alt="" loading="lazy" /> : <span className="file-icon">PDF</span>}
            <span>{f.name}</span>
          </a>
          {onRemove && (
            <button className="btn sm ghost danger" type="button" aria-label={`Remove ${f.name}`} onClick={() => onRemove(f)}>
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

// Most phone browsers cannot draw a PDF inside an iframe, so phones get a link.
const inlinePdf = () => !matchMedia('(pointer: coarse)').matches;

export function Viewer({ files }: { files: FileInfo[] }) {
  return (
    <div className="viewer">
      {files.map((f) =>
        f.mime === 'application/pdf' ? (
          inlinePdf() ? (
            <div key={f.id}>
              <iframe src={fileUrl(f)} title={f.name} loading="lazy" />
              <a className="small" href={fileUrl(f)} target="_blank" rel="noopener">
                Open PDF in a new tab
              </a>
            </div>
          ) : (
            <a key={f.id} className="btn" href={fileUrl(f)} target="_blank" rel="noopener">
              <Icon name="file" />
              Open {f.name}
            </a>
          )
        ) : (
          <a key={f.id} href={fileUrl(f)} target="_blank" rel="noopener">
            <img src={fileUrl(f)} alt={f.name} loading="lazy" />
          </a>
        ),
      )}
    </div>
  );
}

interface DropProps {
  label: string;
  /** Sends the prepared files; onProgress gets 0 to 1. */
  upload(files: File[], onProgress: (share: number) => void): Promise<unknown>;
  /** After a successful upload, usually a reload. */
  done(): Promise<unknown> | void;
}

/** A drop zone plus a "Take a photo" button for phones. */
export function Dropzone({ label, upload, done }: DropProps) {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [over, setOver] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  async function send(list: FileList | null) {
    if (!list?.length) return;
    setStatus('Preparing…');
    try {
      const files = await preparePhotos(list);
      await upload(files, (share) => setStatus(`Uploading ${Math.round(share * 100)}%`));
      toast('Uploaded.');
      await done();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setStatus('');
      setInputKey((k) => k + 1); // clears the file inputs
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void send(e.dataTransfer.files);
  };

  return (
    <div
      className={`upload ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <label className="drop">
        <input key={`f${inputKey}`} type="file" multiple accept={ACCEPT} onChange={(e) => void send(e.target.files)} />
        <Icon name="upload" />
        <b>{status || label}</b>
        <span>Drag files here or click to browse · PDF, JPG or PNG · photos are shrunk automatically</span>
      </label>
      <label className="btn camera">
        <Icon name="camera" />
        Take a photo
        <input key={`c${inputKey}`} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(e) => void send(e.target.files)} />
      </label>
    </div>
  );
}
