const TYPE_LABEL = {
  office: "Büro",
  on_the_way: "Weg",
  after_office: "Danach",
  homeoffice: "Homeoffice",
  sickness: "Krankheit",
  free: "Freizeit",
  lunch: "Mittag",
};

export class FileCompareForm extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <form class="panel" novalidate>
        <div class="files">
          <div class="file-field">
            <label for="office">Büro-PDF (Key)</label>
            <input id="office" name="office" type="file" accept=".pdf,application/pdf" required />
          </div>
          <div class="file-field">
            <label for="crewmeister">Crewmeister (xlsx)</label>
            <input id="crewmeister" name="crewmeister" type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
          </div>
        </div>
        <div class="actions">
          <button type="submit">Abgleichen</button>
          <p class="muted">Dateien bleiben auf diesem Rechner.</p>
        </div>
        <p class="error" hidden></p>
      </form>
    `;
    this.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      this.#submit();
    });
  }

  async #submit() {
    const button = this.querySelector("button");
    const error = this.querySelector(".error");
    error.hidden = true;
    button.disabled = true;
    try {
      const body = new FormData(this.querySelector("form"));
      const response = await fetch("/api/compare", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Vergleich fehlgeschlagen.");
      this.dispatchEvent(new CustomEvent("compare-result", { detail: payload, bubbles: true }));
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  }
}

customElements.define("file-compare-form", FileCompareForm);

function duration(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return "—";
  const rounded = Math.round(minutes);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

function clock(minutes) {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

function chips(intervals, empty = "—") {
  if (!intervals?.length) return empty;
  return `<div class="chips">${intervals
    .map((interval) => {
      const label = TYPE_LABEL[interval.type] || interval.type;
      return `<span class="chip ${interval.type}">${clock(interval.start)}–${clock(interval.end)} ${label}</span>`;
    })
    .join("")}</div>`;
}

function crewLabel(day) {
  if (!day.crew) return '<span class="muted">—</span>';
  const bits = [];
  if (day.crew.intervals?.length) bits.push(chips(day.crew.intervals.map((i) => ({ ...i, type: "homeoffice" }))));
  const extra = [day.crew.comment, day.crew.absence].filter(Boolean).join(" · ");
  if (extra) bits.push(`<div class="muted">${extra}</div>`);
  if (!bits.length && day.crew.istMinutes) bits.push(duration(day.crew.istMinutes));
  return bits.join("") || "—";
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[;"\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function pauseLabel(day) {
  const lunch = (day.lunchIntervals || [])
    .map((interval) => `${clock(interval.start)}–${clock(interval.end)}`)
    .join(", ");
  if (lunch && day.pauseSplit) {
    return `Mittag ${lunch} · Morgen ${day.pauseSplit.morningFree} Min · Abend ${day.pauseSplit.eveningFree} Min`;
  }
  if (day.pauseSplit) {
    return `Morgen ${day.pauseSplit.morningFree} / Abend ${day.pauseSplit.eveningFree} Min`;
  }
  return "—";
}

function toCsv(result) {
  const header = [
    "Datum",
    "WT",
    "Büro",
    "Büro Ist",
    "Crewmeister",
    "Crew Ist",
    "Kommentar",
    "Abgleich",
    "Abgleich Ist",
    "Büro Soll",
    "Pause",
    "Hinweis",
  ];
  const rows = result.days.map((day) => {
    const office = (day.office?.intervals || []).map((i) => `${clock(i.start)}-${clock(i.end)}`).join(" ");
    const crew = (day.crew?.intervals || []).map((i) => `${clock(i.start)}-${clock(i.end)}`).join(" ");
    const reconciled = (day.reconciledIntervals || [])
      .map((i) => `${clock(i.start)}-${clock(i.end)} ${TYPE_LABEL[i.type] || i.type}`)
      .join(" | ");
    const pause = pauseLabel(day);
    return [
      day.date,
      day.weekday,
      office,
      duration(day.office?.istMinutes),
      crew,
      duration(day.crew?.istMinutes),
      [day.crew?.comment, day.crew?.absence].filter(Boolean).join(" "),
      reconciled,
      duration(day.reconciledIstMinutes),
      duration(day.officeSollMinutes),
      pause,
      day.note,
    ].map(csvEscape).join(";");
  });
  return [header.join(";"), ...rows].join("\n");
}

function downloadBlob(data, filename, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function hrPanel(hr) {
  if (!hr?.rows?.length) return "";
  const body = hr.rows
    .map((row) => {
      const mark = row.needsBooking ? "needs" : "";
      return `<tr class="${mark}">
        <td>${row.date}<div class="muted">${row.weekday}</div></td>
        <td class="kg">${row.k1 || "—"}</td>
        <td class="kg">${row.g1 || "—"}</td>
        <td class="kg">${row.k2 || "—"}</td>
        <td class="kg">${row.g2 || "—"}</td>
        <td>${row.ist || "—"}</td>
        <td>${row.soll || "—"}</td>
        <td>${row.extraText || "—"}</td>
        <td>${row.instruction}</td>
      </tr>`;
    })
    .join("");
  return `
    <section class="panel hr-panel">
      <h2>Für die Personalabteilung</h2>
      <p class="lede">${hr.legend}</p>
      <div class="summary">
        <div><span>Büro-Tage unverändert</span><strong>${hr.unchanged}</strong></div>
        <div><span>Nachbuchungen</span><strong>${hr.toBook}</strong></div>
      </div>
      <div class="actions">
        <button type="button" data-hr-xlsx>Excel für Personal</button>
        <button class="ghost" type="button" data-hr-print>Drucken / PDF</button>
      </div>
      <div class="table-wrap">
        <table class="hr-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>K</th>
              <th>G</th>
              <th>K</th>
              <th>G</th>
              <th>Istzeit</th>
              <th>Sollzeit</th>
              <th>Zusätzlich buchen</th>
              <th>Anweisung</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>
  `;
}

function printHr(hr) {
  const table = hrPanel(hr);
  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Buchungen für Personal</title>
  <link rel="stylesheet" href="/styles.css" />
  <style>
    body { background: #fff; padding: 1.2cm; }
    .actions, file-compare-form, .masthead { display: none !important; }
    .panel { box-shadow: none; border: 0; padding: 0; margin: 0; }
    .table-wrap { overflow: visible; border: 0; }
    th { position: static; }
    @page { size: A4 landscape; margin: 12mm; }
  </style>
</head>
<body>
  <p class="kicker">Personalabteilung</p>
  <h1>Arbeitszeiten</h1>
  ${table}
</body>
</html>`;
  const popup = window.open("", "_blank");
  if (!popup) {
    alert("Bitte Pop-ups erlauben, um zu drucken.");
    return;
  }
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  popup.addEventListener("load", () => popup.print());
}

export class TimeResultTable extends HTMLElement {
  #result = null;

  set result(value) {
    this.#result = value;
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  render() {
    if (!this.#result) {
      this.innerHTML = `<p class="empty">Noch kein Vergleich. PDF und Excel oben wählen.</p>`;
      return;
    }

    const totals = this.#result.totals;
    const rows = this.#result.days
      .map((day) => {
        const pause = pauseLabel(day);
        const warnClass = day.warnings?.length ? " warn" : "";
        return `<tr>
          <td>${day.date}<div class="muted">${day.weekday}</div></td>
          <td>${chips(day.office?.intervals, '<span class="muted">keine Stempel</span>')}${
            day.office?.intervals?.length ? '<div class="locked">unverändert</div>' : ""
          }<div>Ist ${duration(day.office?.istMinutes)}</div></td>
          <td>${crewLabel(day)}<div>Ist ${duration(day.crew?.istMinutes)}</div></td>
          <td>${chips(day.reconciledIntervals)}<div><strong>${duration(day.reconciledIstMinutes)}</strong> / Soll ${duration(day.officeSollMinutes)}</div></td>
          <td>${pause}</td>
          <td class="note${warnClass}">${day.note}</td>
        </tr>`;
      })
      .join("");

    this.innerHTML = `
      <section class="panel">
        <div class="summary">
          <div><span>Büro Ist</span><strong>${duration(totals.officeIst)}</strong></div>
          <div><span>Crewmeister Ist</span><strong>${duration(totals.crewIst)}</strong></div>
          <div><span>Abgleich Ist</span><strong>${duration(totals.reconciledIst)}</strong></div>
          <div><span>Büro Soll</span><strong>${duration(totals.officeSoll)}</strong></div>
        </div>
        <div class="actions">
          <button class="ghost" type="button" data-csv>Internes CSV</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Büro</th>
                <th>Crewmeister</th>
                <th>Abgleich</th>
                <th>Pause</th>
                <th>Hinweis</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
      ${hrPanel(this.#result.hr)}
    `;
    this.querySelector("[data-csv]").addEventListener("click", () => {
      downloadBlob(toCsv(this.#result), "zeitabgleich.csv", "text/csv;charset=utf-8");
    });
    this.querySelector("[data-hr-xlsx]")?.addEventListener("click", () => this.#downloadHrXlsx());
    this.querySelector("[data-hr-print]")?.addEventListener("click", () => printHr(this.#result.hr));
  }

  async #downloadHrXlsx() {
    const button = this.querySelector("[data-hr-xlsx]");
    button.disabled = true;
    try {
      const response = await fetch("/api/hr.xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hr: this.#result.hr }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Excel-Export fehlgeschlagen.");
      }
      downloadBlob(await response.blob(), "Personal_Buchungen.xlsx", response.headers.get("Content-Type"));
    } catch (error) {
      alert(error.message);
    } finally {
      button.disabled = false;
    }
  }
}

customElements.define("time-result-table", TimeResultTable);
