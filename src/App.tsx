import React, { useMemo, useState, useEffect } from "react";

// 50%-Aufteilungs-Tracker — single-file React app with Light/Dark toggle
// Features
// - Hinzufügen eines Eintrags mit: Name (Firma), Betrag, Monat, Jahr, Zahlungsart
// - Berechnet automatisch 50 % (nur bei positiven Beträgen)
// - Anzeige nach Jahr → Monat gruppiert
// - Filter nach Jahr/Monat + Suche nach Name
// - Persistenz via localStorage
// - CSV-Export
// - Light/Dark Theme Toggle (persistiert)

const months = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

// Vordefinierte Namensauswahl inkl. "Benutzerdefiniert"
const NAME_OPTIONS = [
  "TIKTOK uswr.bello",
  "TIKTOK eltheodoro0clips",
  "TIKTOK bachelorbby0",
  "Epic Games",
  "Theo Cutten",
  "Finanzamt",
  "Benutzerdefiniert",
];

const PAYMENT_OPTIONS = ["Bank", "PayPal"];

function paymentBadgeClass(payment, dark) {
  if (payment === "PayPal") return dark
    ? "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-900/30 text-blue-300"
    : "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700";
  if (payment === "Bank") return dark
    ? "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-300"
    : "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700";
  return dark
    ? "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-800 text-gray-300"
    : "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700";
}

function formatCurrency(value) {
  if (Number.isNaN(value) || value == null) return "-";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format(value);
}

function amountClass(value) {
  if (value > 0) return "text-green-600 font-medium";
  if (value < 0) return "text-red-600 font-medium";
  return "text-gray-500 font-medium";
}

// Pure functions for logic & testing
export function computeHalf(n) {
  if (typeof n !== "number") return 0;
  if (Number.isNaN(n) || n <= 0) return 0; // Only for positive amounts
  return n * 0.5;
}

export function computeTotals(arr) {
  if (!Array.isArray(arr)) return { sumAmount: 0, sumHalf: 0 };
  return arr.reduce((acc, e) => {
    const amt = typeof e.amount === "number" && !Number.isNaN(e.amount) ? e.amount : 0;
    const half = typeof e.half === "number" && !Number.isNaN(e.half) ? e.half : 0;
    acc.sumAmount += amt;
    acc.sumHalf += half;
    return acc;
  }, { sumAmount: 0, sumHalf: 0 });
}

// New rule helper: negatives subtract from the 50% pool (Steuern). Raw pot can go negative.
export function computePot(arr) {
  if (!Array.isArray(arr)) return { halfFromPositives: 0, negativeOffset: 0, potAfter: 0 };
  let halfFromPositives = 0;
  let negativeOffset = 0; // sum of negative amounts (≤ 0)
  for (const e of arr) {
    const amt = typeof e.amount === "number" && !Number.isNaN(e.amount) ? e.amount : 0;
    const half = typeof e.half === "number" && !Number.isNaN(e.half) ? e.half : 0;
    if (amt > 0) halfFromPositives += half; // only positives contribute to pot
    if (amt < 0) negativeOffset += amt;      // negatives reduce the pot
  }
  const potAfter = halfFromPositives + negativeOffset; // raw (can be < 0)
  return { halfFromPositives, negativeOffset, potAfter };
}

// Clamp tax balance: never below zero (paid taxes set balance to 0, increases only with new income)
export function clampTaxBalance(halfFromPositives, negativeOffset) {
  const raw = (Number(halfFromPositives) || 0) + (Number(negativeOffset) || 0);
  return Math.max(raw, 0);
}

// --------------------------
// CSV helpers (TOP-LEVEL)
// --------------------------
export function buildCSV(headers, rows) {
  const safe = (cell) => `"${String(cell).replace(/"/g, '""')}"`;
  return [headers, ...rows].map(r => r.map(safe).join(",")).join("\\n");
}

const STORAGE_KEY = "split-tracker-eintraege-v1"; // ASCII key to avoid encoding issues
const THEME_KEY = "split-tracker-theme";

export default function App() {
  const now = new Date();
  const [name, setName] = useState("");
  const [nameOption, setNameOption] = useState(NAME_OPTIONS[0]);
  const [payment, setPayment] = useState("Bank");
  const [amountInput, setAmountInput] = useState("");
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const [Eintraege, setEntries] = useState([]);
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [search, setSearch] = useState("");
  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNameOption, setEditNameOption] = useState(NAME_OPTIONS[0]);
  const [editPayment, setEditPayment] = useState("Bank");
  const [editAmountInput, setEditAmountInput] = useState("");
  const [editMonth, setEditMonth] = useState(now.getMonth());
  const [editYear, setEditYear] = useState(now.getFullYear());
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) === "dark"; } catch { return false; }
  });

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try { setEntries(JSON.parse(raw)); } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Eintraege));
  }, [Eintraege]);

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, dark ? "dark" : "light"); } catch {}
  }, [dark]);

  const ui = useMemo(() => {
    if (dark) {
      return {
        app: "min-h-screen bg-gray-900 text-gray-100 p-4 md:p-8",
        card: "bg-gray-800 rounded-2xl shadow-sm p-4 md:p-6 mb-6",
        muted: "text-gray-400",
        strongMuted: "text-gray-300",
        border: "border-gray-600",
        input: "w-full rounded-xl border border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-200 bg-gray-900 text-gray-100 placeholder-gray-400",
        select: "w-full rounded-xl border border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-200 bg-gray-900 text-gray-100",
        btn: "inline-flex justify-center items-center rounded-2xl border border-gray-600 px-3 py-1.5 md:px-4 md:py-2 font-medium hover:bg-gray-700",
        btnPrimary: "inline-flex justify-center items-center rounded-2xl bg-black text-white px-4 py-2 font-medium hover:opacity-90 active:opacity-80",
        btnDanger: "inline-flex justify-center items-center rounded-2xl border border-red-500 text-red-300 px-4 py-2 font-medium hover:bg-red-900/20",
        tableHead: "text-left text-gray-300",
        tableRowBorder: "border-t border-gray-700",
        orangePill: "text-sm mt-1 font-medium inline-flex rounded-full px-3 py-1 bg-orange-900/30 text-orange-300",
      };
    }
    return {
      app: "min-h-screen bg-gray-50 text-gray-900 p-4 md:p-8",
      card: "bg-white rounded-2xl shadow-sm p-4 md:p-6 mb-6",
      muted: "text-gray-500",
      strongMuted: "text-gray-600",
      border: "border-gray-300",
      input: "w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black",
      select: "w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black",
      btn: "inline-flex justify-center items-center rounded-2xl border border-gray-300 px-3 py-1.5 md:px-4 md:py-2 font-medium hover:bg-gray-100",
      btnPrimary: "inline-flex justify-center items-center rounded-2xl bg-black text-white px-4 py-2 font-medium hover:opacity-90 active:opacity-80",
      btnDanger: "inline-flex justify-center items-center rounded-2xl border border-red-300 text-red-700 px-4 py-2 font-medium hover:bg-red-50",
      tableHead: "text-left text-gray-500",
      tableRowBorder: "border-t",
      orangePill: "text-sm mt-1 font-medium inline-flex rounded-full px-3 py-1 bg-orange-100 text-orange-600",
    };
  }, [dark]);

  // Live preview of 50% (positive only)
  const half = useMemo(() => {
    const normalized = amountInput.replace(/,/g, ".");
    const n = parseFloat(normalized);
    return computeHalf(n);
  }, [amountInput]);

  function addEntry(e) {
    e.preventDefault();
    const normalized = amountInput.replace(/,/g, ".");
    const amt = parseFloat(normalized);
    if ((nameOption === "Benutzerdefiniert" && !name.trim()) || Number.isNaN(amt)) return;

    const finalName = nameOption === "Benutzerdefiniert" ? name.trim() : nameOption;
    const entry = {
      id: (crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
      name: finalName,
      amount: amt,
      half: computeHalf(amt),
      month,
      year,
      payment,
      createdAt: new Date().toISOString(),
    };
    setEntries(prev => [entry, ...prev]);
    setName("");
    setNameOption(NAME_OPTIONS[0]);
    setPayment("Bank");
    setAmountInput("");
    setMonth(now.getMonth());
    setYear(now.getFullYear());
  }

  function deleteEntry(id) {
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  // ------- Edit helpers -------
  function startEdit(entry) {
    setEditingId(entry.id);
    // map to NAME_OPTIONS if exact match, else Benutzerdefiniert + editName
    if (NAME_OPTIONS.includes(entry.name)) {
      setEditNameOption(entry.name);
      setEditName("");
    } else {
      setEditNameOption("Benutzerdefiniert");
      setEditName(entry.name);
    }
    setEditPayment(entry.payment || "Bank");
    setEditAmountInput(String(entry.amount).replace(".", ","));
    setEditMonth(entry.month);
    setEditYear(entry.year);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditNameOption(NAME_OPTIONS[0]);
    setEditPayment("Bank");
    setEditAmountInput("");
    setEditMonth(now.getMonth());
    setEditYear(now.getFullYear());
  }

  function saveEdit(e) {
    e.preventDefault();
    if (!editingId) return;
    const normalized = editAmountInput.replace(/,/g, ".");
    const amt = parseFloat(normalized);
    if ((editNameOption === "Benutzerdefiniert" && !editName.trim()) || Number.isNaN(amt)) return;
    const finalName = editNameOption === "Benutzerdefiniert" ? editName.trim() : editNameOption;

    setEntries(prev => prev.map(it => {
      if (it.id !== editingId) return it;
      return {
        ...it,
        name: finalName,
        amount: amt,
        half: computeHalf(amt),
        month: editMonth,
        year: editYear,
        payment: editPayment,
        // keep createdAt as original
      };
    }));
    cancelEdit();
  }

  const filtered = useMemo(() => {
    const list = Eintraege.filter(e => {
      const okYear = filterYear === "all" || e.year === Number(filterYear);
      const okMonth = filterMonth === "all" || e.month === Number(filterMonth);
      const okSearch = !search.trim() || e.name.toLowerCase().includes(search.toLowerCase());
      return okYear && okMonth && okSearch;
    });
    return list.sort((a,b) => {
      // Year desc, Month desc, createdAt desc
      if (b.year !== a.year) return b.year - a.year;
      if (b.month !== a.month) return b.month - a.month;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [Eintraege, filterMonth, filterYear, search]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const e of filtered) {
      const key = `${e.year}-${e.month}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    // Sort keys Year desc then Month desc
    const keys = Array.from(map.keys()).sort((k1, k2) => {
      const [y1, m1] = k1.split("-").map(Number);
      const [y2, m2] = k2.split("-").map(Number);
      if (y2 !== y1) return y2 - y1;
      return m2 - m1;
    });
    return keys.map(key => ({ key, list: map.get(key) }));
  }, [filtered]);

  const yearsAvailable = useMemo(() => {
    const s = new Set(Eintraege.map(e => e.year));
    return Array.from(s).sort((a,b) => b - a);
  }, [Eintraege]);

  // Global totals (all entries)
  const totalsAll = useMemo(() => computeTotals(Eintraege), [Eintraege]);
  const potAll = useMemo(() => computePot(Eintraege), [Eintraege]);
  const sumNegAll = useMemo(() => Eintraege.reduce((s,e) => s + (e.amount < 0 ? e.amount : 0), 0), [Eintraege]);
  const taxBalanceAll = useMemo(() => clampTaxBalance(potAll.halfFromPositives, potAll.negativeOffset), [potAll]);

  function exportCSV() {
    try {
      const header = ["Name","Amount EUR","50% EUR","Month","Year","Zahlungsart","CreatedAt"];  
      const rows = Eintraege.map(e => [
        e.name,
        // keep simple EU-style decimal comma for human readability
        typeof e.amount === 'number' ? String(e.amount).replace(".", ",") : String(e.amount),
        typeof e.half === 'number' ? String(e.half).replace(".", ",") : String(e.half),
        months[e.month],
        e.year,
        e.payment,
        e.createdAt,
      ]);

      const csv = buildCSV(header, rows);
      const blob = new Blob(["\\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "split-tracker.csv";
      a.style.display = "none";
      document.body.appendChild(a); // required for some browsers (Safari/iOS)
      a.click();
      // Cleanup after a tick for Safari
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
    } catch (err) {
      console.error("CSV export failed:", err);
    }
  }

  return (
    <div className={ui.app}>
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">50%-Aufteilungs-Tracker</h1>
            <p className={`text-sm mt-1 ${ui.strongMuted}`}>Gib einen Betrag und eine Quelle ein. Die App speichert sowohl den ursprünglichen Betrag als auch 50 % (nur bei positiven Beträgen) und gruppiert sie nach Monat und Jahr.</p>
          </div>
          <button
            onClick={() => setDark(v => !v)}
            className={ui.btn}
            aria-label="Theme umschalten"
            title={dark ? "Auf hell umschalten" : "Auf dunkel umschalten"}
          >
            {dark ? "☀️ Hell" : "🌙 Dunkel"}
          </button>
        </header>

        {/* Global Totals Summary */}
        <div className={ui.card.replace(" mb-6", "") + " mb-6"}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className={`text-xs uppercase tracking-wide ${ui.muted}`}>Alle Einträge (Gesamt)</div>
              <div className="text-sm mt-1">Gesamtbetrag (inkl. Negative): <span className={amountClass(totalsAll.sumAmount)}>{formatCurrency(totalsAll.sumAmount)}</span></div>
              <div className="text-sm mt-1 font-medium">Steuern (Bestand): <span className={amountClass(taxBalanceAll)}>{formatCurrency(taxBalanceAll)}</span></div>
            </div>
            <div className="md:text-right">
              <div className={`text-xs uppercase tracking-wide ${ui.muted}`}>Summe Negativbeträge</div>
              <div className={ui.orangePill}>{formatCurrency(sumNegAll)}</div>
            </div>
          </div>
        </div>

        {/* Edit Panel (appears when editing) */}
        {editingId && (
          <div className={ui.card}>
            <form onSubmit={saveEdit} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Vorgabe-Name (Bearbeiten)</label>
                <select className={ui.select} value={editNameOption} onChange={(e)=>setEditNameOption(e.target.value)}>
                  {NAME_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                {editNameOption === "Benutzerdefiniert" && (
                  <div className="mt-2">
                    <label className={`block text-xs mb-1 ${ui.muted}`}>Eigener Name / Firma</label>
                    <input className={ui.input} value={editName} onChange={(e)=>setEditName(e.target.value)} />
                  </div>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Betrag (EUR)</label>
                <input className={ui.input} inputMode="decimal" value={editAmountInput} onChange={(e)=>setEditAmountInput(e.target.value)} />
                <p className={`text-xs mt-1 ${ui.muted}`}>50 % = <span className={amountClass(computeHalf(parseFloat(editAmountInput.replace(/,/g, "."))))}>{formatCurrency(computeHalf(parseFloat(editAmountInput.replace(/,/g, "."))))}</span></p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Zahlungsart</label>
                <select className={ui.select} value={editPayment} onChange={(e)=>setEditPayment(e.target.value)}>
                  {PAYMENT_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <div className={`text-xs mt-1 ${ui.muted}`}>Vorschau: <span className={paymentBadgeClass(editPayment, dark)}>{editPayment}</span></div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Monat</label>
                <select className={ui.select} value={editMonth} onChange={(e)=>setEditMonth(Number(e.target.value))}>
                  {months.map((m,i)=>(<option key={m} value={i}>{m}</option>))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Jahr</label>
                <input type="number" className={ui.input} value={editYear} onChange={(e)=>setEditYear(Number(e.target.value))} />
              </div>

              <div className="flex gap-2">
                <button type="submit" className={ui.btnPrimary}>Speichern</button>
                <button type="button" onClick={cancelEdit} className={ui.btn}>Abbrechen</button>
              </div>
            </form>
          </div>
        )}

        {/* Input Card */}
        <div className={ui.card}>
          <form onSubmit={addEntry} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Vorgabe-Name</label>
              <select
                className={ui.select}
                value={nameOption}
                onChange={(e) => setNameOption(e.target.value)}
              >
                {NAME_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              {nameOption === "Benutzerdefiniert" && (
                <div className="mt-2">
                  <label className={`block text-xs mb-1 ${ui.muted}`}>Eigener Name / Firma</label>
                  <input
                    className={ui.input}
                    placeholder="z. B., ACME GmbH"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Betrag (EUR)</label>
              <input
                className={ui.input}
                placeholder="z. B., 199,99"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
              <p className={`text-xs mt-1 ${ui.muted}`}>50 % = <span className={amountClass(half)}>{formatCurrency(half)}</span></p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Zahlungsart</label>
              <select
                className={ui.select}
                value={payment}
                onChange={(e) => setPayment(e.target.value)}
              >
                {PAYMENT_OPTIONS.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <div className={`text-xs mt-1 ${ui.muted}`}>Vorschau: <span className={paymentBadgeClass(payment, dark)}>{payment}</span></div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Monat</label>
              <select
                className={ui.select}
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {months.map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Jahr</label>
              <input
                type="number"
                className={ui.input}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                min={2000}
                max={9999}
              />
            </div>

            <button type="submit" className={ui.btnPrimary}>Hinzufügen</button>
          </form>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between mb-4">
          <div className="flex gap-2">
            <select
              className={ui.select}
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
            >
              <option value="all">Alle Jahre</option>
              {yearsAvailable.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select
              className={ui.select}
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
            >
              <option value="all">Alle Monate</option>
              {months.map((m, i) => (
                <option key={m} value={i}>{m}</option>
              ))}
            </select>
            <input
              className={ui.input}
              placeholder="Name suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <button onClick={exportCSV} className={ui.btn}>CSV exportieren</button>
            <button onClick={() => setEntries([])} className={ui.btnDanger}>Alle löschen</button>
          </div>
        </div>

        {/* Grouped Lists */}
        {grouped.length === 0 ? (
          <p className={ui.muted}>Noch keine Einträge. Füge oben deinen ersten Eintrag hinzu.</p>
        ) : (
          <div className="space-y-5">
            {grouped.map(({ key, list }) => {
              const [y, m] = key.split("-").map(Number);
              return (
                <section key={key} className={ui.card}>
                  <div className="flex items-baseline justify-between mb-3">
                    <h2 className="text-lg font-semibold">{months[m]} {y}</h2>
                    <div className={`${ui.muted} text-sm`}>{list.length} Einträge</div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className={ui.tableHead}>
                          <th className="py-2 pr-3 font-normal">Name</th>
                          <th className="py-2 pr-3 font-normal">Betrag</th>
                          <th className="py-2 pr-3 font-normal">50 %</th>
                          <th className="py-2 pr-3 font-normal">Hinzugefügt</th>
                          <th className="py-2 font-normal">Aktion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map(e => (
                          <tr key={e.id} className={ui.tableRowBorder}>
                            <td className="py-2 pr-3 font-medium flex items-center gap-2">{e.name} <span className={paymentBadgeClass(e.payment, dark)}>{e.payment}</span></td>
                            <td className="py-2 pr-3"><span className={amountClass(e.amount)}>{formatCurrency(e.amount)}</span></td>
                            <td className="py-2 pr-3"><span className={amountClass(e.half)}>{formatCurrency(e.half)}</span></td>
                            <td className="py-2 pr-3">{new Date(e.createdAt).toLocaleString()}</td>
                            <td className="py-2">
                              <div className="flex gap-2">
                              <button onClick={() => startEdit(e)} className={ui.btn}>Bearbeiten</button>
                              <button onClick={() => deleteEntry(e.id)} className={ui.btnDanger}>Löschen</button>
                            </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <footer className={`mt-10 text-center text-xs ${ui.muted}`}>
          Erstellt für Roshan — schnelle 50 %‑Aufteilung mit monatlicher/jährlicher Gruppierung
        </footer>
      </div>
    </div>
  );
}

// --------------------------
// Lightweight runtime tests
// --------------------------
(function runTests() {
  try {
    console.assert(computeHalf(100) === 50, "computeHalf positive");
    console.assert(computeHalf(0) === 0, "computeHalf zero → 0");
    console.assert(computeHalf(-100) === 0, "computeHalf negative → 0");
    console.assert(computeHalf(Number.NaN) === 0, "computeHalf NaN → 0");
    // Totals tests
    const sampleEntries = [
      { amount: 100, half: 50 },
      { amount: -20, half: 0 },
      { amount: 0, half: 0 },
    ];
    const t = computeTotals(sampleEntries);
    console.assert(t.sumAmount === 80, "totals amount should sum to 80");
    console.assert(t.sumHalf === 50, "totals half should sum to 50");

    // Extra tests
    const t2 = computeTotals([{ amount: NaN, half: NaN }, { amount: 10, half: 5 }]);
    console.assert(t2.sumAmount === 10 && t2.sumHalf === 5, "totals should ignore NaN");
    console.assert(computeHalf(199.99) === 99.995, "computeHalf precise decimal");

    // Pot rule tests: negatives reduce the 50% pool; raw pool can go negative
    const pot1 = computePot([
      { amount: 100, half: 50 }, // +50
      { amount: -30, half: 0 },  // -30
      { amount: 50, half: 25 },  // +25
    ]);
    console.assert(pot1.halfFromPositives === 75, "pot positives should be 75");
    console.assert(pot1.negativeOffset === -30, "pot negatives should be -30");
    console.assert(pot1.potAfter === 45, "pot after should be 45");

    const pot2 = computePot([
      { amount: 50, half: 25 },
      { amount: -40, half: 0 },
      { amount: -20, half: 0 },
    ]);
    console.assert(pot2.halfFromPositives === 25, "pot positives 25");
    console.assert(pot2.negativeOffset === -60, "pot negatives -60");
    console.assert(pot2.potAfter === -35, "pot after can go negative (-35)");

    // Clamp test: balance never below zero
    console.assert(clampTaxBalance(10, -50) === 0, "clamp to 0 when negative");
    console.assert(clampTaxBalance(100, -40) === 60, "clamp preserves positive");

    // CSV builder tests
    const headers = ["A","B"]; const rows = [["x","y"],["a, b","c\"d"]];
    const csvText = buildCSV(headers, rows);
    console.assert(csvText.startsWith('"A","B"\\n'), "csv headers correct");
    console.assert(csvText.includes('\\n"a, b","c""d"'), "csv escaping and commas correct");
  } catch (e) {
    console.error("Tests failed:", e);
  }
})();
