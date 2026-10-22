/**
 * W5-J «Desde un archivo»: which kind of file the person picked (by its first bytes, then its name and type) and the
 * intake request it becomes. Everything is read in the browser; only the resulting text (or an HTML page's capture)
 * is sent, and only to cv's own same-origin API, to build the preview.
 */
import type { IntakeInput } from '../../../lib/client/types.ts';
import { captureFromDocument, fitCapture } from './capture.ts';

export type FileKind = 'pdf' | 'docx' | 'text' | 'html' | 'image' | 'unsupported';

export const FILE_MAX_BYTES = 20 * 1024 * 1024;
export const FILE_ACCEPT = '.pdf,.docx,.txt,.md,.html,.htm,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/html,image/*';

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0) => sig.every((x, i) => b[at + i] === x);

export function fileKind(name: string, type: string, head: Uint8Array): FileKind {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46])) return 'pdf';
  if (
    startsWith(head, [0x89, 0x50, 0x4e, 0x47]) ||
    startsWith(head, [0xff, 0xd8, 0xff]) ||
    startsWith(head, [0x47, 0x49, 0x46, 0x38]) ||
    (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) ||
    startsWith(head, [0x66, 0x74, 0x79, 0x70], 4) ||
    type.startsWith('image/')
  ) {
    return 'image';
  }
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return ext === 'docx' ? 'docx' : 'unsupported';
  if (ext === 'html' || ext === 'htm' || type === 'text/html') return 'html';
  if (ext === 'txt' || ext === 'md' || type === 'text/plain') return 'text';
  return 'unsupported';
}

/** Text of a .txt: UTF-8, or Windows-1252 when it is not valid UTF-8 (files saved by older Spanish Windows set-ups). */
export function decodeTextFile(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** A saved job page (.html) → the same capture the bookmarklet makes (DOMParser: inert, no script runs). */
export function htmlFileToInput(html: string): IntakeInput {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? doc.querySelector('meta[property="og:url"]')?.getAttribute('content') ?? null;
  let url: string | null = null;
  try {
    url = base && /^https?:/i.test(base) ? new URL(base).toString() : null;
  } catch {
    url = null;
  }
  return { source: 'capture', kind: 'file', capture: fitCapture(captureFromDocument(doc, url)) };
}
