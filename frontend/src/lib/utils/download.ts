import { apiClient } from '@/lib/api/client';

// Shared helpers for anything that should end up as a real file on the
// user's device -- receipts, CSV exports, etc. -- instead of just being
// displayed in the browser.

/**
 * Triggers a real "Save As" browser download for an in-memory Blob by
 * momentarily attaching an <a download> to the DOM and clicking it.
 */
export function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Give the browser a moment to pick up the blob URL before revoking it.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

/**
 * Downloads a receipt (or any other API-served file) straight to disk,
 * in addition to opening `viewUrl` in a new tab the way this app already
 * does.
 *
 * `viewUrl` is typically a storage-hosted link (e.g. `receiptUrl` from a
 * booking) -- fine for a plain browser navigation to *view* the PDF, but
 * not a safe target for a scripted `fetch()`: that host is served by the
 * reverse proxy/object storage in staging and production (not this
 * Django app), so it may not carry this app's CORS configuration or may
 * still be on plain HTTP, either of which silently breaks a `fetch()`
 * from an HTTPS page even though opening the same link in a tab works
 * fine. `apiPath` instead points at this app's own API (see
 * `apiClient.downloadFile`), the same host every other successful
 * request already uses, so fetching its bytes for a forced download
 * actually works. If that download request fails for some other reason,
 * we still open `viewUrl` so the user isn't left with a dead button.
 */
export async function downloadReceipt(apiPath: string, viewUrl: string, filename: string) {
  try {
    const blob = await apiClient.downloadFile(apiPath);
    triggerBlobDownload(blob, filename);
  } catch (error) {
    console.error('Direct download failed, falling back to opening the file', error);
  } finally {
    window.open(viewUrl, '_blank');
  }
}

/**
 * Builds a CSV file (RFC 4180-style quoting) from headers + rows and
 * downloads it.
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
) {
  const escapeCell = (cell: string | number) => {
    const str = String(cell);
    return /["\n,]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','));
  // Prepend a UTF-8 BOM so Excel (still the #1 CSV consumer) renders the
  // Amharic labels correctly instead of mangling them.
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(blob, filename);
}
