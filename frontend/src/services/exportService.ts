/**
 * Enterprise Dashboard Export Service
 * Provides client-side export to PDF, PNG, JPG, SVG, and JSON formats
 * with customizable resolution scales (1x Standard, 2x High, 4x Print).
 */

export type ExportFormat = 'pdf' | 'png' | 'jpeg' | 'svg' | 'json' | 'xlsx' | 'pptx';
export type ExportResolution = '1x' | '2x' | '4x';

export interface ExportOptions {
  format: ExportFormat;
  resolution: ExportResolution;
  includeMetadata?: boolean;
  includeBranding?: boolean;
  title?: string;
  filename?: string;
}

export interface ExportWidgetData {
  id: number;
  title: string;
  widget_type: string;
  sql_query?: string;
  visualization_spec?: {
    type?: string;
    title?: string;
    xField?: string | null;
    yField?: string | null;
    value?: number | string | null;
  };
  columns?: Array<{ name: string; data_type?: string }>;
  rows?: Array<Record<string, any>>;
}

export interface DashboardExportData {
  title: string;
  exportedAt: string;
  systemMetrics: {
    connectedSources: number;
    catalogedTables: number;
    syncFreshness: string;
    systemHealth: string;
  };
  sources: Array<{ name: string; platform: string; status: string }>;
  recentActivities: Array<{ timestamp: string; action: string; resource: string; status: string }>;
  kpis?: Array<{ label: string; value: string | number; change?: string; subtext?: string }>;
  widgets?: ExportWidgetData[];
  dataTable?: {
    title: string;
    columns: Array<{ key: string; header: string }>;
    rows: Array<Record<string, any>>;
  };
}

/**
 * Triggers a native browser file download of a Blob or URL.
 */
export function triggerDownload(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Converts a DOM element to an SVG foreignObject data URI.
 */
async function domToSvgDataUri(element: HTMLElement, width: number, height: number): Promise<string> {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');

  // Copy computed styles or embed basic styling
  const svgString = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="background:#fafaf9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#000; width:100%; height:100%; box-sizing:border-box;">
          ${clone.outerHTML}
        </div>
      </foreignObject>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
}

/**
 * Converts CSS oklch() colors to rgb() for html2canvas compatibility.
 * The conversion is applied only to the cloned export document.
 */
function replaceOklchColors(css: string): string {
  const oklchRegex = /oklch\(\s*([0-9.]+%?)\s+([0-9.]+%?)\s+([0-9.]+)(?:deg)?(?:\s*\/\s*([0-9.]+%?))?\s*\)/gi;

  const toNumber = (value: string, percentScale: number): number => {
    return value.endsWith('%')
      ? (parseFloat(value) / 100) * percentScale
      : parseFloat(value);
  };

  const clamp = (v: number) => Math.max(0, Math.min(1, v));

  const oklabToRgb = (l: number, a: number, b: number) => {
    const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = l - 0.0894841775 * a - 1.291485548 * b;

    const l3 = l_ * l_ * l_;
    const m3 = m_ * m_ * m_;
    const s3 = s_ * s_ * s_;

    const x = 1.2270138511 * l3 - 0.5577999807 * m3 + 0.2812561490 * s3;
    const y = -0.0405801784 * l3 + 1.1122568696 * m3 - 0.0716766787 * s3;
    const z = -0.0763812845 * l3 - 0.4214819784 * m3 + 1.5861632204 * s3;

    const rLinear = 3.2406 * x - 1.5372 * y - 0.4986 * z;
    const gLinear = -0.9689 * x + 1.8758 * y + 0.0415 * z;
    const bLinear = 0.0557 * x - 0.2040 * y + 1.0570 * z;

    const gamma = (v: number) =>
      v <= 0.0031308
        ? 12.92 * v
        : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055;

    return [
      Math.round(clamp(gamma(rLinear)) * 255),
      Math.round(clamp(gamma(gLinear)) * 255),
      Math.round(clamp(gamma(bLinear)) * 255),
    ];
  };

  return css.replace(
    oklchRegex,
    (_match, lRaw, cRaw, hRaw, alphaRaw) => {
      const l = toNumber(lRaw, 1);
      const c = toNumber(cRaw, 0.4);
      const h = (parseFloat(hRaw) * Math.PI) / 180;

      const a = c * Math.cos(h);
      const b = c * Math.sin(h);

      const [r, g, bValue] = oklabToRgb(l, a, b);

      if (!alphaRaw) {
        return `rgb(${r}, ${g}, ${bValue})`;
      }

      const alpha = alphaRaw.endsWith('%')
        ? parseFloat(alphaRaw) / 100
        : parseFloat(alphaRaw);

      return `rgba(${r}, ${g}, ${bValue}, ${Math.max(0, Math.min(1, alpha))})`;
    }
  );
}

/**
 * Render a canvas representation of the dashboard element at specified DPI scale.
 */
async function renderDashboardToCanvas(
  element: HTMLElement,
  scaleFactor: number = 2
): Promise<HTMLCanvasElement> {
  const html2canvasModule = await import('html2canvas');
  const html2canvas = html2canvasModule.default || html2canvasModule;

  if (typeof html2canvas !== 'function') {
    throw new Error('Dashboard renderer is unavailable. Please reload the page and try again.');
  }

  const width = Math.max(
    element.scrollWidth,
    element.offsetWidth,
    element.clientWidth,
    1200
  );

  const height = Math.max(
    element.scrollHeight,
    element.offsetHeight,
    element.clientHeight,
    900
  );

  return await html2canvas(element, {
    scale: scaleFactor,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#fafaf9',
    logging: true,
    width,
    height,
    windowWidth: Math.max(window.innerWidth, width),
    windowHeight: Math.max(window.innerHeight, height),
    scrollX: 0,
    scrollY: 0,
    imageTimeout: 15000,
    removeContainer: true,
    foreignObjectRendering: false,
    onclone: (clonedDocument) => {
      const clonedRoot =
        clonedDocument.querySelector<HTMLElement>(
          '[data-pi-dashboard-export-root]'
        ) || clonedDocument.body;

      const sourceWindow = window;

      const colorProperties = [
        'color',
        'backgroundColor',
        'borderTopColor',
        'borderRightColor',
        'borderBottomColor',
        'borderLeftColor',
        'outlineColor',
        'textDecorationColor',
        'columnRuleColor',
        'fill',
        'stroke',
      ];

      clonedRoot.querySelectorAll<HTMLElement>('*').forEach((node) => {
        const sourceNode = sourceWindow.document.querySelector(
          `[data-pi-export-source-id="${node.getAttribute('data-pi-export-id')}"]`
        );

        const computed = clonedDocument.defaultView?.getComputedStyle(node);

        if (computed) {
          colorProperties.forEach((property) => {
            const value = computed.getPropertyValue(property);

            if (value && /oklch\(/i.test(value)) {
              const converted = replaceOklchColors(value);
              node.style.setProperty(property, converted);
            }
          });
        }

        const position = computed?.position;

        if (position === 'sticky' || position === 'fixed') {
          node.style.position = 'relative';
          node.style.top = 'auto';
          node.style.right = 'auto';
          node.style.bottom = 'auto';
          node.style.left = 'auto';
        }

        node.style.animation = 'none';
        node.style.transition = 'none';
      });

      clonedRoot
        .querySelectorAll<HTMLElement>('[data-export-hide]')
        .forEach((node) => {
          node.style.display = 'none';
        });

      // Remove all remaining oklch declarations from cloned stylesheets.
      clonedDocument.querySelectorAll('style').forEach((style) => {
        style.textContent = replaceOklchColors(style.textContent || '');
      });

      clonedDocument.querySelectorAll<HTMLElement>('[style]').forEach((node) => {
        const inlineStyle = node.getAttribute('style');

        if (inlineStyle && /oklch\(/i.test(inlineStyle)) {
          node.setAttribute(
            'style',
            replaceOklchColors(inlineStyle)
          );
        }
      });
    },
  });
}

/**
 * Exports the dashboard data to a formatted PDF document.
 */
export async function exportDashboardToPDF(
  dashboardElement: HTMLElement | null,
  data: DashboardExportData,
  options: ExportOptions
): Promise<void> {
  const filename =
    options.filename || `pi-analytics-dashboard-${Date.now()}.pdf`;

  try {
    const jspdfModule = await import(/* @vite-ignore */ 'jspdf');
    const { jsPDF } = jspdfModule;

    if (!jsPDF) {
      throw new Error('PDF renderer is unavailable.');
    }

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = 297;
    const pageHeight = 210;
    const margin = 10;
    const contentWidth = pageWidth - margin * 2;

    const textValue = (value: unknown): string => {
      if (value === null || value === undefined || value === '') return '-';
      if (typeof value === 'number') return value.toLocaleString();
      return String(value);
    };

    const numberValue = (value: unknown): number => {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') {
        const parsed = Number(value.replace(/,/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    };

    const header = (subtitle?: string) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(17);
      doc.setTextColor(15, 23, 42);
      doc.text(data.title || 'Pi Analytics Dashboard', margin, 13);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        subtitle ||
          `Generated ${new Date(data.exportedAt || Date.now()).toLocaleString()}`,
        margin,
        19
      );

      doc.setDrawColor(226, 232, 240);
      doc.line(margin, 23, pageWidth - margin, 23);
    };

    const drawKpi = (
      title: string,
      value: unknown,
      x: number,
      y: number,
      w: number
    ) => {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, y, w, 30, 3, 3, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(String(title || 'Metric').toUpperCase(), x + 5, y + 8);

      doc.setFontSize(19);
      doc.setTextColor(15, 23, 42);
      doc.text(textValue(value), x + 5, y + 22);
    };

    const drawChart = (
      type: string,
      title: string,
      rows: Array<Record<string, any>>,
      columns: Array<{ name: string; data_type?: string }>,
      xField: string | null | undefined,
      yField: string | null | undefined,
      x: number,
      y: number,
      w: number,
      h: number
    ) => {
      const firstRow = rows[0] || {};
      const keys =
        columns.length > 0
          ? columns.map((column) => column.name)
          : Object.keys(firstRow);

      // Prefer the exact fields returned by Copilot. Only fall back to
      // column order when an older widget has no visualization spec.
      const xKey = xField || keys[0];
      const yKey = yField || keys[1];

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(title || 'Visualization', x, y + 7);

      if (!xKey || !yKey || rows.length === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text('No chart data available.', x, y + 17);
        return;
      }

      const chartX = x + 14;
      const chartY = y + 13;
      const chartW = w - 20;
      const chartH = h - 28;

      const points = rows.slice(0, 30).map((row) => ({
        label: textValue(row[xKey]).slice(0, 14),
        value: numberValue(row[yKey]),
      }));

      const max = Math.max(...points.map((p) => Math.abs(p.value)), 1);

      doc.setDrawColor(203, 213, 225);
      doc.line(chartX, chartY + chartH, chartX + chartW, chartY + chartH);

      if (type === 'line') {
        const step = points.length > 1
          ? chartW / (points.length - 1)
          : chartW;

        const coords = points.map((point, index) => ({
          x: chartX + index * step,
          y: chartY + chartH - (Math.abs(point.value) / max) * chartH,
        }));

        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.8);

        for (let i = 1; i < coords.length; i++) {
          doc.line(
            coords[i - 1].x,
            coords[i - 1].y,
            coords[i].x,
            coords[i].y
          );
        }

        coords.forEach((point, index) => {
          doc.setFillColor(15, 23, 42);
          doc.circle(point.x, point.y, 1.4, 'F');

          if (
            index === 0 ||
            index === coords.length - 1 ||
            index % Math.max(1, Math.floor(points.length / 6)) === 0
          ) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6);
            doc.setTextColor(71, 85, 105);
            doc.text(points[index].label, point.x, chartY + chartH + 5, {
              align: 'center',
            });
          }
        });
      } else {
        const slot = chartW / Math.max(points.length, 1);
        const barW = Math.max(4, slot * 0.6);

        points.forEach((point, index) => {
          const barH = (Math.abs(point.value) / max) * chartH;
          const barX = chartX + index * slot + (slot - barW) / 2;
          const barY = chartY + chartH - barH;

          doc.setFillColor(15, 23, 42);
          doc.rect(barX, barY, barW, barH, 'F');

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6);
          doc.setTextColor(71, 85, 105);
          doc.text(point.label, barX + barW / 2, chartY + chartH + 5, {
            align: 'center',
          });

          doc.setFontSize(6);
          doc.setTextColor(15, 23, 42);
          doc.text(
            point.value.toLocaleString(),
            barX + barW / 2,
            Math.max(chartY + 4, barY - 2),
            { align: 'center' }
          );
        });
      }
    };

    const drawTable = (
      title: string,
      rows: Array<Record<string, any>>,
      columns: Array<{ name: string; data_type?: string }>,
      x: number,
      y: number,
      w: number
    ) => {
      const keys =
        columns.length > 0
          ? columns.map((column) => column.name)
          : Object.keys(rows[0] || {});

      const visibleKeys = keys.slice(0, 8);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(title || 'Data', x, y + 7);

      const tableY = y + 13;
      const rowH = 7;
      const colW = w / Math.max(visibleKeys.length, 1);

      doc.setFillColor(245, 245, 244);
      doc.rect(x, tableY, w, rowH, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(15, 23, 42);

      visibleKeys.forEach((key, index) => {
        doc.text(
          key.slice(0, 18),
          x + index * colW + 2,
          tableY + 4.5
        );
      });

      doc.setFont('helvetica', 'normal');

      rows.slice(0, 18).forEach((row, rowIndex) => {
        const currentY = tableY + rowH + rowIndex * rowH;

        doc.setDrawColor(226, 232, 240);
        doc.line(x, currentY + rowH, x + w, currentY + rowH);

        visibleKeys.forEach((key, index) => {
          doc.text(
            textValue(row[key]).slice(0, 22),
            x + index * colW + 2,
            currentY + 4.5
          );
        });
      });
    };

    header();

    // Real dashboard KPIs
    if (data.kpis && data.kpis.length > 0) {
      const gap = 4;
      const count = Math.min(data.kpis.length, 4);
      const cardW = (contentWidth - gap * (count - 1)) / count;

      data.kpis.slice(0, 4).forEach((kpi, index) => {
        drawKpi(
          kpi.label,
          kpi.value,
          margin + index * (cardW + gap),
          29,
          cardW
        );
      });
    }

    const widgets = data.widgets || [];

    if (widgets.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text('No dashboard widgets were available.', margin, 75);
    }

    widgets.forEach((widget, index) => {
      doc.addPage();
      header(`Widget ${index + 1} of ${widgets.length}`);

      const type = String(
        widget.visualization_spec?.type ||
        widget.widget_type ||
        'table'
      ).toLowerCase();

      const rows = widget.rows || [];
      const columns = widget.columns || [];
      const spec = widget.visualization_spec;

      if (type === 'kpi') {
        const firstRow = rows[0] || {};
        const valueKey =
          spec?.yField ||
          columns[0]?.name ||
          Object.keys(firstRow)[0];

        const value =
          spec?.value !== undefined && spec?.value !== null
            ? spec.value
            : firstRow[valueKey];

        drawKpi(
          spec?.title || widget.title,
          value,
          margin,
          35,
          90
        );
      } else if (type === 'bar' || type === 'line') {
        drawChart(
          type,
          spec?.title || widget.title,
          rows,
          columns,
          spec?.xField,
          spec?.yField,
          margin,
          34,
          contentWidth,
          125
        );
      } else {
        drawTable(
          widget.title,
          rows,
          columns,
          margin,
          34,
          contentWidth
        );
      }

      if (widget.sql_query) {
        doc.setFont('courier', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `Query: ${widget.sql_query.slice(0, 180)}`,
          margin,
          192
        );
      }
    });

    doc.save(filename);
  } catch (error) {
    console.error('DASHBOARD_PDF_EXPORT_ERROR:', error);
    throw new Error(
      `PDF export failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Exports the dashboard as high-resolution PNG image.
 */
export async function exportDashboardToPNG(
  dashboardElement: HTMLElement,
  options: ExportOptions
): Promise<void> {
  const scale = options.resolution === '4x' ? 4 : options.resolution === '2x' ? 2 : 1;
  const filename = options.filename || `pi-analytics-dashboard-${options.resolution}-${Date.now()}.png`;

  const canvas = await renderDashboardToCanvas(dashboardElement, scale);
  const dataUrl = canvas.toDataURL('image/png');
  triggerDownload(dataUrl, filename);
}

/**
 * Exports the dashboard as JPEG image with quality settings.
 */
export async function exportDashboardToJPEG(
  dashboardElement: HTMLElement,
  options: ExportOptions
): Promise<void> {
  const scale = options.resolution === '4x' ? 4 : options.resolution === '2x' ? 2 : 1;
  const filename = options.filename || `pi-analytics-dashboard-${options.resolution}-${Date.now()}.jpg`;

  const canvas = await renderDashboardToCanvas(dashboardElement, scale);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  triggerDownload(dataUrl, filename);
}

/**
 * Exports the dashboard as SVG vector file.
 */
export async function exportDashboardToSVG(
  dashboardElement: HTMLElement,
  options: ExportOptions
): Promise<void> {
  const filename = options.filename || `pi-analytics-dashboard-${Date.now()}.svg`;
  const width = dashboardElement.offsetWidth || 1200;
  const height = dashboardElement.offsetHeight || 900;

  const svgDataUri = await domToSvgDataUri(dashboardElement, width, height);
  triggerDownload(svgDataUri, filename);
}

/**
 * Exports dashboard structured data as JSON.
 */
export function exportDashboardToJSON(
  data: DashboardExportData,
  options: ExportOptions
): void {
  const filename = options.filename || `pi-analytics-dashboard-${Date.now()}.json`;
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  URL.revokeObjectURL(url);
}

/**
 * P0-7: Exports dashboard real data and query results to a valid multi-sheet Excel (.xlsx) file.
 */
export async function exportDashboardToXLSX(
  data: DashboardExportData,
  options: ExportOptions
): Promise<void> {
  const filename = options.filename || `pi-analytics-dashboard-${Date.now()}.xlsx`;
  const XLSX = await import('xlsx');

  const workbook = XLSX.utils.book_new();

  // Sheet 1: Executive Summary & Overview
  const summaryRows: Array<Record<string, any>> = [
    { Metric: 'Dashboard Title', Value: data.title },
    { Metric: 'Exported At', Value: data.exportedAt },
    { Metric: 'Connected Sources', Value: data.systemMetrics.connectedSources },
    { Metric: 'Cataloged Tables', Value: data.systemMetrics.catalogedTables },
    { Metric: 'Sync Freshness', Value: data.systemMetrics.syncFreshness },
    { Metric: 'System Health', Value: data.systemMetrics.systemHealth },
  ];

  if (data.kpis && data.kpis.length > 0) {
    summaryRows.push({ Metric: '--- KPIs ---', Value: '------------' });
    data.kpis.forEach((kpi) => {
      summaryRows.push({
        Metric: kpi.label,
        Value: kpi.value,
        Change: kpi.change || '',
        Context: kpi.subtext || '',
      });
    });
  }

  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Executive Summary');

  // Sheet 2: Data Sources & Catalog
  if (data.sources && data.sources.length > 0) {
    const sourcesSheet = XLSX.utils.json_to_sheet(data.sources);
    XLSX.utils.book_append_sheet(workbook, sourcesSheet, 'Data Sources');
  }

  // Sheet 3: Baseline Data Table (if present)
  if (data.dataTable && data.dataTable.rows.length > 0) {
    const tableSheet = XLSX.utils.json_to_sheet(data.dataTable.rows);
    const safeSheetTitle = data.dataTable.title.replace(/[:\\/?*\[\]]/g, '').slice(0, 31) || 'Data Table';
    XLSX.utils.book_append_sheet(workbook, tableSheet, safeSheetTitle);
  }

  // Sheets 4+: Each Widget with its Real Query Results
  if (data.widgets && data.widgets.length > 0) {
    data.widgets.forEach((w, idx) => {
      if (w.rows && w.rows.length > 0) {
        const widgetSheet = XLSX.utils.json_to_sheet(w.rows);
        const rawTitle = w.title || `Widget ${idx + 1}`;
        const cleanTitle = rawTitle.replace(/[:\\/?*\[\]]/g, '').slice(0, 28);
        const uniqueTitle = `${cleanTitle}_${idx + 1}`.slice(0, 31);
        XLSX.utils.book_append_sheet(workbook, widgetSheet, uniqueTitle);
      }
    });
  }

  // Trigger real XLSX binary download
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  URL.revokeObjectURL(url);
}

/**
 * P0-7: Exports dashboard real data and slide captures to a valid PowerPoint (.pptx) file.
 */
export async function exportDashboardToPPTX(
  dashboardElement: HTMLElement | null,
  data: DashboardExportData,
  options: ExportOptions
): Promise<void> {
  const filename = options.filename || `pi-analytics-dashboard-${Date.now()}.pptx`;
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();

  pptx.layout = 'LAYOUT_16x9';

  // Slide 1: Executive Title Slide
  const slide1 = pptx.addSlide();
  slide1.background = { color: 'FAFAF9' };

  slide1.addText(data.title || 'Pi Analytics Enterprise Report', {
    x: 1.0,
    y: 2.0,
    w: 11.33,
    h: 1.0,
    fontSize: 28,
    bold: true,
    color: '000000',
    fontFace: 'Helvetica',
  });

  slide1.addText(
    `Executive Briefing & Unified Analytics\nExported: ${data.exportedAt} | System Health: ${data.systemMetrics.systemHealth}`,
    {
      x: 1.0,
      y: 3.2,
      w: 11.33,
      h: 0.8,
      fontSize: 14,
      color: '525252',
      fontFace: 'Helvetica',
    }
  );

  // Slide 2: KPI & System Metrics Card Overview
  const slide2 = pptx.addSlide();
  slide2.background = { color: 'FAFAF9' };
  slide2.addText('Executive Metrics & KPIs', {
    x: 0.8,
    y: 0.5,
    w: 11.5,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: '000000',
    fontFace: 'Helvetica',
  });

  if (data.kpis && data.kpis.length > 0) {
    const kpiCount = Math.min(data.kpis.length, 4);
    const cardWidth = 2.7;
    const gap = 0.3;
    data.kpis.slice(0, 4).forEach((kpi, idx) => {
      const xPos = 0.8 + idx * (cardWidth + gap);
      slide2.addShape(pptx.ShapeType.rect, {
        x: xPos,
        y: 1.4,
        w: cardWidth,
        h: 2.2,
        fill: { color: 'FFFFFF' },
        line: { color: 'E5E5E5', width: 1 },
      });
      slide2.addText(kpi.label, {
        x: xPos + 0.15,
        y: 1.6,
        w: cardWidth - 0.3,
        h: 0.4,
        fontSize: 12,
        color: '737373',
        bold: true,
      });
      slide2.addText(String(kpi.value), {
        x: xPos + 0.15,
        y: 2.1,
        w: cardWidth - 0.3,
        h: 0.6,
        fontSize: 22,
        bold: true,
        color: '000000',
      });
      if (kpi.change || kpi.subtext) {
        slide2.addText(`${kpi.change ? kpi.change + ' • ' : ''}${kpi.subtext || ''}`, {
          x: xPos + 0.15,
          y: 2.8,
          w: cardWidth - 0.3,
          h: 0.5,
          fontSize: 10,
          color: '525252',
        });
      }
    });
  }

  // Add Ecosystem Metrics Table on Slide 2
  const ecoRows = [
    [
      { text: 'Connected Sources', options: { bold: true } },
      { text: String(data.systemMetrics.connectedSources) },
      { text: 'Cataloged Tables', options: { bold: true } },
      { text: String(data.systemMetrics.catalogedTables) },
    ],
    [
      { text: 'Freshness', options: { bold: true } },
      { text: data.systemMetrics.syncFreshness },
      { text: 'Status', options: { bold: true } },
      { text: data.systemMetrics.systemHealth },
    ],
  ];
  slide2.addTable(ecoRows, {
    x: 0.8,
    y: 4.0,
    w: 11.5,
    h: 1.2,
    fontSize: 11,
    border: { pt: 1, color: 'E5E5E5' },
    fill: { color: 'FFFFFF' },
  });

  // Slide 3: Visual Dashboard Canvas Capture (if element exists)
  if (dashboardElement) {
    try {
      const scale = options.resolution === '4x' ? 3 : 2;
      const canvas = await renderDashboardToCanvas(dashboardElement, scale);
      const dataUrl = canvas.toDataURL('image/png');
      const slide3 = pptx.addSlide();
      slide3.background = { color: 'FAFAF9' };
      slide3.addText('Dashboard Live Snapshot', {
        x: 0.8,
        y: 0.4,
        w: 11.5,
        h: 0.4,
        fontSize: 18,
        bold: true,
        color: '000000',
      });
      slide3.addImage({
        data: dataUrl,
        x: 0.8,
        y: 1.0,
        w: 11.5,
        h: 5.8,
      });
    } catch (err) {
      console.warn('Canvas capture in PPTX export skipped:', err);
    }
  }

  // Slide 4: Real Data Table Sample (if present)
  if (data.dataTable && data.dataTable.rows.length > 0) {
    const slide4 = pptx.addSlide();
    slide4.background = { color: 'FAFAF9' };
    slide4.addText(data.dataTable.title || 'Underlying Analytics Data', {
      x: 0.8,
      y: 0.4,
      w: 11.5,
      h: 0.4,
      fontSize: 18,
      bold: true,
      color: '000000',
    });

    const headers = data.dataTable.columns.map((c) => ({
      text: c.header,
      options: { bold: true, fill: { color: 'F5F5F4' } },
    }));
    const sampleRows = data.dataTable.rows.slice(0, 8).map((row) =>
      data.dataTable!.columns.map((c) => ({
        text: String(row[c.key] ?? ''),
      }))
    );

    slide4.addTable([headers, ...sampleRows], {
      x: 0.8,
      y: 1.0,
      w: 11.5,
      fontSize: 10,
      border: { pt: 1, color: 'E5E5E5' },
      fill: { color: 'FFFFFF' },
    });
  }

  // Trigger PPTX file download
  await pptx.writeFile({ fileName: filename });
}

