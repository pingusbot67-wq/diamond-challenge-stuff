/* Minimal .xlsx writer with native, editable charts (Excel, Google Sheets, LibreOffice). Needs JSZip.
   buildWorkbook([{name, rows:[[header...], [values...]], widths?, charts?:[chartSpec]}]) -> Promise<Blob>
   chartSpec (scatter): {type:'scatter', title, x:{col, title}, y:{title, log?, min?, max?}, series:[{col, name, color, dash?, markers?}], at:[col,row,w,h]}
   chartSpec (bar):     {type:'bar', dir:'bar'|'col', title, cat:{col}, y:{title}, series:[{col, name, color}], at:[col,row,w,h]}
   Columns are 0-based indexes into rows; data starts on the second row. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const colName = n => { let s = ''; n += 1; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const safeName = (n, used) => { let s = n.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Sheet'; let k = 2, b = s; while (used.has(s)) s = `${b.slice(0, 28)} ${k++}`; used.add(s); return s; };
  const ref = (sheet, c, r1, r2) => `'${sheet.replace(/'/g, "''")}'!$${colName(c)}$${r1}${r2 ? `:$${colName(c)}$${r2}` : ''}`;
  const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
  const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  function sheetXml(sh, drawingRid) {
    const rows = sh.rows, ncol = Math.max(...rows.map(r => r.length));
    const widths = sh.widths || Array.from({ length: ncol }, (_, c) => Math.min(48, Math.max(8, ...rows.slice(0, 200).map(r => (r[c] == null ? 0 : String(isNum(r[c]) ? +r[c].toPrecision(6) : r[c]).length + 2)))));
    let x = `${XML}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_R}">`;
    x += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
    x += `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>`;
    rows.forEach((r, ri) => {
      x += `<row r="${ri + 1}">`;
      r.forEach((v, ci) => {
        const a = `${colName(ci)}${ri + 1}`, st = ri === 0 ? ' s="1"' : '';
        if (isNum(v)) x += `<c r="${a}"${st}><v>${+v.toPrecision(10)}</v></c>`;
        else if (v != null && v !== '' && !(typeof v === 'number')) x += `<c r="${a}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
      });
      x += '</row>';
    });
    x += '</sheetData>';
    if (drawingRid) x += `<drawing r:id="${drawingRid}"/>`;
    return x + '</worksheet>';
  }

  const rich = (t, sz, b) => `<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${b ? 1 : 0}"/></a:pPr><a:r><a:rPr lang="en-US" sz="${sz}" b="${b ? 1 : 0}"/><a:t>${esc(t)}</a:t></a:r></a:p></c:rich></c:tx>`;
  const titleXml = (t, sz = 1000, b = false) => (t ? `<c:title>${rich(t, sz, b)}<c:overlay val="0"/></c:title>` : '');
  const fill = hex => `<a:solidFill><a:srgbClr val="${hex.replace('#', '').toUpperCase()}"/></a:solidFill>`;
  const lineFmt = '<c:spPr><a:ln w="9525">' + fill('#BFBFBF') + '</a:ln></c:spPr>';
  function numCache(rows, c) {
    const pts = []; rows.slice(1).forEach((r, i) => { if (isNum(r[c])) pts.push(`<c:pt idx="${i}"><c:v>${+r[c].toPrecision(10)}</c:v></c:pt>`); });
    return `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${rows.length - 1}"/>${pts.join('')}</c:numCache>`;
  }
  const strCache = (rows, c) => `<c:strCache><c:ptCount val="${rows.length - 1}"/>${rows.slice(1).map((r, i) => `<c:pt idx="${i}"><c:v>${esc(r[c] ?? '')}</c:v></c:pt>`).join('')}</c:strCache>`;
  const serName = (sheet, rows, s) => `<c:tx><c:strRef><c:f>${ref(sheet, s.col, 1)}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${esc(s.name || rows[0][s.col])}</c:v></c:pt></c:strCache></c:strRef></c:tx>`;
  function valAx(id, cross, pos, t, o = {}) {
    const sc = `${o.log ? '<c:logBase val="10"/>' : ''}<c:orientation val="minMax"/>${o.max != null ? `<c:max val="${o.max}"/>` : ''}${o.min != null ? `<c:min val="${o.min}"/>` : ''}`;
    return `<c:valAx><c:axId val="${id}"/><c:scaling>${sc}</c:scaling><c:delete val="0"/><c:axPos val="${pos}"/>${o.grid ? `<c:majorGridlines>${lineFmt.replace('BFBFBF', 'E6E6E6')}</c:majorGridlines>` : ''}${titleXml(t)}`
      + `<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="${o.lblLow ? 'low' : 'nextTo'}"/>${lineFmt}`
      + `<c:crossAx val="${cross}"/><c:crosses val="${o.crossMin ? 'min' : 'autoZero'}"/><c:crossBetween val="${o.between ? 'between' : 'midCat'}"/></c:valAx>`;
  }
  function chartXml(sheet, rows, ch) {
    const n = rows.length, last = n;   // data rows 2..n
    let plot = '';
    if (ch.type === 'bar') {
      plot += `<c:barChart><c:barDir val="${ch.dir || 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>`;
      ch.series.forEach((s, i) => {
        plot += `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${serName(sheet, rows, s)}<c:spPr>${fill(s.color)}</c:spPr><c:invertIfNegative val="0"/>`
          + `<c:cat><c:strRef><c:f>${ref(sheet, ch.cat.col, 2, last)}</c:f>${strCache(rows, ch.cat.col)}</c:strRef></c:cat>`
          + `<c:val><c:numRef><c:f>${ref(sheet, s.col, 2, last)}</c:f>${numCache(rows, s.col)}</c:numRef></c:val></c:ser>`;
      });
      plot += '<c:gapWidth val="60"/><c:axId val="2001"/><c:axId val="2002"/></c:barChart>';
      plot += `<c:catAx><c:axId val="2001"/><c:scaling><c:orientation val="${ch.dir === 'bar' ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${ch.dir === 'bar' ? 'l' : 'b'}"/>${titleXml(ch.x?.title)}`
        + `<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${lineFmt}<c:crossAx val="2002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
      plot += valAx(2002, 2001, ch.dir === 'bar' ? 'b' : 'l', ch.y.title, { grid: true, between: true, min: ch.y.min, max: ch.y.max });
    } else {
      plot += '<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>';
      ch.series.forEach((s, i) => {
        const ln = s.markers ? '<a:ln><a:noFill/></a:ln>' : `<a:ln w="19050" cap="rnd">${fill(s.color)}${s.dash ? '<a:prstDash val="dash"/>' : ''}<a:round/></a:ln>`;
        const mk = s.markers ? `<c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr><a:noFill/><a:ln w="15875">${fill(s.color)}</a:ln></c:spPr></c:marker>` : '<c:marker><c:symbol val="none"/></c:marker>';
        plot += `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${serName(sheet, rows, s)}<c:spPr>${ln}</c:spPr>${mk}`
          + `<c:xVal><c:numRef><c:f>${ref(sheet, ch.x.col, 2, last)}</c:f>${numCache(rows, ch.x.col)}</c:numRef></c:xVal>`
          + `<c:yVal><c:numRef><c:f>${ref(sheet, s.col, 2, last)}</c:f>${numCache(rows, s.col)}</c:numRef></c:yVal><c:smooth val="0"/></c:ser>`;
      });
      plot += '<c:axId val="1001"/><c:axId val="1002"/></c:scatterChart>';
      plot += valAx(1001, 1002, 'b', ch.x.title, { crossMin: !!ch.y.log, min: ch.x.min, max: ch.x.max });
      plot += valAx(1002, 1001, 'l', ch.y.title, { grid: true, log: ch.y.log, min: ch.y.min, max: ch.y.max });
    }
    return `${XML}<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/><c:chart>${titleXml(ch.title, 1200, true)}<c:autoTitleDeleted val="0"/>`
      + `<c:plotArea><c:layout/>${plot}</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>`
      + `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:chartSpace>`;
  }
  function drawingXml(charts, firstRid) {
    return `${XML}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${NS_A}">` + charts.map((ch, i) => {
      const [c, r, w, h] = ch.at;
      return `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${c}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>`
        + `<xdr:to><xdr:col>${c + w}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r + h}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>`
        + `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Chart ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>`
        + `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="rId${firstRid + i}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
    }).join('') + '</xdr:wsDr>';
  }
  const rels = list => `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`).join('')}</Relationships>`;
  const T = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const STYLES = `${XML}<styleSheet xmlns="${NS_MAIN}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>`
    + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill></fills>'
    + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  async function buildWorkbook(sheets, meta = {}) {
    const JSZip = root.JSZip || (typeof require !== 'undefined' ? require('jszip') : null);
    if (!JSZip) throw new Error('JSZip is not loaded');
    const zip = new JSZip(), used = new Set(), ct = [];
    let chartNo = 0;
    sheets.forEach((sh, i) => {
      const n = i + 1, name = sh.sheetName = safeName(sh.name, used), charts = sh.charts || [];
      ct.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
      if (charts.length) {
        zip.file(`xl/worksheets/_rels/sheet${n}.xml.rels`, rels([['rId1', T + 'drawing', `../drawings/drawing${n}.xml`]]));
        zip.file(`xl/drawings/drawing${n}.xml`, drawingXml(charts, 1));
        ct.push(`<Override PartName="/xl/drawings/drawing${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
        const dr = [];
        charts.forEach((ch, k) => {
          chartNo += 1;
          zip.file(`xl/charts/chart${chartNo}.xml`, chartXml(name, sh.rows, ch));
          ct.push(`<Override PartName="/xl/charts/chart${chartNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
          dr.push([`rId${k + 1}`, T + 'chart', `../charts/chart${chartNo}.xml`]);
        });
        zip.file(`xl/drawings/_rels/drawing${n}.xml.rels`, rels(dr));
      }
      zip.file(`xl/worksheets/sheet${n}.xml`, sheetXml(sh, charts.length ? 'rId1' : null));
    });
    zip.file('xl/workbook.xml', `${XML}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_R}"><bookViews><workbookView/></bookViews><sheets>${sheets.map((sh, i) => `<sheet name="${esc(sh.sheetName)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
    zip.file('xl/_rels/workbook.xml.rels', rels([...sheets.map((_, i) => [`rId${i + 1}`, T + 'worksheet', `worksheets/sheet${i + 1}.xml`]), [`rId${sheets.length + 1}`, T + 'styles', 'styles.xml']]));
    zip.file('xl/styles.xml', STYLES);
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    zip.file('docProps/core.xml', `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(meta.title || 'Saltback export')}</dc:title><dc:creator>Saltback</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`);
    zip.file('docProps/app.xml', `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Saltback</Application></Properties>`);
    zip.file('_rels/.rels', rels([['rId1', T + 'officeDocument', 'xl/workbook.xml'], ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'], ['rId3', T + 'extended-properties', 'docProps/app.xml']]));
    zip.file('[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>`
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
      + ct.join('') + '</Types>');
    return zip.generateAsync({ type: typeof window !== 'undefined' ? 'blob' : 'nodebuffer', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
  }

  /* Plain-text helpers shared by the page: CSV for files, TSV for pasting into Sheets/Excel. */
  const cell = v => (v == null || (typeof v === 'number' && !Number.isFinite(v)) ? '' : typeof v === 'number' ? String(+v.toPrecision(10)) : String(v));
  const toCSV = rows => rows.map(r => r.map(v => { const s = cell(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n');
  const toTSV = rows => rows.map(r => r.map(v => cell(v).replace(/[\t\n]/g, ' ')).join('\t')).join('\n');

  const api = { buildWorkbook, toCSV, toTSV };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SaltbackXLSX = api;
})(typeof window !== 'undefined' ? window : globalThis);
