export async function forwardReceipts(receiptsToForward, toEmail) {
  if (!receiptsToForward || receiptsToForward.length === 0) {
    throw new Error("No receipts to forward");
  }

  // Get the HTML content for each receipt
  const htmlContents = [];

  for (const receipt of receiptsToForward) {
    try {
      const result = await window.electronAPI.getEmailHtml(receipt.messageId);
      if (result.success && result.html) {
        htmlContents.push({
          vendor: receipt.vendor,
          date: new Date(receipt.date).toLocaleDateString(),
          total: receipt.total,
          html: result.html,
        });
      }
    } catch (error) {
      console.error(
        `Failed to get HTML for receipt ${receipt.messageId}:`,
        error
      );
    }
  }

  if (htmlContents.length === 0) {
    throw new Error("Could not retrieve email HTML content");
  }

  // Create a combined HTML email with all receipts
  const emailBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .receipt-container {
      background-color: white;
      margin-bottom: 30px;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .receipt-header {
      background-color: #535bf2;
      color: white;
      padding: 15px;
      margin: -20px -20px 20px -20px;
      border-radius: 8px 8px 0 0;
    }
    .receipt-header h2 {
      margin: 0;
      font-size: 18px;
    }
    .receipt-header p {
      margin: 5px 0 0 0;
      font-size: 14px;
      opacity: 0.9;
    }
    .divider {
      border-top: 2px solid #e0e0e0;
      margin: 30px 0;
    }
    .summary {
      background-color: #f0f0f0;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="summary">
    <h1 style="margin: 0 0 10px 0;">Rideshare Receipts</h1>
    <p style="margin: 0; color: #666;">
      Total Receipts: ${htmlContents.length}<br>
      Total Amount: $${htmlContents
        .reduce((sum, r) => sum + r.total, 0)
        .toFixed(2)}
    </p>
  </div>

  ${htmlContents
    .map(
      (content, index) => `
    <div class="receipt-container">
      <div class="receipt-header">
        <h2>Receipt ${index + 1} of ${htmlContents.length}</h2>
        <p>${content.vendor} - ${content.date} - $${content.total.toFixed(
        2
      )}</p>
      </div>
      ${content.html}
    </div>
    ${index < htmlContents.length - 1 ? '<div class="divider"></div>' : ""}
  `
    )
    .join("")}
  
  <div style="margin-top: 30px; padding: 20px; background-color: #f0f0f0; border-radius: 8px; text-align: center; color: #666;">
    <p style="margin: 0;">Forwarded from Rideshare Receipts App</p>
  </div>
</body>
</html>
  `.trim();

  const subject = `Rideshare Receipts - ${htmlContents.length} receipt${
    htmlContents.length !== 1 ? "s" : ""
  }`;

  return await window.electronAPI.sendEmail(toEmail, subject, emailBody, true); // true = isHtml
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

  return receipts.length;
}
