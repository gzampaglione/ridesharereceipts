export function calculateTotals(receipts) {
  const totalAmount = receipts.reduce((sum, r) => sum + r.total, 0);
  const totalTips = receipts.reduce((sum, r) => sum + r.tip, 0);
  return { totalAmount, totalTips };
}
