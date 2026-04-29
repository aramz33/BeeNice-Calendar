export function formatRepSeniority(seniority: string): string {
  if (seniority === "senior") return "Senior";
  if (seniority === "junior") return "Junior";
  return "Non défini";
}
