/**
 * Formats bytes into a human-readable file size string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size < 10 && unitIndex > 0 ? size.toFixed(1) : Math.round(size)} ${units[unitIndex]}`;
}
