export const SIGNATURE_MARKER = 'data-sitebolt-signature="true"';

export const SIGNATURE_DIVIDER_HTML =
  '<br><hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;" /><br>';

export const SIGNATURE_DIVIDER_TEXT = "\n-- \n";

export function hasEmbeddedSignature(html: string): boolean {
  return html.includes(SIGNATURE_MARKER);
}

export function wrapSignatureHtml(signatureHtml: string): string {
  return `<div ${SIGNATURE_MARKER}>${signatureHtml}</div>`;
}

export function appendSignatureHtml(bodyHtml: string, signatureHtml: string): string {
  const trimmed = signatureHtml.trim();
  if (!trimmed || hasEmbeddedSignature(bodyHtml)) return bodyHtml;
  return `${bodyHtml}${SIGNATURE_DIVIDER_HTML}${wrapSignatureHtml(trimmed)}`;
}

export function appendSignatureText(bodyText: string, signatureText: string): string {
  const trimmed = signatureText.trim();
  if (!trimmed) return bodyText;
  if (bodyText.includes("--")) {
    const markerIndex = bodyText.lastIndexOf(SIGNATURE_DIVIDER_TEXT.trim());
    if (markerIndex >= 0) return bodyText;
  }
  const base = bodyText.trimEnd();
  return base ? `${base}${SIGNATURE_DIVIDER_TEXT}${trimmed}` : trimmed;
}

export function splitBodyAndSignature(html: string): {
  messageHtml: string;
  signatureHtml: string;
} {
  if (!hasEmbeddedSignature(html)) {
    return { messageHtml: html, signatureHtml: "" };
  }

  const markerIndex = html.indexOf(`<div ${SIGNATURE_MARKER}>`);
  if (markerIndex < 0) {
    return { messageHtml: html, signatureHtml: "" };
  }

  const messageHtml = html.slice(0, markerIndex).replace(/<br><hr[^>]*\/?><br>$/i, "").trimEnd();
  const signatureBlock = html.slice(markerIndex);
  const innerMatch = signatureBlock.match(
    new RegExp(`<div ${SIGNATURE_MARKER.replace(/"/g, '\\"')}>([\\s\\S]*?)</div>`)
  );

  return {
    messageHtml,
    signatureHtml: innerMatch?.[1]?.trim() ?? "",
  };
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
