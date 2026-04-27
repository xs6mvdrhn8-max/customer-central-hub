export const BACKUP_SIZE_LIMIT_BYTES = 100 * 1024 * 1024;
export const BACKUP_EXTENSION = 'phb';
export const BACKUP_MIME = 'application/vnd.photayote.backup';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function createBackupBlob(json: string): Promise<{ blob: Blob; extension: string; compressed: boolean }> {
  if ('CompressionStream' in globalThis) {
    const stream = new Blob([encoder.encode(json)]).stream().pipeThrough(new CompressionStream('gzip'));
    return {
      blob: await new Response(stream).blob(),
      extension: BACKUP_EXTENSION,
      compressed: true,
    };
  }

  return {
    blob: new Blob([json], { type: 'application/json' }),
    extension: 'json',
    compressed: false,
  };
}

export async function readBackupFile(file: File): Promise<string> {
  if (file.size > BACKUP_SIZE_LIMIT_BYTES) {
    throw new Error('Backup file is too large (max 100 MB).');
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;

  if (!isGzip) return decoder.decode(bytes);

  if (!('DecompressionStream' in globalThis)) {
    throw new Error('This browser cannot open compressed backups. Try importing a .json backup instead.');
  }

  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
