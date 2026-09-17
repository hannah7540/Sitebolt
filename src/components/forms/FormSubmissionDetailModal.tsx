"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, Share2, X } from "lucide-react";
import ImageLightboxGallery from "@/components/ui/ImageLightboxGallery";
import {
  asNamedFileList,
  asSignatureAnswer,
  asStringList,
  formatAnswerForDisplay,
  formatFormDate,
  type CustomFormSubmission,
} from "@/lib/custom-forms";
import { cn } from "@/lib/utils";
import {
  modalBodyClass,
  modalOverlayClass,
  modalShellClass,
  modalStickyFooterClass,
} from "@/lib/ui-classes";

interface FormSubmissionDetailModalProps {
  open: boolean;
  submission: CustomFormSubmission | null;
  onClose: () => void;
}

export default function FormSubmissionDetailModal({
  open,
  submission,
  onClose,
}: FormSubmissionDetailModalProps) {
  const [mounted, setMounted] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const images = useMemo(() => {
    if (!submission) return [];
    const urls: Array<{ url: string; alt: string }> = [];
    for (const answer of Object.values(submission.answers)) {
      if (answer.type === "image" || answer.type === "upload") {
        for (const url of asStringList(answer.value)) {
          urls.push({ url, alt: answer.label });
        }
        for (const file of asNamedFileList(answer.value)) {
          if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(file.url) || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name)) {
            urls.push({ url: file.url, alt: file.name || answer.label });
          }
        }
      }
      if (answer.type === "signature") {
        const signature = asSignatureAnswer(answer.value);
        if (signature.url) {
          urls.push({ url: signature.url, alt: `${answer.label} signature` });
        }
      }
    }
    if (submission.signature_url) {
      urls.push({ url: submission.signature_url, alt: "Submission signature" });
    }
    return urls.filter(
      (item, index, list) => list.findIndex((other) => other.url === item.url) === index
    );
  }, [submission]);

  if (!open || !mounted || !submission) return null;

  const summaryText = [
    submission.template_title,
    `Submitted ${formatFormDate(submission.submitted_at)}`,
    submission.submitted_by_name ? `By ${submission.submitted_by_name}` : "",
    ...Object.values(submission.answers).map(
      (answer) => `${answer.label}: ${formatAnswerForDisplay(answer.value, answer.type)}`
    ),
  ]
    .filter(Boolean)
    .join("\n");

  const handlePrint = () => {
    const popup = window.open("", "_blank", "noopener,noreferrer,width=800,height=900");
    if (!popup) return;
    const rows = Object.values(submission.answers)
      .map((answer) => {
        if (answer.type === "image" || answer.type === "upload") {
          const thumbs = [
            ...asStringList(answer.value),
            ...asNamedFileList(answer.value).map((file) => file.url),
          ]
            .filter((url, index, list) => list.indexOf(url) === index)
            .map((url) => `<img src="${url}" alt="" style="height:80px;margin-right:8px;border-radius:6px" />`)
            .join("");
          const docs = asNamedFileList(answer.value)
            .filter((file) => !/\.(png|jpe?g|gif|webp|svg)$/i.test(file.name))
            .map((file) => `<a href="${file.url}">${file.name}</a>`)
            .join(", ");
          return `<p><strong>${answer.label}</strong><br/>${thumbs || docs || "—"}</p>`;
        }
        if (answer.type === "document") {
          const links = asNamedFileList(answer.value)
            .map((file) => `<a href="${file.url}">${file.name}</a>`)
            .join(", ");
          return `<p><strong>${answer.label}</strong><br/>${links || "—"}</p>`;
        }
        if (answer.type === "signature") {
          const signature = asSignatureAnswer(answer.value);
          if (signature.url) {
            const signedAt = formatFormDate(signature.signed_at || submission.submitted_at);
            return `<p><strong>${answer.label}</strong><br/><img src="${signature.url}" alt="Signature" style="height:96px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px" /><br/><span style="color:#64748b;font-size:12px">${signedAt}</span></p>`;
          }
        }
        return `<p><strong>${answer.label}</strong><br/>${formatAnswerForDisplay(answer.value, answer.type)}</p>`;
      })
      .join("");
    popup.document.write(`<!doctype html><html><head><title>${submission.template_title}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#0f172a} h1{font-size:20px}</style>
      </head><body>
      <h1>${submission.template_title}</h1>
      <p>Submitted ${formatFormDate(submission.submitted_at)}${submission.submitted_by_name ? ` by ${submission.submitted_by_name}` : ""}</p>
      ${rows}
      </body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: submission.template_title, text: summaryText });
      return;
    }
    await navigator.clipboard.writeText(summaryText);
  };

  return createPortal(
    <div className={modalOverlayClass} role="dialog" aria-modal="true" aria-labelledby="submission-detail-title">
      <div className={cn(modalShellClass, "max-w-2xl")}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="submission-detail-title" className="text-lg font-bold text-slate-900">
              {submission.template_title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Submitted {formatFormDate(submission.submitted_at)}
              {submission.submitted_by_name ? ` · ${submission.submitted_by_name}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={modalBodyClass}>
          <div className="space-y-5">
            {Object.entries(submission.answers).map(([fieldId, answer]) => {
              const signature =
                answer.type === "signature" ? asSignatureAnswer(answer.value) : null;
              return (
              <div key={fieldId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {answer.label}
                </p>
                {answer.type === "image" || answer.type === "upload" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {asNamedFileList(answer.value).length
                      ? asNamedFileList(answer.value).map((file) =>
                          /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name) ||
                          file.url.match(/\.(png|jpe?g|gif|webp|svg)(\?|$)/i) ? (
                            <button
                              key={file.url}
                              type="button"
                              onClick={() =>
                                setLightboxIndex(images.findIndex((item) => item.url === file.url))
                              }
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={file.url}
                                alt={file.name}
                                className="h-20 w-20 rounded-md object-cover ring-1 ring-slate-200"
                              />
                            </button>
                          ) : (
                            <a
                              key={file.url}
                              href={file.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-orange-600 hover:underline"
                            >
                              {file.name}
                            </a>
                          )
                        )
                      : asStringList(answer.value).map((url) => (
                          <button
                            key={url}
                            type="button"
                            onClick={() =>
                              setLightboxIndex(images.findIndex((item) => item.url === url))
                            }
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={answer.label}
                              className="h-20 w-20 rounded-md object-cover ring-1 ring-slate-200"
                            />
                          </button>
                        ))}
                    {!asNamedFileList(answer.value).length && !asStringList(answer.value).length ? (
                      <p className="text-sm text-slate-600">—</p>
                    ) : null}
                  </div>
                ) : answer.type === "document" ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {asNamedFileList(answer.value).map((file) => (
                      <li key={file.url}>
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-orange-600 hover:underline"
                        >
                          {file.name}
                        </a>
                      </li>
                    ))}
                    {!asNamedFileList(answer.value).length ? (
                      <li className="text-slate-600">—</li>
                    ) : null}
                  </ul>
                ) : signature ? (
                  signature.url ? (
                    <button
                      type="button"
                      className="mt-3 w-full max-w-md text-left"
                      onClick={() =>
                        setLightboxIndex(images.findIndex((item) => item.url === signature.url))
                      }
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={signature.url}
                        alt={`${answer.label} signature`}
                        className="h-28 w-full rounded-lg bg-white object-contain p-3 ring-1 ring-slate-200"
                      />
                      <p className="mt-2 text-xs font-medium text-slate-500">
                        Signed {formatFormDate(signature.signed_at || submission.submitted_at)}
                      </p>
                    </button>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600">—</p>
                  )
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
                    {formatAnswerForDisplay(answer.value, answer.type)}
                  </p>
                )}
              </div>
              );
            })}

            {submission.signature_url ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Signature
                </p>
                <button
                  type="button"
                  className="mt-2"
                  onClick={() =>
                    setLightboxIndex(
                      images.findIndex((item) => item.url === submission.signature_url)
                    )
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={submission.signature_url}
                    alt="Signature"
                    className="h-20 rounded-md bg-white object-contain ring-1 ring-slate-200"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    {formatFormDate(submission.submitted_at)}
                  </p>
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className={cn(modalStickyFooterClass, "flex justify-end gap-2 py-3")}>
          <button
            type="button"
            onClick={() => void handleShare()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Close
          </button>
        </div>
      </div>
      {lightboxIndex != null && images[lightboxIndex] ? (
        <ImageLightboxGallery
          images={images}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </div>,
    document.body
  );
}
