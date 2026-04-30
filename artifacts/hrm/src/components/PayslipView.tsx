import { Download } from "lucide-react";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatMonth } from "@/lib/utils";

type Payslip = {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeEmail: string;
  employeePosition?: string;
  employeeCode?: string;
  month: number;
  year: number;
  totalWorkingDays: number;
  presentDays: number;
  absentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  lateCount: number;
  lateAbsenceDays?: number;
  basicSalary: number;
  allowances: number;
  bonus: number;
  loanDeduction: number;
  otherDeductions: number;
  netSalary: number;
  generatedAt: string;
};

function empCode(id: number, code?: string | null) {
  if (code) return code;
  return `EMP-${String(id).padStart(3, "0")}`;
}

function downloadPayslipPdf(p: Payslip, logoDataUrl?: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const margin = 40;
  const innerW = w - margin * 2;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(20, 20, 20);

  // Outer border
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(1.5);
  doc.rect(margin - 10, 30, innerW + 20, h - 60);

  // Company header with logo
  let headerY = 55;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", margin, 38, 28, 28);
    } catch {
      // ignore logo error
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("HiQain", w / 2, headerY, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("HR Management System", w / 2, headerY + 14, { align: "center" });

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Pay Slip for ${formatMonth(p.month, p.year)}`, w / 2, headerY + 30, { align: "center" });

  // Horizontal line below title
  doc.setLineWidth(0.5);
  doc.line(margin - 10, headerY + 38, w - margin + 10, headerY + 38);

  // Employee info block
  let y = headerY + 58;
  const labelX = margin;
  const col2X = w / 2 + 10;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("EMPLOYEE CODE", labelX, y);
  doc.setFont("helvetica", "normal");
  doc.text(empCode(p.employeeId, p.employeeCode), labelX + 120, y);

  doc.setFont("helvetica", "bold");
  doc.text("NAME", col2X, y);
  doc.setFont("helvetica", "normal");
  doc.text(p.employeeName, col2X + 80, y);

  y += 22;
  doc.setFont("helvetica", "bold");
  doc.text("DESIGNATION", labelX, y);
  doc.setFont("helvetica", "normal");
  doc.text(p.employeePosition || "-", labelX + 120, y);

  doc.setFont("helvetica", "bold");
  doc.text("MODE OF PAYMENT", col2X, y);
  doc.setFont("helvetica", "normal");
  doc.text("Online", col2X + 120, y);

  // Attendance summary row
  y += 22;
  doc.setFont("helvetica", "bold");
  doc.text("ATTENDANCE", labelX, y);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Working ${p.totalWorkingDays} · Present ${p.presentDays} · Absent ${p.absentDays} · Late ${p.lateCount} (→ ${p.lateAbsenceDays ?? 0} day${(p.lateAbsenceDays ?? 0) === 1 ? "" : "s"})`,
    labelX + 120,
    y,
  );

  // Horizontal line
  y += 16;
  doc.setLineWidth(0.5);
  doc.line(margin - 10, y, w - margin + 10, y);
  y += 14;

  // Earnings / Deductions header
  const leftX = margin;
  const midX = w / 2;
  const rightX = w - margin - 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("EARNINGS / ADDITION", leftX, y);
  doc.line(midX - 5, y - 10, midX - 5, h - 60); // vertical divider
  doc.text("DEDUCTIONS", midX + 10, y);
  y += 6;
  doc.setLineWidth(0.3);
  doc.line(margin - 10, y, w - margin + 10, y);
  y += 16;

  // Earnings rows
  const totalAddition = p.basicSalary + p.allowances + p.bonus;
  const totalDeduction = p.otherDeductions + p.loanDeduction;

  const earningsRows: Array<[string, number | null]> = [
    ["BASIC SALARY", p.basicSalary],
    ["UTILITIES", 0],
    ["HOUSE RENT ALLOWANCE", p.allowances],
    ["INTERNET ALLOWANCE", 0],
    ["MOBILE ALLOWANCE", 0],
    ["FUEL & MAINTENANCE ALLOWANCE", 0],
    ["OVERTIME", 0],
    ["BONUS", p.bonus],
    ["COMMISSION", null],
  ];

  const deductionRows: Array<[string, number | null]> = [
    ["ABSENCE", p.otherDeductions],
    ["ADVANCE", 0],
    ["LOAN", p.loanDeduction],
    ["TAX", 0],
    ["PROVIDENT FUND", null],
  ];

  const maxRows = Math.max(earningsRows.length, deductionRows.length);
  const rowH = 18;

  for (let i = 0; i < maxRows; i++) {
    const rowY = y + i * rowH;
    const earn = earningsRows[i];
    const ded = deductionRows[i];

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);

    if (earn) {
      doc.text(earn[0], leftX, rowY);
      if (earn[1] !== null) {
        doc.text(formatCurrency(earn[1]), midX - 15, rowY, { align: "right" });
      }
    }

    if (ded) {
      doc.text(ded[0], midX + 10, rowY);
      if (ded[1] !== null) {
        doc.text(formatCurrency(ded[1]), rightX, rowY, { align: "right" });
      }
    }
  }

  y = y + maxRows * rowH + 4;
  doc.setLineWidth(0.3);
  doc.line(margin - 10, y, w - margin + 10, y);
  y += 14;

  // Totals row
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TOTAL ADDITION", leftX, y);
  doc.text(formatCurrency(totalAddition), midX - 15, y, { align: "right" });
  doc.text("TOTAL DEDUCTION", midX + 10, y);
  doc.text(formatCurrency(totalDeduction), rightX, y, { align: "right" });

  y += 6;
  doc.setLineWidth(0.5);
  doc.line(margin - 10, y, w - margin + 10, y);
  y += 18;

  // Net Payment
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("NET PAYMENT", leftX, y);
  doc.text(formatCurrency(p.netSalary), rightX, y, { align: "right" });

  y += 6;
  doc.setLineWidth(0.5);
  doc.line(margin - 10, y, w - margin + 10, y);

  // Footer - system generated
  const footerY = h - 60;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("System generated. No signature required.", w / 2, footerY, { align: "center" });

  const safeName = p.employeeName.replace(/\s+/g, "-").toLowerCase();
  doc.save(`payslip-${safeName}-${p.year}-${String(p.month).padStart(2, "0")}.pdf`);
}

export function PayslipView({ payslip }: { payslip: Payslip }) {
  const totalAddition = payslip.basicSalary + payslip.allowances + payslip.bonus;
  const totalDeduction = payslip.otherDeductions + payslip.loanDeduction;

  const handleDownload = () => {
    // Try to load logo as data URL for PDF
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");
      downloadPayslipPdf(payslip, dataUrl);
    };
    img.onerror = () => {
      downloadPayslipPdf(payslip);
    };
    img.src = `${import.meta.env.BASE_URL}logo.png`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          {formatMonth(payslip.month, payslip.year)}
        </p>
        <Button onClick={handleDownload} size="sm" className="gap-2">
          <Download className="h-3.5 w-3.5" />
          Download PDF
        </Button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden text-sm font-mono">
        {/* Company header */}
        <div className="bg-muted/50 border-b border-border px-4 py-3 flex items-center justify-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="HiQain"
            className="h-8 w-8 object-contain"
          />
          <div className="text-center">
            <p className="font-bold text-base">HiQain</p>
            <p className="text-xs text-muted-foreground">Pay Slip for {formatMonth(payslip.month, payslip.year)}</p>
          </div>
        </div>

        {/* Employee Info */}
        <div className="grid grid-cols-2 border-b border-border divide-x divide-border">
          <InfoCell label="EMPLOYEE CODE" value={empCode(payslip.employeeId, payslip.employeeCode)} />
          <InfoCell label="NAME" value={payslip.employeeName} />
        </div>
        <div className="grid grid-cols-2 border-b border-border divide-x divide-border">
          <InfoCell label="DESIGNATION" value={payslip.employeePosition || "-"} />
          <InfoCell label="MODE OF PAYMENT" value="Online" />
        </div>

        {/* Attendance summary */}
        <div className="grid grid-cols-4 border-b border-border divide-x divide-border bg-muted/10">
          <InfoCell label="WORKING DAYS" value={String(payslip.totalWorkingDays)} />
          <InfoCell label="PRESENT" value={String(payslip.presentDays)} />
          <InfoCell label="ABSENT" value={String(payslip.absentDays)} />
          <InfoCell
            label="LATE → ABSENCE"
            value={`${payslip.lateCount} late · ${payslip.lateAbsenceDays ?? 0} day${(payslip.lateAbsenceDays ?? 0) === 1 ? "" : "s"} applied`}
          />
        </div>

        {/* Columns header */}
        <div className="grid grid-cols-2 divide-x divide-border border-b border-border bg-muted/30">
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Earnings / Addition
          </div>
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Deductions
          </div>
        </div>

        {/* Earnings + Deductions rows */}
        <div className="grid grid-cols-2 divide-x divide-border">
          {/* Left: Earnings */}
          <div className="divide-y divide-border/50">
            <SlipRow label="BASIC SALARY" value={payslip.basicSalary} />
            <SlipRow label="UTILITIES" value={0} />
            <SlipRow label="HOUSE RENT ALLOWANCE" value={payslip.allowances} />
            <SlipRow label="INTERNET ALLOWANCE" value={0} />
            <SlipRow label="MOBILE ALLOWANCE" value={0} />
            <SlipRow label="FUEL & MAINTENANCE ALLOWANCE" value={0} />
            <SlipRow label="OVERTIME" value={0} />
            <SlipRow label="BONUS" value={payslip.bonus} />
            <SlipRow label="COMMISSION" value={null} />
          </div>
          {/* Right: Deductions */}
          <div className="divide-y divide-border/50">
            <SlipRow label="ABSENCE" value={payslip.otherDeductions} />
            <SlipRow label="ADVANCE" value={0} />
            <SlipRow label="LOAN" value={payslip.loanDeduction} />
            <SlipRow label="TAX" value={0} />
            <SlipRow label="PROVIDENT FUND" value={null} />
            {/* Fill remaining rows to match height */}
            <div className="px-4 py-2 min-h-[36px]" />
            <div className="px-4 py-2 min-h-[36px]" />
            <div className="px-4 py-2 min-h-[36px]" />
            <div className="px-4 py-2 min-h-[36px]" />
          </div>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 divide-x divide-border border-t border-border bg-muted/20">
          <TotalRow label="TOTAL ADDITION" value={totalAddition} />
          <TotalRow label="TOTAL DEDUCTION" value={totalDeduction} />
        </div>

        {/* Net Payment */}
        <div className="border-t border-border bg-primary/5 px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-sm uppercase tracking-wide">NET PAYMENT</span>
          <span className="font-bold text-lg">{formatCurrency(payslip.netSalary)}</span>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-3 text-center text-xs text-muted-foreground italic">
          System generated. No signature required.
        </div>
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-2.5 text-xs">
      <span className="font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="mt-0.5 font-medium text-foreground">{value}</div>
    </div>
  );
}

function SlipRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 min-h-[36px] gap-2">
      <span className="text-xs text-muted-foreground uppercase tracking-wide leading-tight">{label}</span>
      {value !== null && (
        <span className="text-xs font-medium whitespace-nowrap">{formatCurrency(value)}</span>
      )}
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 gap-2">
      <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
      <span className="text-xs font-bold">{formatCurrency(value)}</span>
    </div>
  );
}
