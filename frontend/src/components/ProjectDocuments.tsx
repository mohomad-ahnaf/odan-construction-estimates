import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiBlob } from "../lib/api";
import type {
  DocumentApproval,
  DocumentCategory,
  DocumentStatus,
  ProjectDocument,
} from "../types";

const categories: DocumentCategory[] = [
  "DRAWINGS",
  "IMAGES",
  "CONTRACTS",
  "BOQ",
  "REPORTS",
  "OTHER",
];
const maximumBytes = 25 * 1024 * 1024;
const allowedExtensions = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".png",
  ".jpg",
  ".jpeg",
];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function categoryLabel(category: DocumentCategory) {
  return category === "BOQ"
    ? "BOQ"
    : `${category.charAt(0)}${category.slice(1).toLowerCase()}`;
}

function statusLabel(status: DocumentStatus) {
  return status
    .split("_")
    .map((part) => `${part.charAt(0)}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function validateFile(file: File) {
  const name = file.name.toLowerCase();
  if (!allowedExtensions.some((extension) => name.endsWith(extension)))
    return "Choose a PDF, Word, Excel, PNG or JPEG file.";
  if (file.size > maximumBytes) return "The file must be 25 MB or smaller.";
  if (file.size === 0) return "The selected file is empty.";
  return "";
}

function useDocumentBlob(documentId: string | null, enabled = true) {
  const [state, setState] = useState<{
    url: string;
    loading: boolean;
    error: string;
  }>({ url: "", loading: false, error: "" });

  useEffect(() => {
    if (!documentId || !enabled) {
      setState({ url: "", loading: false, error: "" });
      return;
    }
    let disposed = false;
    let objectUrl = "";
    setState({ url: "", loading: true, error: "" });
    void apiBlob(`/documents/${documentId}/content`)
      .then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, loading: false, error: "" });
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setState({
          url: "",
          loading: false,
          error: error instanceof Error ? error.message : "Preview unavailable",
        });
      });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId, enabled]);

  return state;
}

function DocumentPreview({ document }: { document: ProjectDocument }) {
  const isImage = document.fileType.startsWith("image/");
  const content = useDocumentBlob(document.id, isImage);
  const extension = document.fileName.split(".").pop()?.toUpperCase() ?? "FILE";

  return (
    <div className="document-preview">
      {isImage && content.url ? (
        <img
          src={content.url}
          alt={`${document.fileName} thumbnail`}
          loading="lazy"
        />
      ) : (
        <div className="document-preview-placeholder" role="img" aria-label={`${document.fileName} preview unavailable`}>
          <span>{content.loading ? "…" : document.fileType === "application/pdf" ? "PDF" : extension}</span>
          <small>{content.loading ? "Loading preview" : isImage ? "Preview unavailable" : "Document file"}</small>
        </div>
      )}
    </div>
  );
}

function AuthenticatedDownloadButton({
  document,
  className = "button",
}: {
  document: ProjectDocument;
  className?: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    if (downloading) return;
    setDownloading(true);
    setError("");
    try {
      const blob = await apiBlob(`/documents/${document.id}/content`);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = document.fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button
      type="button"
      className={className}
      disabled={downloading}
      title={error || undefined}
      onClick={() => void download()}
    >
      {downloading ? "Downloading…" : error ? "Retry Download" : "Download"}
    </button>
  );
}

function DocumentPreviewModal({
  document,
  onClose,
}: {
  document: ProjectDocument;
  onClose: () => void;
}) {
  const isImage = document.fileType.startsWith("image/");
  const isPdf = document.fileType === "application/pdf";
  const content = useDocumentBlob(document.id, isImage || isPdf);

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal-card document-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-preview-title"
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">DOCUMENT PREVIEW</span>
            <h2 id="document-preview-title" title={document.fileName}>
              {document.fileName}
            </h2>
          </div>
          <button aria-label="Close document preview" onClick={onClose}>×</button>
        </div>
        <div className="document-full-preview">
          {content.loading ? (
            <p className="empty" role="status">Loading document preview…</p>
          ) : content.error ? (
            <p className="error" role="alert">{content.error}</p>
          ) : isImage && content.url ? (
            <img src={content.url} alt={document.fileName} />
          ) : isPdf && content.url ? (
            <iframe src={content.url} title={`${document.fileName} preview`} />
          ) : (
            <p className="empty">Preview is unavailable for this file type. Download the file to open it.</p>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Close</button>
          <AuthenticatedDownloadButton document={document} className="primary" />
        </div>
      </section>
    </div>
  );
}

type UploadState = "queued" | "uploading" | "uploaded" | "failed";
type UploadQueueItem = {
  id: string;
  file: File;
  status: UploadState;
  validationError: string;
  uploadError: string;
};

let queueSequence = 0;

function fileIdentity(file: File) {
  return `${file.name}\0${file.size}\0${file.lastModified}`;
}

function DropZone({
  multiple,
  disabled,
  onFiles,
}: {
  multiple: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div>
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        multiple={multiple}
        disabled={disabled}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
        aria-label={multiple ? "Choose document files" : "Choose revision file"}
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <button
        type="button"
        className={`document-drop-zone${dragging ? " is-dragging" : ""}`}
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragging(false);
          if (!disabled) onFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <strong>Drag and drop files here, or click to browse.</strong>
        <span>
          PDF, Word, Excel, PNG or JPEG · maximum 25 MB {multiple ? "per file" : ""}
        </span>
      </button>
    </div>
  );
}

export function ProjectDocuments({ projectId, initialCategory }: { projectId: string; initialCategory?: DocumentCategory }) {
  const cache = useQueryClient();
  const [filter, setFilter] = useState<"ALL" | DocumentCategory>(initialCategory ?? "ALL");
  useEffect(() => { if (initialCategory) setFilter(initialCategory); }, [initialCategory]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [category, setCategory] = useState<DocumentCategory>("DRAWINGS");
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [revisionNote, setRevisionNote] = useState("");
  const [previewTarget, setPreviewTarget] = useState<ProjectDocument | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectDocument | null>(null);
  const [historyTarget, setHistoryTarget] = useState<ProjectDocument | null>(null);
  const [revisionTarget, setRevisionTarget] = useState<ProjectDocument | null>(null);
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [newRevisionNote, setNewRevisionNote] = useState("");
  const [revisionError, setRevisionError] = useState("");
  const [approvalHistoryTarget, setApprovalHistoryTarget] =
    useState<ProjectDocument | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ProjectDocument | null>(null);
  const [rejectionComment, setRejectionComment] = useState("");
  const [approvalError, setApprovalError] = useState("");

  const documents = useQuery({
    queryKey: ["project-documents", projectId],
    queryFn: () => api<ProjectDocument[]>(`/projects/${projectId}/documents`),
  });
  const history = useQuery({
    queryKey: ["document-versions", historyTarget?.id],
    queryFn: () =>
      api<ProjectDocument[]>(`/documents/${historyTarget!.id}/versions`),
    enabled: !!historyTarget,
  });
  const revise = useMutation({
    mutationFn: async () => {
      if (!revisionTarget || !revisionFile)
        throw new Error("Choose a file to upload.");
      const validation = validateFile(revisionFile);
      if (validation) throw new Error(validation);
      const body = new FormData();
      body.append("file", revisionFile);
      if (newRevisionNote.trim())
        body.append("revisionNote", newRevisionNote.trim());
      return api<ProjectDocument>(
        `/documents/${revisionTarget.id}/revision`,
        { method: "POST", body },
      );
    },
    onSuccess: async (document) => {
      setRevisionTarget(null);
      setRevisionFile(null);
      setNewRevisionNote("");
      setRevisionError("");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["project-documents", projectId] }),
        cache.invalidateQueries({
          queryKey: ["document-versions", document.id],
        }),
      ]);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/documents/${id}`, { method: "DELETE" }),
    onSuccess: async (_, removedId) => {
      cache.setQueryData<ProjectDocument[]>(
        ["project-documents", projectId],
        (current) => current?.filter((document) => document.id !== removedId),
      );
      setDeleteTarget(null);
      await cache.invalidateQueries({
        queryKey: ["project-documents", projectId],
      });
    },
  });
  const approvalHistory = useQuery({
    queryKey: ["document-approval-history", approvalHistoryTarget?.id],
    queryFn: () =>
      api<DocumentApproval[]>(
        `/documents/${approvalHistoryTarget!.id}/approval-history`,
      ),
    enabled: !!approvalHistoryTarget,
  });
  const workflow = useMutation({
    mutationFn: ({
      document,
      action,
      comment,
    }: {
      document: ProjectDocument;
      action: "submit" | "approve" | "reject";
      comment?: string;
    }) =>
      api<ProjectDocument>(`/documents/${document.id}/${action}`, {
        method: "POST",
        body: JSON.stringify(comment ? { comment } : {}),
      }),
    onSuccess: async (updated) => {
      cache.setQueryData<ProjectDocument[]>(
        ["project-documents", projectId],
        (current) =>
          current?.map((document) =>
            document.id === updated.id ? updated : document,
          ),
      );
      setRejectTarget(null);
      setRejectionComment("");
      setApprovalError("");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["project-documents", projectId] }),
        cache.invalidateQueries({
          queryKey: ["document-approval-history", updated.id],
        }),
      ]);
    },
  });
  const visible = useMemo(
    () =>
      documents.data?.filter(
        (document) => filter === "ALL" || document.category === filter,
      ) ?? [],
    [documents.data, filter],
  );
  const uploadableCount = uploadQueue.filter(
    (item) =>
      (item.status === "queued" || item.status === "failed") &&
      !item.validationError,
  ).length;
  const hasCompletedUploads = uploadQueue.some(
    (item) => item.status === "uploaded",
  );

  useEffect(() => {
    if (!openActionsId) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".document-actions-menu")
      )
        return;
      setOpenActionsId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenActionsId(null);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openActionsId]);

  function addUploadFiles(files: File[]) {
    setUploadQueue((current) => {
      const identities = new Set(current.map((item) => fileIdentity(item.file)));
      const additions: UploadQueueItem[] = [];
      for (const selected of files) {
        const identity = fileIdentity(selected);
        if (identities.has(identity)) continue;
        identities.add(identity);
        const validationError = validateFile(selected);
        additions.push({
          id: `${identity}-${++queueSequence}`,
          file: selected,
          status: validationError ? "failed" : "queued",
          validationError,
          uploadError: "",
        });
      }
      return [...current, ...additions];
    });
  }

  function resetUploadModal() {
    setUploadOpen(false);
    setUploadQueue([]);
    setRevisionNote("");
    setUploadProgress({ current: 0, total: 0 });
  }

  async function submitUpload(event: FormEvent) {
    event.preventDefault();
    if (isUploading) return;
    const candidates = uploadQueue.filter(
      (item) =>
        (item.status === "queued" || item.status === "failed") &&
        !item.validationError,
    );
    if (!candidates.length) return;

    setIsUploading(true);
    setUploadProgress({ current: 0, total: candidates.length });
    let successful = 0;
    let failed = uploadQueue.some((item) => Boolean(item.validationError));

    for (const [index, item] of candidates.entries()) {
      setUploadProgress({ current: index + 1, total: candidates.length });
      setUploadQueue((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, status: "uploading", uploadError: "" }
            : entry,
        ),
      );
      const body = new FormData();
      body.append("file", item.file);
      body.append("category", category);
      if (revisionNote.trim()) body.append("revisionNote", revisionNote.trim());
      try {
        await api<ProjectDocument>(`/projects/${projectId}/documents`, {
          method: "POST",
          body,
        });
        successful += 1;
        setUploadQueue((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? { ...entry, status: "uploaded", uploadError: "" }
              : entry,
          ),
        );
      } catch (error) {
        failed = true;
        setUploadQueue((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: "failed",
                  uploadError: (error as Error).message || "Upload failed",
                }
              : entry,
          ),
        );
      }
    }

    if (successful)
      await cache.invalidateQueries({
        queryKey: ["project-documents", projectId],
      });
    setIsUploading(false);
    if (!failed) resetUploadModal();
  }

  function submitRevision(event: FormEvent) {
    event.preventDefault();
    const validation = revisionFile
      ? validateFile(revisionFile)
      : "Choose a file to upload.";
    setRevisionError(validation);
    if (!validation) revise.mutate();
  }

  return (
    <section className="panel documents-panel" aria-labelledby="documents-heading">
      <div className="panel-toolbar documents-toolbar">
        <div>
          <h2 id="documents-heading">Project Documents</h2>
          <p className="muted">Drawings, contracts, BOQs, reports and site files.</p>
        </div>
        <div className="documents-toolbar-actions">
          <label>
            <span className="visually-hidden">Filter document category</span>
            <select
              aria-label="Filter document category"
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value as "ALL" | DocumentCategory)
              }
            >
              <option value="ALL">All categories</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {categoryLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" onClick={() => setUploadOpen(true)}>
            Upload Document
          </button>
        </div>
      </div>

      {documents.isPending ? (
        <p className="empty">Loading documents…</p>
      ) : documents.isError ? (
        <p className="error" role="alert">
          {documents.error.message}{" "}
          <button onClick={() => void documents.refetch()}>Retry</button>
        </p>
      ) : visible.length === 0 ? (
        <div className="empty">
          <p>
            {documents.data.length
              ? "No documents match this category."
              : "No documents have been uploaded for this Project."}
          </p>
        </div>
      ) : (
        <div className="document-grid">
          {visible.map((document) => {
            const isImage = document.fileType.startsWith("image/");
            const isPdf = document.fileType === "application/pdf";
            return (
              <article className="document-card" key={document.id}>
                <DocumentPreview document={document} />
                <div className="document-card-body">
                  <div className="document-row-details">
                    <div className="document-card-heading">
                      <h3 title={document.fileName}>{document.fileName}</h3>
                    </div>
                    <div className="document-badges">
                      <span className="document-category">
                        {categoryLabel(document.category)}
                      </span>
                      <span className="document-version">V{document.version}</span>
                      {document.isLatest && (
                        <span className="latest-version-badge">Latest</span>
                      )}
                      <span
                        className={`document-status document-status-${document.status.toLowerCase()}`}
                      >
                        {statusLabel(document.status)}
                      </span>
                    </div>
                    <p className="document-meta">
                      <span title={document.fileType}>{document.fileType}</span>
                      <span>{formatSize(document.fileSize)}</span>
                      <span>Uploaded {new Date(document.createdAt).toLocaleDateString("en-GB")}</span>
                    </p>
                  </div>
                  <div className="document-actions">
                    <div className="document-primary-actions">
                      {(isPdf || isImage) && (
                        <button
                          type="button"
                          className="primary"
                          onClick={() => setPreviewTarget(document)}
                        >
                          Preview
                        </button>
                      )}
                      <AuthenticatedDownloadButton document={document} />
                    </div>
                    <div
                      className={`document-actions-menu${
                        openActionsId === document.id ? " is-open" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="document-actions-trigger"
                        aria-expanded={openActionsId === document.id}
                        onClick={() =>
                          setOpenActionsId((current) =>
                            current === document.id ? null : document.id,
                          )
                        }
                      >
                        Actions <span aria-hidden="true">▾</span>
                      </button>
                      {openActionsId === document.id && (
                        <div
                          className="document-actions-menu-panel"
                          onClick={() => setOpenActionsId(null)}
                        >
                        <button
                          type="button"
                          onClick={() => setHistoryTarget(document)}
                        >
                          Version History
                        </button>
                        <button
                          type="button"
                          aria-label="Upload New Revision"
                          onClick={() => {
                            setRevisionTarget(document);
                            setRevisionFile(null);
                            setNewRevisionNote("");
                            setRevisionError("");
                            revise.reset();
                          }}
                        >
                          Upload Revision
                        </button>
                        <button
                          type="button"
                          onClick={() => setApprovalHistoryTarget(document)}
                        >
                          Approval History
                        </button>
                        {document.status === "DRAFT" && (
                          <button
                            type="button"
                            disabled={workflow.isPending}
                            onClick={() =>
                              workflow.mutate({ document, action: "submit" })
                            }
                          >
                            Submit for Review
                          </button>
                        )}
                        {document.status === "PENDING_REVIEW" && (
                          <>
                            <button
                              type="button"
                              disabled={workflow.isPending}
                              onClick={() => workflow.mutate({ document, action: "approve" })}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="document-reject"
                              onClick={() => {
                                setRejectTarget(document);
                                setRejectionComment("");
                                setApprovalError("");
                                workflow.reset();
                              }}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {document.status !== "APPROVED" && (
                          <button
                            type="button"
                            className="danger document-delete"
                            onClick={() => setDeleteTarget(document)}
                          >
                          Delete
                          </button>
                        )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {previewTarget && (
        <DocumentPreviewModal
          document={previewTarget}
          onClose={() => setPreviewTarget(null)}
        />
      )}

      {uploadOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="upload-document-title">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">PROJECT DOCUMENT</span>
                <h2 id="upload-document-title">Upload Document</h2>
              </div>
              <button
                aria-label="Close upload dialog"
                disabled={isUploading}
                onClick={resetUploadModal}
              >
                ×
              </button>
            </div>
            <form onSubmit={submitUpload}>
              <DropZone multiple disabled={isUploading} onFiles={addUploadFiles} />
              {uploadQueue.length > 0 && (
                <div
                  className="document-upload-queue"
                  aria-label="Files selected for upload"
                >
                  {uploadQueue.map((item) => (
                    <div className="document-upload-item" key={item.id}>
                      <div>
                        <strong title={item.file.name}>{item.file.name}</strong>
                        <span>{formatSize(item.file.size)}</span>
                        {(item.validationError || item.uploadError) && (
                          <small role="alert">{item.validationError || item.uploadError}</small>
                        )}
                      </div>
                      <span className={`upload-state upload-state-${item.status}`}>
                        {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                      </span>
                      <button
                        type="button"
                        className="document-queue-remove"
                        disabled={
                          isUploading ||
                          item.status === "uploading" ||
                          item.status === "uploaded"
                        }
                        onClick={() =>
                          setUploadQueue((current) =>
                            current.filter((entry) => entry.id !== item.id),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {isUploading && (
                <p className="document-upload-progress" role="status">
                  Uploading {uploadProgress.current} of {uploadProgress.total}
                </p>
              )}
              <label>
                Category
                <select value={category} onChange={(event) => setCategory(event.target.value as DocumentCategory)}>
                  {categories.map((value) => <option key={value} value={value}>{categoryLabel(value)}</option>)}
                </select>
              </label>
              <p className="document-upload-note">
                The selected category and optional revision note apply to every queued file.
              </p>
              <label>
                Revision note (optional)
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={revisionNote}
                  onChange={(event) => setRevisionNote(event.target.value)}
                  placeholder="Purpose or summary of this document"
                />
              </label>
              <div className="modal-actions">
                <button type="button" disabled={isUploading} onClick={resetUploadModal}>Cancel</button>
                <button
                  className="primary"
                  disabled={isUploading || uploadableCount === 0}
                >
                  {isUploading
                    ? `Uploading ${uploadProgress.current} of ${uploadProgress.total}`
                    : hasCompletedUploads
                      ? `Retry ${uploadableCount} Failed ${uploadableCount === 1 ? "File" : "Files"}`
                      : `Upload ${uploadableCount} ${uploadableCount === 1 ? "File" : "Files"}`}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {revisionTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="revision-document-title">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">DOCUMENT REVISION</span>
                <h2 id="revision-document-title">Upload New Revision</h2>
                <p className="muted">Current: {revisionTarget.fileName} · V{revisionTarget.version}</p>
              </div>
              <button aria-label="Close revision dialog" onClick={() => setRevisionTarget(null)}>×</button>
            </div>
            <form onSubmit={submitRevision}>
              <DropZone
                multiple={false}
                disabled={revise.isPending}
                onFiles={(files) => {
                  if (files.length !== 1) {
                    setRevisionFile(null);
                    setRevisionError("Choose exactly one file for a revision.");
                    return;
                  }
                  setRevisionFile(files[0]);
                  setRevisionError(validateFile(files[0]));
                }}
              />
              {revisionFile && (
                <div className="revision-file-selection">
                  <strong title={revisionFile.name}>{revisionFile.name}</strong>
                  <span>{formatSize(revisionFile.size)}</span>
                </div>
              )}
              <p className="document-upload-note">The existing Drive file will be retained.</p>
              <label>
                Revision note (optional)
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={newRevisionNote}
                  onChange={(event) => setNewRevisionNote(event.target.value)}
                  placeholder="Describe what changed"
                />
              </label>
              {(revisionError || revise.error) && <p className="error" role="alert">{revisionError || revise.error?.message}</p>}
              <div className="modal-actions">
                <button type="button" onClick={() => setRevisionTarget(null)}>Cancel</button>
                <button className="primary" disabled={revise.isPending}>
                  {revise.isPending ? "Uploading…" : "Upload Revision"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {historyTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card document-history-modal" role="dialog" aria-modal="true" aria-labelledby="document-history-title">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">DOCUMENT HISTORY</span>
                <h2 id="document-history-title">Version History</h2>
                <p className="muted">{historyTarget.fileName}</p>
              </div>
              <button aria-label="Close version history" onClick={() => setHistoryTarget(null)}>×</button>
            </div>
            {history.isPending ? (
              <p className="empty">Loading versions…</p>
            ) : history.isError ? (
              <p className="error" role="alert">{history.error.message}</p>
            ) : (
              <div className="version-history-list">
                {history.data.map((version) => (
                  <article key={version.id} className="version-history-item">
                    <div>
                      <strong>Version {version.version}</strong>
                      {version.isLatest && <span className="latest-version-badge">Latest</span>}
                      <h3>{version.fileName}</h3>
                      <p>{version.revisionNote || "No revision note"}</p>
                    </div>
                    <div className="version-history-meta">
                      <span>{new Date(version.createdAt).toLocaleDateString("en-GB")}</span>
                      <span>{version.uploader.name}</span>
                      <AuthenticatedDownloadButton
                        document={version}
                        className="document-history-download"
                      />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card modal-card-small" role="alertdialog" aria-modal="true" aria-labelledby="delete-document-title">
            <h2 id="delete-document-title">Delete document?</h2>
            <p><strong>{deleteTarget.fileName}</strong> will be removed from this Project and Google Drive.</p>
            {remove.error && <p className="error" role="alert">{remove.error.message}</p>}
            <div className="modal-actions">
              <button onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="danger" disabled={remove.isPending} onClick={() => remove.mutate(deleteTarget.id)}>
                {remove.isPending ? "Deleting…" : "Delete Document"}
              </button>
            </div>
          </section>
        </div>
      )}

      {rejectTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card modal-card-small" role="dialog" aria-modal="true" aria-labelledby="reject-document-title">
            <h2 id="reject-document-title">Reject Document</h2>
            <p><strong>{rejectTarget.fileName}</strong> will return with a required review comment.</p>
            <label className="modal-field">
              Rejection comment
              <textarea
                rows={4}
                maxLength={1000}
                value={rejectionComment}
                onChange={(event) => {
                  setRejectionComment(event.target.value);
                  setApprovalError("");
                }}
                placeholder="Explain what must be corrected"
              />
            </label>
            {(approvalError || workflow.error) && <p className="error" role="alert">{approvalError || workflow.error?.message}</p>}
            <div className="modal-actions">
              <button onClick={() => setRejectTarget(null)}>Cancel</button>
              <button
                className="danger"
                disabled={workflow.isPending}
                onClick={() => {
                  const comment = rejectionComment.trim();
                  if (!comment) {
                    setApprovalError("A rejection comment is required.");
                    return;
                  }
                  workflow.mutate({ document: rejectTarget, action: "reject", comment });
                }}
              >
                {workflow.isPending ? "Rejecting…" : "Reject Document"}
              </button>
            </div>
          </section>
        </div>
      )}

      {approvalHistoryTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card document-history-modal" role="dialog" aria-modal="true" aria-labelledby="approval-history-title">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">APPROVAL WORKFLOW</span>
                <h2 id="approval-history-title">Approval History</h2>
                <p className="muted">{approvalHistoryTarget.fileName}</p>
              </div>
              <button aria-label="Close approval history" onClick={() => setApprovalHistoryTarget(null)}>×</button>
            </div>
            {approvalHistory.isPending ? (
              <p className="empty">Loading approval history…</p>
            ) : approvalHistory.isError ? (
              <p className="error" role="alert">{approvalHistory.error.message}</p>
            ) : approvalHistory.data.length === 0 ? (
              <p className="empty">No approval actions recorded yet.</p>
            ) : (
              <div className="version-history-list">
                {approvalHistory.data.map((entry) => (
                  <article className="version-history-item" key={entry.id}>
                    <div>
                      <strong>{statusLabel(entry.action === "SUBMITTED" ? "PENDING_REVIEW" : entry.action)}</strong>
                      <p>{entry.comment || "No comment"}</p>
                    </div>
                    <div className="version-history-meta">
                      <span>{new Date(entry.createdAt).toLocaleDateString("en-GB")}</span>
                      <span>{entry.approver.name}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
