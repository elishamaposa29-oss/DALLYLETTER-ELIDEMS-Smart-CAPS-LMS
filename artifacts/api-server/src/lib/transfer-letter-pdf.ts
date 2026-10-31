import { Buffer } from "node:buffer";

function ascii(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?");
}

function escapePdf(value: string): string {
  return ascii(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

/** Build a dependency-free, one-page PDF using only server-provided record data. */
export function createTransferLetterPdf(lines: string[]): Buffer {
  const wrapped: string[] = [];
  for (const raw of lines) {
    let remaining = ascii(raw);
    if (!remaining) { wrapped.push(""); continue; }
    while (remaining.length > 88) {
      let cut = remaining.lastIndexOf(" ", 88);
      if (cut < 30) cut = 88;
      wrapped.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut).trimStart();
    }
    wrapped.push(remaining);
  }
  const ops = ["q", "0.90 g", "BT", "/F1 34 Tf", "0.707 0.707 -0.707 0 120 300 Tm", "(APPROVED - CONFIDENTIAL) Tj", "ET", "Q", "0 g", "BT", "/F1 10 Tf", "50 790 Td", "14 TL"];
  wrapped.slice(0, 48).forEach((line, index) => {
    if (index > 0) ops.push("T*");
    ops.push("(" + escapePdf(line) + ") Tj");
  });
  ops.push("ET");
  const stream = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length " + Buffer.byteLength(stream, "ascii") + " >>\nstream\n" + stream + "\nendstream",
  ];
  let pdf = "%PDF-1.4\n%----\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += (index + 1) + " 0 obj\n" + object + "\nendobj\n";
  });
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) pdf += String(offset).padStart(10, "0") + " 00000 n \n";
  pdf += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF";
  return Buffer.from(pdf, "ascii");
}