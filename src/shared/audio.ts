export function audioBlob(bytes: Uint8Array, mimeType = 'audio/mp3'): Blob {
  if (!/audio\/(L16|pcm)/i.test(mimeType)) return new Blob([Uint8Array.from(bytes).buffer], { type: mimeType });
  const sampleRate = Number(mimeType.match(/rate=(\d+)/)?.[1] || 24000);
  const wav = new ArrayBuffer(44 + bytes.length);
  const view = new DataView(wav);
  const label = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  label(0, 'RIFF'); view.setUint32(4, 36 + bytes.length, true); label(8, 'WAVE'); label(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); label(36, 'data'); view.setUint32(40, bytes.length, true);
  new Uint8Array(wav, 44).set(bytes);
  return new Blob([wav], { type: 'audio/wav' });
}
