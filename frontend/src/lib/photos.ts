// Redrawing a phone photo shrinks the upload and drops its metadata, including
// GPS location, before a classmate could ever download it. Large PNG or WEBP
// images (screenshots, scans) are turned into JPEGs too.
async function preparePhoto(file: File): Promise<File> {
  const bigImage = /^image\/(png|webp)$/.test(file.type) && file.size > 1.5 * 1024 * 1024;
  if (file.type !== 'image/jpeg' && !bigImage) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    const name = file.type === 'image/jpeg' ? file.name : `${file.name.replace(/\.\w+$/, '')}.jpg`;
    return blob ? new File([blob], name, { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

export const preparePhotos = (files: Iterable<File>) => Promise.all([...files].map(preparePhoto));

export const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

export const fileUrl = (file: { id: string }, download = false) =>
  `/api/files/${encodeURIComponent(file.id)}${download ? '?download=1' : ''}`;
