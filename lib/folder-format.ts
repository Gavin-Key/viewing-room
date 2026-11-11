export type FolderFormats = Record<string, string>;
export function folderFormat(folder: string | null, formats: FolderFormats) {
  const match = Object.keys(formats)
    .filter((path) => folder === path || folder?.startsWith(path + '/'))
    .sort((a, b) => b.length - a.length)[0];
  return match ? formats[match] : 'sbs-full';
}
export function imageSize(width: number, height: number, stereo: string) {
  const max = stereo.startsWith('sbs') ? 3072 : 2048;
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
