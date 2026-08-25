import ExcelJS from "exceljs";

export async function hrToXlsxBuffer(hr) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Zeitabgleich";
  const sheet = workbook.addWorksheet("Personal", {
    views: [{ state: "frozen", ySplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, paperSize: 9 },
  });

  sheet.mergeCells("A1:M1");
  sheet.getCell("A1").value = hr.title;
  sheet.getCell("A1").font = { bold: true, size: 14, name: "Calibri" };

  sheet.mergeCells("A2:M2");
  sheet.getCell("A2").value = hr.legend;
  sheet.getCell("A2").font = { italic: true, size: 11, name: "Calibri", color: { argb: "FF5C564C" } };
  sheet.getCell("A2").alignment = { wrapText: true, vertical: "middle" };
  sheet.getRow(2).height = 32;

  const headers = [
    "Datum",
    "WT",
    "K",
    "G",
    "K",
    "G",
    "Istzeit",
    "Sollzeit",
    "Art",
    "Zusatzzeit",
    "Pausezeit",
    "Zusätzlich buchen",
    "Anweisung",
  ];
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true, name: "Calibri", size: 11 };
  headerRow.alignment = { vertical: "middle" };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3E3DB" } };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFD9D0C3" } },
    };
  });

  for (const row of hr.rows) {
    const added = sheet.addRow([
      row.date,
      row.weekday,
      row.k1,
      row.g1,
      row.k2,
      row.g2,
      row.ist,
      row.soll,
      row.extraKind,
      row.extraDuration,
      row.pauseDuration,
      row.extraText,
      row.instruction,
    ]);
    added.font = { name: "Calibri", size: 11 };
    added.alignment = { vertical: "middle", wrapText: true };
    added.height = Math.max(28, 18 * (1 + (String(row.extraText || "").match(/\n/g) || []).length));
    for (const col of [3, 4, 5, 6]) {
      added.getCell(col).font = { name: "Calibri", size: 11, bold: true };
    }
    if (row.needsBooking) {
      added.getCell(9).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCEEE9" } };
      added.getCell(10).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCEEE9" } };
      added.getCell(12).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCEEE9" } };
      added.getCell(10).font = { name: "Calibri", size: 11, bold: true };
    }
  }

  sheet.columns = [
    { width: 14 },
    { width: 6 },
    { width: 8 },
    { width: 8 },
    { width: 8 },
    { width: 8 },
    { width: 10 },
    { width: 10 },
    { width: 22 },
    { width: 12 },
    { width: 12 },
    { width: 42 },
    { width: 55 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
