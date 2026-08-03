import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

const slug = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const download = (blob: Blob, filename: string) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); };
export function downloadMarkdown(report: string, name: string, date: string) { download(new Blob([report], { type: 'text/markdown;charset=utf-8' }), `${slug(name)}-${date}.md`); }

function inlineRuns(text: string) {
  const runs: TextRun[] = []; const re = /\*\*([^*]+)\*\*/g; let last = 0; let match: RegExpExecArray | null;
  while ((match = re.exec(text))) { if (match.index > last) runs.push(new TextRun({ text: text.slice(last, match.index) })); runs.push(new TextRun({ text: match[1], bold: true })); last = re.lastIndex; }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last) })); return runs.length ? runs : [new TextRun({ text })];
}

function parseReport(report: string): Paragraph[] {
  return report.split(/\r?\n/).filter(line => line.trim()).map(line => {
    if (/^##\s+/.test(line)) return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: line.replace(/^##\s+/, '').toUpperCase(), bold: true })] });
    if (/^###\s+/.test(line)) return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: line.replace(/^###\s+/, ''), bold: true })] });
    const nested = /^\s{2,}[-*]\s+/.test(line); const bullet = /^\s*[-*]\s+/.test(line);
    const value = line.replace(/^\s*[-*]\s+/, '');
    return new Paragraph({ indent: bullet ? { left: nested ? 720 : 360, hanging: 180 } : undefined, children: bullet ? [new TextRun({ text: `${nested ? '○' : '●'} ` }), ...inlineRuns(value)] : inlineRuns(line) });
  });
}

export async function downloadDocx(report: string, name: string, date: string) {
  const blob = await Packer.toBlob(new Document({ sections: [{ properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } }, children: parseReport(report) }] }));
  download(blob, `${slug(name)}-${date}.docx`);
}
