import type { RawSheet } from "./lomaco";

export async function tablesFromBuffer(data: ArrayBuffer, filename: string): Promise<RawSheet[]> {
  const XLSX = await import("xlsx");
  const isCsv = /\.csv$/i.test(filename);
  let FS = ",";
  if (isCsv) {
    const head = new TextDecoder().decode(data.slice(0, 4000));
    const line = head.split(/\r?\n/).find((row) => row.trim()) ?? "";
    if ((line.match(/;/g) ?? []).length > (line.match(/,/g) ?? []).length) FS = ";";
  }
  const book = XLSX.read(data, isCsv ? { type: "array", FS, raw: false } : { type: "array", raw: false });
  return book.SheetNames.flatMap((sheet) => {
    const grid = XLSX.utils.sheet_to_json<(string | number | null)[]>(book.Sheets[sheet]!, {
      header: 1,
      raw: false,
      defval: "",
    });
    const matrix = grid.map((row) => (Array.isArray(row) ? row : []).map((cell) => String(cell ?? "").trim()));
    const headerIndex = matrix.findIndex((row) => row.some(Boolean));
    if (headerIndex < 0) return [];
    const headers = matrix[headerIndex] ?? [];
    const width = headers.length;
    const rows = matrix.slice(headerIndex + 1).map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ""));
    if (!headers.some(Boolean)) return [];
    return [{ file: filename, sheet, headers, rows }];
  });
}

export async function sheetsToXlsx(sheets: { name: string; rows: string[][] }[]): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const sheet of sheets) {
    let name = sheet.name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Feuille";
    while (used.has(name)) name = `${name.slice(0, 28)}-${used.size}`;
    used.add(name);
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet.rows), name);
  }
  return asBytes(XLSX.write(book, { type: "array", bookType: "xlsx" }));
}

function asBytes(value: unknown): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return Uint8Array.from(value as ArrayLike<number>);
}
