const PF_POLICY_START_DATE = "2026-02-01";

export function getProvidentFundPolicyStartDate() {
  return new Date(`${PF_POLICY_START_DATE}T00:00:00Z`);
}

export function resolveProvidentFundPercent(
  employeeProvidentFundPercent: number | string | null | undefined,
  defaultProvidentFundPercent: number | string | null | undefined,
) {
  if (employeeProvidentFundPercent != null) {
    return Number(employeeProvidentFundPercent);
  }
  return Number(defaultProvidentFundPercent ?? 0);
}

export function getMatchedProvidentFundContribution(employeeProvidentFundAmount: number) {
  return employeeProvidentFundAmount * 2;
}

export function isProvidentFundPolicyActiveForPeriod(month: number, year: number) {
  const periodEnd = new Date(Date.UTC(year, month, 0));
  return periodEnd.getTime() >= getProvidentFundPolicyStartDate().getTime();
}
