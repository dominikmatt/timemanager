const TYPE_LABEL = {
  office: "Büro",
  on_the_way: "Auswärts",
  after_office: "Auswärts",
  homeoffice: "Homeoffice",
  sickness: "Krankheit",
  vacation: "Urlaub",
  compensation: "Freizeitausgleich",
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
            <label for="crewmeister">Crewmeister 1. Monat</label>
            <input id="crewmeister" name="crewmeister" type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
          </div>
          <div class="file-field">
            <label for="crewmeister2">Crewmeister 2. Monat</label>
            <input id="crewmeister2" name="crewmeister" type="file" multiple accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
          </div>
        </div>
        <div class="actions">
          <button type="submit">Abgleichen</button>
          <p class="muted">Beide Monats-Exporte wählen. Alle Tage dazwischen werden berechnet, auch Wochenenden.</p>
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
      const form = this.querySelector("form");
      const office = form.office.files[0];
      const crewFiles = [...form.querySelectorAll('input[name="crewmeister"]')].flatMap(
        (input) => [...input.files],
      );
      if (!office) throw new Error("Bitte das Büro-PDF hochladen.");
      if (!crewFiles.length) throw new Error("Bitte mindestens eine Crewmeister-Datei wählen.");
      const body = new FormData();
      body.append("office", office);
      for (const file of crewFiles) body.append("crewmeister", file);
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

function signedDuration(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return "—";
  const rounded = Math.round(minutes);
  if (rounded === 0) return "0:00";
  const sign = rounded > 0 ? "+" : "-";
  const abs = Math.abs(rounded);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

function dayDiff(day) {
  if (day.diffMinutes != null) return day.diffMinutes;
  return (day.reconciledIstMinutes || 0) - (day.officeSollMinutes || 0);
}

function diffClass(minutes) {
  const rounded = Math.round(minutes || 0);
  if (rounded > 0) return "diff plus";
  if (rounded < 0) return "diff minus";
  return "diff";
}

function germanRange(range) {
  if (!range?.from) return "—";
  const fmt = (iso) => {
    const [year, month, day] = iso.split("-");
    return `${day}.${month}.${year}`;
  };
  return `${fmt(range.from)}–${fmt(range.to)}`;
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
      if (interval.start == null || interval.end == null) {
        return `<span class="chip ${interval.type}">${label}</span>`;
      }
      return `<span class="chip ${interval.type}">${clock(interval.start)}–${clock(interval.end)} ${label}</span>`;
    })
    .join("")}</div>`;
}

function absenceChip(day) {
  if (!["vacation", "compensation", "sickness"].includes(day.kind)) return "";
  if (day.reconciledIntervals?.length) return "";
  const label = day.absenceLabel || TYPE_LABEL[day.kind] || day.kind;
  const days = day.absenceDays != null ? ` ${day.absenceDays} Tag` : "";
  return `<div class="chips"><span class="chip ${day.kind}">${label}${days}</span></div>`;
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
  const parts = [];
  if (lunch) parts.push(`Mittag ${lunch}`);
  if (day.pauseSplit?.morningFree) parts.push(`Morgen ${day.pauseSplit.morningFree} Min`);
  if (day.pauseSplit?.eveningFree) parts.push(`Abend ${day.pauseSplit.eveningFree} Min`);
  return parts.join(" · ") || "—";
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
    "Differenz",
    "Pause",
    "Freizeit",
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
      signedDuration(dayDiff(day)),
      pause,
      duration(day.freeMinutes),
      day.note,
    ].map(csvEscape).join(";");
  });
  return [header.join(";"), ...rows].join("\n");
}

function dayHasStamps(day) {
  if (day.office?.intervals?.length || day.office?.punches?.length) return true;
  if (day.crew?.intervals?.length || day.crew?.istMinutes) return true;
  if (["vacation", "compensation", "sickness"].includes(day.kind)) return true;
  if (day.crew?.absence) return true;
  return false;
}

function sumTotals(days) {
  return days.reduce(
    (acc, day) => {
      acc.officeIst += day.office?.istMinutes || 0;
      acc.crewIst += day.crew?.istMinutes || 0;
      acc.reconciledIst += day.reconciledIstMinutes || 0;
      acc.officeSoll += day.officeSollMinutes || 0;
      acc.diff += dayDiff(day);
      acc.free += day.freeMinutes || 0;
      return acc;
    },
    { officeIst: 0, crewIst: 0, reconciledIst: 0, officeSoll: 0, diff: 0, free: 0 },
  );
}

function visibleResult(result, ignoreEmpty) {
  if (!ignoreEmpty) return result;
  const days = (result.days || []).filter(dayHasStamps);
  const isos = new Set(days.map((day) => day.iso));
  const hr = result.hr
    ? {
        ...result.hr,
        rows: (result.hr.rows || []).filter((row) => isos.has(row.iso)),
      }
    : result.hr;
  if (hr) {
    hr.toBook = hr.rows.filter((row) => row.needsBooking).length;
    hr.unchanged = hr.rows.filter((row) => row.hasOfficePunches).length;
  }
  return { ...result, days, totals: sumTotals(days), hr };
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
    .map((row, dayIndex) => {
      const lines = row.pairs?.length ? row.pairs : [{ kommen: "", gehen: "", label: "", extra: false }];
      const span = lines.length;
      const band = dayIndex % 2 === 1 ? " band" : "";
      const absenceOnly = row.absence && !row.pairs?.length ? " absence" : "";
      return lines
        .map((pair, index) => {
          const lead =
            index === 0
              ? `<td class="day" rowspan="${span}">${row.date}<div class="muted">${row.weekday}</div></td>
        <td class="abs" rowspan="${span}">${row.absence || "—"}</td>`
              : "";
          const tail =
            index === 0
              ? `<td class="num" rowspan="${span}">${row.ist || "—"}</td>
        <td class="num" rowspan="${span}">${row.soll || "—"}</td>
        <td class="num ${diffClass(row.puffMinutes ?? row.diffMinutes)}" rowspan="${span}">${row.puff || row.diff || "—"}</td>`
              : "";
          const mark = pair.extra ? " extra" : "";
          return `<tr class="${band}${absenceOnly}${mark}">
        ${lead}
        <td class="kg punch">${pair.kommen || "—"}</td>
        <td class="kg punch">${pair.gehen || "—"}</td>
        <td class="art">${pair.label || "—"}</td>
        ${tail}
      </tr>`;
        })
        .join("");
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
              <th>Abwesenheit</th>
              <th>Kommen</th>
              <th>Gehen</th>
              <th>Art</th>
              <th>IST</th>
              <th>SOLL</th>
              <th>Puff</th>
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
  #ignoreEmpty = true;

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

    const view = visibleResult(this.#result, this.#ignoreEmpty);
    const totals = view.totals;
    const diffTotal = totals.diff ?? (totals.reconciledIst || 0) - (totals.officeSoll || 0);
    const allDays = this.#result.days.length;
    const rows = view.days
      .map((day) => {
        const pause = pauseLabel(day);
        const warnClass = day.warnings?.length ? " warn" : "";
        return `<tr>
          <td>${day.date}<div class="muted">${day.weekday}</div></td>
          <td>${chips(day.office?.intervals, '<span class="muted">keine Stempel</span>')}${
            day.office?.intervals?.length ? '<div class="locked">unverändert</div>' : ""
          }<div>Ist ${duration(day.office?.istMinutes)}</div></td>
          <td>${crewLabel(day)}<div>Ist ${duration(day.crew?.istMinutes)}</div></td>
          <td>${absenceChip(day) || chips(day.reconciledIntervals)}<div><strong>${duration(day.reconciledIstMinutes)}</strong> / Soll ${duration(day.officeSollMinutes)}</div></td>
          <td class="${diffClass(dayDiff(day))}"><strong>${signedDuration(dayDiff(day))}</strong></td>
          <td>${pause}</td>
          <td><strong>${duration(day.freeMinutes)}</strong></td>
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
          <div><span>Differenz</span><strong class="${diffClass(diffTotal)}">${signedDuration(diffTotal)}</strong></div>
          <div><span>Freizeit</span><strong>${duration(totals.free)}</strong></div>
          <div><span>Crewmeister-Dateien</span><strong>${this.#result.crewFiles || 0}</strong></div>
          <div><span>Zeitraum</span><strong>${germanRange(this.#result.crewRange)} · ${view.days.length}${
            this.#ignoreEmpty && view.days.length !== allDays ? ` von ${allDays}` : ""
          } Tage</strong></div>
        </div>
        <div class="actions">
          <label class="toggle">
            <input type="checkbox" data-ignore-empty ${this.#ignoreEmpty ? "checked" : ""} />
            Tage ohne Stempelungen ignorieren
          </label>
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
                <th>Differenz</th>
                <th>Pause</th>
                <th>Freizeit</th>
                <th>Hinweis</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
      ${hrPanel(view.hr)}
    `;
    this.querySelector("[data-ignore-empty]")?.addEventListener("change", (event) => {
      this.#ignoreEmpty = event.target.checked;
      this.render();
    });
    this.querySelector("[data-csv]").addEventListener("click", () => {
      downloadBlob(toCsv(view), "zeitabgleich.csv", "text/csv;charset=utf-8");
    });
    this.querySelector("[data-hr-xlsx]")?.addEventListener("click", () => this.#downloadHrXlsx(view));
    this.querySelector("[data-hr-print]")?.addEventListener("click", () => printHr(view.hr));
  }

  async #downloadHrXlsx(view) {
    const button = this.querySelector("[data-hr-xlsx]");
    button.disabled = true;
    try {
      const response = await fetch("/api/hr.xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hr: view.hr }),
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
