import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  converterUnit,
  converterUnits,
  defaultConverterUnits,
  feetAndInchesToMetres,
  formatConverterNumber,
  formatFeetAndInches,
  fromCanonical,
  parseConverterNumber,
  toCanonical,
  type ConverterCategory,
} from "../lib/unitConverter";
import {
  addConverterHistory,
  historyResultLabel,
  historySourceLabel,
  readConverterHistory,
  writeConverterHistory,
  type ConverterHistoryEntry,
} from "../lib/unitConverterHistory";

const categories: { id: ConverterCategory; label: string }[] = [
  { id: "length", label: "Length" },
  { id: "area", label: "Area" },
  { id: "volume", label: "Volume" },
  { id: "weight", label: "Weight" },
];

export function UnitConverter() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? "";
  const [category, setCategory] = useState<ConverterCategory>("length");
  const [from, setFrom] = useState<string>("m");
  const [to, setTo] = useState<string>("ft");
  const [value, setValue] = useState("");
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");
  const [precision, setPrecision] = useState(4);
  const [exactAfterSwap, setExactAfterSwap] = useState<number | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [historyState, setHistoryState] = useState(() => userId ? readConverterHistory(userId) : { entries: [], available: false });
  const [historyOwner, setHistoryOwner] = useState(userId);
  const [historyStatus, setHistoryStatus] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setHistoryState(userId ? readConverterHistory(userId) : { entries: [], available: false });
    setHistoryOwner(userId);
    setHistoryStatus("");
    setConfirmClear(false);
  }, [userId]);
  const historyEntries = historyOwner === userId ? historyState.entries : [];

  const calculation = useMemo(() => {
    const parsed = from === "ft-in" ? feetAndInchesToMetres(feet, inches) : parseConverterNumber(value);
    if (parsed.error) return { canonical: null, result: null, error: parsed.error };
    if (parsed.value === null) return { canonical: null, result: null, error: "" };
    const canonical = exactAfterSwap ?? (from === "ft-in" ? parsed.value : toCanonical(category, parsed.value, from));
    if (canonical === null) return { canonical: null, result: null, error: "Value is too large to convert accurately." };
    const result = fromCanonical(category, canonical, to);
    if (result === null) return { canonical: null, result: null, error: "Result is too large to display accurately." };
    return { canonical, result, error: "" };
  }, [category, exactAfterSwap, feet, from, inches, to, value]);

  const resultText = calculation.result === null
    ? ""
    : to === "ft-in"
      ? formatFeetAndInches(calculation.canonical!)
      : `${formatConverterNumber(calculation.result, precision)} ${converterUnit(category, to)?.symbol ?? ""}`;
  const feetEquivalent = category === "length" && to === "ft" && calculation.canonical !== null
    ? formatFeetAndInches(calculation.canonical)
    : "";

  function chooseCategory(next: ConverterCategory) {
    setCategory(next);
    setFrom(defaultConverterUnits[next].from);
    setTo(defaultConverterUnits[next].to);
    setValue("");
    setFeet("");
    setInches("");
    setExactAfterSwap(null);
    setCopyStatus("");
  }

  function setInputForUnit(unit: string, canonical: number | null) {
    if (canonical === null) {
      setValue("");
      setFeet("");
      setInches("");
      setExactAfterSwap(null);
      return;
    }
    if (unit === "ft-in") {
      const totalFeet = canonical / 0.3048;
      const wholeFeet = Math.floor(totalFeet);
      setFeet(String(wholeFeet));
      setInches(String((totalFeet - wholeFeet) * 12));
    } else {
      const converted = fromCanonical(category, canonical, unit);
      if (converted === null) {
        setValue("");
        setExactAfterSwap(null);
        return;
      }
      setValue(String(converted));
    }
    setExactAfterSwap(canonical);
  }

  function changeFromUnit(unit: string) {
    setInputForUnit(unit, calculation.canonical);
    setFrom(unit);
    setCopyStatus("");
  }

  function swap() {
    const oldFrom = from;
    const oldTo = to;
    setInputForUnit(oldTo, calculation.canonical);
    setFrom(oldTo);
    setTo(oldFrom);
    setCopyStatus("");
  }

  async function copyResult() {
    if (!resultText) return;
    try {
      await navigator.clipboard.writeText(resultText);
      setCopyStatus("Result copied.");
    } catch {
      setCopyStatus("Copy failed. Select the result to copy it manually.");
    }
  }

  function reset() {
    setValue("");
    setFeet("");
    setInches("");
    setExactAfterSwap(null);
    setCopyStatus("");
  }

  function saveToHistory() {
    if (!userId || calculation.canonical === null || calculation.result === null) return;
    const parsed = from === "ft-in" ? feetAndInchesToMetres(feet, inches) : parseConverterNumber(value);
    if (parsed.error || parsed.value === null) return;
    const inputValue = from === "ft-in"
      ? calculation.canonical / 0.3048
      : exactAfterSwap !== null
        ? fromCanonical(category, calculation.canonical, from)
        : parsed.value;
    if (inputValue === null || !Number.isFinite(inputValue)) return;
    const entry: ConverterHistoryEntry = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      category, fromUnit: from, toUnit: to,
      inputValue, resultValue: calculation.result, canonicalValue: calculation.canonical,
      inputRaw: from === "ft-in" ? { feet, inches } : value,
      precision, createdAt: new Date().toISOString(),
    };
    const next = addConverterHistory(historyEntries, entry);
    if (next === historyEntries) {
      setHistoryStatus("This is already the most recent conversion.");
      return;
    }
    const available = writeConverterHistory(userId, next);
    setHistoryState({ entries: next, available });
    setHistoryStatus(available ? "Conversion saved to history." : "Saved for this page only; browser storage is unavailable.");
  }

  function deleteHistoryEntry(id: string) {
    const next = historyEntries.filter((entry) => entry.id !== id);
    const available = userId ? writeConverterHistory(userId, next) : false;
    setHistoryState({ entries: next, available });
    setHistoryStatus(available ? "Conversion removed." : "Removed for this page only; browser storage is unavailable.");
  }

  function clearHistory() {
    const available = userId ? writeConverterHistory(userId, []) : false;
    setHistoryState({ entries: [], available });
    setHistoryStatus(available ? "History cleared." : "Cleared for this page only; browser storage is unavailable.");
    setConfirmClear(false);
  }

  return (
    <div className="unit-converter-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">WORKSPACE TOOL</span>
          <h1>Unit Converter</h1>
          <p className="muted">Convert construction quantities instantly.</p>
        </div>
      </div>

      <section className="panel converter-panel" aria-labelledby="converter-heading">
        <div className="converter-panel-heading">
          <div>
            <span className="eyebrow">QUICK CONVERSION</span>
            <h2 id="converter-heading">Select a category</h2>
          </div>
          <label className="converter-precision">Display precision
            <select value={precision} onChange={(event) => setPrecision(Number(event.target.value))}>
              {Array.from({ length: 7 }, (_, count) => <option key={count} value={count}>{count} decimal places</option>)}
            </select>
          </label>
        </div>
        <div className="converter-tabs" role="tablist" aria-label="Conversion category">
          {categories.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={category === item.id} className={category === item.id ? "active" : ""} onClick={() => chooseCategory(item.id)}>{item.label}</button>
          ))}
        </div>

        <div className="converter-grid" role="tabpanel" aria-label={`${categories.find((item) => item.id === category)?.label} conversion`}>
          <div className="converter-inputs">
            {from === "ft-in" ? (
              <div className="converter-compound">
                <label>Feet
                  <input inputMode="numeric" value={feet} onChange={(event) => { setFeet(event.target.value); setExactAfterSwap(null); setCopyStatus(""); }} placeholder="0" />
                </label>
                <label>Inches
                  <input inputMode="decimal" value={inches} onChange={(event) => { setInches(event.target.value); setExactAfterSwap(null); setCopyStatus(""); }} placeholder="0" />
                </label>
              </div>
            ) : (
              <label>Value
                <input inputMode="decimal" value={value} onChange={(event) => { setValue(event.target.value); setExactAfterSwap(null); setCopyStatus(""); }} placeholder="Enter a value" aria-invalid={Boolean(calculation.error)} aria-describedby={calculation.error ? "converter-error" : undefined} />
              </label>
            )}
            {calculation.error && <p id="converter-error" className="error" role="alert">{calculation.error}</p>}
            <div className="converter-unit-pair">
              <label>From unit
                <select value={from} onChange={(event) => changeFromUnit(event.target.value)}>
                  {converterUnits[category].map((unit) => <option key={unit.id} value={unit.id}>{unit.label}{unit.label === unit.symbol ? "" : ` (${unit.symbol})`}</option>)}
                </select>
              </label>
              <button className="converter-swap" type="button" aria-label="Swap units" title="Swap units" onClick={swap}>⇄ <span>Swap</span></button>
              <label>To unit
                <select value={to} onChange={(event) => { setTo(event.target.value); setCopyStatus(""); }}>
                  {converterUnits[category].map((unit) => <option key={unit.id} value={unit.id}>{unit.label}{unit.label === unit.symbol ? "" : ` (${unit.symbol})`}</option>)}
                </select>
              </label>
            </div>
            {category === "volume" && <p className="converter-help">In this converter, 1 cube = 1,000 ft³.</p>}
          </div>

          <div className="converter-result" aria-live="polite">
            <span className="eyebrow">RESULT</span>
            {resultText ? <output aria-label="Converted result">{resultText}</output> : <p className="converter-placeholder">Enter a value to see the conversion.</p>}
            {feetEquivalent && <p className="converter-equivalent">Equivalent: {feetEquivalent}</p>}
            <div className="converter-actions">
              <button type="button" className="primary" onClick={() => void copyResult()} disabled={!resultText}>Copy result</button>
              <button type="button" onClick={saveToHistory} disabled={!resultText || !userId}>Save to history</button>
              <button type="button" onClick={reset}>Reset</button>
            </div>
            {copyStatus && <p role="status" className="converter-copy-status">{copyStatus}</p>}
          </div>
        </div>
      </section>
      <section className="panel converter-history" aria-labelledby="converter-history-heading">
        <div className="converter-history-heading">
          <div>
            <h2 id="converter-history-heading">Recent conversions</h2>
            <p>History is saved in this browser.</p>
          </div>
          <button type="button" onClick={() => setConfirmClear(true)} disabled={historyEntries.length === 0}>Clear history</button>
        </div>
        {!historyState.available && <p className="converter-storage-note">Browser storage is unavailable. History will last only until you leave this page.</p>}
        {historyStatus && <p role="status" className="converter-history-status">{historyStatus}</p>}
        {historyEntries.length === 0 ? <p className="converter-history-empty">No recent conversions yet</p> :
          <ol className="converter-history-list">
            {historyEntries.map((entry) => <li key={entry.id} className="converter-history-row">
              <div className="converter-history-main">
                <span className="converter-history-category">{entry.category}</span>
                <span className="converter-history-values" title={`${historySourceLabel(entry)} to ${historyResultLabel(entry)}`}>
                  <strong>{historySourceLabel(entry)}</strong><span aria-hidden="true">→</span><strong>{historyResultLabel(entry)}</strong>
                </span>
                <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time>
              </div>
              <button type="button" className="converter-history-delete" title="Delete conversion" aria-label={`Delete conversion ${historySourceLabel(entry)} to ${historyResultLabel(entry)}`} onClick={() => deleteHistoryEntry(entry.id)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v6m4-6v6" /></svg>
              </button>
            </li>)}
          </ol>}
      </section>
      {confirmClear && <ConfirmDialog title="Clear conversion history?" message="This removes all recent conversions saved for your account in this browser." confirmLabel="Clear history" onCancel={() => setConfirmClear(false)} onConfirm={clearHistory} />}
    </div>
  );
}
