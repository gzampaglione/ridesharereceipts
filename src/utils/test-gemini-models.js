// test-gemini-models.js
// Run this with: node test-gemini-models.js

// Load environment variables
require("dotenv").config();

const Store = require("electron-store");
const store = new Store();

async function listAvailableModels() {
  const apiKey = store.get("geminiApiKey") || process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === "") {
    console.error("❌ No API key found!");
    console.error(
      "Set it in your app settings or add GEMINI_API_KEY to .env file"
    );
    process.exit(1);
  }

  console.log("🔑 Using API key:", apiKey.substring(0, 10) + "...");
  console.log("\n📋 Fetching list of available models from Gemini API...\n");

  try {
    // List models using v1 API
    const v1Url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey.trim()}`;
    console.log("Trying v1 API endpoint...");
    const v1Response = await fetch(v1Url);

    if (v1Response.ok) {
      const v1Data = await v1Response.json();
      console.log("\n✅ V1 API - Available models:");
      if (v1Data.models && v1Data.models.length > 0) {
        v1Data.models.forEach((model) => {
          console.log(
            `  - ${model.name} (${model.displayName || "No display name"})`
          );
          if (model.supportedGenerationMethods) {
            console.log(
              `    Supports: ${model.supportedGenerationMethods.join(", ")}`
            );
          }
        });
      } else {
        console.log("  No models found in v1 API");
      }
    } else {
      console.log(`  ❌ V1 API failed: ${v1Response.status}`);
      const errorText = await v1Response.text();
      console.log(`  ${errorText.substring(0, 200)}`);
    }

    // List models using v1beta API
    console.log("\n\nTrying v1beta API endpoint...");
    const v1betaUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`;
    const v1betaResponse = await fetch(v1betaUrl);

    if (v1betaResponse.ok) {
      const v1betaData = await v1betaResponse.json();
      console.log("\n✅ V1BETA API - Available models:");
      if (v1betaData.models && v1betaData.models.length > 0) {
        v1betaData.models.forEach((model) => {
          console.log(
            `  - ${model.name} (${model.displayName || "No display name"})`
          );
          if (model.supportedGenerationMethods) {
            console.log(
              `    Supports: ${model.supportedGenerationMethods.join(", ")}`
            );
          }
        });
      } else {
        console.log("  No models found in v1beta API");
      }
    } else {
      console.log(`  ❌ V1BETA API failed: ${v1betaResponse.status}`);
      const errorText = await v1betaResponse.text();
      console.log(`  ${errorText.substring(0, 200)}`);
    }

    console.log(
      "\n\n💡 Use one of the model names above in your geminiParser.js file"
    );
    console.log(
      "   Model names should be used exactly as shown (e.g., 'models/gemini-1.5-flash-001')"
    );
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error("\nPossible issues:");
    console.error("  - Invalid API key");
    console.error("  - Network connectivity problems");
    console.error("  - Gemini API not enabled for your Google Cloud project");
  }
}

listAvailableModels();
