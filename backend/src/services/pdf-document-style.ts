export const pdfDocumentStyles = `
  @page{size:A4 portrait;margin:16mm 15mm 19mm}
  *{box-sizing:border-box}
  body{font:12px/1.38 Arial,Helvetica,sans-serif;color:#172331;min-height:262mm;display:flex;flex-direction:column;margin:0}
  .watermark{position:fixed;left:50%;top:50%;width:112mm;height:58mm;transform:translate(-50%,-50%);object-fit:contain;opacity:.045;pointer-events:none;z-index:0}
  main,.final-block{position:relative;z-index:1}
  header{display:flex;justify-content:space-between;align-items:center;gap:10mm;border-bottom:2px solid #D5A94E;padding-bottom:5mm;break-inside:avoid}
  .company{width:48mm;flex:none}.company img{display:block;width:100%;height:25mm;object-fit:contain;object-position:left center}
  .company-name{font-size:12px;font-weight:bold;letter-spacing:1px;color:#0B2745}
  .document-title{text-align:right;min-width:0;overflow-wrap:anywhere}
  .eyebrow{color:#795414;font-size:11px;font-weight:bold;letter-spacing:.6px;text-transform:uppercase}
  .company-contact{font-size:11px;line-height:1.45;color:#66717D}
  h1{font-size:25px;line-height:1.15;margin:2mm 0;color:#071A2F}
  .metadata{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:8mm;margin-top:5mm}
  .detail-column{min-width:0}.detail-row{display:grid;grid-template-columns:28mm minmax(0,1fr);gap:2mm;margin-bottom:2mm;align-items:start;break-inside:avoid}
  .detail-label{font-size:12px;font-weight:600;letter-spacing:.2px;color:#795414;text-transform:uppercase;line-height:1.35}
  .detail-value{font-size:13px;font-weight:600;line-height:1.38;overflow-wrap:anywhere;white-space:pre-wrap;min-width:0}
  table{width:100%;border-collapse:collapse;font-size:12px;line-height:1.4}
  th{background:#46677A;color:#fff;text-align:left;font-size:12px;font-weight:700}
  td,th{padding:7px 6px;border-bottom:1px solid #D8DEDF;overflow-wrap:anywhere;vertical-align:top}
  .num{text-align:right;white-space:nowrap}tr{break-inside:avoid;page-break-inside:avoid}thead{display:table-header-group}
  .items{margin-top:20px}
  .summary,.grand-total{margin:5mm 0 4mm auto;break-inside:avoid;page-break-inside:avoid}
  .summary td,.grand-total td{padding:6px}
  .summary .final-total td,.grand-total td{background:#F8F6EF;border-top:1.5px solid #C8A767;font-weight:700;color:#071A2F}
  .notes{white-space:pre-wrap;overflow-wrap:anywhere;break-inside:avoid}
  .notes h2{font-size:15px;line-height:1.25;color:#071A2F;margin:0 0 2mm}
  .notes p{font-size:12px;line-height:1.45;margin:0}
  .final-block{margin-top:auto;padding-top:6mm;break-inside:avoid;page-break-inside:avoid}
  .approval{display:flex;gap:10mm;margin-bottom:7mm}
  .approval div{flex:1;border-top:1px solid #8093A0;padding-top:2mm;color:#66717D;font-size:11px}
  .mandatory-note{font-size:11px;line-height:1.45;color:#66717D;border-top:1px solid #D8DEDF;padding-top:3mm}
  footer{font-size:11px;color:#66717D;margin-top:4mm}
`;
