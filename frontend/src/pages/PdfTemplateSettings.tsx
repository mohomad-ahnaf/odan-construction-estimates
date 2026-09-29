import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { api, apiBlob } from "../lib/api";

type Settings = {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  logoDataUrl: string | null;
  documentTitle: string;
  footerNote: string;
  termsConditions: string;
  primaryColor: string;
  accentColor: string;
  fontFamily: "Helvetica" | "Roboto" | "Times New Roman" | "Inter";
  headerLayout: "LEFT" | "CENTER" | "RIGHT";
  watermarkEnabled: boolean;
  watermarkOpacity: number;
  watermarkSize: "SMALL" | "MEDIUM" | "LARGE";
  tableStyle: "NAVY" | "GOLD" | "LIGHT_GRAY";
};

const readImage = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("Could not read the logo image"));
  reader.readAsDataURL(file);
});

export function PdfTemplateSettings() {
  const query = useQuery({ queryKey: ["pdf-template-settings"], queryFn: () => api<Settings>("/settings/pdf-template") });
  const { register, reset, setValue, watch, getValues, handleSubmit, formState: { isSubmitting } } = useForm<Settings>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => { if (query.data) reset(query.data); }, [query.data, reset]);
  const logo = watch("logoDataUrl");
  const save = handleSubmit(async (values) => {
    setError(""); setMessage("");
    try {
      const saved = await api<Settings>("/settings/pdf-template", { method: "PUT", body: JSON.stringify(values) });
      reset(saved);
      setMessage("PDF template settings saved.");
    } catch (cause) { setError((cause as Error).message); }
  });
  async function preview(length: "short" | "long") {
    setError("");
    setPreviewing(true);
    const tab = window.open("", "_blank");
    try {
      const blob = await apiBlob(`/settings/pdf-template/preview?length=${length}`, {
        method: "POST", body: JSON.stringify(getValues()),
      });
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else {
        const link = document.createElement("a");
        link.href = url;
        link.download = `estimate-template-${length}.pdf`;
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      tab?.close();
      setError((cause as Error).message);
    } finally { setPreviewing(false); }
  }
  if (query.isPending) return <p>Loading PDF template settings…</p>;
  if (query.isError) return <p role="alert">{query.error.message}</p>;
  return <div className="pdf-settings-page">
    <div className="page-heading"><div><h1>PDF Template Settings</h1><p className="muted">Customize Construction Estimate PDFs. Changes apply to future downloads, including existing estimates.</p></div></div>
    <form onSubmit={save}>
      <section className="pdf-settings-section"><h2>Company details</h2><div className="pdf-settings-grid">
        <label>Company name<input required maxLength={120} {...register("companyName")} /></label>
        <label>Telephone<input required maxLength={80} {...register("companyPhone")} /></label>
        <label>Email<input required type="email" maxLength={254} {...register("companyEmail")} /></label>
        <label className="wide">Address<textarea required maxLength={300} rows={2} {...register("companyAddress")} /></label>
      </div></section>
      <section className="pdf-settings-section"><h2>Logo upload</h2><p className="muted">PNG or JPEG, up to 1 MB. The original image is preserved and scaled to fit the PDF header.</p>
        <div className="pdf-logo-preview">{logo ? <img src={logo} alt="Current PDF logo" /> : <img src="/branding/odan-logo-transparent.png" alt="Default Odan logo" />}</div>
        <input aria-label="Upload company logo" type="file" accept="image/png,image/jpeg" onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 1_000_000) { setError("Choose a PNG or JPEG image under 1 MB."); return; }
          try { setValue("logoDataUrl", await readImage(file), { shouldDirty: true }); setError(""); }
          catch (cause) { setError((cause as Error).message); }
        }} />
        {logo && <button type="button" onClick={() => setValue("logoDataUrl", null, { shouldDirty: true })}>Use default logo</button>}
      </section>
      <section className="pdf-settings-section"><h2>Header configuration</h2><div className="pdf-settings-grid">
        <label>Document title<input required maxLength={100} {...register("documentTitle")} /></label>
        <label>Logo position<select {...register("headerLayout")}><option value="LEFT">Left</option><option value="CENTER">Center</option><option value="RIGHT">Right</option></select></label>
      </div></section>
      <section className="pdf-settings-section"><h2>Footer notes</h2><textarea aria-label="Footer note" required maxLength={1000} rows={3} {...register("footerNote")} /></section>
      <section className="pdf-settings-section"><h2>Terms and conditions</h2><textarea aria-label="Terms and conditions" maxLength={4000} rows={5} {...register("termsConditions")} /></section>
      <section className="pdf-settings-section"><h2>Visual customization</h2><div className="pdf-settings-grid">
        <label>Primary color<input type="color" {...register("primaryColor")} /></label>
        <label>Accent color<input type="color" {...register("accentColor")} /></label>
        <label>Font<select {...register("fontFamily")}><option>Helvetica</option><option>Roboto</option><option>Times New Roman</option><option>Inter</option></select></label>
        <label>Table header style<select {...register("tableStyle")}><option value="NAVY">Navy</option><option value="GOLD">Gold</option><option value="LIGHT_GRAY">Light gray</option></select></label>
        <label className="pdf-settings-check"><input type="checkbox" {...register("watermarkEnabled")} /> Show watermark</label>
        <label>Watermark opacity (%)<input type="number" min="1" max="10" step="0.5" value={((watch("watermarkOpacity") ?? 0.045) * 100).toString()} onChange={(event) => setValue("watermarkOpacity", Number(event.target.value) / 100, { shouldDirty: true })} /></label>
        <label>Watermark size<select {...register("watermarkSize")}><option value="SMALL">Small</option><option value="MEDIUM">Medium</option><option value="LARGE">Large</option></select></label>
      </div></section>
      {error && <p role="alert" className="error">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="pdf-settings-actions"><button className="primary" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save changes"}</button><button type="button" disabled={previewing} onClick={() => void preview("short")}>Preview PDF template</button><button type="button" disabled={previewing} onClick={() => void preview("long")}>Preview multi-page PDF</button></div>
    </form>
  </div>;
}
