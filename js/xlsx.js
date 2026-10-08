/* GéoCliché — classeur Excel (.xlsx) minimal : plusieurs feuilles, en-têtes en couleur, nombres à 2 décimales */
(function (global) {
  'use strict';
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const xesc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sname = (s) => String(s).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);
  function col(i) {
    let s = '';
    i += 1;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }
  // styles : 0 normal, 1 en-tête (gras, fond jaune), 2 nombre 0,00, 3 nombre gras, 4 texte gras
  const STYLES = HEAD + `<styleSheet xmlns="${NS}">` +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFC400"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function sheet(rows, widths) {
    const cols = widths && widths.length
      ? '<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' : '';
    const data = rows.map((row, ri) => {
      const cells = (row || []).map((c, ci) => {
        const o = c !== null && typeof c === 'object' ? c : { v: c };
        if (o.v === null || o.v === undefined || o.v === '') return '';
        const ref = col(ci) + (ri + 1), s = o.s ? ` s="${o.s}"` : '';
        if (typeof o.v === 'number') return isFinite(o.v) ? `<c r="${ref}"${s}><v>${o.v}</v></c>` : '';
        return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xesc(o.v)}</t></is></c>`;
      }).join('');
      return `<row r="${ri + 1}">${cells}</row>`;
    }).join('');
    return HEAD + `<worksheet xmlns="${NS}"><sheetViews><sheetView workbookViewId="0">` +
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      `${cols}<sheetData>${data}</sheetData></worksheet>`;
  }

  /** sheets = [{ name, widths: [..], rows: [[cellule, ...], ...] }] ; cellule = texte, nombre ou { v, s } */
  async function build(sheets) {
    const z = new global.ZipWriter(), n = sheets.length;
    await z.add('[Content_Types].xml', HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
    await z.add('_rels/.rels', HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    await z.add('xl/workbook.xml', HEAD + `<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>` +
      sheets.map((s, i) => `<sheet name="${xesc(sname(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>');
    await z.add('xl/_rels/workbook.xml.rels', HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${n + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`);
    await z.add('xl/styles.xml', STYLES);
    for (let i = 0; i < n; i++) await z.add(`xl/worksheets/sheet${i + 1}.xml`, sheet(sheets[i].rows, sheets[i].widths));
    return z.blob('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  global.Xlsx = { build };
})(typeof window !== 'undefined' ? window : globalThis);
