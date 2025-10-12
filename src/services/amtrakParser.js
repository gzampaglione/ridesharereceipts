// src/services/amtrakParser.js

function parseAmtrakEmail(emailBody, subject) {
  try {
    // Check if this is a refund/cancellation
    const isRefund =
      subject.includes("Refund Receipt") ||
      emailBody.includes("REFUND RECEIPT");

    // Extract reservation number
    const reservationMatch = emailBody.match(
      /Reservation Number\s*-\s*([A-Z0-9]+)/i
    );
    const reservationNumber = reservationMatch
      ? reservationMatch[1].trim()
      : null;

    if (isRefund) {
      return parseAmtrakRefund(emailBody, reservationNumber);
    } else {
      return parseAmtrakPurchase(emailBody, reservationNumber);
    }
  } catch (error) {
    console.error("Amtrak parse error:", error.message);
    return null;
  }
}

function parseAmtrakPurchase(emailBody, reservationNumber) {
  try {
    // Extract total - look for "Total $XX.XX" or "Total Charged by Amtrak"
    const totalMatch =
      emailBody.match(/Total Charged by Amtrak\s*\$?([\d,]+\.?\d{0,2})/i) ||
      emailBody.match(/Total\s*\$?([\d,]+\.?\d{0,2})/i);

    if (!totalMatch) return null;
    const total = parseFloat(totalMatch[1].replace(/,/g, ""));
    if (isNaN(total) || total <= 0) return null;

    // Extract purchase date (when ticket was bought)
    const purchasedMatch = emailBody.match(
      /Purchased:\s*(\d{2}\/\d{2}\/\d{4})/i
    );

    // Extract trip date - look for "Depart" with date
    // Format: "Depart 7:00 AM, Tuesday, November 4, 2025"
    const tripDateMatch = emailBody.match(
      /Depart\s+\d{1,2}:\d{2}\s+[AP]M,\s+\w+,\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/i
    );

    let date;
    if (tripDateMatch) {
      // Extract just the date part
      const dateStr = tripDateMatch[0].match(
        /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/i
      )[0];
      date = new Date(dateStr);
    } else if (purchasedMatch) {
      // Fallback to purchase date
      date = new Date(purchasedMatch[1]);
    } else {
      return null;
    }

    if (isNaN(date.getTime())) return null;

    // Extract route information
    // Format: "Philadelphia, PA - William H Gray III 30th St. Sta. to New York, NY - Moynihan Train Hall at Penn Sta."
    const routeMatch = emailBody.match(
      /TRAIN\s+\d+:\s*([^(]+?)\s+to\s+([^(]+?)(?:\(|Depart)/i
    );

    let startLocation = null;
    let endLocation = null;

    if (routeMatch) {
      const fromStation = routeMatch[1].trim();
      const toStation = routeMatch[2].trim();

      startLocation = parseAmtrakStation(fromStation);
      endLocation = parseAmtrakStation(toStation);
    }

    // Extract departure time
    const departTimeMatch = emailBody.match(
      /Depart\s+(\d{1,2}:\d{2}\s+[AP]M)/i
    );
    const startTime = departTimeMatch ? departTimeMatch[1] : null;

    return {
      vendor: "Amtrak",
      total,
      tip: 0, // Amtrak doesn't have tips
      date: date.toISOString(),
      startTime,
      endTime: null, // Amtrak receipts don't show arrival time
      startLocation,
      endLocation,
      category: null,
      billed: false,
      parsedBy: "regex",
      reservationNumber,
      isRefund: false,
      isRoundTrip: emailBody.includes("(Round-Trip)"),
    };
  } catch (error) {
    console.error("Amtrak purchase parse error:", error.message);
    return null;
  }
}

function parseAmtrakRefund(emailBody, reservationNumber) {
  try {
    // Extract refund amount
    const refundMatch =
      emailBody.match(/Total Refunded\s*\$?([\d,]+\.?\d{0,2})/i) ||
      emailBody.match(/Total\s*\$?([\d,]+\.?\d{0,2})/i);

    if (!refundMatch) return null;
    const refundAmount = parseFloat(refundMatch[1].replace(/,/g, ""));
    if (isNaN(refundAmount) || refundAmount <= 0) return null;

    // Extract refund date (when refund was processed)
    const modifiedMatch = emailBody.match(/Modified:\s*(\d{2}\/\d{2}\/\d{4})/i);
    const purchasedMatch = emailBody.match(
      /Purchased:\s*(\d{2}\/\d{2}\/\d{4})/i
    );

    let date;
    if (modifiedMatch) {
      date = new Date(modifiedMatch[1]);
    } else if (purchasedMatch) {
      date = new Date(purchasedMatch[1]);
    } else {
      date = new Date();
    }

    if (isNaN(date.getTime())) return null;

    return {
      vendor: "Amtrak",
      total: -refundAmount, // Negative to indicate refund
      tip: 0,
      date: date.toISOString(),
      startTime: null,
      endTime: null,
      startLocation: null,
      endLocation: null,
      category: null,
      billed: false,
      parsedBy: "regex",
      reservationNumber,
      isRefund: true,
    };
  } catch (error) {
    console.error("Amtrak refund parse error:", error.message);
    return null;
  }
}

function parseAmtrakStation(stationString) {
  if (!stationString) return null;

  // Format: "Philadelphia, PA - William H Gray III 30th St. Sta."
  // or "New York, NY - Moynihan Train Hall at Penn Sta."
  const parts = stationString.split("-").map((p) => p.trim());

  if (parts.length < 1) return null;

  // First part should be "City, State"
  const cityStateMatch = parts[0].match(/([^,]+),\s*([A-Z]{2})/);

  if (!cityStateMatch) return null;

  const city = cityStateMatch[1].trim();
  const state = cityStateMatch[2].trim();
  const stationName = parts.length > 1 ? parts[1].trim() : null;

  return {
    address: stationName || `${city}, ${state}`,
    city,
    state,
    country: "US",
  };
}

module.exports = {
  parseAmtrakEmail,
};
