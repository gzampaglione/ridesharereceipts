// src/services/receiptParser.js
const { parseReceiptWithGemini } = require("./geminiParser");

function parseAddressString(addressString) {
  if (!addressString) return null;
  const parts = addressString.split(",").map((p) => p.trim());
  if (parts.length < 2) return null;

  try {
    const country = parts.length > 3 ? parts[parts.length - 1] : "US";
    const stateZipPart = parts[parts.length - 2] || parts[parts.length - 1];
    const stateZipMatch = stateZipPart.match(/([A-Z]{2})\s*(\d{5})?/);
    const state = stateZipMatch ? stateZipMatch[1] : null;
    const city = parts.length >= 3 ? parts[parts.length - 3] : parts[0];
    const address = parts.slice(0, Math.max(1, parts.length - 3)).join(", ");

    return { address, city, state, country };
  } catch (parseError) {
    console.error("Address parse error:", parseError);
    return { address: addressString, city: null, state: null, country: null };
  }
}

function parseUberEmail(emailBody) {
  try {
    const totalMatch =
      emailBody.match(/Total\s*\$?([\d.]+)/) ||
      emailBody.match(/\$(\d+\.\d{2})\s*$/m);
    const total = totalMatch ? parseFloat(totalMatch[1]) : null;
    if (total === null) return null;

    const tipMatch = emailBody.match(/Tip\s*\$?([\d.]+)/);
    const tip = tipMatch ? parseFloat(tipMatch[1]) : 0.0;

    const dateMatch = emailBody.match(
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/
    );
    const date = dateMatch ? new Date(dateMatch[0]) : null;
    if (!date) return null;

    let startTime = null,
      endTime = null,
      startLocation = null,
      endLocation = null;

    const timeAddressPattern =
      /(\d{1,2}:\d{2}\s*(?:AM|PM))([^\n]+?)(?=\d{1,2}:\d{2}\s*(?:AM|PM)|Report lost item|Contact support|$)/gs;
    const matches = [...emailBody.matchAll(timeAddressPattern)];

    if (matches.length >= 2) {
      startTime = matches[0][1].trim();
      startLocation = parseAddressString(matches[0][2].trim());
      endTime = matches[1][1].trim();
      endLocation = parseAddressString(matches[1][2].trim());
    }

    return {
      vendor: "Uber",
      total,
      tip,
      date: date.toISOString(),
      startTime,
      endTime,
      startLocation,
      endLocation,
      category: null,
      billed: false,
      parsedBy: "regex",
    };
  } catch (error) {
    return null;
  }
}

function parseLyftEmail(emailBody) {
  try {
    const totalMatch =
      emailBody.match(/\$(\d+\.\d{2})/) ||
      emailBody.match(/Total.*?\$(\d+\.\d{2})/);
    const total = totalMatch ? parseFloat(totalMatch[1]) : null;
    if (total === null) return null;

    const tipMatch = emailBody.match(/Tip.*?\$(\d+\.\d{2})/i);
    const tip = tipMatch ? parseFloat(tipMatch[1]) : 0.0;

    const dateMatch = emailBody.match(
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/
    );
    const date = dateMatch ? new Date(dateMatch[0]) : null;
    if (!date) return null;

    let startLocation = null,
      endLocation = null,
      startTime = null,
      endTime = null;

    const pickupMatch = emailBody.match(
      /Pickup\s+(\d{1,2}:\d{2}\s*(?:AM|PM))([^\n]+?)(?=Drop-off|$)/s
    );
    const dropoffMatch = emailBody.match(
      /Drop-off\s+(\d{1,2}:\d{2}\s*(?:AM|PM))([^\n]+?)(?=Committed|$)/s
    );

    if (pickupMatch) {
      startTime = pickupMatch[1].trim();
      startLocation = parseAddressString(pickupMatch[2].trim());
    }
    if (dropoffMatch) {
      endTime = dropoffMatch[1].trim();
      endLocation = parseAddressString(dropoffMatch[2].trim());
    }

    return {
      vendor: "Lyft",
      total,
      tip,
      date: date.toISOString(),
      startTime,
      endTime,
      startLocation,
      endLocation,
      category: null,
      billed: false,
      parsedBy: "regex",
    };
  } catch (error) {
    return null;
  }
}

function parseCurbEmail(emailBody) {
  try {
    const totalMatch = emailBody.match(/Total[^\$]*\$(\d+\.\d{2})/);
    const total = totalMatch ? parseFloat(totalMatch[1]) : null;
    if (total === null) return null;

    const tipMatch = emailBody.match(/Tip[^\$]*\$(\d+\.\d{2})/);
    const tip = tipMatch ? parseFloat(tipMatch[1]) : 0.0;

    const dateMatch = emailBody.match(
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/
    );
    const currentYear = new Date().getFullYear();
    const date = dateMatch ? new Date(`${dateMatch[0]}, ${currentYear}`) : null;
    if (!date) return null;

    return {
      vendor: "Curb",
      total,
      tip,
      date: date.toISOString(),
      startTime: null,
      endTime: null,
      startLocation: null,
      endLocation: null,
      category: null,
      billed: false,
      parsedBy: "regex",
    };
  } catch (error) {
    return null;
  }
}

// Hybrid parser: Try regex first, fallback to Gemini
async function parseReceipt(emailBody, vendor, subject) {
  console.log(`\nParsing ${vendor} receipt: "${subject}"`);

  // Try regex parsing first
  let parsed = null;
  if (vendor === "Uber") parsed = parseUberEmail(emailBody);
  else if (vendor === "Lyft") parsed = parseLyftEmail(emailBody);
  else if (vendor === "Curb") parsed = parseCurbEmail(emailBody);

  if (parsed) {
    console.log(`  ✓ Regex parsed: $${parsed.total}`);
    return parsed;
  }

  // Fallback to Gemini if regex failed
  console.log(`  ⚠ Regex failed, trying Gemini...`);
  parsed = await parseReceiptWithGemini(emailBody, vendor);

  if (parsed) {
    console.log(`  ✓ Gemini parsed: $${parsed.total}`);
    return parsed;
  }

  console.log(`  ✗ All parsing methods failed`);
  return null;
}

module.exports = {
  parseReceipt,
  parseUberEmail,
  parseLyftEmail,
  parseCurbEmail,
};
