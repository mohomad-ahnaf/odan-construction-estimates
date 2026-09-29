import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { DocumentCategory, ProjectDocument } from "../types";

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

function validateFile(file: File) {
  const name = file.name.toLowerCase();
  if (!allowedExtensions.some((extension) => name.endsWith(extension)))
    return "Choose a PDF, Word, Excel, PNG or JPEG file.";
  if (file.size > maximumBytes) return "The file must be 25 MB or smaller.";
  if (file.size === 0) return "The selected file is empty.";
  return "";
}

export function ProjectDocuments({ projectId }: { projectId: string }) {
  const cache = useQueryClient();
  const [filter, setFilter] = useState<"ALL" | DocumentCategory>("ALL");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [category, setCategory] = useState<DocumentCategory>("DRAWINGS");
  const [file, setFile] = useState<File | null>(null);
  const [revisionNote, setRevisionNote] = useState("");
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ProjectDocument | null>(null);
  const [historyTarget, setHistoryTarget] = useState<ProjectDocument | null>(null);
  const [revisionTarget, setRevisionTarget] = useState<ProjectDocument | null>(null);
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [newRevisionNote, setNewRevisionNote] = useState("");
  const [revisionError, setRevisionError] = useState("");

  const documents = useQuery({
    queryKey: ["project-documents", projectId],
    queryFn: () => api<ProjectDocument[]>(`/projects/${projectId}/documents`),
  });
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file to upload.");
      const validation = validateFile(file);
      if (validation) throw new Error(validation);
      const body = new FormData();
      body.append("file", file);
      body.append("category", category);
      if (revisionNote.trim()) body.append("revisionNote", revisionNote.trim());
      return api<ProjectDocument>(`/projects/${projectId}/documents`, {
        method: "POST",
        body,
      });
    },
    onSuccess: async () => {
      setUploadOpen(false);
      setFile(null);
      setRevisionNote("");
      setFormError("");
      await cache.invalidateQueries({
        queryKey: ["project-documents", projectId],
      });
    },
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
  const visible = useMemo(
    () =>
      documents.data?.filter(
        (document) => filter === "ALL" || document.category === filter,
      ) ?? [],
    [documents.data, filter],
  );

  function submitUpload(event: FormEvent) {
    event.preventDefault();
    const validation = file ? validateFile(file) : "Choose a file to upload.";
    setFormError(validation);
    if (!validation) upload.mutate();
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
                <div className="document-preview" aria-hidden={!isImage}>
                  {isImage ? (
                    <img
                      src={document.links.downloadUrl}
                      alt={`${document.fileName} thumbnail`}
                      loading="lazy"
                    />
                  ) : (
                    <span>{isPdf ? "PDF" : document.fileName.split(".").pop()?.toUpperCase()}</span>
                  )}
                </div>
                <div className="document-card-body">
                  <div className="document-card-heading">
                    <h3 title={document.fileName}>{document.fileName}</h3>
                    <div className="document-badges">
                      {document.isLatest && (
                        <span className="latest-version-badge">Latest</span>
                      )}
                      <span className="document-version">V{document.version}</span>
                      <span className="document-category">
                        {categoryLabel(document.category)}
                      </span>
                    </div>
                  </div>
                  <dl className="document-meta">
                    <div><dt>Type</dt><dd>{document.fileType}</dd></div>
                    <div><dt>Size</dt><dd>{formatSize(document.fileSize)}</dd></div>
                    <div>
                      <dt>Uploaded</dt>
                      <dd>{new Date(document.createdAt).toLocaleDateString("en-GB")}</dd>
                    </div>
                  </dl>
                  <div className="document-actions">
                    {(isPdf || isImage) && (
                      <a href={document.links.viewUrl} target="_blank" rel="noreferrer">
                        Preview
                      </a>
                    )}
                    <a href={document.links.downloadUrl} target="_blank" rel="noreferrer">
                      Download
                    </a>
                    <button
                      className="text-button"
                      onClick={() => setHistoryTarget(document)}
                    >
                      Version History
                    </button>
                    <button
                      className="text-button"
                      onClick={() => {
                        setRevisionTarget(document);
                        setRevisionFile(null);
                        setNewRevisionNote("");
                        setRevisionError("");
                        revise.reset();
                      }}
                    >
                      Upload New Revision
                    </button>
                    <button className="text-button document-delete" onClick={() => setDeleteTarget(document)}>
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {uploadOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="upload-document-title">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">PROJECT DOCUMENT</span>
                <h2 id="upload-document-title">Upload Document</h2>
              </div>
              <button aria-label="Close upload dialog" onClick={() => setUploadOpen(false)}>×</button>
            </div>
            <form onSubmit={submitUpload}>
              <label>
                File
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  onChange={(event) => {
                    const selected = event.target.files?.[0] ?? null;
                    setFile(selected);
                    setFormError(selected ? validateFile(selected) : "");
                  }}
                />
                <small>PDF, Word, Excel, PNG or JPEG · maximum 25 MB</small>
              </label>
              <label>
                Category
                <select value={category} onChange={(event) => setCategory(event.target.value as DocumentCategory)}>
                  {categories.map((value) => <option key={value} value={value}>{categoryLabel(value)}</option>)}
                </select>
              </label>
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
              {(formError || upload.error) && <p className="error" role="alert">{formError || upload.error?.message}</p>}
              <div className="modal-actions">
                <button type="button" onClick={() => setUploadOpen(false)}>Cancel</button>
                <button className="primary" disabled={upload.isPending}>
                  {upload.isPending ? "Uploading…" : "Upload Document"}
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
              <label>
                Revised file
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  onChange={(event) => {
                    const selected = event.target.files?.[0] ?? null;
                    setRevisionFile(selected);
                    setRevisionError(selected ? validateFile(selected) : "");
                  }}
                />
                <small>The existing Drive file will be retained.</small>
              </label>
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
                      <a href={version.links.downloadUrl} target="_blank" rel="noreferrer">Download</a>
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
    </section>
  );
}
