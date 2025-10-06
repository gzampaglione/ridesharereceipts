// src/services/geminiParser.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function parseReceiptWithGemini(emailBody, vendor) {
  if (!process.env.GEMINI_API_KEY) {
    console.log("No Gemini API key found, skipping AI parsing");
    return null;
  }

  try {
    console.log(`Attempting Gemini parsing for ${vendor}...`);

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `You are parsing a ${vendor} rideshare receipt email. Extract the following information and return ONLY valid JSON with no markdown formatting:

Email content:
${emailBody}

Return a JSON object with these exact fields:
{
  "total": number (total charge in dollars),
  "tip": number (tip amount in dollars, 0 if not found),
  "date": "YYYY-MM-DD" (date of the trip),
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

If you cannot find a field, use null. Do not include any markdown code blocks or extra text, just the JSON object.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    // Clean up response - remove markdown code blocks if present
    text = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const parsed = JSON.parse(text);

    console.log(
      `✓ Gemini successfully parsed ${vendor} receipt: $${parsed.total}`
    );

    return {
      vendor,
      total: parsed.total || 0,
      tip: parsed.tip || 0,
      date: parsed.date
        ? new Date(parsed.date).toISOString()
        : new Date().toISOString(),
      startTime: parsed.startTime || null,
      endTime: parsed.endTime || null,
      startLocation: parsed.startLocation || null,
      endLocation: parsed.endLocation || null,
      category: null,
      billed: false,
      parsedBy: "gemini",
    };
  } catch (error) {
    console.error(`Gemini parsing failed for ${vendor}:`, error.message);
    return null;
  }
}

module.exports = { parseReceiptWithGemini };
