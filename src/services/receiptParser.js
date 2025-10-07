// src/services/receiptParser.js
const { parseReceiptWithGemini } = require("./geminiParser");
const Store = require("electron-store");
const store = new Store();
const crypto = require("crypto");

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

// Generate a unique hash for a receipt based on key fields
function generateReceiptHash(receipt) {
  // Create a hash based on vendor, date, total, and locations
  // This helps identify duplicates even if messageId is different (forwards, etc.)
  const hashData = {
    vendor: receipt.vendor,
    date: receipt.date
      ? new Date(receipt.date).toISOString().split("T")[0]
      : null, // Just the date part
    total: receipt.total ? Math.round(receipt.total * 100) : null, // Cents to avoid floating point issues
    tip: receipt.tip ? Math.round(receipt.tip * 100) : null,
    startCity: receipt.startLocation?.city || null,
    startState: receipt.startLocation?.state || null,
    endCity: receipt.endLocation?.city || null,
    endState: receipt.endLocation?.state || null,
    startTime: receipt.startTime || null,
    endTime: receipt.endTime || null,
  };

  // Create a string representation and hash it
  const dataString = JSON.stringify(hashData, Object.keys(hashData).sort());
  const hash = crypto.createHash("sha256").update(dataString).digest("hex");

  return hash;
}

// Check if a receipt is a duplicate based on content hash
function isDuplicateReceipt(newReceipt, existingReceipts) {
  const newHash = generateReceiptHash(newReceipt);

  // Check if any existing receipt has the same hash
  for (const existing of existingReceipts) {
    const existingHash = existing.contentHash || generateReceiptHash(existing);

    if (newHash === existingHash) {
      console.log(`  🔄 Duplicate detected: Same content as existing receipt`);
      console.log(`     Hash: ${newHash.substring(0, 16)}...`);
      console.log(
        `     Date: ${new Date(
          newReceipt.date
        ).toLocaleDateString()}, Total: $${newReceipt.total.toFixed(2)}`
      );
      return true;
    }
  }

  return false;
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

// Check if subject matches the configured patterns for receipt emails
function isReceiptEmail(subject, vendor) {
  // Get patterns from settings
  const uberPattern = store.get(
    "uberSubjectRegex",
    "Your (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (morning|afternoon|evening|night) trip with Uber"
  );
  const lyftPattern = store.get(
    "lyftSubjectRegex",
    "Your ride with .+ on (January|February|March|April|May|June|July|August|September|October|November|December) \\d{1,2}"
  );
  const curbPattern = store.get("curbSubjectRegex", "Your Curb Ride Receipt");

  try {
    if (vendor === "Uber" && uberPattern) {
      return new RegExp(uberPattern, "i").test(subject);
    }
    if (vendor === "Lyft" && lyftPattern) {
      return new RegExp(lyftPattern, "i").test(subject);
    }
    if (vendor === "Curb" && curbPattern) {
      // For Curb, do exact match (case insensitive)
      return subject.toLowerCase() === curbPattern.toLowerCase();
    }
  } catch (regexError) {
    console.error(`Invalid regex pattern for ${vendor}:`, regexError.message);
    // Fall back to basic detection
    if (vendor === "Uber")
      return subject.toLowerCase().includes("trip with uber");
    if (vendor === "Lyft")
      return subject.toLowerCase().includes("your ride with");
    if (vendor === "Curb")
      return subject.toLowerCase().includes("curb ride receipt");
  }

  return false;
}

// Hybrid parser with configurable preference and deduplication
async function parseReceipt(
  emailBody,
  vendor,
  subject,
  parserPreference = "regex-first",
  existingReceipts = []
) {
  console.log(
    `\n📧 Parsing ${vendor} receipt: "${subject.substring(
      0,
      60
    )}..." (Mode: ${parserPreference})`
  );

  // New mode: Gemini with subject filtering
  if (parserPreference === "gemini-subject-filter") {
    console.log(`  🔍 Checking subject line against ${vendor} pattern...`);

    // Check if this is a receipt email based on subject
    if (!isReceiptEmail(subject, vendor)) {
      console.log(
        `  ⊘ Subject doesn't match ${vendor} receipt pattern - skipping`
      );
      return null;
    }

    console.log(
      `  ✅ Subject matches ${vendor} receipt pattern - parsing with Gemini`
    );
    const parsed = await parseReceiptWithGemini(emailBody, vendor);
    if (parsed) {
      // Add content hash for deduplication
      parsed.contentHash = generateReceiptHash(parsed);

      // Check for duplicates
      if (isDuplicateReceipt(parsed, existingReceipts)) {
        return null; // Skip duplicate
      }

      console.log(`  ✅ SUCCESS: Gemini parsed $${parsed.total.toFixed(2)}`);
      return parsed;
    }
    console.log(`  ❌ FAILED: Gemini parsing returned null`);
    return null;
  }

  if (parserPreference === "gemini-only") {
    console.log(`  🤖 Using Gemini AI Only mode`);
    // Use only Gemini
    const parsed = await parseReceiptWithGemini(emailBody, vendor);
    if (parsed) {
      // Add content hash for deduplication
      parsed.contentHash = generateReceiptHash(parsed);

      // Check for duplicates
      if (isDuplicateReceipt(parsed, existingReceipts)) {
        return null; // Skip duplicate
      }

      console.log(`  ✅ SUCCESS: Gemini parsed $${parsed.total.toFixed(2)}`);
      return parsed;
    }
    console.log(`  ❌ FAILED: Gemini parsing returned null`);
    return null;
  }

  if (parserPreference === "regex-only") {
    console.log(`  🔍 Using Regex Only mode`);
    // Use only regex
    let parsed = null;
    if (vendor === "Uber") parsed = parseUberEmail(emailBody);
    else if (vendor === "Lyft") parsed = parseLyftEmail(emailBody);
    else if (vendor === "Curb") parsed = parseCurbEmail(emailBody);

    if (parsed) {
      // Add content hash for deduplication
      parsed.contentHash = generateReceiptHash(parsed);

      // Check for duplicates
      if (isDuplicateReceipt(parsed, existingReceipts)) {
        return null; // Skip duplicate
      }

      console.log(`  ✅ SUCCESS: Regex parsed $${parsed.total.toFixed(2)}`);
      return parsed;
    }
    console.log(`  ❌ FAILED: Regex parsing returned null`);
    return null;
  }

  // Default: regex-first with Gemini fallback
  console.log(`  🔍 Trying Regex first...`);
  let parsed = null;
  if (vendor === "Uber") parsed = parseUberEmail(emailBody);
  else if (vendor === "Lyft") parsed = parseLyftEmail(emailBody);
  else if (vendor === "Curb") parsed = parseCurbEmail(emailBody);

  if (parsed) {
    // Add content hash for deduplication
    parsed.contentHash = generateReceiptHash(parsed);

    // Check for duplicates
    if (isDuplicateReceipt(parsed, existingReceipts)) {
      return null; // Skip duplicate
    }

    console.log(`  ✅ SUCCESS: Regex parsed $${parsed.total.toFixed(2)}`);
    return parsed;
  }

  // Fallback to Gemini
  console.log(`  ⚠️  Regex failed, trying Gemini fallback...`);
  parsed = await parseReceiptWithGemini(emailBody, vendor);

  if (parsed) {
    // Add content hash for deduplication
    parsed.contentHash = generateReceiptHash(parsed);

    // Check for duplicates
    if (isDuplicateReceipt(parsed, existingReceipts)) {
      return null; // Skip duplicate
    }

    console.log(
      `  ✅ SUCCESS: Gemini fallback parsed $${parsed.total.toFixed(2)}`
    );
    return parsed;
  }

  console.log(`  ❌ FAILED: All parsing methods failed for this receipt`);
  return null;
}

module.exports = {
  parseReceipt,
  parseUberEmail,
  parseLyftEmail,
  parseCurbEmail,
  isReceiptEmail,
  generateReceiptHash,
  isDuplicateReceipt,
};
