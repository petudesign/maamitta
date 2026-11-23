import { jsPDF } from 'jspdf';
import { formatArea, formatLength, formatNumber } from '../engine/format';
import type {
  CalculationResult,
  CompanyInfo,
  MeasurementSummary,
  QuoteZoneItem,
} from '../engine/types';
import { getMessages, type Locale } from '../i18n';

export interface PdfQuoteInput {
  company: CompanyInfo;
  parcelCode?: string | null;
  summary: MeasurementSummary;
  estimate: CalculationResult;
  quoteItems?: QuoteZoneItem[];
  mapSnapshotDataUrl: string | null;
  mapAttribution: string;
  locale?: Locale;
}

/** Strips characters outside WinAnsi/Latin-1 (e.g. emoji) so standard PDF Helvetica never emits mojibake. */
function pdfSafeText(text: string): string {
  return text
    .replace(/€/g, 'EUR')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Draws the geometric Maamitta "Palsta" brand emblem as crisp PDF vector art. */
function drawMaamittaMark(doc: jsPDF, x: number, y: number, size: number) {
  const s = size / 32;
  doc.setFillColor(24, 78, 59); // #184E3B
  doc.roundedRect(x, y, size, size, 7 * s, 7 * s, 'F');

  // Top-left active parcel (solid white)
  doc.setFillColor(255, 255, 255);
  doc.lines(
    [
      [12.5 * s, 0],
      [-4 * s, 14.5 * s],
      [-8.5 * s, 0],
    ],
    x + 5 * s,
    y + 5 * s,
    [1, 1],
    'F',
    true
  );

  // Top-right neighbor parcel (soft sage-white)
  doc.setFillColor(126, 163, 149);
  doc.lines(
    [
      [6.5 * s, 0],
      [0, 9.5 * s],
      [-9.1 * s, 0],
    ],
    x + 20.5 * s,
    y + 5 * s,
    [1, 1],
    'F',
    true
  );

  // Bottom-right parcel (mid sage-white)
  doc.setFillColor(178, 202, 193);
  doc.lines(
    [
      [9.9 * s, 0],
      [0, 9.5 * s],
      [-12.5 * s, 0],
    ],
    x + 17.1 * s,
    y + 17.5 * s,
    [1, 1],
    'F',
    true
  );

  // Bottom-left sky-cyan accent lot (#7DD3FC)
  doc.setFillColor(125, 211, 252);
  doc.lines(
    [
      [7.7 * s, 0],
      [-1.2 * s, 4.5 * s],
      [-6.5 * s, 0],
    ],
    x + 5 * s,
    y + 22.5 * s,
    [1, 1],
    'F',
    true
  );
}

/**
 * Generates a clean A4 contractor estimate PDF completely client-side.
 * Uses "EUR" instead of the € glyph for guaranteed Latin-1 compatibility in standard PDF fonts.
 */
export function downloadPdfQuote(input: PdfQuoteInput): void {
  const {
    company,
    parcelCode,
    summary,
    estimate,
    quoteItems = [],
    mapSnapshotDataUrl,
    mapAttribution,
    locale = 'fi',
  } = input;

  const t = getMessages(locale).pdf;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageW = 210;
  const margin = 18;
  const contentW = pageW - margin * 2;
  const maxContentY = 266;
  let y = 18;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > maxContentY) {
      doc.addPage();
      y = 20;
    }
  };

  // Header band
  doc.setFillColor(24, 78, 59); // --accent-primary #184E3B
  doc.rect(0, 0, pageW, 10, 'F');

  y = 20;

  // Optional user/company logo in top-right of header
  let headerRightBottomY = y + 4;
  if (company.logoDataUrl) {
    try {
      const props = doc.getImageProperties(company.logoDataUrl);
      const maxLogoW = 38;
      const maxLogoH = 14;
      const ratio = Math.min(maxLogoW / props.width, maxLogoH / props.height);
      const drawW = props.width * ratio;
      const drawH = props.height * ratio;
      doc.addImage(
        company.logoDataUrl,
        'PNG',
        pageW - margin - drawW,
        15,
        drawW,
        drawH
      );
      headerRightBottomY = 15 + drawH + 5;
    } catch {
      // Ignore invalid logo data URL
    }
  }

  const titleMaxW = contentW - 44;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20, 26, 24);
  const safeTitle = pdfSafeText(company.projectTitle) || t.defaultTitle;
  const titleLines = doc.splitTextToSize(safeTitle, titleMaxW) as string[];
  doc.text(titleLines, margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(74, 85, 81);
  const dateStr = new Intl.DateTimeFormat(
    locale === 'en' ? 'en-GB' : 'fi-FI'
  ).format(new Date());
  doc.text(
    `${t.dateLabel}: ${dateStr}`,
    pageW - margin,
    company.logoDataUrl ? headerRightBottomY : y,
    { align: 'right' }
  );

  y += titleLines.length * 6.5;
  if (company.address.trim()) {
    const addrLines = doc.splitTextToSize(
      `${t.addressLabel}: ${pdfSafeText(company.address)}`,
      contentW - 40
    ) as string[];
    doc.text(addrLines, margin, y);
    y += addrLines.length * 4.8;
  }
  if (parcelCode) {
    doc.text(`${t.parcelLabel}: ${pdfSafeText(parcelCode)}`, margin, y);
    y += 5;
  }
  if (company.name.trim() || company.contact.trim()) {
    const sender = [pdfSafeText(company.name), pdfSafeText(company.contact)]
      .filter(Boolean)
      .join('  |  ');
    if (sender) {
      const senderLines = doc.splitTextToSize(
        `${t.authorLabel}: ${sender}`,
        contentW
      ) as string[];
      doc.text(senderLines, margin, y);
      y += senderLines.length * 4.8;
    }
  }

  y = Math.max(y, headerRightBottomY + 2);

  // Divider
  y += 2;
  doc.setDrawColor(215, 218, 216);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // Map snapshot (cropped to exact 174:82 aspect ratio)
  if (mapSnapshotDataUrl) {
    const imgH = 82;
    try {
      doc.addImage(mapSnapshotDataUrl, 'JPEG', margin, y, contentW, imgH);
      doc.setDrawColor(200, 205, 202);
      doc.rect(margin, y, contentW, imgH);
      y += imgH + 4;
      doc.setFontSize(7.5);
      doc.setTextColor(110, 123, 118);
      doc.text(`${t.mapSourceLabel}: ${mapAttribution}`, margin, y);
      y += 7;
    } catch {
      // Skip image gracefully if canvas capture failed due to CORS
    }
  }

  // Measurement summary section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 26, 24);
  doc.text(t.sectionMeasurements, margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  const measureRows: Array<[string, string]> = [];
  if (summary.grossAreaSqm > 0) {
    measureRows.push([t.grossArea, formatArea(summary.grossAreaSqm, locale)]);
    if (summary.cutoutAreaSqm > 0) {
      measureRows.push([
        t.cutouts,
        `-${formatArea(summary.cutoutAreaSqm, locale)}`,
      ]);
    }
    measureRows.push([
      summary.slopePct > 0 ? t.netAreaSloped(summary.slopePct) : t.netArea,
      formatArea(summary.effectiveAreaSqm, locale),
    ]);
    measureRows.push([t.perimeter, formatLength(summary.perimeterM, locale)]);
  }
  if (summary.lineLengthM > 0) {
    measureRows.push([
      t.measuredLine,
      formatLength(summary.lineLengthM, locale),
    ]);
  }
  measureRows.push([t.accuracyLabel, estimate.accuracy.label]);

  for (const [label, value] of measureRows) {
    doc.setTextColor(74, 85, 81);
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 26, 24);
    doc.text(value, pageW - margin, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 5.5;
  }

  // Material & price estimate section (supports both single-item and multi-zone quotes)
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 26, 24);

  const hasMultiItems = quoteItems.length > 0;
  doc.text(
    hasMultiItems
      ? locale === 'en'
        ? '2. Itemized Material & Price Estimate'
        : '2. Erittely: työlajit ja materiaalit'
      : t.sectionEstimate(estimate.presetName),
    margin,
    y
  );
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);

  let finalSubtotal = estimate.subtotalEur;
  let finalVat = estimate.vatEur;
  let finalTotal = estimate.totalEur;

  if (hasMultiItems) {
    finalSubtotal = 0;
    finalVat = 0;
    finalTotal = 0;

    for (const item of quoteItems) {
      ensureSpace(14);
      finalSubtotal += item.subtotalEur;
      finalVat += item.vatEur;
      finalTotal += item.totalEur;

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 26, 24);
      doc.text(
        pdfSafeText(`${item.label} (${item.presetName})`),
        margin,
        y
      );
      doc.text(
        `${formatNumber(item.subtotalEur, 2, locale)} EUR`,
        pageW - margin,
        y,
        { align: 'right' }
      );
      y += 4.5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(74, 85, 81);
      const summaryLines = doc.splitTextToSize(
        pdfSafeText(item.summaryText),
        contentW
      ) as string[];
      doc.text(summaryLines, margin, y);
      doc.setFontSize(9.5);
      y += summaryLines.length * 4 + 2;
    }

    // Also include active unsaved measurement if present
    if (estimate.basisValue > 0) {
      ensureSpace(14);
      finalSubtotal += estimate.subtotalEur;
      finalVat += estimate.vatEur;
      finalTotal += estimate.totalEur;

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 26, 24);
      doc.text(pdfSafeText(estimate.presetName), margin, y);
      doc.text(
        `${formatNumber(estimate.subtotalEur, 2, locale)} EUR`,
        pageW - margin,
        y,
        { align: 'right' }
      );
      y += 4.5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(74, 85, 81);
      const activeSummaryLines = doc.splitTextToSize(
        pdfSafeText(
          estimate.lines.map((l) => `${l.label}: ${l.value}`).join('  |  ')
        ),
        contentW
      ) as string[];
      doc.text(activeSummaryLines, margin, y);
      doc.setFontSize(9.5);
      y += activeSummaryLines.length * 4 + 2;
    }
  } else {
    for (const row of estimate.lines) {
      ensureSpace(7);
      const safeVal = pdfSafeText(row.value);
      doc.setTextColor(74, 85, 81);
      doc.text(pdfSafeText(row.label), margin, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 26, 24);
      doc.text(safeVal, pageW - margin, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += 5.5;
    }
  }

  // Totals box (paginates cleanly if near bottom of page)
  ensureSpace(30);
  y += 4;
  doc.setFillColor(241, 239, 234);
  doc.roundedRect(margin, y, contentW, 25, 2, 2, 'F');
  y += 6.5;

  doc.setFontSize(9.5);
  doc.setTextColor(74, 85, 81);
  doc.text(t.subtotal, margin + 4, y);
  doc.text(
    `${formatNumber(finalSubtotal, 2, locale)} EUR`,
    pageW - margin - 4,
    y,
    { align: 'right' }
  );

  y += 5.5;
  doc.text(
    t.vat(formatNumber(estimate.vatRatePct, 1, locale)),
    margin + 4,
    y
  );
  doc.text(
    `${formatNumber(finalVat, 2, locale)} EUR`,
    pageW - margin - 4,
    y,
    { align: 'right' }
  );

  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(24, 78, 59);
  doc.text(t.total, margin + 4, y);
  doc.text(
    `${formatNumber(finalTotal, 2, locale)} EUR`,
    pageW - margin - 4,
    y,
    { align: 'right' }
  );

  // Footer disclaimer + crisp vector Maamitta logo
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(110, 123, 118);
  doc.text(t.disclaimer, margin, 279);

  const footerText = t.footerBrand;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(24, 78, 59);
  const textW = doc.getTextWidth(footerText);
  const markSize = 4.2;
  const gap = 2.4;
  drawMaamittaMark(
    doc,
    pageW - margin - textW - gap - markSize,
    283.2,
    markSize
  );
  doc.text(footerText, pageW - margin, 286.3, { align: 'right' });

  const isoDate = new Date().toISOString().slice(0, 10);
  doc.save(`${t.filePrefix}-${isoDate}.pdf`);
}
