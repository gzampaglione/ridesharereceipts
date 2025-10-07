// src/services/geminiParser.js - UPDATED: Use only selected model
const Store = require("electron-store");
const store = new Store();

async function parseReceiptWithGemini(emailBody, vendor) {
  const apiKey = store.get("geminiApiKey") || process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === "") {
    console.log("⚠️  No Gemini API key - skipping AI parsing");
    return null;
  }

  try {
    console.log(`  🤖 Gemini parsing for ${vendor}...`);

    // Get user's preferred model - USE ONLY THIS MODEL
    const modelName = store.get("geminiModel", "gemini-2.5-flash");
    console.log(`  🎯 Using model: ${modelName}`);

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

    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey.trim()}`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`  ❌ API error: ${response.status}`);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    if (
      !data.candidates ||
      !data.candidates[0] ||
      !data.candidates[0].content
    ) {
      console.log(`  ❌ Invalid response structure`);
      throw new Error("Invalid response from API");
    }

    let text = data.candidates[0].content.parts[0].text;

    // Clean up response
    text = text
      .replace(/```json\n?/g, "")
      .replace(/```javascript\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (jsonError) {
      console.error(`  ❌ JSON parse failed`);
      console.error(`  Response: ${text.substring(0, 200)}...`);
      throw new Error(`JSON parse error: ${jsonError.message}`);
    }

    // Validate required fields
    if (!parsed.total || isNaN(parseFloat(parsed.total))) {
      throw new Error(`Invalid total: ${parsed.total}`);
    }
    if (!parsed.date) {
      throw new Error(`Missing date field`);
    }

    const totalAmount = parseFloat(parsed.total);
    if (totalAmount <= 0) {
      throw new Error(`Invalid amount: ${totalAmount}`);
    }

    const tipAmount = parsed.tip ? parseFloat(parsed.tip) : 0;

    let receiptDate;
    try {
      receiptDate = new Date(parsed.date);
      if (isNaN(receiptDate.getTime())) {
        throw new Error(`Invalid date: ${parsed.date}`);
      }
    } catch (dateError) {
      console.error(`  ⚠️  Date parse failed, using today`);
      receiptDate = new Date();
    }

    const result = {
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
      `  ✓ Parsed: $${totalAmount.toFixed(2)} (tip: $${tipAmount.toFixed(2)})`
    );

    return result;
  } catch (error) {
    console.error(`  ❌ Gemini failed: ${error.message}`);

    // Check for specific errors
    if (
      error.message?.includes("API_KEY_INVALID") ||
      error.message?.includes("API key")
    ) {
      console.error(`  🔑 Invalid API key`);
    } else if (
      error.message?.includes("quota") ||
      error.message?.includes("429")
    ) {
      console.error(`  💰 Quota exceeded`);
    } else if (error.message?.includes("403")) {
      console.error(`  🔒 API access forbidden`);
    } else if (error.message?.includes("404")) {
      console.error(`  🔧 Model not found`);
    }

    return null;
  }
}

module.exports = { parseReceiptWithGemini };
