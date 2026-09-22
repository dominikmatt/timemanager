import ExcelJS from "exceljs";

const GRID = "FFD5DDE5";
const GRID_STRONG = "FF5D6D7E";
const HEADER = "FF2C3E50";
const EXTRA = "FFD6EAF8";
const EXTRA_INK = "FF1A365D";
const BAND = "FFEEF2F5";
const ABSENCE = "FFFCF3CF";
const INK = "FF1C2833";
const MUTED = "FF7F8C8D";
const PUFF_PLUS = "FF196F3D";
const PUFF_MINUS = "FF922B21";

const COLUMNS = ["Datum", "WT", "Abwesenheit", "Kommen", "Gehen", "Art", "IST", "SOLL", "Puff"];

function paint(cell, { fill, font, align, strongBottom }) {
  cell.font = font;
  cell.alignment = align;
  if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  cell.border = {
    top: { style: "thin", color: { argb: GRID } },
    left: { style: "thin", color: { argb: GRID } },
    right: { style: "thin", color: { argb: GRID } },
    bottom: { style: strongBottom ? "medium" : "thin", color: { argb: strongBottom ? GRID_STRONG : GRID } },
  };
}

export async function hrToXlsxBuffer(hr) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Zeitabgleich";
  const sheet = workbook.addWorksheet("Buchungen", {
    views: [{ state: "frozen", ySplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, paperSize: 9 },
  });

  sheet.mergeCells("A1:I1");
  sheet.getCell("A1").value = hr.title || "Buchungen";
  sheet.getCell("A1").font = { bold: true, size: 16, name: "Calibri", color: { argb: INK } };
  sheet.getCell("A1").alignment = { vertical: "middle" };
  sheet.getRow(1).height = 24;

  sheet.mergeCells("A2:I2");
  sheet.getCell("A2").value = hr.legend;
  sheet.getCell("A2").font = { italic: true, size: 11, name: "Calibri", color: { argb: "FF5D6D7E" } };
  sheet.getCell("A2").alignment = { wrapText: true, vertical: "middle" };
  sheet.getRow(2).height = 36;

  const headerRow = sheet.getRow(3);
  headerRow.height = 22;
  COLUMNS.forEach((label, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = label;
    cell.font = { bold: true, name: "Calibri", size: 11, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER } };
    cell.border = {
      bottom: { style: "thin", color: { argb: HEADER } },
    };
  });

  let cursor = 4;
  for (const [dayIndex, row] of hr.rows.entries()) {
    const lines = row.pairs.length ? row.pairs : [{ kommen: "", gehen: "", label: "", extra: false }];
    const start = cursor;
    const band = dayIndex % 2 === 1;
    const absenceOnly = Boolean(row.absence) && row.pairs.length === 0;

    for (const pair of lines) {
      const excelRow = sheet.getRow(cursor);
      excelRow.height = 20;
      if (cursor === start) {
        excelRow.getCell(1).value = row.date;
        excelRow.getCell(2).value = row.weekday;
        excelRow.getCell(3).value = row.absence;
        excelRow.getCell(7).value = row.ist;
        excelRow.getCell(8).value = row.soll;
        excelRow.getCell(9).value = row.puff;
      }
      excelRow.getCell(4).value = pair.kommen;
      excelRow.getCell(5).value = pair.gehen;
      excelRow.getCell(6).value = pair.label;
      cursor += 1;
    }

    const end = cursor - 1;
    if (end > start) {
      for (const col of [1, 2, 3, 7, 8, 9]) sheet.mergeCells(start, col, end, col);
    }

    for (let rowNumber = start; rowNumber <= end; rowNumber += 1) {
      const excelRow = sheet.getRow(rowNumber);
      const pair = lines[rowNumber - start];
      const last = rowNumber === end;
      const baseFill = absenceOnly ? ABSENCE : band ? BAND : null;
      for (let col = 1; col <= 9; col += 1) {
        const cell = excelRow.getCell(col);
        const isPunch = col === 4 || col === 5 || col === 6;
        const fill = pair.extra && isPunch ? EXTRA : baseFill;
        const puffColor =
          col === 9 ? (row.puffMinutes > 0 ? PUFF_PLUS : row.puffMinutes < 0 ? PUFF_MINUS : INK) : null;
        const fontColor = pair.extra && isPunch ? EXTRA_INK : col === 6 && !pair.extra ? MUTED : puffColor || INK;
        paint(cell, {
          fill,
          strongBottom: last,
          font: {
            name: "Calibri",
            size: 11,
            bold: (pair.extra && isPunch) || col >= 7,
            color: { argb: fontColor },
          },
          align: {
            vertical: "middle",
            horizontal: col === 1 || col === 3 || col === 6 ? "left" : "center",
            indent: col === 1 || col === 3 || col === 6 ? 1 : 0,
          },
        });
      }
    }
  }

  sheet.columns = [
    { width: 14 },
    { width: 6 },
    { width: 20 },
    { width: 12 },
    { width: 12 },
    { width: 22 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
