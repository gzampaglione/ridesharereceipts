export async function forwardReceipts(receipts, toEmail) {
  const emailBody = receipts
    .map((r) => {
      return `Date: ${new Date(r.date).toLocaleDateString()}
Vendor: ${r.vendor}
Total: $${r.total.toFixed(2)}
Tip: $${r.tip.toFixed(2)}
From: ${
        r.startLocation?.city
          ? `${r.startLocation.city}, ${r.startLocation.state || ""}`
          : "N/A"
      }
To: ${
        r.endLocation?.city
          ? `${r.endLocation.city}, ${r.endLocation.state || ""}`
          : "N/A"
      }
Category: ${r.category || "Uncategorized"}
Billed: ${r.billed ? "Yes" : "No"}
---`;
    })
    .join("\n\n");

  const subject = `Rideshare Receipts - ${receipts.length} receipt${
    receipts.length !== 1 ? "s" : ""
  }`;

  return await window.electronAPI.sendEmail(toEmail, subject, emailBody);
}

export function exportReceiptsToCSV(receipts, filename = null) {
  if (!receipts || receipts.length === 0) {
    throw new Error("No receipts to export");
  }

  const headers = [
    "Date",
    "Vendor",
    "Total",
    "Tip",
    "From Location",
    "To Location",
    "Start Time",
    "End Time",
    "Category",
    "Billed",
  ];
  const rows = receipts.map((r) => [
    new Date(r.date).toLocaleDateString(),
    `"${r.vendor}"`,
    r.total.toFixed(2),
    r.tip.toFixed(2),
    `"${
      r.startLocation?.city
        ? `${r.startLocation.city}, ${r.startLocation.state || ""}`
        : "N/A"
    }"`,
    `"${
      r.endLocation?.city
        ? `${r.endLocation.city}, ${r.endLocation.state || ""}`
        : "N/A"
    }"`,
    `"${r.startTime || "N/A"}"`,
    `"${r.endTime || "N/A"}"`,
    `"${r.category || "Uncategorized"}"`,
    r.billed ? "Yes" : "No",
  ]);

  const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
    "\n"
  );
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filename || `receipts_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return receipts.length; // Return count of exported receipts
}
