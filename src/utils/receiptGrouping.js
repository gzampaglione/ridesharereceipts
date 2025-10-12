// src/utils/receiptGrouping.js
// Groups Amtrak receipts with their cancellations

export function groupReceiptsWithCancellations(receipts) {
  // Separate Amtrak and non-Amtrak receipts
  const amtrakReceipts = receipts.filter((r) => r.vendor === "Amtrak");
  const otherReceipts = receipts.filter((r) => r.vendor !== "Amtrak");

  // Group Amtrak receipts by reservation number
  const amtrakGroups = new Map();

  amtrakReceipts.forEach((receipt) => {
    const resNum = receipt.reservationNumber;
    if (!resNum) {
      // No reservation number - add as standalone
      amtrakGroups.set(receipt.messageId, [receipt]);
      return;
    }

    if (!amtrakGroups.has(resNum)) {
      amtrakGroups.set(resNum, []);
    }
    amtrakGroups.get(resNum).push(receipt);
  });

  // Create grouped receipt objects
  const groupedAmtrak = [];

  amtrakGroups.forEach((group, key) => {
    if (group.length === 1) {
      // Single receipt - no grouping needed
      groupedAmtrak.push({
        ...group[0],
        isGroup: false,
        hierarchy: [],
      });
    } else {
      // Multiple receipts with same reservation number
      // Sort: purchases first, then refunds
      const sorted = group.sort((a, b) => {
        if (a.isRefund && !b.isRefund) return 1;
        if (!a.isRefund && b.isRefund) return -1;
        return new Date(a.date) - new Date(b.date);
      });

      const purchase = sorted.find((r) => !r.isRefund);
      const refunds = sorted.filter((r) => r.isRefund);

      if (purchase) {
        // Use purchase as parent row
        groupedAmtrak.push({
          ...purchase,
          isGroup: true,
          hasRefund: refunds.length > 0,
          refundAmount: refunds.reduce((sum, r) => sum + Math.abs(r.total), 0),
          hierarchy: refunds.map((r) => r.messageId || r.id),
          children: refunds,
        });

        // Add refunds as child rows
        refunds.forEach((refund) => {
          groupedAmtrak.push({
            ...refund,
            isGroup: false,
            isChildRow: true,
            parentId: purchase.messageId || purchase.id,
            hierarchy: [purchase.messageId || purchase.id],
          });
        });
      } else {
        // Only refunds, no purchase - show all standalone
        sorted.forEach((r) => {
          groupedAmtrak.push({
            ...r,
            isGroup: false,
            hierarchy: [],
          });
        });
      }
    }
  });

  // Combine and return
  return [
    ...otherReceipts.map((r) => ({
      ...r,
      isGroup: false,
      hierarchy: [],
    })),
    ...groupedAmtrak,
  ];
}

export function calculateGroupedTotal(receipt) {
  if (receipt.isGroup && receipt.hasRefund) {
    // Show net amount after refund
    const netAmount = receipt.total - receipt.refundAmount;
    return netAmount;
  }
  return receipt.total;
}
