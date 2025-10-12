// src/services/receiptParser.js - UPDATED WITH DATE VALIDATION
const { parseReceiptWithGemini } = require("./geminiParser");
const {
  parseUberEmail,
  parseLyftEmail,
  parseCurbEmail,
} = require("./regexParsers");
const { parseAmtrakEmail } = require("./amtrakParser");

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

// Validate and correct date using email received date
function validateDate(parsedDate, emailReceivedDate) {
  if (!parsedDate || !emailReceivedDate) return parsedDate;

  const parsed = new Date(parsedDate);
  const received = new Date(emailReceivedDate);

  // If parsed date is in the future compared to received date, it's wrong
  if (parsed > received) {
    console.log(
      `     ⚠️  Parsed date (${parsed.toLocaleDateString()}) is after email received date (${received.toLocaleDateString()})`
    );

    // Use the year from the email received date
    parsed.setFullYear(received.getFullYear());

    // If still in the future, must be previous year
    if (parsed > received) {
      parsed.setFullYear(received.getFullYear() - 1);
    }

    console.log(`     ✓ Corrected to: ${parsed.toLocaleDateString()}`);
    return parsed.toISOString();
  }

  // If parsed date is more than 1 year before received date, probably wrong year
  const yearsDiff = (received - parsed) / (1000 * 60 * 60 * 24 * 365);
  if (yearsDiff > 1) {
    console.log(
      `     ⚠️  Parsed date is ${yearsDiff.toFixed(
        1
      )} years before received date`
    );
    parsed.setFullYear(received.getFullYear());

    if (parsed > received) {
      parsed.setFullYear(received.getFullYear() - 1);
    }

    console.log(`     ✓ Corrected to: ${parsed.toLocaleDateString()}`);
    return parsed.toISOString();
  }

  return parsed.toISOString();
}

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

function isDuplicateReceipt(newReceipt, existingReceipts) {
  const newHash = generateReceiptHash(newReceipt);

  for (const existing of existingReceipts) {
    const existingHash = existing.contentHash || generateReceiptHash(existing);

    if (newHash === existingHash) {
      console.log(`  🔄 Duplicate: Exact match`);
      return true;
    }
  }

  const newDate = new Date(newReceipt.date).toISOString().split("T")[0];
  const newTotal = Math.round(newReceipt.total * 100);

  for (const existing of existingReceipts) {
    if (existing.vendor !== newReceipt.vendor) continue;

    const existingDate = new Date(existing.date).toISOString().split("T")[0];
    const existingTotal = Math.round(existing.total * 100);

    if (existingDate === newDate && Math.abs(existingTotal - newTotal) <= 1) {
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
        return true;
      }
    }
  }

  return false;
}

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
  const amtrakPattern = store.get(
    "amtrakSubjectRegex",
    "eTicket and Receipt for Your|Amtrak: Refund Receipt"
  );

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
    if (vendor === "Amtrak" && amtrakPattern) {
      return new RegExp(amtrakPattern, "i").test(subject);
    }
  } catch (regexError) {
    console.error(`Invalid regex pattern for ${vendor}:`, regexError.message);
    if (vendor === "Uber")
      return subject.toLowerCase().includes("trip with uber");
    if (vendor === "Lyft")
      return subject.toLowerCase().includes("your ride with");
    if (vendor === "Curb")
      return subject.toLowerCase().includes("curb ride receipt");
    if (vendor === "Amtrak")
      return (
        subject.toLowerCase().includes("eticket") ||
        subject.toLowerCase().includes("refund receipt")
      );
  }

  return false;
}

// UPDATED: Add emailReceivedDate parameter
async function parseReceipt(
  emailBody,
  vendor,
  subject,
  parserPreference = "regex-first",
  existingReceipts = [],
  emailReceivedDate = null
) {
  console.log(`\n📧 Parsing ${vendor}: "${subject.substring(0, 50)}..."`);

  const hasTotal = emailBody.match(/Total[:\s]*\$?([\d,]+\.?\d{0,2})/i);
  const hasDate = emailBody.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i
  );
  console.log(
    `  📊 Has: ${hasTotal ? "✓ total" : "✗ total"}, ${
      hasDate ? "✓ date" : "✗ date"
    }`
  );

  // Helper to validate and return parsed data
  const finalizeParsed = (parsed) => {
    if (!parsed) return null;

    // Validate date against email received date
    if (emailReceivedDate && parsed.date) {
      parsed.date = validateDate(parsed.date, emailReceivedDate);
    }

    parsed.contentHash = generateReceiptHash(parsed);
    if (isDuplicateReceipt(parsed, existingReceipts)) {
      return null;
    }
    return parsed;
  };

  // Mode: Gemini with subject filtering
  if (parserPreference === "gemini-subject-filter") {
    if (!isReceiptEmail(subject, vendor)) {
      console.log(`  ⊘ Subject doesn't match - skipping`);
      return null;
    }

    const parsed = await parseReceiptWithGemini(emailBody, vendor);
    const result = finalizeParsed(parsed);
    if (result) {
      console.log(`  ✅ SUCCESS: $${result.total.toFixed(2)}`);
      return result;
    }
    console.log(`  ❌ FAILED`);
    return null;
  }

  // Mode: Gemini only
  if (parserPreference === "gemini-only") {
    console.log(`  🤖 Gemini AI Only`);
    const parsed = await parseReceiptWithGemini(emailBody, vendor);
    const result = finalizeParsed(parsed);
    if (result) {
      console.log(`  ✅ SUCCESS: $${result.total.toFixed(2)}`);
      return result;
    }
    console.log(`  ❌ FAILED`);
    return null;
  }

  // Mode: Regex only
  if (parserPreference === "regex-only") {
    console.log(`  🔍 Regex Only`);
    let parsed = null;
    if (vendor === "Uber") parsed = parseUberEmail(emailBody);
    else if (vendor === "Lyft") parsed = parseLyftEmail(emailBody);
    else if (vendor === "Curb") parsed = parseCurbEmail(emailBody);
    else if (vendor === "Amtrak") parsed = parseAmtrakEmail(emailBody, subject);

    const result = finalizeParsed(parsed);
    if (result) {
      console.log(`  ✅ SUCCESS: $${result.total.toFixed(2)}`);
      return result;
    }
    console.log(`  ❌ FAILED`);
    return null;
  }

  // Default: Regex-first with Gemini fallback
  console.log(`  🔍 Trying Regex...`);
  let parsed = null;
  if (vendor === "Uber") parsed = parseUberEmail(emailBody);
  else if (vendor === "Lyft") parsed = parseLyftEmail(emailBody);
  else if (vendor === "Curb") parsed = parseCurbEmail(emailBody);
  else if (vendor === "Amtrak") parsed = parseAmtrakEmail(emailBody, subject);

  let result = finalizeParsed(parsed);
  if (result) {
    console.log(`  ✅ SUCCESS: Regex $${result.total.toFixed(2)}`);
    return result;
  }

  // Fallback to Gemini
  console.log(`  ⚠️  Regex failed, trying Gemini...`);
  parsed = await parseReceiptWithGemini(emailBody, vendor);
  result = finalizeParsed(parsed);

  if (result) {
    console.log(`  ✅ SUCCESS: Gemini $${result.total.toFixed(2)}`);
    return result;
  }

  console.log(`  ❌ FAILED: All methods failed`);
  return null;
}

module.exports = {
  parseReceipt,
  parseUberEmail,
  parseLyftEmail,
  parseCurbEmail,
  parseAmtrakEmail,
  isReceiptEmail,
  generateReceiptHash,
  isDuplicateReceipt,
};
