// src/services/receiptParser.js
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
