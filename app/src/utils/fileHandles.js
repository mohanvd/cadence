import { saveRecentFileHandle, getRecentFileHandle, getAllRecentFileHandles } from './db';
import { cacheRecentHandle } from './handleCache';

/**
 * @returns {boolean}
 */
export function supportsFileSystemAccess() {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

export const VIDEO_PICKER_OPTIONS = {
  multiple: false,
  types: [
    {
      description: 'Video',
      accept: {
        'video/mp4': ['.mp4'],
        'video/webm': ['.webm'],
        'video/x-matroska': ['.mkv'],
        'video/quicktime': ['.mov'],
      },
    },
  ],
};

export const VIDEO_PICKER_OPTIONS_MULTIPLE = {
  ...VIDEO_PICKER_OPTIONS,
  multiple: true,
};

/**
 * @typedef {{ handle: FileSystemFileHandle, name: string, size: number, lastOpened: number }} FileHandleRecord
 */

/** @param {FileHandleRecord} record */
export async function saveFileHandle(record) {
  cacheRecentHandle(record.name, record.handle);
  return saveRecentFileHandle(record);
}

/** Pre-load recent handles into memory for instant open on click. */
export async function warmRecentHandleCache() {
  try {
    const records = await getAllRecentFileHandles();
    for (const record of records) {
      if (record.handle) cacheRecentHandle(record.name, record.handle);
    }
  } catch {
    /* ignore */
  }
}

/** @param {string} name */
export async function getFileHandle(name) {
  return getRecentFileHandle(name);
}
