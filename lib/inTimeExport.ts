import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { InTimeGridModel, StaffGridRow, sortStaffRows } from './inTimeGrid';
import { IN_TIME_COLORS } from './inTimeColors';
import { getExportHeader } from './exportHeader';

export interface InTimeExportOptions {
  branch: 'both' | 'daily' | 'hypermarket';
  includeSummary: boolean;
  includeColourGrid: boolean;
  includeFines: boolean;
  finesOnlyWithFines: boolean;
  user: any;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function getBranchLabel(branch: 'both' | 'daily' | 'hypermarket'): string {
  if (branch === 'daily') return 'Daily';
  if (branch === 'hypermarket') return 'Hypermarket';
  return 'Both Branches';
}

function getBranchFileTag(branch: 'both' | 'daily' | 'hypermarket'): string {
  if (branch === 'daily') return 'Daily';
  if (branch === 'hypermarket') return 'Hypermarket';
  return 'Both';
}

export function filterRowsByBranch(
  rows: StaffGridRow[],
  branch: 'both' | 'daily' | 'hypermarket'
): StaffGridRow[] {
  if (branch === 'both') return rows;
  return rows.filter((r) => r.branchId === branch);
}

/**
 * Exports In-Time Grid data to landscape A4 PDF.
 */
export async function exportInTimePDF(
  model: InTimeGridModel,
  options: InTimeExportOptions
): Promise<any> {
  const {
    branch,
    includeSummary,
    includeColourGrid,
    includeFines,
    finesOnlyWithFines,
    user,
  } = options;

  const branchRows = filterRowsByBranch(model.rows, branch);
  const sortedRows = sortStaffRows(branchRows, 'place');

  const monthName = MONTH_NAMES[model.month - 1];
  const shortMonth = SHORT_MONTH_NAMES[model.month - 1];
  const branchLabel = getBranchLabel(branch);
  const branchFileTag = getBranchFileTag(branch);
  const fileName = `Nearbi_InTime_${shortMonth}${model.year}_${branchFileTag}.pdf`;

  // Create landscape A4 document (width 297mm, height 210mm) with compression enabled
  const doc = new jsPDF({
    orientation: 'landscape',
    format: 'a4',
    unit: 'mm',
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 297
  const pageHeight = doc.internal.pageSize.getHeight(); // 210

  let isFirstPage = true;

  // Helper to draw the legend box
  const drawLegend = (startY: number) => {
    doc.setFontSize(7.2);
    doc.setFont('helvetica', 'normal');

    const items = [
      { label: 'Green: On time / Early', rgb: IN_TIME_COLORS.green.rgb, textRgb: IN_TIME_COLORS.green.textRgb },
      { label: 'Yellow: 1 - 15 mins late', rgb: IN_TIME_COLORS.yellow.rgb, textRgb: IN_TIME_COLORS.yellow.textRgb },
      { label: 'Orange: 16 - 30 mins late', rgb: IN_TIME_COLORS.orange.rgb, textRgb: IN_TIME_COLORS.orange.textRgb },
      { label: 'Red: > 30 mins late', rgb: IN_TIME_COLORS.red.rgb, textRgb: IN_TIME_COLORS.red.textRgb },
      { label: 'Grey: No punch (L = approved leave)', rgb: IN_TIME_COLORS.grey.rgb, textRgb: IN_TIME_COLORS.grey.textRgb },
      { label: 'White: Hourly / No shift', rgb: [255, 255, 255] as [number, number, number], textRgb: [0, 0, 0] as [number, number, number] },
    ];

    let currX = 10;
    items.forEach((item) => {
      doc.setFillColor(item.rgb[0], item.rgb[1], item.rgb[2]);
      doc.rect(currX, startY - 2.8, 3.5, 3.5, 'FD');
      doc.setTextColor(50, 50, 50);
      doc.text(item.label, currX + 4.5, startY);
      currX += doc.getTextWidth(item.label) + 7;
    });
  };

  // 1. SUMMARY PAGE
  if (includeSummary) {
    if (!isFirstPage) doc.addPage('a4', 'landscape');
    isFirstPage = false;

    const drawSummaryHeader = () => {
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 25, 40);
      doc.text(
        `Nearbi In-Time Report - ${monthName} ${model.year} - ${branchLabel}`,
        10,
        9.5
      );

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      const fineRulesStr = `Fine Rules: Yellow Rs ${model.fineSettings.yellow_fine} (${model.fineSettings.yellow_free_passes} free passes), Orange Rs ${model.fineSettings.orange_fine}, Red Rs ${model.fineSettings.red_fine}`;
      doc.text(fineRulesStr, 10, 13.5);

      drawLegend(18);
    };

    // Summary Table headers
    const tableHeaders = [
      'Place',
      'Name',
      'Dept',
      'Shift',
      'Off days',
      'G',
      'Y',
      'O',
      'R',
      'No punch',
      'Leave',
      'Target',
      'Status',
      'Fines issued',
      'Fines waived',
      'Passes left',
    ];

    const tableRows = sortedRows.map((r) => {
      const placeStr = r.place !== null ? `#${r.place}` : '-';
      let statusStr = r.statusText;
      if (model.isCurrentMonth && r.hasShift && !r.isHourly && !r.isNew && r.progressText) {
        statusStr = `${r.progressText} / ${r.statusText}`;
      }

      return [
        placeStr,
        r.name,
        r.department,
        r.shiftLabel,
        r.offDaysPerMonth,
        r.counts.green,
        r.counts.yellow,
        r.counts.orange,
        r.counts.red,
        r.noPunchPastDays,
        r.approvedLeaveDays,
        r.hasShift && !r.isNew ? r.targetDays : '—',
        statusStr,
        r.isHourly ? '—' : (r.finesIssued > 0 ? `Rs ${r.finesIssued.toLocaleString('en-IN')}` : 'Rs 0'),
        r.isHourly ? '—' : (r.finesWaived > 0 ? `Rs ${r.finesWaived.toLocaleString('en-IN')}` : 'Rs 0'),
        r.isHourly ? '—' : r.freePassesLeft,
      ];
    });

    autoTable(doc, {
      startY: 22,
      margin: { top: 22, bottom: 8, left: 10, right: 10 },
      head: [tableHeaders],
      body: tableRows,
      theme: 'grid',
      tableWidth: 277,
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      didDrawPage: () => {
        drawSummaryHeader();
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontSize: 7,
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 0.5,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      bodyStyles: {
        fontSize: 7,
        cellPadding: [0.5, 0.4, 0.5, 0.4],
        textColor: [30, 30, 30],
        halign: 'center',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },                                       // Place
        1: { halign: 'left', cellWidth: 38, fontStyle: 'bold', overflow: 'linebreak' }, // Name (NEVER CUT OFF)
        2: { halign: 'left', cellWidth: 22 },                                        // Dept
        3: { halign: 'left', cellWidth: 44 },                                        // Shift
        4: { halign: 'center', cellWidth: 8 },                                       // Off days
        5: { halign: 'center', cellWidth: 7 },                                       // G
        6: { halign: 'center', cellWidth: 7 },                                       // Y
        7: { halign: 'center', cellWidth: 7 },                                       // O
        8: { halign: 'center', cellWidth: 7 },                                       // R
        9: { halign: 'center', cellWidth: 11 },                                      // No punch
        10: { halign: 'center', cellWidth: 9 },                                      // Leave
        11: { halign: 'center', cellWidth: 9 },                                      // Target
        12: { halign: 'left', cellWidth: 52 },                                       // Status
        13: { halign: 'right', cellWidth: 18 },                                      // Fines issued
        14: { halign: 'right', cellWidth: 18 },                                      // Fines waived
        15: { halign: 'center', cellWidth: 12 },                                     // Free passes left
      },
      didParseCell: (data: any) => {
        if (data.section === 'body') {
          // G (col 5)
          if (data.column.index === 5) {
            data.cell.styles.fillColor = IN_TIME_COLORS.green.rgb;
            data.cell.styles.textColor = IN_TIME_COLORS.green.textRgb;
            data.cell.styles.fontStyle = 'bold';
          }
          // Y (col 6)
          else if (data.column.index === 6) {
            data.cell.styles.fillColor = IN_TIME_COLORS.yellow.rgb;
            data.cell.styles.textColor = IN_TIME_COLORS.yellow.textRgb;
            data.cell.styles.fontStyle = 'bold';
          }
          // O (col 7)
          else if (data.column.index === 7) {
            data.cell.styles.fillColor = IN_TIME_COLORS.orange.rgb;
            data.cell.styles.textColor = IN_TIME_COLORS.orange.textRgb;
            data.cell.styles.fontStyle = 'bold';
          }
          // R (col 8)
          else if (data.column.index === 8) {
            data.cell.styles.fillColor = IN_TIME_COLORS.red.rgb;
            data.cell.styles.textColor = IN_TIME_COLORS.red.textRgb;
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });
  }

  // 2. COLOUR GRID PAGES
  if (includeColourGrid) {
    if (!isFirstPage) doc.addPage('a4', 'landscape');
    isFirstPage = false;

    const daysCount = model.calendarDays;
    const dayHeaders = ['Staff Name'];
    for (let d = 1; d <= daysCount; d++) {
      const col = model.dayColumns[d - 1];
      dayHeaders.push(`${d}\n${col.dayOfWeek}`);
    }

    const cleanTime = (t: string | null | undefined): string => {
      if (!t) return '';
      return t.replace(/\s*(AM|PM)/i, '').trim();
    };

    const gridRows = sortedRows.map((r) => {
      const shiftSubtext = r.isHourly || !r.hasShift ? 'Hourly' : r.standardShiftRange;
      const rowData: string[] = [`${r.name}\n${shiftSubtext}`];
      for (let d = 1; d <= daysCount; d++) {
        const cell = r.days[d];
        if (!cell) {
          rowData.push('');
          continue;
        }

        if (cell.hasPunch) {
          const inT = cleanTime(cell.formattedIn);
          const outT = cleanTime(cell.formattedOut);
          rowData.push(outT && outT !== '—' ? `${inT}\n${outT}` : inT);
        } else if (cell.isApprovedLeave) {
          rowData.push('L');
        } else if (cell.isFuture) {
          rowData.push('');
        } else {
          // Past no punch
          rowData.push(cell.isHourly ? '' : '—');
        }
      }
      return rowData;
    });

    const nameColWidth = 30;
    const dayColWidth = (277 - nameColWidth) / daysCount;

    const colStyles: Record<number, any> = {
      0: { cellWidth: nameColWidth, halign: 'left', fontStyle: 'bold', overflow: 'linebreak' },
    };
    for (let d = 1; d <= daysCount; d++) {
      colStyles[d] = { cellWidth: dayColWidth, halign: 'center', cellPadding: 0.2 };
    }

    autoTable(doc, {
      startY: 21,
      head: [dayHeaders],
      body: gridRows,
      theme: 'grid',
      tableWidth: 277,
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      didDrawPage: () => {
        // Repeated header and legend on every colour grid page
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(20, 25, 40);
        doc.text(
          `Nearbi In-Time Colour Grid - ${monthName} ${model.year} - ${branchLabel}`,
          10,
          9
        );
        drawLegend(15);
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontSize: 6,
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 0.6,
      },
      bodyStyles: {
        fontSize: 6,
        cellPadding: [0.6, 0.2, 0.6, 0.2],
        textColor: [30, 30, 30],
        halign: 'center',
        minCellHeight: 6.8,
      },
      columnStyles: colStyles,
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index > 0) {
          const staffIndex = data.row.index;
          const dayNumber = data.column.index;
          const r = sortedRows[staffIndex];
          if (!r) return;
          const cell = r.days[dayNumber];
          if (!cell) return;

          if (cell.isHourly) {
            data.cell.styles.fillColor = [255, 255, 255];
            data.cell.styles.textColor = [50, 50, 50];
          } else if (cell.hasPunch && cell.colorCode) {
            const band = IN_TIME_COLORS[cell.colorCode];
            if (band) {
              data.cell.styles.fillColor = band.rgb;
              data.cell.styles.textColor = band.textRgb;
              data.cell.styles.fontStyle = 'bold';
            }
          } else if (cell.isApprovedLeave) {
            data.cell.styles.fillColor = IN_TIME_COLORS.grey.rgb;
            data.cell.styles.textColor = [0, 0, 0];
            data.cell.styles.fontStyle = 'bold';
          } else if (cell.isFuture) {
            // Blank cell
            data.cell.styles.fillColor = [255, 255, 255];
            data.cell.styles.textColor = [200, 200, 200];
          } else {
            // Past day with no punch: plain grey
            data.cell.styles.fillColor = IN_TIME_COLORS.grey.rgb;
            data.cell.styles.textColor = [80, 80, 80];
          }
        }
      },
      didDrawCell: (data: any) => {
        if (data.section === 'body' && data.column.index > 0) {
          const staffIndex = data.row.index;
          const dayNumber = data.column.index;
          const r = sortedRows[staffIndex];
          if (!r) return;
          const cell = r.days[dayNumber];
          if (!cell || !cell.hasPunch) return;

          const inT = cleanTime(cell.formattedIn);
          const outT = cleanTime(cell.formattedOut);
          const hasOut = outT && outT !== '—';

          if (cell.isHourly) {
            // Part 4 item 2: plain white cell, dark text, no band colour
            doc.setFillColor(255, 255, 255);
            doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
            doc.setDrawColor(220, 220, 220);
            doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'S');

            const centerX = data.cell.x + data.cell.width / 2;
            const textY1 = data.cell.y + (hasOut ? 2.8 : 4.2);

            doc.setFontSize(6);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(20, 20, 20);
            doc.text(inT, centerX, textY1, { align: 'center' });

            if (hasOut) {
              const textY2 = data.cell.y + 5.8;
              doc.setFontSize(4.5);
              doc.setFont('helvetica', 'normal');
              doc.setTextColor(80, 80, 80);
              doc.text(outT, centerX, textY2, { align: 'center' });
            }
          } else if (cell.colorCode) {
            const band = IN_TIME_COLORS[cell.colorCode];
            if (band) {
              doc.setFillColor(band.rgb[0], band.rgb[1], band.rgb[2]);
              doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
              doc.setDrawColor(220, 220, 220);
              doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'S');

              const centerX = data.cell.x + data.cell.width / 2;
              const textY1 = data.cell.y + (hasOut ? 2.8 : 4.2);

              // Line 1: IN time at 6pt bold
              doc.setFontSize(6);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(band.textRgb[0], band.textRgb[1], band.textRgb[2]);
              doc.text(inT, centerX, textY1, { align: 'center' });

              // Line 2: OUT time at 4.5pt normal (readable, smaller, no overflow)
              if (hasOut) {
                const textY2 = data.cell.y + 5.8;
                doc.setFontSize(4.5);
                doc.setFont('helvetica', 'normal');
                if (band.textHex === '#FFFFFF') {
                  doc.setTextColor(240, 240, 240);
                } else {
                  doc.setTextColor(50, 50, 50);
                }
                doc.text(outT, centerX, textY2, { align: 'center' });
              }
            }
          }
        }
      },
      margin: { top: 21, left: 10, right: 10, bottom: 12 },
    });
  }

  // 3. PER-STAFF FINES PAGES
  if (includeFines) {
    if (!isFirstPage) doc.addPage('a4', 'landscape');
    isFirstPage = false;

    let staffListForFines = sortedRows;
    if (finesOnlyWithFines) {
      staffListForFines = sortedRows.filter(
        (r) => r.lateDayDetails && r.lateDayDetails.length > 0
      );
    }

    const drawFinesPageHeader = () => {
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 25, 40);
      doc.text(
        `Nearbi In-Time Late Fines Register - ${monthName} ${model.year} - ${branchLabel}`,
        10,
        11
      );
    };

    drawFinesPageHeader();

    let currentY = 16;

    if (staffListForFines.length === 0) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text('No late fines recorded for this selection.', 10, currentY);
    } else {
      for (const r of staffListForFines) {
        const fineCount = r.lateDayDetails ? r.lateDayDetails.length : 0;
        // Total height calculation:
        // Banner: 11.5mm + spacing: 2mm + Table: header (5.5mm) + fineCount * 5mm + margin: 5mm
        const tableHeight = fineCount === 0 ? 6 : 5.5 + fineCount * 5;
        const totalBlockHeight = 11.5 + 2 + tableHeight + 5;

        // Ensure NO staff block is ever split across a page break!
        if (currentY + totalBlockHeight > pageHeight - 14) {
          doc.addPage('a4', 'landscape');
          drawFinesPageHeader();
          currentY = 16;
        }

        // Staff banner box
        doc.setFillColor(245, 247, 250);
        doc.roundedRect(10, currentY, pageWidth - 20, 11.5, 1.5, 1.5, 'F');
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(20, 25, 40);

        const placeStr = r.place !== null ? `#${r.place}` : '-';
        const bannerLeft = `${r.name} (${r.department}) | Shift: ${r.shiftLabel} | Target: ${r.targetDays} | Status: ${r.statusText} | Rank: ${placeStr}`;
        const bannerRight = r.isHourly
          ? 'Hourly (exempt from late fines)'
          : `Fines: Rs ${r.finesIssued.toLocaleString('en-IN')} | Waived: Rs ${r.finesWaived.toLocaleString('en-IN')} | Passes: ${r.freePassesUsed} used, ${r.freePassesLeft} left`;

        doc.text(bannerLeft, 13, currentY + 4.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(70, 70, 70);
        doc.text(bannerRight, 13, currentY + 9.2);

        currentY += 13.5;

        if (fineCount === 0) {
          doc.setFontSize(7.5);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(120, 120, 120);
          doc.text('No late days recorded this month.', 14, currentY);
          currentY += 6;
        } else {
          const fineTableHeaders = [
            'Date',
            'Day',
            'Band',
            'Minutes Late',
            'Resolution / Status',
          ];
          const fineTableRows = r.lateDayDetails.map((ld) => {
            const dt = new Date(ld.date);
            const dayName = [
              'Sunday',
              'Monday',
              'Tuesday',
              'Wednesday',
              'Thursday',
              'Friday',
              'Saturday',
            ][dt.getDay()];
            return [
              ld.date,
              dayName,
              ld.colorCode.toUpperCase(),
              `${ld.minutesLate} mins`,
              ld.statusText,
            ];
          });

          autoTable(doc, {
            startY: currentY,
            head: [fineTableHeaders],
            body: fineTableRows,
            theme: 'grid',
            tableWidth: 277,
            headStyles: {
              fillColor: [51, 65, 85],
              textColor: [255, 255, 255],
              fontSize: 7,
              fontStyle: 'bold',
              cellPadding: 0.9,
            },
            bodyStyles: {
              fontSize: 7,
              cellPadding: 0.9,
              textColor: [30, 30, 30],
            },
            columnStyles: {
              0: { cellWidth: 25, halign: 'center' },
              1: { cellWidth: 25, halign: 'center' },
              2: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
              3: { cellWidth: 25, halign: 'center' },
              4: { cellWidth: 177, halign: 'left' },
            },
            didParseCell: (data: any) => {
              if (data.section === 'body' && data.column.index === 2) {
                const bandName = data.cell.raw.toString().toLowerCase();
                const band = (IN_TIME_COLORS as any)[bandName];
                if (band) {
                  data.cell.styles.fillColor = band.rgb;
                  data.cell.styles.textColor = band.textRgb;
                }
              }
            },
            margin: { left: 10, right: 10, bottom: 14 },
          });

          currentY = (doc as any).lastAutoTable.finalY + 5;
        }
      }
    }
  }

  // Footer line and "Page X of Y" on EVERY page
  const totalPages = doc.getNumberOfPages();
  const footerTimestamp = getExportHeader(user);

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);

    // Left footer: generated on ...
    doc.text(footerTimestamp, 10, pageHeight - 6);

    // Right footer: Page X of Y
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 10, pageHeight - 6, {
      align: 'right',
    });
  }

  if (typeof window !== 'undefined') {
    doc.save(fileName);
  }
  return doc;
}

/**
 * Exports In-Time Grid data to multi-sheet Excel file.
 */
export async function exportInTimeExcel(
  model: InTimeGridModel,
  options: InTimeExportOptions
): Promise<any> {
  const {
    branch,
    includeSummary,
    includeColourGrid,
    includeFines,
    finesOnlyWithFines,
    user,
  } = options;

  const branchRows = filterRowsByBranch(model.rows, branch);
  const sortedRows = sortStaffRows(branchRows, 'place');

  const monthName = MONTH_NAMES[model.month - 1];
  const shortMonth = SHORT_MONTH_NAMES[model.month - 1];
  const branchLabel = getBranchLabel(branch);
  const branchFileTag = getBranchFileTag(branch);
  const fileName = `Nearbi_InTime_${shortMonth}${model.year}_${branchFileTag}.xlsx`;

  const workbook = new ExcelJS.Workbook();
  const exportHeaderLine = getExportHeader(user);

  // 1. SUMMARY SHEET
  if (includeSummary) {
    const summarySheet = workbook.addWorksheet('Summary');

    // Row 1: Header line
    summarySheet.addRow([exportHeaderLine]);
    summarySheet.mergeCells('A1:P1');
    const r1 = summarySheet.getRow(1);
    r1.font = { italic: true, size: 9, color: { argb: '555555' } };
    r1.alignment = { vertical: 'middle' };

    // Row 2: Title
    summarySheet.addRow([`Nearbi In-Time Report - ${monthName} ${model.year} - ${branchLabel}`]);
    summarySheet.mergeCells('A2:P2');
    const r2 = summarySheet.getRow(2);
    r2.font = { bold: true, size: 13, color: { argb: '1E293B' } };
    r2.alignment = { vertical: 'middle' };

    // Row 3: Fine rules
    const fineRulesStr = `Fine Rules: Yellow Rs ${model.fineSettings.yellow_fine} (${model.fineSettings.yellow_free_passes} free passes), Orange Rs ${model.fineSettings.orange_fine}, Red Rs ${model.fineSettings.red_fine}`;
    summarySheet.addRow([fineRulesStr]);
    summarySheet.mergeCells('A3:P3');
    const r3 = summarySheet.getRow(3);
    r3.font = { size: 9, color: { argb: '333333' } };

    // Row 4: Empty
    summarySheet.addRow([]);

    // Row 5: Table Header
    const headers = [
      'Place',
      'Name',
      'Branch',
      'Department',
      'Shift',
      'Off Days',
      'Green',
      'Yellow',
      'Orange',
      'Red',
      'No Punch',
      'Leave',
      'Target',
      'Status',
      'Fines Issued (Rs)',
      'Fines Waived (Rs)',
      'Free Passes Left',
    ];
    summarySheet.addRow(headers);
    const r5 = summarySheet.getRow(5);
    r5.height = 24;
    r5.font = { bold: true, color: { argb: 'FFFFFF' }, size: 9.5 };
    r5.alignment = { horizontal: 'center', vertical: 'middle' };
    r5.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '1E293B' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: '475569' } },
        bottom: { style: 'thin', color: { argb: '475569' } },
        left: { style: 'thin', color: { argb: '475569' } },
        right: { style: 'thin', color: { argb: '475569' } },
      };
    });

    // Data rows
    sortedRows.forEach((r) => {
      const placeStr = r.place !== null ? `#${r.place}` : '-';
      let statusStr = r.statusText;
      if (model.isCurrentMonth && r.hasShift && !r.isHourly && !r.isNew && r.progressText) {
        statusStr = `${r.progressText} / ${r.statusText}`;
      }

      const rowValues = [
        placeStr,
        r.name,
        r.branchId === 'hypermarket' ? 'Hypermarket' : 'Daily',
        r.department,
        r.shiftLabel,
        r.offDaysPerMonth,
        r.counts.green,
        r.counts.yellow,
        r.counts.orange,
        r.counts.red,
        r.noPunchPastDays,
        r.approvedLeaveDays,
        r.hasShift && !r.isNew ? r.targetDays : '—',
        statusStr,
        r.isHourly ? '—' : (r.finesIssued > 0 ? `Rs ${r.finesIssued.toLocaleString('en-IN')}` : 'Rs 0'),
        r.isHourly ? '—' : (r.finesWaived > 0 ? `Rs ${r.finesWaived.toLocaleString('en-IN')}` : 'Rs 0'),
        r.isHourly ? '—' : r.freePassesLeft,
      ];

      const row = summarySheet.addRow(rowValues);
      row.alignment = { vertical: 'middle' };

      // Fill colors on G (col 7), Y (col 8), O (col 9), R (col 10)
      const gCell = row.getCell(7);
      gCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${IN_TIME_COLORS.green.hex}` } };
      gCell.font = { bold: true, color: { argb: 'FF000000' } };
      gCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const yCell = row.getCell(8);
      yCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${IN_TIME_COLORS.yellow.hex}` } };
      yCell.font = { bold: true, color: { argb: 'FF000000' } };
      yCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const oCell = row.getCell(9);
      oCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${IN_TIME_COLORS.orange.hex}` } };
      oCell.font = { bold: true, color: { argb: 'FF000000' } };
      oCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const rCell = row.getCell(10);
      rCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${IN_TIME_COLORS.red.hex}` } };
      rCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      rCell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Freeze header row and Name column
    summarySheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 5 }];

    // Auto-fit column widths
    summarySheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: true }, (c) => {
        const val = c.value ? c.value.toString() : '';
        if (val.length > maxLen && val.length < 50) maxLen = val.length;
      });
      col.width = Math.max(maxLen + 3, 10);
    });
  }

  // 2. COLOUR GRID SHEET
  if (includeColourGrid) {
    const gridSheet = workbook.addWorksheet('Colour Grid');

    // Row 1: Header line
    gridSheet.addRow([exportHeaderLine]);
    gridSheet.mergeCells('A1:AI1');
    const r1 = gridSheet.getRow(1);
    r1.font = { italic: true, size: 9, color: { argb: '555555' } };

    // Row 2: Legend / Instructions
    const legendStr = `Green: On Time/Early (${IN_TIME_COLORS.green.hashHex}) | Yellow: 1-15m (${IN_TIME_COLORS.yellow.hashHex}) | Orange: 16-30m (${IN_TIME_COLORS.orange.hashHex}) | Red: >30m (${IN_TIME_COLORS.red.hashHex}) | Grey: No punch | L = approved leave | White: Hourly / No shift`;
    gridSheet.addRow([legendStr]);
    gridSheet.mergeCells('A2:AI2');
    const r2 = gridSheet.getRow(2);
    r2.font = { size: 9, color: { argb: '333333' } };

    // Row 3: Day Header
    const daysCount = model.calendarDays;
    const headerRowValues = ['Staff Name', 'Type'];
    for (let d = 1; d <= daysCount; d++) {
      const col = model.dayColumns[d - 1];
      headerRowValues.push(`${d} (${col.dayOfWeek})`);
    }

    gridSheet.addRow(headerRowValues);
    const r3 = gridSheet.getRow(3);
    r3.height = 24;
    r3.font = { bold: true, color: { argb: 'FFFFFF' }, size: 9 };
    r3.alignment = { horizontal: 'center', vertical: 'middle' };
    r3.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '1E293B' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: '475569' } },
        bottom: { style: 'thin', color: { argb: '475569' } },
        left: { style: 'thin', color: { argb: '475569' } },
        right: { style: 'thin', color: { argb: '475569' } },
      };
    });

    // 2 rows per staff (Row 1: IN with colour fill, Row 2: OUT uncoloured)
    sortedRows.forEach((r) => {
      const shiftSubtext = r.isHourly || !r.hasShift ? 'Hourly' : r.standardShiftRange;
      const nameWithShift = `${r.name}\n${shiftSubtext}`;
      const inRowValues: any[] = [nameWithShift, 'IN'];
      const outRowValues: any[] = ['', 'OUT'];

      for (let d = 1; d <= daysCount; d++) {
        const cell = r.days[d];
        if (!cell) {
          inRowValues.push('');
          outRowValues.push('');
          continue;
        }

        if (cell.hasPunch) {
          inRowValues.push(cell.formattedIn);
          outRowValues.push(cell.formattedOut && cell.formattedOut !== '—' ? cell.formattedOut : '');
        } else if (cell.isApprovedLeave) {
          inRowValues.push('L');
          outRowValues.push('');
        } else if (cell.isFuture) {
          inRowValues.push('');
          outRowValues.push('');
        } else {
          // Past no punch
          inRowValues.push(cell.isHourly ? '' : '—');
          outRowValues.push('');
        }
      }

      const inRow = gridSheet.addRow(inRowValues);
      inRow.alignment = { horizontal: 'center', vertical: 'middle' };
      inRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      inRow.getCell(1).font = { bold: true };

      // Apply fill colors to IN row
      for (let d = 1; d <= daysCount; d++) {
        const cell = r.days[d];
        const xlCell = inRow.getCell(d + 2);

        xlCell.border = {
          top: { style: 'thin', color: { argb: 'E2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
          left: { style: 'thin', color: { argb: 'E2E8F0' } },
          right: { style: 'thin', color: { argb: 'E2E8F0' } },
        };

        if (!cell || cell.isHourly) {
          // White
          xlCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
          xlCell.font = { bold: true, color: { argb: 'FF000000' } };
        } else if (cell.hasPunch && cell.colorCode) {
          const band = IN_TIME_COLORS[cell.colorCode];
          if (band) {
            xlCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${band.hex}` } };
            xlCell.font = {
              bold: true,
              color: { argb: band.textHex === '#FFFFFF' ? 'FFFFFFFF' : 'FF000000' },
            };
          }
        } else if (cell.isApprovedLeave) {
          xlCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${IN_TIME_COLORS.grey.hex}` } };
          xlCell.font = { bold: true, color: { argb: 'FF000000' } };
        } else if (cell.isFuture) {
          // White blank
          xlCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
        } else {
          // Past no punch
          xlCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${IN_TIME_COLORS.grey.hex}` } };
          xlCell.font = { color: { argb: 'FF475569' } };
        }
      }

      const outRow = gridSheet.addRow(outRowValues);
      outRow.alignment = { horizontal: 'center', vertical: 'middle' };
      outRow.font = { size: 8, color: { argb: '64748B' } };
      for (let d = 1; d <= daysCount; d++) {
        const xlCell = outRow.getCell(d + 2);
        xlCell.border = {
          top: { style: 'thin', color: { argb: 'E2E8F0' } },
          bottom: { style: 'medium', color: { argb: 'CBD5E1' } },
          left: { style: 'thin', color: { argb: 'E2E8F0' } },
          right: { style: 'thin', color: { argb: 'E2E8F0' } },
        };
      }
    });

    // Freeze header row and Name column
    gridSheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 3 }];

    gridSheet.getColumn(1).width = 24;
    gridSheet.getColumn(2).width = 8;
    for (let d = 1; d <= daysCount; d++) {
      gridSheet.getColumn(d + 2).width = 11;
    }
  }

  // 3. FINES SHEET
  if (includeFines) {
    const finesSheet = workbook.addWorksheet('Fines');

    // Row 1: Header line
    finesSheet.addRow([exportHeaderLine]);
    finesSheet.mergeCells('A1:K1');
    const r1 = finesSheet.getRow(1);
    r1.font = { italic: true, size: 9, color: { argb: '555555' } };

    // Row 2: Table Header
    const fineHeaders = [
      'Staff Name',
      'Branch',
      'Department',
      'Date',
      'Day',
      'Band',
      'Minutes Late',
      'Fine Amount (Rs)',
      'Resolution / Status',
      'Waived By',
      'Waived Reason',
    ];
    finesSheet.addRow(fineHeaders);
    const r2 = finesSheet.getRow(2);
    r2.height = 24;
    r2.font = { bold: true, color: { argb: 'FFFFFF' }, size: 9.5 };
    r2.alignment = { horizontal: 'center', vertical: 'middle' };
    r2.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '1E293B' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: '475569' } },
        bottom: { style: 'thin', color: { argb: '475569' } },
        left: { style: 'thin', color: { argb: '475569' } },
        right: { style: 'thin', color: { argb: '475569' } },
      };
    });

    let staffListForFines = sortedRows;
    if (finesOnlyWithFines) {
      staffListForFines = sortedRows.filter(
        (r) => r.lateDayDetails && r.lateDayDetails.length > 0
      );
    }

    staffListForFines.forEach((r) => {
      r.lateDayDetails.forEach((ld) => {
        const dt = new Date(ld.date);
        const dayName = [
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
        ][dt.getDay()];

        const rowValues = [
          r.name,
          r.branchId === 'hypermarket' ? 'Hypermarket' : 'Daily',
          r.department,
          ld.date,
          dayName,
          ld.colorCode.toUpperCase(),
          ld.minutesLate,
          ld.fineAmount !== undefined ? `Rs ${ld.fineAmount.toLocaleString('en-IN')}` : '—',
          ld.statusText,
          ld.waivedBy || '—',
          ld.waivedReason || '—',
        ];

        const row = finesSheet.addRow(rowValues);
        row.alignment = { vertical: 'middle' };

        // Color band cell (col 6)
        const bandCell = row.getCell(6);
        const band = (IN_TIME_COLORS as any)[ld.colorCode];
        if (band) {
          bandCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: `FF${band.hex}` },
          };
          bandCell.font = {
            bold: true,
            color: { argb: band.textHex === '#FFFFFF' ? 'FFFFFFFF' : 'FF000000' },
          };
          bandCell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });
    });

    // Freeze header row and Name column
    finesSheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];

    // Auto-fit column widths
    finesSheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: true }, (c) => {
        const val = c.value ? c.value.toString() : '';
        if (val.length > maxLen && val.length < 50) maxLen = val.length;
      });
      col.width = Math.max(maxLen + 3, 12);
    });
  }

  // Trigger browser download if in browser
  if (typeof window !== 'undefined') {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  return workbook;
}
