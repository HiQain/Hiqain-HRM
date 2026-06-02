import { Download } from "lucide-react";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDuration, formatMonth } from "@/lib/utils";

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
  scheduledMinutes?: number;
  completedMinutes?: number;
  extraMinutes?: number;
  shortMinutes?: number;
  basicSalary: number;
  allowances: number;
  bonus: number;
  loanDeduction: number;
  otherDeductions: number;
  netSalary: number;
  salaryBreakdown?: {
    earnings?: Array<{ label: string; amount: number }>;
    deductions?: Array<{ label: string; amount: number }>;
  } | null;
  generatedAt: string;
};

function empCode(id: number, code?: string | null) {
  if (code) return code;
  return `EMP-${String(id).padStart(3, "0")}`;
}

function getBreakdownRows(p: Payslip) {
  const fallbackEarnings: Array<{ label: string; amount: number }> = [
    { label: "Basic Salary", amount: p.basicSalary },
    { label: "Home Rent", amount: Math.round((p.allowances / 2) * 100) / 100 },
    {
      label: "Utility Bills",
      amount:
        Math.round((p.allowances - Math.round((p.allowances / 2) * 100) / 100) * 100) /
        100,
    },
    { label: "Additional Bonus", amount: p.bonus },
  ];

  const fallbackDeductions: Array<{ label: string; amount: number }> = [
    { label: "Absence Deduction", amount: 0 },
    { label: "Late Penalty", amount: 0 },
    { label: "Loan Deduction", amount: p.loanDeduction },
    { label: "Other Deductions", amount: p.otherDeductions },
    { label: "Provident Fund", amount: 0 },
    { label: "Payroll Tax", amount: 0 },
  ];

  return {
    earnings: p.salaryBreakdown?.earnings?.length
      ? p.salaryBreakdown.earnings
      : fallbackEarnings,
    deductions: p.salaryBreakdown?.deductions?.length
      ? p.salaryBreakdown.deductions
      : fallbackDeductions,
  };
}

function downloadPayslipPdf(p: Payslip, logoDataUrl?: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const margin = 42;
  const contentW = w - margin * 2;
  const leftColW = contentW / 2;
  const halfGap = 10;
  const pageBottom = doc.internal.pageSize.getHeight() - margin;
  const lineColor: [number, number, number] = [205, 213, 224];
  const mutedColor: [number, number, number] = [98, 109, 124];
  const strongColor: [number, number, number] = [31, 41, 55];
  let y = margin;

  const drawBox = (x: number, top: number, width: number, height: number) => {
    doc.setDrawColor(...lineColor);
    doc.setLineWidth(0.8);
    doc.rect(x, top, width, height);
  };

  const drawCell = (
    x: number,
    top: number,
    width: number,
    height: number,
    label: string,
    value: string,
    align: "left" | "right" = "left",
  ) => {
    drawBox(x, top, width, height);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...mutedColor);
    doc.text(label, x + 14, top + 16);
    doc.setFont("courier", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...strongColor);
    const textX = align === "right" ? x + width - 14 : x + 14;
    doc.text(value || "-", textX, top + 36, {
      align: align === "right" ? "right" : "left",
      maxWidth: width - 28,
    });
  };

  const drawSlipRow = (
    x: number,
    top: number,
    width: number,
    label: string,
    value?: string | null,
  ) => {
    drawBox(x, top, width, 28);
    doc.setFont("courier", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...mutedColor);
    doc.text(label || " ", x + 12, top + 18, { maxWidth: width - 110 });
    if (value) {
      doc.setTextColor(...strongColor);
      doc.text(value, x + width - 12, top + 18, { align: "right" });
    }
  };

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...strongColor);

  const breakdown = getBreakdownRows(p);
  const earningsRows = breakdown.earnings.map((row) => [row.label, formatCurrency(row.amount)] as const);
  const deductionRows = breakdown.deductions.map((row) => [row.label, formatCurrency(row.amount)] as const);
  const rowCount = Math.max(earningsRows.length, deductionRows.length, 1);
  const totalAddition = p.basicSalary + p.allowances + p.bonus;
  const totalDeduction = p.otherDeductions + p.loanDeduction;

  // Header
  drawBox(margin, y, contentW, 72);
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", margin + 14, y + 12, 26, 26);
    } catch {
      // ignore logo error
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("HiQain", w / 2, y + 26, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("HR Management System", w / 2, y + 42, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Pay Slip for ${formatMonth(p.month, p.year)}`, w / 2, y + 58, {
    align: "center",
  });
  y += 84;

  // Employee info
  drawCell(margin, y, leftColW, 48, "EMPLOYEE CODE", empCode(p.employeeId, p.employeeCode));
  drawCell(margin + leftColW, y, leftColW, 48, "NAME", p.employeeName);
  y += 48;
  drawCell(margin, y, leftColW, 48, "DESIGNATION", p.employeePosition || "-");
  drawCell(margin + leftColW, y, leftColW, 48, "MODE OF PAYMENT", "Online");
  y += 48;

  // Attendance
  const quarterW = contentW / 4;
  drawCell(margin, y, quarterW, 52, "WORKING DAYS", String(p.totalWorkingDays));
  drawCell(margin + quarterW, y, quarterW, 52, "PRESENT", String(p.presentDays));
  drawCell(margin + quarterW * 2, y, quarterW, 52, "ABSENT", String(p.absentDays));
  drawCell(
    margin + quarterW * 3,
    y,
    quarterW,
    52,
    "LATE → ABSENCE",
    `${p.lateCount} late · ${p.lateAbsenceDays ?? 0} day${(p.lateAbsenceDays ?? 0) === 1 ? "" : "s"}`,
  );
  y += 64;

  // Breakdown headers
  drawBox(margin, y, leftColW, 28);
  drawBox(margin + leftColW, y, leftColW, 28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...mutedColor);
  doc.text("EARNINGS / ADDITION", margin + 12, y + 18);
  doc.text("DEDUCTIONS", margin + leftColW + 12, y + 18);
  y += 28;

  for (let i = 0; i < rowCount; i++) {
    const earn = earningsRows[i];
    const ded = deductionRows[i];
    drawSlipRow(margin, y, leftColW, earn?.[0] ?? "", earn?.[1] ?? null);
    drawSlipRow(margin + leftColW, y, leftColW, ded?.[0] ?? "", ded?.[1] ?? null);
    y += 28;
  }

  // Totals
  drawBox(margin, y, leftColW, 30);
  drawBox(margin + leftColW, y, leftColW, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...strongColor);
  doc.text("TOTAL ADDITION", margin + 12, y + 20);
  doc.text(formatCurrency(totalAddition), margin + leftColW - 12, y + 20, {
    align: "right",
  });
  doc.text("TOTAL DEDUCTION", margin + leftColW + 12, y + 20);
  doc.text(formatCurrency(totalDeduction), margin + contentW - 12, y + 20, {
    align: "right",
  });
  y += 30;

  // Net payment
  drawBox(margin, y, contentW, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("NET PAYMENT", margin + 12, y + 26);
  doc.setFontSize(18);
  doc.text(formatCurrency(p.netSalary), margin + contentW - 12, y + 27, {
    align: "right",
  });
  y += 42;

  // Footer
  const footerY = Math.min(y + 26, pageBottom);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...mutedColor);
  doc.text("System generated. No signature required.", w / 2, footerY, { align: "center" });

  const safeName = p.employeeName.replace(/\s+/g, "-").toLowerCase();
  doc.save(`payslip-${safeName}-${p.year}-${String(p.month).padStart(2, "0")}.pdf`);
}

export function PayslipView({ payslip }: { payslip: Payslip }) {
  const totalAddition = payslip.basicSalary + payslip.allowances + payslip.bonus;
  const totalDeduction = payslip.otherDeductions + payslip.loanDeduction;
  const scheduledMinutes = Math.max(0, Number(payslip.scheduledMinutes ?? 0));
  const completedMinutes = Math.max(0, Number(payslip.completedMinutes ?? 0));
  const extraMinutes = Math.max(0, Number(payslip.extraMinutes ?? 0));
  const shortMinutes = Math.max(0, Number(payslip.shortMinutes ?? 0));
  const breakdown = getBreakdownRows(payslip);
  const rowCount = Math.max(breakdown.earnings.length, breakdown.deductions.length, 1);
  const earningsRows = Array.from({ length: rowCount }, (_, index) =>
    breakdown.earnings[index] ?? null,
  );
  const deductionRows = Array.from({ length: rowCount }, (_, index) =>
    breakdown.deductions[index] ?? null,
  );

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

        <div className="grid grid-cols-4 border-b border-border divide-x divide-border bg-muted/5">
          <InfoCell label="HOURS REQUIRED" value={formatDuration(scheduledMinutes)} />
          <InfoCell label="HOURS COMPLETED" value={formatDuration(completedMinutes)} />
          <InfoCell label="EXTRA HOURS" value={formatDuration(extraMinutes)} />
          <InfoCell label="LESS HOURS" value={formatDuration(shortMinutes)} />
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
            {earningsRows.map((row, index) => (
              <SlipRow
                key={`earning-${index}`}
                label={row?.label ?? ""}
                value={row?.amount ?? null}
              />
            ))}
          </div>
          {/* Right: Deductions */}
          <div className="divide-y divide-border/50">
            {deductionRows.map((row, index) => (
              <SlipRow
                key={`deduction-${index}`}
                label={row?.label ?? ""}
                value={row?.amount ?? null}
              />
            ))}
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
      <span className="text-xs text-muted-foreground uppercase tracking-wide leading-tight">
        {label || "\u00A0"}
      </span>
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
