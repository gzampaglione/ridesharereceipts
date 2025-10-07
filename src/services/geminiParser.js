// src/services/geminiParser.js
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

    // Use REST API directly to avoid SDK API version issues
    // Try different model names that work with the v1 API
    const modelNames = ["gemini-2.5-flash"];

    let successfulParse = null;
    let lastError = null;

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

    // Try each model until one works
    for (const modelName of modelNames) {
      try {
        console.log(`  🔍 Trying model: ${modelName} via REST API...`);

        // Use the v1 API endpoint directly
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

        console.log(
          `  📤 Sending request to Gemini v1 API with ${modelName}...`
        );

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.log(
            `  ⚠️  Model ${modelName} failed: ${
              response.status
            } ${errorText.substring(0, 100)}`
          );
          lastError = new Error(`HTTP ${response.status}: ${errorText}`);
          continue;
        }

        const data = await response.json();

        if (
          !data.candidates ||
          !data.candidates[0] ||
          !data.candidates[0].content
        ) {
          console.log(
            `  ⚠️  Model ${modelName} returned invalid response structure`
          );
          lastError = new Error("Invalid response structure from API");
          continue;
        }

        let text = data.candidates[0].content.parts[0].text;

        console.log(`  📥 Received response from Gemini`);
        console.log(`  ✅ Model ${modelName} worked!`);
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
          `  🧹 Cleaned response (first 200 chars): ${text.substring(
            0,
            200
          )}...`
        );

        let parsed;
        try {
          parsed = JSON.parse(text);
          console.log(`  ✅ Successfully parsed JSON`);
        } catch (jsonError) {
          console.error(`  ❌ JSON parsing failed with ${modelName}`);
          console.error(`  📄 Full cleaned text:\n${text}`);
          lastError = new Error(
            `JSON parse error with ${modelName}: ${jsonError.message}`
          );
          continue;
        }

        // Validate required fields
        if (!parsed.total || isNaN(parseFloat(parsed.total))) {
          console.error(
            `  ⚠️  Invalid total field with ${modelName}, trying next model...`
          );
          lastError = new Error(
            `Missing or invalid 'total' field: ${parsed.total}`
          );
          continue;
        }
        if (!parsed.date) {
          console.error(
            `  ⚠️  Missing date field with ${modelName}, trying next model...`
          );
          lastError = new Error(`Missing 'date' field`);
          continue;
        }

        // Convert and validate total
        const totalAmount = parseFloat(parsed.total);
        if (totalAmount <= 0) {
          console.error(
            `  ⚠️  Invalid total amount with ${modelName}, trying next model...`
          );
          lastError = new Error(`Invalid total amount: ${totalAmount}`);
          continue;
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

        successfulParse = {
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
          `  ✓ Gemini successfully parsed ${vendor} receipt with ${modelName}: $${totalAmount.toFixed(
            2
          )} (tip: $${tipAmount.toFixed(2)})`
        );

        break; // Success! Exit the loop
      } catch (modelError) {
        console.log(`  ⚠️  Model ${modelName} failed: ${modelError.message}`);
        lastError = modelError;
        continue;
      }
    }

    // If we got a successful parse, return it
    if (successfulParse) {
      return successfulParse;
    }

    // If we get here, all models failed
    throw lastError || new Error("All models failed");
  } catch (error) {
    console.error(`  ❌ Gemini parsing failed for ${vendor}:`);
    console.error(`  📛 Error type: ${error.constructor.name}`);
    console.error(`  📛 Error message: ${error.message}`);

    // Check for specific API errors
    if (
      error.message?.includes("API_KEY_INVALID") ||
      error.message?.includes("API key")
    ) {
      console.error(
        `  🔑 API key is invalid - please verify your API key is correct`
      );
      console.error(
        `  💡 Get a new API key at: https://aistudio.google.com/app/apikey`
      );
    } else if (
      error.message?.includes("quota") ||
      error.message?.includes("429")
    ) {
      console.error(
        `  💰 Quota exceeded - you may need to upgrade your API plan`
      );
    } else if (error.message?.includes("403")) {
      console.error(
        `  🔒 API access forbidden - check if Gemini API is enabled in your Google Cloud Console`
      );
    } else if (error.message?.includes("404")) {
      console.error(
        `  🔧 Model not found - the model may not be available for your API key`
      );
    }

    return null;
  }
}

module.exports = { parseReceiptWithGemini };
