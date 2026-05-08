const PF_POLICY_START_DATE = "2026-02-01";

export function getProvidentFundPolicyStartDate() {
  return new Date(`${PF_POLICY_START_DATE}T00:00:00Z`);
}

export function isProvidentFundPolicyActiveForPeriod(month: number, year: number) {
  const periodEnd = new Date(Date.UTC(year, month, 0));
  return periodEnd.getTime() >= getProvidentFundPolicyStartDate().getTime();
}
