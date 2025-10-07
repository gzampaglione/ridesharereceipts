// src/services/receiptParser.js - COMPLETE VERSION
const { parseReceiptWithGemini } = require("./geminiParser");
const {
  parseUberEmail,
  parseLyftEmail,
  parseCurbEmail,
} = require("./regexParsers");

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
  const hashData = {
    vendor: receipt.vendor,
    date: receipt.date
      ? new Date(receipt.date).toISOString().split("T")[0]
      : null,
    total: receipt.total ? Math.round(receipt.total * 100) : null,
    tip: receipt.tip ? Math.round(receipt.tip * 100) : null,
    startCity: receipt.startLocation?.city || null,
    startState: receipt.startLocation?.state || null,
    endCity: receipt.endLocation?.city || null,
    endState: receipt.endLocation?.state || null,
    startTime: receipt.startTime || null,
    endTime: receipt.endTime || null,
  };

  const dataString = JSON.stringify(hashData, Object.keys(hashData).sort());
  const hash = crypto.createHash("sha256").update(dataString).digest("hex");

  return hash;
}

// IMPROVED: Less aggressive duplicate detection
function isDuplicateReceipt(newReceipt, existingReceipts) {
  const newHash = generateReceiptHash(newReceipt);

  // First check: exact content hash match
  for (const existing of existingReceipts) {
    const existingHash = existing.contentHash || generateReceiptHash(existing);

    if (newHash === existingHash) {
      console.log(`  🔄 Duplicate: Exact content match`);
      console.log(`     Hash: ${newHash.substring(0, 16)}...`);
      return true;
    }
  }

  // Second check: same vendor, date, and very similar amount
  const newDate = new Date(newReceipt.date).toISOString().split("T")[0];
  const newTotal = Math.round(newReceipt.total * 100);

  for (const existing of existingReceipts) {
    if (existing.vendor !== newReceipt.vendor) continue;

    const existingDate = new Date(existing.date).toISOString().split("T")[0];
    const existingTotal = Math.round(existing.total * 100);

    // Same vendor, same day, amount within 1 cent
    if (existingDate === newDate && Math.abs(existingTotal - newTotal) <= 1) {
      // Check locations if available
      const sameStart =
        !newReceipt.startLocation?.city ||
        !existing.startLocation?.city ||
        newReceipt.startLocation?.city === existing.startLocation?.city;
      const sameEnd =
        !newReceipt.endLocation?.city ||
        !existing.endLocation?.city ||
        newReceipt.endLocation?.city === existing.endLocation?.city;

      if (sameStart && sameEnd) {
        console.log(`  🔄 Duplicate: Same vendor/date/amount`);
        console.log(
          `     ${newReceipt.vendor} - ${newDate} - $${newReceipt.total.toFixed(
            2
          )}`
        );
        return true;
      }
    }
  }

  return false;
}

// Check if subject matches the configured patterns for receipt emails
function isReceiptEmail(subject, vendor) {
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
      return subject.toLowerCase() === curbPattern.toLowerCase();
    }
  } catch (regexError) {
    console.error(`Invalid regex pattern for ${vendor}:`, regexError.message);
    if (vendor === "Uber")
      return subject.toLowerCase().includes("trip with uber");
    if (vendor === "Lyft")
      return subject.toLowerCase().includes("your ride with");
    if (vendor === "Curb")
      return subject.toLowerCase().includes("curb ride receipt");
  }

  return false;
}

// IMPROVED: Hybrid parser with better logging
async function parseReceipt(
  emailBody,
  vendor,
  subject,
  parserPreference = "regex-first",
  existingReceipts = []
) {
  console.log(`\n📧 Parsing ${vendor}: "${subject.substring(0, 50)}..."`);

  // Log email characteristics for debugging
  const hasTotal = emailBody.match(/Total[:\s]*\$?([\d,]+\.?\d{0,2})/i);
  const hasDate = emailBody.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i
  );
  console.log(
    `  📊 Has: ${hasTotal ? "✓ total" : "✗ total"}, ${
      hasDate ? "✓ date" : "✗ date"
    }`
  );

  // Mode: Gemini with subject filtering
  if (parserPreference === "gemini-subject-filter") {
    if (!isReceiptEmail(subject, vendor)) {
      console.log(`  ⊘ Subject doesn't match ${vendor} pattern - skipping`);
      return null;
    }

    console.log(`  ✅ Subject matches - parsing with Gemini`);
    const parsed = await parseReceiptWithGemini(emailBody, vendor);
    if (parsed) {
      parsed.contentHash = generateReceiptHash(parsed);
      if (isDuplicateReceipt(parsed, existingReceipts)) {
        return null;
      }
      console.log(`  ✅ SUCCESS: Gemini parsed $${parsed.total.toFixed(2)}`);
      return parsed;
    }
    console.log(`  ❌ FAILED: Gemini returned null`);
    return null;
  }

  // Mode: Gemini only
  if (parserPreference === "gemini-only") {
    console.log(`  🤖 Gemini AI Only mode`);
    const parsed = await parseReceiptWithGemini(emailBody, vendor);
    if (parsed) {
      parsed.contentHash = generateReceiptHash(parsed);
      if (isDuplicateReceipt(parsed, existingReceipts)) {
        return null;
      }
      console.log(`  ✅ SUCCESS: Gemini parsed $${parsed.total.toFixed(2)}`);
      return parsed;
    }
    console.log(`  ❌ FAILED: Gemini returned null`);
    return null;
  }

  // Mode: Regex only
  if (parserPreference === "regex-only") {
    console.log(`  🔍 Regex Only mode`);
    let parsed = null;
    if (vendor === "Uber") parsed = parseUberEmail(emailBody);
    else if (vendor === "Lyft") parsed = parseLyftEmail(emailBody);
    else if (vendor === "Curb") parsed = parseCurbEmail(emailBody);

    if (parsed) {
      parsed.contentHash = generateReceiptHash(parsed);
      if (isDuplicateReceipt(parsed, existingReceipts)) {
        return null;
      }
      console.log(`  ✅ SUCCESS: Regex parsed $${parsed.total.toFixed(2)}`);
      return parsed;
    }
    console.log(`  ❌ FAILED: Regex returned null`);
    return null;
  }

  // Default: Regex-first with Gemini fallback
  console.log(`  🔍 Trying Regex first...`);
  let parsed = null;
  if (vendor === "Uber") parsed = parseUberEmail(emailBody);
  else if (vendor === "Lyft") parsed = parseLyftEmail(emailBody);
  else if (vendor === "Curb") parsed = parseCurbEmail(emailBody);

  if (parsed) {
    parsed.contentHash = generateReceiptHash(parsed);
    if (isDuplicateReceipt(parsed, existingReceipts)) {
      return null;
    }
    console.log(`  ✅ SUCCESS: Regex parsed $${parsed.total.toFixed(2)}`);
    return parsed;
  }

  // Fallback to Gemini
  console.log(`  ⚠️  Regex failed, trying Gemini...`);
  parsed = await parseReceiptWithGemini(emailBody, vendor);

  if (parsed) {
    parsed.contentHash = generateReceiptHash(parsed);
    if (isDuplicateReceipt(parsed, existingReceipts)) {
      return null;
    }
    console.log(`  ✅ SUCCESS: Gemini parsed $${parsed.total.toFixed(2)}`);
    return parsed;
  }

  console.log(`  ❌ FAILED: All methods failed`);
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
