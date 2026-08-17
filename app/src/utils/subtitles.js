/**
 * Converts SRT content to WebVTT format.
 * @param {string} srt
 * @returns {string}
 */
export function srtToVtt(srt) {
  const blocks = srt.trim().replace(/\r\n/g, '\n').split(/\n\n+/);
  let vtt = 'WEBVTT\n\n';

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 2) continue;
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const textLines = lines.slice(lines.indexOf(timeLine) + 1);
    const convertedTime = timeLine.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    vtt += `${convertedTime}\n${textLines.join('\n')}\n\n`;
  }

  return vtt;
}

/**
 * @param {File} file
 * @returns {Promise<string>} object URL for VTT
 */
export async function loadSubtitleFile(file) {
  const text = await file.text();
  const ext = file.name.split('.').pop()?.toLowerCase();
  const vttContent = ext === 'srt' ? srtToVtt(text) : text;
  const blob = new Blob([vttContent], { type: 'text/vtt' });
  return URL.createObjectURL(blob);
}
