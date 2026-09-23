import { calculateMetrics } from './calculations.mjs';
import { validateProject } from './validation.mjs';
import { calculateProgress, progressAt } from './progress.mjs';
import { symbolForCell } from './project.mjs';

const escapeHTML = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fr = number => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(number);
const integer = number => new Intl.NumberFormat('fr-FR').format(number);
const PAGE_CELLS = 25;
const CELL_PX = 20;

function chartPage(project, threads, pageRow, pageColumn, pageNumber, pageTotal) {
  const fromRow = pageRow * PAGE_CELLS, fromColumn = pageColumn * PAGE_CELLS;
  const rows = Math.min(PAGE_CELLS, project.heightStitches - fromRow);
  const columns = Math.min(PAGE_CELLS, project.widthStitches - fromColumn);
  const margin = 38, width = margin + columns * CELL_PX + 6, height = margin + rows * CELL_PX + 6;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Grille, lignes ${fromRow + 1} à ${fromRow + rows}, colonnes ${fromColumn + 1} à ${fromColumn + columns}">`;
  for (let c = 0; c < columns; c++) {
    svg += `<text class="axis" x="${margin + (c + .5) * CELL_PX}" y="${margin - 10}" text-anchor="middle">${fromColumn + c + 1}</text>`;
  }
  for (let r = 0; r < rows; r++) {
    svg += `<text class="axis" x="${margin - 10}" y="${margin + (r + .5) * CELL_PX + 3}" text-anchor="end">${fromRow + r + 1}</text>`;
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const row = fromRow + r, column = fromColumn + c;
    const cell = project.grid[row][column], thread = cell && threads.get(cell.threadId);
    const x = margin + c * CELL_PX, y = margin + r * CELL_PX;
    const stroke = row % 10 === 0 || column % 10 === 0 ? '#504a3d' : '#b4ad9d';
    svg += `<g class="chart-cell" data-row="${row}" data-column="${column}" data-thread-id="${escapeHTML(cell?.threadId ?? '')}" data-progress="${cell ? progressAt(project, row, column) : ''}"><rect x="${x}" y="${y}" width="${CELL_PX}" height="${CELL_PX}" fill="${thread ? escapeHTML(thread.color) : '#fffefa'}" fill-opacity="${thread ? '.35' : '1'}" stroke="${stroke}" stroke-width="${stroke === '#504a3d' ? 1.3 : .65}"/>`;
    if (thread) svg += `<text class="glyph" x="${x + CELL_PX / 2}" y="${y + CELL_PX / 2 + 4}" text-anchor="middle">${escapeHTML(symbolForCell(project, row, column))}</text>`;
    svg += '</g>';
  }
  svg += '</svg>';
  return `<section class="page chart-page"><div class="chart-header"><div><span class="eyebrow">Patron à broder · ${escapeHTML(project.name)}</span><h2>Grille ${pageNumber} / ${pageTotal}</h2><p>Lignes ${fromRow + 1}–${fromRow + rows} · colonnes ${fromColumn + 1}–${fromColumn + columns} · une case = une position de point de croix</p></div><span class="page-count">${pageNumber} / ${pageTotal}</span></div>${svg}<p class="chart-foot">Utilisez les coordonnées et la légende de la première page. Les cases sans symbole restent vides.</p></section>`;
}

export function buildSheetHTML(project) {
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(`Fiche impossible : ${validation.errors.join(' ')}`);
  const metrics = calculateMetrics(project);
  const progress = calculateProgress(project);
  const threads = new Map(project.palette.map(thread => [thread.threadId, thread]));
  const margins = project.fabric.marginsCm;
  const legend = project.palette.map(thread => `<tr><td class="symbol">${escapeHTML(thread.symbol)}</td><td><span class="swatch" style="background:${escapeHTML(thread.color)}"></span>${escapeHTML(thread.name)}</td><td>${escapeHTML(thread.reference)}</td><td>${escapeHTML(thread.referenceStatus)}</td><td class="right">${integer(metrics.countsByThread[thread.threadId])} · ${fr(metrics.crossCount ? 100 * metrics.countsByThread[thread.threadId] / metrics.crossCount : 0)} %</td></tr>`).join('');
  const pageRows = Math.ceil(project.heightStitches / PAGE_CELLS);
  const pageColumns = Math.ceil(project.widthStitches / PAGE_CELLS);
  const pageTotal = pageRows * pageColumns;
  let pages = '';
  for (let row = 0; row < pageRows; row++) for (let column = 0; column < pageColumns; column++) {
    pages += chartPage(project, threads, row, column, row * pageColumns + column + 1, pageTotal);
  }
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Patron · ${escapeHTML(project.name)}</title><style>
  @page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#24342d;background:#f6f3ec;font:12px/1.5 Arial,sans-serif}.page{max-width:820px;margin:22px auto;padding:28px;background:#fffefa;box-shadow:0 10px 30px #263a3012;break-after:page;page-break-after:always}.cover-page{border-top:4px solid #6e9475}.tools{max-width:820px;margin:18px auto;display:flex;justify-content:space-between;align-items:center;gap:12px}.tools button{background:#375c49;color:white;border:0;border-radius:7px;padding:10px 15px;cursor:pointer}h1,h2{font-family:Georgia,serif;font-weight:normal}h1{font-size:28px;margin:8px 0 12px}h2{font-size:21px;margin:5px 0 7px}.eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:10px;color:#718573}.summary{display:grid;grid-template-columns:1fr 1fr;gap:9px}.summary div{border:1px solid #e9e7df;padding:8px 10px;border-radius:6px}.summary strong{display:block;font-size:13px;margin-top:3px}.summary span{font-size:10px;color:#68766b}.note{background:#f4f3ec;border-left:3px solid #6e9475;padding:9px 12px;margin:13px 0}table{border-collapse:collapse;width:100%;margin-top:9px}th,td{text-align:left;padding:7px;border-bottom:1px solid #e9e7df}th{background:#f2f4ed;font-size:10px;text-transform:uppercase;letter-spacing:.06em}.right{text-align:right}.symbol{font-size:16px;font-weight:700;text-align:center;width:52px}.swatch{width:13px;height:13px;border:1px solid #7c897a;display:inline-block;border-radius:3px;margin-right:8px;vertical-align:middle}.chart-header{display:flex;justify-content:space-between;gap:15px}.chart-header p,.chart-foot{font-size:11px;color:#718073}.page-count{color:#657766}.chart-page svg{display:block;width:auto;max-width:100%;height:auto;margin:20px auto;overflow:visible}.axis{font:10px Arial;fill:#435847}.glyph{font:bold 13px Arial,sans-serif;fill:#171d19}.chart-foot{text-align:center}
  @media print{body{background:white}.tools{display:none}.page{margin:0;padding:0;box-shadow:none;max-width:none;break-after:page;page-break-after:always}.chart-page svg{max-width:100%}.chart-page{break-inside:avoid}}
  </style></head><body><div class="tools"><span>Patron de broderie · ${escapeHTML(project.name)}</span><button onclick="window.print()">Imprimer / enregistrer en PDF</button></div>
  <section class="page cover-page"><span class="eyebrow">L’Atelier Universel · couverture, données physiques & légende</span><h1>${escapeHTML(project.name)}</h1>
  <div class="summary"><div><span>Grille</span><strong>${integer(project.widthStitches)} × ${integer(project.heightStitches)} positions</strong></div><div><span>Points de croix / couleurs utilisées</span><strong>${integer(metrics.crossCount)} / ${integer(metrics.usedColorCount)}</strong></div><div><span>Motif (largeur × hauteur)</span><strong>${fr(metrics.motifWidthCm)} × ${fr(metrics.motifHeightCm)} cm</strong></div><div><span>Toile avec marges (largeur × hauteur)</span><strong>${fr(metrics.canvasWidthCm)} × ${fr(metrics.canvasHeightCm)} cm</strong></div><div><span>Toile et densité déclarées</span><strong>${escapeHTML(project.fabric.type)} · ${fr(project.fabric.stitchesPerCm)} points/cm</strong></div><div><span>Marges choisies</span><strong>H ${fr(margins.top)} · B ${fr(margins.bottom)} · G ${fr(margins.left)} · D ${fr(margins.right)} cm</strong></div><div><span>Surface du motif</span><strong>${fr(metrics.motifAreaCm2)} cm²</strong></div><div><span>Surface de la toile</span><strong>${fr(metrics.canvasAreaCm2)} cm²</strong></div><div><span>Croix marquées FAIT / restantes</span><strong>${integer(progress.done)} / ${integer(progress.remaining)} · ${fr(progress.percent)} % fait</strong></div><div><span>Statut EN COURS déclaré</span><strong>${integer(progress.inProgress)} croix</strong></div></div>
  <p class="note">Chaque case représente une position réelle ; le symbole indique le fil de la croix, même en impression grise. Dimensions calculées à partir de la toile et des marges déclarées. Réalisation calculée UNIQUEMENT d’après les points effectivement marqués FAIT, et non depuis l’aperçu 3D.<br><strong>MÉTRAGE : À CALCULER</strong> · Échevettes et temps : non estimés sans calibration.</p>
  <h2>Légende et comptage par fil</h2><table><thead><tr><th>Symbole</th><th>Fil</th><th>Référence</th><th>Statut</th><th class="right">Croix / part</th></tr></thead><tbody>${legend}</tbody></table>
  <p class="note">${escapeHTML(validation.warnings.join(' ') || 'Références indiquées avec leur statut de vérification.')}</p><p>${pageTotal} page(s) de grille suivent. Coordonnées à partir de 1, numérotées en haut et sur le bord gauche de chaque page ; traits renforcés tous les 10 points.</p></section>${pages}</body></html>`;
}
