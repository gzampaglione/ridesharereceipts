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
    // More flexible total matching for Uber
    const totalMatch =
      emailBody.match(/Total[:\s]*\$?([\d,]+\.?\d{0,2})/i) ||
      emailBody.match(/You were charged[:\s]*\$?([\d,]+\.?\d{0,2})/i) ||
      emailBody.match(/Amount charged[:\s]*\$?([\d,]+\.?\d{0,2})/i) ||
      emailBody.match(/\$(\d+\.\d{2})\s*$/m);

    if (!totalMatch) return null;
    const total = parseFloat(totalMatch[1].replace(/,/g, ""));
    if (isNaN(total)) return null;

    const tipMatch = emailBody.match(/Tip[:\s]*\$?([\d,]+\.?\d{0,2})/i);
    const tip = tipMatch ? parseFloat(tipMatch[1].replace(/,/g, "")) : 0.0;

    // More flexible date matching
    const dateMatch = emailBody.match(
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i
    );
    const date = dateMatch ? new Date(dateMatch[0]) : null;
    if (!date || isNaN(date.getTime())) return null;

    let startTime = null,
      endTime = null,
      startLocation = null,
      endLocation = null;

    // Enhanced time/address pattern matching
    const timeAddressPattern =
      /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))[\s\n]*([^\n]+?)(?=\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)|Report an issue|Contact|Trip fare|$)/gis;
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
    console.error("Uber regex parse error:", error.message);
    return null;
  }
}

function parseLyftEmail(emailBody) {
  try {
    // More flexible total matching for Lyft
    const totalMatch =
      emailBody.match(/Total[:\s]*\$?([\d,]+\.?\d{0,2})/i) ||
      emailBody.match(/You paid[:\s]*\$?([\d,]+\.?\d{0,2})/i) ||
      emailBody.match(/Amount[:\s]*\$?([\d,]+\.?\d{0,2})/i) ||
      emailBody.match(/\$(\d+\.\d{2})/);

    if (!totalMatch) return null;
    const total = parseFloat(totalMatch[1].replace(/,/g, ""));
    if (isNaN(total)) return null;

    const tipMatch = emailBody.match(/Tip[:\s]*\$?([\d,]+\.?\d{0,2})/i);
    const tip = tipMatch ? parseFloat(tipMatch[1].replace(/,/g, "")) : 0.0;

    // More flexible date matching
    const dateMatch = emailBody.match(
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i
    );
    const date = dateMatch ? new Date(dateMatch[0]) : null;
    if (!date || isNaN(date.getTime())) return null;

    let startLocation = null,
      endLocation = null,
      startTime = null,
      endTime = null;

    // Enhanced pickup/dropoff matching
    const pickupMatch = emailBody.match(
      /(?:Pickup|Picked up)[:\s]*(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))?[\s\n]*([^\n]+?)(?=Drop-?off|Dropped|$)/is
    );
    const dropoffMatch = emailBody.match(
      /(?:Drop-?off|Dropped)[:\s]*(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))?[\s\n]*([^\n]+?)(?=Ride time|Driver|Total|$)/is
    );

    if (pickupMatch) {
      startTime = pickupMatch[1] ? pickupMatch[1].trim() : null;
      startLocation = parseAddressString(pickupMatch[2].trim());
    }
    if (dropoffMatch) {
      endTime = dropoffMatch[1] ? dropoffMatch[1].trim() : null;
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
    console.error("Lyft regex parse error:", error.message);
    return null;
  }
}

function parseCurbEmail(emailBody) {
  try {
    // More flexible total matching for Curb
    const totalMatch =
      emailBody.match(/Total[:\s]*\$?([\d,]+\.?\d{0,2})/i) ||
      emailBody.match(/Amount[:\s]*\$?([\d,]+\.?\d{0,2})/i) ||
      emailBody.match(/Fare[:\s]*\$?([\d,]+\.?\d{0,2})/i);

    if (!totalMatch) return null;
    const total = parseFloat(totalMatch[1].replace(/,/g, ""));
    if (isNaN(total)) return null;

    const tipMatch = emailBody.match(/Tip[:\s]*\$?([\d,]+\.?\d{0,2})/i);
    const tip = tipMatch ? parseFloat(tipMatch[1].replace(/,/g, "")) : 0.0;

    // Try to find full date, otherwise use current year
    let date = null;
    const fullDateMatch = emailBody.match(
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i
    );

    if (fullDateMatch) {
      date = new Date(fullDateMatch[0]);
    } else {
      const monthDayMatch = emailBody.match(
        /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i
      );
      if (monthDayMatch) {
        const currentYear = new Date().getFullYear();
        date = new Date(`${monthDayMatch[0]}, ${currentYear}`);
      }
    }

    if (!date || isNaN(date.getTime())) return null;

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
    console.error("Curb regex parse error:", error.message);
    return null;
  }
}

// Hybrid parser with configurable preference
async function parseReceipt(
  emailBody,
  vendor,
  subject,
  parserPreference = "regex-first"
) {
  console.log(
    `\nParsing ${vendor} receipt: "${subject}" (Mode: ${parserPreference})`
  );

  if (parserPreference === "gemini-only") {
    // Use only Gemini
    const parsed = await parseReceiptWithGemini(emailBody, vendor);
    if (parsed) {
      console.log(`  ✓ Gemini parsed: ${parsed.total}`);
      return parsed;
    }
    console.log(`  ✗ Gemini parsing failed`);
    return null;
  }

  if (parserPreference === "regex-only") {
    // Use only regex
    let parsed = null;
    if (vendor === "Uber") parsed = parseUberEmail(emailBody);
    else if (vendor === "Lyft") parsed = parseLyftEmail(emailBody);
    else if (vendor === "Curb") parsed = parseCurbEmail(emailBody);

    if (parsed) {
      console.log(`  ✓ Regex parsed: ${parsed.total}`);
      return parsed;
    }
    console.log(`  ✗ Regex parsing failed`);
    return null;
  }

  // Default: regex-first with Gemini fallback
  let parsed = null;
  if (vendor === "Uber") parsed = parseUberEmail(emailBody);
  else if (vendor === "Lyft") parsed = parseLyftEmail(emailBody);
  else if (vendor === "Curb") parsed = parseCurbEmail(emailBody);

  if (parsed) {
    console.log(`  ✓ Regex parsed: ${parsed.total}`);
    return parsed;
  }

  // Fallback to Gemini
  console.log(`  ⚠ Regex failed, trying Gemini fallback...`);
  parsed = await parseReceiptWithGemini(emailBody, vendor);

  if (parsed) {
    console.log(`  ✓ Gemini parsed: ${parsed.total}`);
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
