// src/services/geminiParser.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Store = require("electron-store");
const store = new Store();

async function parseReceiptWithGemini(emailBody, vendor) {
  // Try to get API key from store first, then fall back to environment variable
  const apiKey = store.get("geminiApiKey") || process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === "") {
    console.log("⚠️  No Gemini API key configured - skipping AI parsing");
    console.log(
      "   Set API key in Settings or add GEMINI_API_KEY to .env file"
    );
    return null;
  }

  try {
    console.log(`  🤖 Attempting Gemini parsing for ${vendor}...`);
    console.log(`  📧 Email body length: ${emailBody.length} characters`);

    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
    });

    const prompt = `You are parsing a ${vendor} rideshare receipt email. Extract the following information and return ONLY valid JSON with no markdown formatting, no code blocks, and no extra text.

Email content:
${emailBody}

Return a JSON object with these exact fields:
{
  "total": number (total charge in dollars, required),
  "tip": number (tip amount in dollars, 0 if not found),
  "date": "YYYY-MM-DD" (date of the trip, required),
  "startTime": "HH:MM AM/PM" (pickup time, null if not found),
  "endTime": "HH:MM AM/PM" (dropoff time, null if not found),
  "startLocation": {
    "address": "full address",
    "city": "city name",
    "state": "two letter state code",
    "country": "US"
  },
  "endLocation": {
    "address": "full address",
    "city": "city name", 
    "state": "two letter state code",
    "country": "US"
  }
}

CRITICAL: 
- Return ONLY the JSON object, nothing else
- Do not wrap in markdown code blocks
- Do not add any explanatory text
- If you cannot find a field, use null
- The "total" and "date" fields are required`;

    console.log(`  📤 Sending request to Gemini API...`);
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    console.log(`  📥 Received response from Gemini`);
    console.log(
      `  📝 Raw response (first 200 chars): ${text.substring(0, 200)}...`
    );

    // Clean up response - remove markdown code blocks if present
    text = text
      .replace(/```json\n?/g, "")
      .replace(/```javascript\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    console.log(
      `  🧹 Cleaned response (first 200 chars): ${text.substring(0, 200)}...`
    );

    let parsed;
    try {
      parsed = JSON.parse(text);
      console.log(`  ✅ Successfully parsed JSON`);
    } catch (jsonError) {
      console.error(`  ❌ JSON parsing failed!`);
      console.error(`  📄 Full cleaned text:\n${text}`);
      throw new Error(`JSON parse error: ${jsonError.message}`);
    }

    // Validate required fields
    if (!parsed.total || isNaN(parseFloat(parsed.total))) {
      throw new Error(`Missing or invalid 'total' field: ${parsed.total}`);
    }
    if (!parsed.date) {
      throw new Error(`Missing 'date' field`);
    }

    // Convert and validate total
    const totalAmount = parseFloat(parsed.total);
    if (totalAmount <= 0) {
      throw new Error(`Invalid total amount: ${totalAmount}`);
    }

    // Convert and validate tip
    const tipAmount = parsed.tip ? parseFloat(parsed.tip) : 0;

    // Validate and convert date
    let receiptDate;
    try {
      receiptDate = new Date(parsed.date);
      if (isNaN(receiptDate.getTime())) {
        throw new Error(`Invalid date: ${parsed.date}`);
      }
    } catch (dateError) {
      console.error(`  ⚠️  Date parsing failed, using current date`);
      receiptDate = new Date();
    }

    const receiptData = {
      vendor,
      total: totalAmount,
      tip: tipAmount,
      date: receiptDate.toISOString(),
      startTime: parsed.startTime || null,
      endTime: parsed.endTime || null,
      startLocation: parsed.startLocation || null,
      endLocation: parsed.endLocation || null,
      category: null,
      billed: false,
      parsedBy: "gemini",
    };

    console.log(
      `  ✓ Gemini successfully parsed ${vendor} receipt: $${totalAmount.toFixed(
        2
      )} (tip: $${tipAmount.toFixed(2)})`
    );

    return receiptData;
  } catch (error) {
    console.error(`  ❌ Gemini parsing failed for ${vendor}:`);
    console.error(`  📛 Error type: ${error.constructor.name}`);
    console.error(`  📛 Error message: ${error.message}`);
    if (error.stack) {
      console.error(`  📛 Stack trace:\n${error.stack}`);
    }

    // Check for specific API errors
    if (error.message?.includes("API key")) {
      console.error(`  🔑 This appears to be an API key issue`);
    } else if (error.message?.includes("quota")) {
      console.error(`  💰 This appears to be a quota/billing issue`);
    } else if (
      error.message?.includes("network") ||
      error.message?.includes("fetch")
    ) {
      console.error(`  🌐 This appears to be a network connectivity issue`);
    }

    return null;
  }
}

module.exports = { parseReceiptWithGemini };
