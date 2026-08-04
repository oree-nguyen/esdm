import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

const slug = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const download = (blob: Blob, filename: string) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); };
export function downloadMarkdown(report: string, name: string, date: string) { download(new Blob([report], { type: 'text/markdown;charset=utf-8' }), `${slug(name)}-${date}.md`); }

function inlineRuns(text: string, size = 22, italic = false) {
  const runs: TextRun[] = []; const re = /\*\*([^*]+)\*\*/g; let last = 0; let match: RegExpExecArray | null;
  while ((match = re.exec(text))) { if (match.index > last) runs.push(new TextRun({ text: text.slice(last, match.index), font: 'Arial', size, italics: italic })); runs.push(new TextRun({ text: match[1], font: 'Arial', size, bold: true, italics: italic })); last = re.lastIndex; }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last), font: 'Arial', size, italics: italic })); return runs.length ? runs : [new TextRun({ text, font: 'Arial', size, italics: italic })];
}

function parseReport(report: string): Paragraph[] {
  return report.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
    if (/^##\s+/.test(line)) return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: line.replace(/^##\s+/, '').toUpperCase(), font: 'Arial', size: 28, bold: true })] });
    if (/^###\s+/.test(line)) return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: line.replace(/^###\s+/, ''), font: 'Arial', size: 24, bold: true })] });
    if (index === 0 && /^\*\*/.test(line)) return new Paragraph({ children: inlineRuns(line, 36) });
    const nested = /^\s{2,}[-*]\s+/.test(line); const bullet = /^\s*[-*]\s+/.test(line);
    const value = line.replace(/^\s*[-*]\s+/, '');
    const italic = /lưu ý/i.test(value);
    return new Paragraph({ indent: bullet ? { left: nested ? 720 : 360, hanging: 180 } : undefined, children: bullet ? [new TextRun({ text: `${nested ? '○' : '●'} `, font: 'Arial', size: 22, italics: italic }), ...inlineRuns(value, 22, italic)] : inlineRuns(line, 22, italic) });
  });
}

export async function downloadDocx(report: string, name: string, date: string) {
  const blob = await Packer.toBlob(new Document({ sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: parseReport(report) }] }));
  download(blob, `${slug(name)}-${date}.docx`);
}
