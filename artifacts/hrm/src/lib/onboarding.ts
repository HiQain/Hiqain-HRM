const CSV_HEADERS = [
  "name",
  "email",
  "password",
  "role",
  "phone",
  "position",
  "department",
  "positionType",
  "joiningDate",
  "probationMonths",
  "officeStartTime",
  "officeEndTime",
  "gracePeriodMinutes",
  "basicSalary",
  "allowances",
  "casualLeaveQuota",
  "sickLeaveQuota",
  "annualLeaveQuota",
  "dateOfBirth",
  "education",
  "address",
];

export function generateTemporaryPassword(length = 12): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const randomValues = crypto.getRandomValues(new Uint32Array(length));

  return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join("");
}

export function createEmployeeCsvTemplateHref(): string {
  const csv = `${CSV_HEADERS.join(",")}\n`;
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}
