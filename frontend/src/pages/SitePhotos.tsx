import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api, apiBlob } from "../lib/api";
import { groupSitePhotosByDate } from "../lib/sitePhotoDates";
import type { Page, Project, ProjectDirectoryItem, ProjectDocument } from "../types";

const MAX_BYTES = 25 * 1024 * 1024;
const PAGE_SIZE = 12;
type UploadState = "queued" | "uploading" | "uploaded" | "failed";
type QueuedPhoto = { id: string; projectId: string; file: File;
  title: string; description: string; state: UploadState; error: string };

export function validateSitePhoto(file: File) {
  const extension = file.name.toLowerCase().split(".").pop();
  if (!["jpg", "jpeg", "png"].includes(extension ?? "") ||
      !["image/jpeg", "image/png"].includes(file.type))
    return "Use a JPEG or PNG image. HEIC/HEIF and other phone formats must be converted before upload.";
  if (!file.size) return "The photo is empty.";
  if (file.size > MAX_BYTES) return "The photo exceeds the 25 MB per-file limit.";
  return "";
}
const identity = (projectId: string, file: File) => `${projectId}\0${file.name}\0${file.size}\0${file.lastModified}`;
const displayName = (photo: ProjectDocument) => photo.title?.trim() || photo.fileName;
const shortDate = (date: string) => new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

type PhotoIconName = "eye" | "pencil" | "replace" | "history" | "trash" | "more";
function PhotoIcon({ name }: { name: PhotoIconName }) {
  const paths: Record<PhotoIconName, ReactNode> = {
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
    pencil: <><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z" /><path d="m13.5 7 3.5 3.5" /></>,
    replace: <><path d="M4 9V5h4M20 15v4h-4" /><path d="M4.8 15a8 8 0 0 0 13.4 2M19.2 9A8 8 0 0 0 5.8 7" /></>,
    history: <><path d="M3 12a9 9 0 1 0 2.6-6.4M3 4v4h4M12 7v5l3 2" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  };
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function SiteDialog({ title, children, onClose, danger = false }: { title: string; children: ReactNode;
  onClose: () => void; danger?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLElement>("button,input,textarea")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)") ?? []);
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop"><section ref={ref} className={`modal-card site-dialog${danger ? " site-dialog-danger" : ""}`}
    role="dialog" aria-modal="true" aria-label={title}>
    <div className="modal-heading"><h2>{title}</h2><button type="button" aria-label={`Close ${title}`} onClick={onClose}>×</button></div>
    {children}
  </section></div>;
}

function PhotoThumbnail({ photo, onOpen }: { photo: ProjectDocument; onOpen: () => void }) {
  const node = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!node.current) return;
    if (!("IntersectionObserver" in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "150px" });
    observer.observe(node.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let disposed = false;
    let objectUrl = "";
    void apiBlob(`/documents/${photo.id}/content`).then((blob) => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => { if (!disposed) setUrl(""); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [visible, photo.id]);
  return <button ref={node} type="button" className="site-photo-thumb" onClick={onOpen}
    aria-label={`Open photo preview: ${displayName(photo)}`} title={`Preview ${displayName(photo)}`}>
    {url ? <img src={url} alt="" loading="lazy" /> : <span aria-hidden="true">▧</span>}
  </button>;
}

function QueueThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (validateSitePhoto(file)) return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return <div className="site-queue-preview">{url ?
    <img src={url} alt="" onError={() => setUrl("")} /> : <span aria-hidden="true">▧</span>}</div>;
}

function PhotoViewer({ photo, onClose }: { photo: ProjectDocument; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false, objectUrl = "";
    setUrl(""); setError("");
    void apiBlob(`/documents/${photo.id}/content`).then((blob) => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch((cause: unknown) => { if (!disposed) setError(cause instanceof Error ? cause.message : "Photo preview unavailable"); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [photo.id]);
  return <SiteDialog title={displayName(photo)} onClose={onClose}>
    <div className="site-photo-full">{error ? <p className="error" role="alert">{error}</p> :
      url ? <img src={url} alt={displayName(photo)} /> : <p role="status">Loading private photo…</p>}</div>
    <div className="modal-actions"><button onClick={onClose}>Close</button>
      <button className="primary" disabled={!url} onClick={() => {
        const anchor = document.createElement("a"); anchor.href = url; anchor.download = photo.fileName; anchor.click();
      }}>Download original</button></div>
  </SiteDialog>;
}

export function SitePhotos() {
  const [params, setParams] = useSearchParams();
  const projectId = params.get("projectId") ?? "";
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [projectPage, setProjectPage] = useState(1);
  const [galleryPage, setGalleryPage] = useState(1);
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueuedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [dragging, setDragging] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const [viewer, setViewer] = useState<ProjectDocument | null>(null);
  const [edit, setEdit] = useState<ProjectDocument | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [replace, setReplace] = useState<ProjectDocument | null>(null);
  const [replacement, setReplacement] = useState<File | null>(null);
  const [historyPhoto, setHistoryPhoto] = useState<ProjectDocument | null>(null);
  const [deleting, setDeleting] = useState<ProjectDocument | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [localNow, setLocalNow] = useState(() => new Date());
  const [modalError, setModalError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setGalleryPage(1); }, [projectId]);
  useEffect(() => { setProjectPage(1); }, [search]);
  useEffect(() => {
    let timer: number;
    const schedule = () => {
      const now = new Date();
      timer = window.setTimeout(() => { setLocalNow(new Date()); schedule(); },
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 100);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!openActionsId) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".site-photo-more-wrap")) return;
      setOpenActionsId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenActionsId(null);
        document.getElementById(`site-photo-more-${openActionsId}`)?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOnOutsideClick); document.removeEventListener("keydown", closeOnEscape); };
  }, [openActionsId]);

  const directory = useQuery({ queryKey: ["site-photo-projects", search, projectPage],
    queryFn: () => api<Page<ProjectDirectoryItem>>(`/projects?search=${encodeURIComponent(search)}&page=${projectPage}&pageSize=20`) });
  const project = useQuery({ queryKey: ["site-photo-project", projectId], enabled: !!projectId,
    queryFn: () => api<Project>(`/projects/${projectId}`) });
  const documents = useQuery({ queryKey: ["project-documents", projectId], enabled: !!projectId && project.isSuccess,
    queryFn: () => api<ProjectDocument[]>(`/projects/${projectId}/documents`) });
  const versions = useQuery({ queryKey: ["document-versions", historyPhoto?.id], enabled: !!historyPhoto,
    queryFn: () => api<ProjectDocument[]>(`/documents/${historyPhoto!.id}/versions`) });
  const photos = useMemo(() => (documents.data ?? []).filter((document) => document.category === "IMAGES" &&
    ["image/jpeg", "image/png"].includes(document.fileType) && document.isLatest)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), [documents.data]);
  useEffect(() => {
    setGalleryPage((page) => Math.min(page, Math.max(1, Math.ceil(photos.length / PAGE_SIZE))));
  }, [photos.length]);
  const shown = photos.slice((galleryPage - 1) * PAGE_SIZE, galleryPage * PAGE_SIZE);
  const dateGroups = groupSitePhotosByDate(shown, localNow);
  const currentQueue = queue.filter((item) => item.projectId === projectId);
  const ready = currentQueue.filter((item) =>
    (item.state === "queued" || item.state === "failed") && !validateSitePhoto(item.file));
  const pending = queue.some((item) => item.projectId === projectId && item.state !== "uploaded");

  function chooseProject(nextId: string) {
    if (nextId === projectId) return;
    if (pending) { setSwitchTo(nextId); return; }
    setParams(nextId ? { projectId: nextId } : {});
  }
  function addFiles(files: File[]) {
    if (!projectId || !files.length) return;
    setQueue((current) => {
      const known = new Set(current.map((item) => identity(item.projectId, item.file)));
      const additions: QueuedPhoto[] = [];
      for (const file of files) {
        const key = identity(projectId, file);
        if (known.has(key)) continue;
        known.add(key);
        const error = validateSitePhoto(file);
        additions.push({ id: crypto.randomUUID(), projectId, file, title: "", description: "",
          state: error ? "failed" : "queued", error });
      }
      return [...current, ...additions];
    });
  }
  function removeQueued(id: string) {
    setQueue((current) => current.filter((entry) => entry.id !== id));
  }
  async function uploadPhotos() {
    if (uploading || !projectId) return;
    const candidates = currentQueue.filter((item) =>
      (item.state === "queued" || item.state === "failed") && !validateSitePhoto(item.file));
    if (!candidates.length) return;
    setUploading(true); setUploadProgress({ done: 0, total: candidates.length });
    let index = 0, done = 0;
    const worker = async () => {
      while (index < candidates.length) {
        const item = candidates[index++]!;
        setQueue((current) => current.map((entry) => entry.id === item.id ? { ...entry, state: "uploading", error: "" } : entry));
        const body = new FormData(); body.append("file", item.file); body.append("category", "IMAGES");
        if (item.title.trim()) body.append("title", item.title.trim());
        if (item.description.trim()) body.append("description", item.description.trim());
        try {
          await api<ProjectDocument>(`/projects/${item.projectId}/documents`, { method: "POST", body });
          setQueue((current) => current.map((entry) => entry.id === item.id ? { ...entry, state: "uploaded", error: "" } : entry));
          await cache.invalidateQueries({ queryKey: ["project-documents", item.projectId] });
        } catch (cause) {
          setQueue((current) => current.map((entry) => entry.id === item.id ? { ...entry, state: "failed",
            error: cause instanceof Error ? cause.message : "Upload failed. Check your connection and retry." } : entry));
        } finally { done += 1; setUploadProgress({ done, total: candidates.length }); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, candidates.length) }, worker));
    setUploading(false);
  }
  async function saveDetails(event: FormEvent) {
    event.preventDefault(); if (!edit || busy) return;
    setBusy(true); setModalError("");
    try {
      await api(`/documents/${edit.id}/metadata`, { method: "PATCH",
        body: JSON.stringify({ title: editTitle.trim() || null, description: editDescription.trim() || null }) });
      await cache.invalidateQueries({ queryKey: ["project-documents", edit.projectId] }); setEdit(null);
    } catch (cause) { setModalError(cause instanceof Error ? cause.message : "Could not save photo details"); }
    finally { setBusy(false); }
  }
  async function replacePhoto(event: FormEvent) {
    event.preventDefault(); if (!replace || !replacement || busy) return;
    const error = validateSitePhoto(replacement); if (error) { setModalError(error); return; }
    setBusy(true); setModalError("");
    try {
      const body = new FormData(); body.append("file", replacement);
      await api(`/documents/${replace.id}/revision`, { method: "POST", body });
      await cache.invalidateQueries({ queryKey: ["project-documents", replace.projectId] });
      await cache.invalidateQueries({ queryKey: ["document-versions"] });
      setReplace(null); setReplacement(null);
    } catch (cause) { setModalError(cause instanceof Error ? cause.message : "Replacement failed. Try again."); }
    finally { setBusy(false); }
  }
  async function deletePhoto() {
    if (!deleting || busy) return;
    setBusy(true); setModalError("");
    try {
      await api(`/documents/${deleting.id}/photo-history`, { method: "DELETE" });
      await cache.invalidateQueries({ queryKey: ["project-documents", deleting.projectId] });
      await cache.invalidateQueries({ queryKey: ["document-versions"] });
      setDeleting(null);
    } catch (cause) { setModalError(cause instanceof Error ? cause.message : "Could not delete photo"); }
    finally { setBusy(false); }
  }

  return <section className="site-photos-page">
    <header className="page-heading site-photos-heading"><div><span className="eyebrow">FIELD RECORDS</span>
      <h1>Site Photos</h1><p className="muted">Capture and manage project images in private Documents storage.</p></div></header>
    <section className="panel site-project-picker"><div className="site-section-title"><h2>Select a project</h2>
      {project.data && <strong>{project.data.projectName}</strong>}</div>
      <input type="search" aria-label="Search accessible projects" value={search} placeholder="Search project or client…"
        onChange={(event) => setSearch(event.target.value)} />
      {directory.isPending ? <p role="status">Loading projects…</p> : directory.isError ?
        <p className="error" role="alert">Could not load projects. <button onClick={() => void directory.refetch()}>Retry</button></p> :
        <div className="site-project-results" aria-label="Accessible projects">{directory.data.data.map((item) =>
          <button key={item.id} className={item.id === projectId ? "selected" : ""} aria-pressed={item.id === projectId}
            onClick={() => chooseProject(item.id)}><strong>{item.projectName}</strong><span>{item.clientName} · {item.projectCode ?? "Legacy project"}</span></button>)}
          {!directory.data.data.length && <p>No matching projects.</p>}</div>}
      {directory.data && directory.data.total > directory.data.pageSize && <div className="site-project-pages">
        <button disabled={projectPage <= 1} onClick={() => setProjectPage((value) => value - 1)}>Previous</button>
        <span>Page {projectPage}</span>
        <button disabled={projectPage * directory.data.pageSize >= directory.data.total}
          onClick={() => setProjectPage((value) => value + 1)}>Next</button></div>}
    </section>
    {!projectId ? <section className="panel site-empty">Choose a project to upload or view its site photos.</section> :
      project.isPending ? <section className="panel" role="status">Loading selected project…</section> :
      project.isError ? <section className="panel error" role="alert">This project is unavailable or inaccessible.
        <button onClick={() => chooseProject("")}>Choose another project</button></section> : <>
        <section className="panel site-upload"><div className="site-section-title"><div><h2>{project.data.projectName}</h2>
          <p>Photos are stored in this project's Documents → Images.</p></div>
          <Link to={`/projects/${projectId}?tab=documents&category=IMAGES`}>Open Documents → Images</Link></div>
          <div className="site-upload-actions"><input ref={cameraInput} className="visually-hidden" type="file" accept="image/jpeg,image/png"
            capture="environment" aria-label="Take Photo camera input" onChange={(event) => {
              addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
            <input ref={filesInput} className="visually-hidden" type="file" accept="image/jpeg,image/png" multiple
              aria-label="Choose Photos file input" onChange={(event) => {
                addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
            <button className="primary" onClick={() => cameraInput.current?.click()}>Take Photo</button>
            <button onClick={() => filesInput.current?.click()}>Choose Photos</button></div>
          <p className="site-upload-help">Camera availability depends on your device. If capture is cancelled or unavailable, use Choose Photos. JPEG or PNG, up to 25 MB each. HEIC/HEIF must be converted first. Original quality is kept.</p>
          <div className={`site-drop-zone${dragging ? " is-dragging" : ""}`} role="button" tabIndex={0}
            aria-label="Drop photos here or browse" onClick={() => filesInput.current?.click()}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); filesInput.current?.click(); } }}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); event.dataTransfer.dropEffect = "copy"; }}
            onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
            onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)); }}>
            Drag and drop photos here, or click to browse
          </div>
          {currentQueue.length > 0 && <div className="site-queue"><div className="site-section-title"><h3>Upload queue</h3>
            <button disabled={uploading} onClick={() => currentQueue.filter((item) => item.state === "uploaded").forEach((item) => removeQueued(item.id))}>Clear completed</button></div>
            {currentQueue.map((item) => <div className="site-queue-row" key={item.id}>
              <QueueThumbnail file={item.file} />
              <div className="site-queue-fields"><strong title={item.file.name}>{item.file.name}</strong>
                <small>{(item.file.size / (1024 * 1024)).toFixed(2)} MB</small>
                <label>Title (optional)<input maxLength={160} value={item.title} disabled={item.state !== "queued" && item.state !== "failed"}
                  onChange={(event) => setQueue((current) => current.map((entry) => entry.id === item.id ? { ...entry, title: event.target.value } : entry))} /></label>
                <label>Description (optional)<input maxLength={1000} value={item.description} disabled={item.state !== "queued" && item.state !== "failed"}
                  onChange={(event) => setQueue((current) => current.map((entry) => entry.id === item.id ? { ...entry, description: event.target.value } : entry))} /></label>
                {item.error && <small className="error" role="alert">{item.error}</small>}</div>
              <div className="site-queue-state"><span>{item.state}</span><button type="button" disabled={item.state === "uploading"}
                aria-label={`Remove ${item.file.name}`} onClick={() => removeQueued(item.id)}>Remove</button></div>
            </div>)}
            {uploading && <p role="status">Uploading {uploadProgress.done} of {uploadProgress.total} complete</p>}
            <button className="primary" disabled={uploading || !ready.length} onClick={() => void uploadPhotos()}>
              {uploading ? "Uploading…" : currentQueue.some((item) => item.state === "uploaded") ?
                `Retry ${ready.length} Failed ${ready.length === 1 ? "Photo" : "Photos"}` :
                `Upload ${ready.length} ${ready.length === 1 ? "Photo" : "Photos"}`}</button>
          </div>}
        </section>
        <section className="panel site-gallery"><div className="site-section-title"><div><h2>Project gallery</h2>
          <p>{photos.length} latest image {photos.length === 1 ? "revision" : "revisions"}</p></div></div>
          {documents.isPending ? <p role="status">Loading photos…</p> : documents.isError ?
            <p className="error" role="alert">Could not load photos. <button onClick={() => void documents.refetch()}>Retry</button></p> :
            !photos.length ? <p className="site-empty">No site photos yet. Images uploaded in Documents will appear here.</p> : <>
              <div className="site-gallery-dates">{dateGroups.map((group) => <section key={group.key} className="site-gallery-date-section"
                aria-label={`${group.label}, ${group.photos.length} ${group.photos.length === 1 ? "photo" : "photos"}`}>
                <div className="site-gallery-date-heading"><h3>{group.label}</h3><span>{group.photos.length} {group.photos.length === 1 ? "photo" : "photos"}</span></div>
                <div className="site-gallery-grid">{group.photos.map((photo) => <article key={photo.id}
                  className={`site-photo-card${openActionsId === photo.id ? " site-photo-card-menu-open" : ""}`}>
                  <PhotoThumbnail photo={photo} onOpen={() => setViewer(photo)} />
                  <div className="site-photo-info"><h4 title={displayName(photo)}>{displayName(photo)}</h4>
                    <p title={`${shortDate(photo.createdAt)} · Version ${photo.version} · ${photo.status.replaceAll("_", " ").toLowerCase()}`}>
                      {shortDate(photo.createdAt)} · V{photo.version} · {photo.status.replaceAll("_", " ").toLowerCase()}</p>
                    {photo.description && <p title={photo.description}>{photo.description}</p>}</div>
                  <div className="site-photo-actions">
                    <button type="button" className="site-photo-icon-button" aria-label={`Preview ${displayName(photo)}`}
                      title="Preview" onClick={() => setViewer(photo)}><PhotoIcon name="eye" /></button>
                    <button type="button" className="site-photo-icon-button" aria-label="Edit details" title="Edit details"
                      onClick={() => { setEdit(photo); setEditTitle(photo.title ?? ""); setEditDescription(photo.description ?? ""); setModalError(""); }}><PhotoIcon name="pencil" /></button>
                    <div className="site-photo-more-wrap" onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpenActionsId(null);
                    }}><button type="button" id={`site-photo-more-${photo.id}`}
                      className="site-photo-icon-button" aria-label={`More actions for ${displayName(photo)}`}
                      title="More actions" aria-expanded={openActionsId === photo.id}
                      aria-controls={openActionsId === photo.id ? `site-photo-menu-${photo.id}` : undefined}
                      onClick={() => setOpenActionsId((current) => current === photo.id ? null : photo.id)}><PhotoIcon name="more" /></button>
                      {openActionsId === photo.id && <div id={`site-photo-menu-${photo.id}`} className="site-photo-menu">
                        <button type="button" title="Replace photo" onClick={() => { setOpenActionsId(null); setReplace(photo); setReplacement(null); setModalError(""); }}>
                          <PhotoIcon name="replace" />Replace photo</button>
                        <button type="button" title="Revision history" onClick={() => { setOpenActionsId(null); setHistoryPhoto(photo); }}>
                          <PhotoIcon name="history" />Revision history</button>
                        <button type="button" className="site-photo-delete-action" title="Delete" onClick={() => { setOpenActionsId(null); setDeleting(photo); setModalError(""); }}>
                          <PhotoIcon name="trash" />Delete</button>
                      </div>}
                    </div>
                  </div>
                </article>)}</div>
              </section>)}</div>
              <div className="site-gallery-pages"><span>Page {galleryPage} of {Math.ceil(photos.length / PAGE_SIZE)}</span>
                <button disabled={galleryPage === 1} onClick={() => setGalleryPage((value) => value - 1)}>Previous</button>
                <button disabled={galleryPage * PAGE_SIZE >= photos.length} onClick={() => setGalleryPage((value) => value + 1)}>Next</button></div>
            </>}
        </section>
      </>}
    {switchTo !== null && <SiteDialog title="Switch project?" onClose={() => setSwitchTo(null)}>
      <p>Queued and failed photos will remain assigned to their original project. Active uploads will finish there, even if you switch now.</p>
      <div className="modal-actions"><button onClick={() => setSwitchTo(null)}>Stay</button>
        <button className="primary" onClick={() => { setParams(switchTo ? { projectId: switchTo } : {}); setSwitchTo(null); }}>Switch and keep queue</button></div>
    </SiteDialog>}
    {viewer && <PhotoViewer photo={viewer} onClose={() => setViewer(null)} />}
    {edit && <SiteDialog title="Edit photo details" onClose={() => { if (!busy) setEdit(null); }}>
      <form onSubmit={(event) => void saveDetails(event)} className="site-details-form">
        <p>Original file: {edit.fileName}</p>
        <label>Title<input autoFocus maxLength={160} value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label>
        <label>Description<textarea rows={4} maxLength={1000} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /></label>
        {modalError && <p className="error" role="alert">{modalError}</p>}
        <div className="modal-actions"><button type="button" disabled={busy} onClick={() => setEdit(null)}>Cancel</button>
          <button className="primary" disabled={busy}>{busy ? "Saving…" : "Save details"}</button></div>
      </form></SiteDialog>}
    {replace && <SiteDialog title="Replace photo" onClose={() => { if (!busy) setReplace(null); }}>
      <form onSubmit={(event) => void replacePhoto(event)} className="site-details-form">
        <p>A new revision will be created for {displayName(replace)}. Older revisions remain in history; approval starts again.</p>
        <label>Replacement JPEG or PNG<input type="file" accept="image/jpeg,image/png" onChange={(event) => {
          const file = event.target.files?.[0] ?? null; setReplacement(file); setModalError(file ? validateSitePhoto(file) : ""); }} /></label>
        {modalError && <p className="error" role="alert">{modalError}</p>}
        <div className="modal-actions"><button type="button" disabled={busy} onClick={() => setReplace(null)}>Cancel</button>
          <button className="primary" disabled={busy || !replacement || !!modalError}>{busy ? "Replacing…" : "Upload revision"}</button></div>
      </form></SiteDialog>}
    {historyPhoto && <SiteDialog title={`Version history: ${displayName(historyPhoto)}`} onClose={() => setHistoryPhoto(null)}>
      {versions.isPending ? <p role="status">Loading history…</p> : versions.isError ? <p className="error" role="alert">Could not load version history.</p> :
        <div className="site-version-list">{versions.data.map((version) => <div key={version.id}>
          <strong>V{version.version} {version.isLatest ? "· Latest" : ""}</strong>
          <span>{version.fileName} · {shortDate(version.createdAt)} · {version.status.replaceAll("_", " ").toLowerCase()}</span>
          <button onClick={() => { setViewer(version); setHistoryPhoto(null); }}>Preview</button></div>)}</div>}
    </SiteDialog>}
    {deleting && <SiteDialog title="Delete site photo?" danger onClose={() => { if (!busy) setDeleting(null); }}>
      <p><strong>{displayName(deleting)}</strong> and its entire revision history will be removed from Site Photos, Documents, and Google Drive. Approved photo histories cannot be deleted.</p>
      {modalError && <p className="error" role="alert">{modalError}</p>}
      <div className="modal-actions"><button disabled={busy} onClick={() => setDeleting(null)}>Cancel</button>
        <button className="danger" disabled={busy} onClick={() => void deletePhoto()}>{busy ? "Deleting…" : "Delete photo and history"}</button></div>
    </SiteDialog>}
  </section>;
}
