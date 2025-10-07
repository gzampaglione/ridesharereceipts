// electron.js
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("fs").promises;
const http = require("http");
const url = require("url");
const { google } = require("googleapis");
const Store = require("electron-store");
const { parseReceipt } = require("./src/services/receiptParser");

// Load environment variables
require("dotenv").config();

const store = new Store();
let win;
let authServer = null;
let authInProgress = false;
let authorizationPromise = null;

async function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
    show: false, // Don't show until ready
  });

  // Maximize window on load
  win.maximize();
  win.show();

  const devServerUrl = "http://localhost:5173";
  const isDev =
    process.env.NODE_ENV === "development" ||
    process.env.ELECTRON_IS_DEV === "1";

  if (isDev) {
    console.log("Loading from Vite dev server:", devServerUrl);
    win.loadURL(devServerUrl);
    // Only open DevTools if explicitly requested via env variable
    if (process.env.OPEN_DEVTOOLS === "1") {
      win.webContents.openDevTools();
    }
  } else {
    win.loadFile(path.join(__dirname, "dist", "index.html"));
  }
}

function getNewToken(oAuth2Client) {
  return new Promise((resolve, reject) => {
    if (authInProgress) {
      return reject(new Error("Authentication already in progress"));
    }

    authInProgress = true;

    if (authServer) {
      authServer.close();
      authServer = null;
    }

    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/gmail.readonly"],
    });

    console.log("Opening browser for OAuth...");
    shell.openExternal(authUrl);

    let hasResponded = false;

    authServer = http
      .createServer(async (req, res) => {
        if (req.url.includes("favicon.ico")) {
          res.writeHead(404);
          res.end();
          return;
        }

        if (hasResponded) {
          res.end("Already processed. You can close this tab.");
          return;
        }

        try {
          const parsedUrl = new url.URL(req.url, "http://localhost:3001");
          const code = parsedUrl.searchParams.get("code");

          if (!code) {
            console.error("No authorization code in callback");
            res.end("No authorization code received. Please try again.");
            return;
          }

          hasResponded = true;
          res.end("Authentication successful! You can close this tab.");

          if (authServer) {
            authServer.close();
            authServer = null;
          }

          const { tokens } = await oAuth2Client.getToken(code);
          oAuth2Client.setCredentials(tokens);
          store.set("google-tokens", tokens);
          console.log("✓ Tokens saved");

          authInProgress = false;
          resolve(oAuth2Client);
        } catch (err) {
          console.error("Token exchange error:", err);
          res.end("Authentication failed: " + err.message);
          if (authServer) {
            authServer.close();
            authServer = null;
          }
          authInProgress = false;
          reject(err);
        }
      })
      .listen(3001);

    authServer.on("error", (err) => {
      console.error("Server error:", err);
      if (authServer) {
        authServer.close();
        authServer = null;
      }
      authInProgress = false;
      reject(err);
    });
  });
}

async function authorize() {
  if (authorizationPromise) {
    return authorizationPromise;
  }

  authorizationPromise = (async () => {
    try {
      const credentialsFile = await fs.readFile("credentials.json");
      const credentials = JSON.parse(credentialsFile);
      const { client_secret, client_id, redirect_uris } = credentials.web;
      const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );

      const tokens = store.get("google-tokens");
      if (tokens && tokens.access_token) {
        console.log("Testing existing tokens...");

        try {
          oAuth2Client.setCredentials(tokens);
          const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
          await gmail.users.getProfile({ userId: "me" });

          console.log("✓ Existing tokens valid");
          authorizationPromise = null;
          return oAuth2Client;
        } catch (validationError) {
          console.log("Tokens invalid, re-authenticating...");
          store.delete("google-tokens");
        }
      }

      const result = await getNewToken(oAuth2Client);
      authorizationPromise = null;
      return result;
    } catch (error) {
      console.error("Authorization error:", error);
      authorizationPromise = null;
      throw error;
    }
  })();

  return authorizationPromise;
}

// electron.js - FIXED VERSION
// Replace your syncReceipts function with this improved version

async function syncReceipts() {
  const auth = await authorize();
  const gmail = google.gmail({ version: "v1", auth });

  // Get parser preference from settings
  const parserPreference = store.get("parserPreference", "regex-first");

  // TEST MODE: Limit emails for faster testing
  let testModeLimit = store.get("testModeLimit", 0);
  if (!testModeLimit && process.env.TEST_MODE_LIMIT) {
    testModeLimit = parseInt(process.env.TEST_MODE_LIMIT);
  }

  if (testModeLimit && testModeLimit > 0) {
    console.log(`⚠️  TEST MODE: Limiting to ${testModeLimit} emails per label`);
  }

  const queries = [
    "label:rideshare-uber", // Note: lowercase with hyphen
    "label:rideshare-lyft", // Note: lowercase with hyphen
    "label:rideshare-curb", // Note: lowercase with hyphen
    "label:rideshare", // Parent label to catch any others
  ];

  const existingReceipts = store.get("receipts", []);
  const existingMessageIds = new Set(existingReceipts.map((r) => r.messageId));
  let newReceiptsCount = 0;
  let duplicatesSkipped = 0;
  let processedCount = 0;
  let skippedCount = 0;
  let parseFailures = 0;

  for (const query of queries) {
    console.log(`\n🔍 ${query}`);

    if (win) {
      win.webContents.send("sync-progress", {
        phase: "searching",
        query: query,
        message: `Searching: ${query}`,
      });
    }

    try {
      let allMessages = [];
      let pageToken = null;

      do {
        const res = await gmail.users.messages.list({
          userId: "me",
          q: query,
          maxResults: testModeLimit && testModeLimit > 0 ? testModeLimit : 500,
          pageToken: pageToken,
        });

        const messages = res.data.messages || [];
        allMessages = allMessages.concat(messages);

        if (
          testModeLimit &&
          testModeLimit > 0 &&
          allMessages.length >= testModeLimit
        ) {
          allMessages = allMessages.slice(0, testModeLimit);
          break;
        }

        pageToken = res.data.nextPageToken;
      } while (pageToken);

      console.log(
        `  Found: ${allMessages.length}${
          testModeLimit && testModeLimit > 0 ? " (test mode limited)" : ""
        }`
      );

      if (win) {
        win.webContents.send("sync-progress", {
          phase: "processing",
          total: allMessages.length,
          current: 0,
          query: query,
          message: `Processing ${allMessages.length} emails from ${query}`,
        });
      }

      for (let i = 0; i < allMessages.length; i++) {
        const message = allMessages[i];

        // Skip if already processed
        if (existingMessageIds.has(message.id)) {
          processedCount++;
          continue;
        }

        if (i % 5 === 0 && win) {
          win.webContents.send("sync-progress", {
            phase: "processing",
            total: allMessages.length,
            current: i,
            query: query,
            message: `Processing email ${i + 1}/${
              allMessages.length
            } from ${query}`,
          });
        }

        const msgRes = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
          format: "full",
        });

        const bodyPart = msgRes.data.payload.parts?.find(
          (p) => p.mimeType === "text/plain"
        );

        if (bodyPart?.body?.data) {
          const bodyData = Buffer.from(bodyPart.body.data, "base64").toString();
          const subject =
            msgRes.data.payload.headers.find((h) => h.name === "Subject")
              ?.value || "";

          // Determine vendor from query or subject - USE BROADER DETECTION
          let vendor = null;

          // Check query first
          if (query.includes("Uber")) {
            vendor = "Uber";
          } else if (query.includes("Lyft")) {
            vendor = "Lyft";
          } else if (query.includes("Curb")) {
            vendor = "Curb";
          }

          // If no vendor from query, check subject with BROADER patterns
          if (!vendor) {
            if (subject.toLowerCase().includes("uber")) {
              vendor = "Uber";
            } else if (subject.toLowerCase().includes("lyft")) {
              vendor = "Lyft";
            } else if (subject.toLowerCase().includes("curb")) {
              vendor = "Curb";
            }
          }

          // NEW: More lenient receipt detection - check if it looks like a receipt
          let isLikelyReceipt = false;
          const subjectLower = subject.toLowerCase();

          // Broad receipt indicators
          if (
            subjectLower.includes("receipt") ||
            subjectLower.includes("trip with") ||
            subjectLower.includes("ride with") ||
            subjectLower.includes("your trip") ||
            subjectLower.includes("your ride") ||
            subjectLower.includes("trip receipt") ||
            // Check body for dollar amounts (strong indicator)
            (bodyData.includes("$") && bodyData.match(/\$\d+\.\d{2}/))
          ) {
            isLikelyReceipt = true;
          }

          // Log for debugging
          if (vendor && !isLikelyReceipt) {
            console.log(`  ℹ️  Possibly not a receipt: "${subject}"`);
          }

          // CRITICAL FIX: Try to parse ALL vendor emails, not just those matching strict patterns
          if (vendor) {
            // Pass existing receipts for deduplication
            const parsedData = await parseReceipt(
              bodyData,
              vendor,
              subject,
              parserPreference,
              existingReceipts
            );

            if (parsedData) {
              existingReceipts.push({ ...parsedData, messageId: message.id });
              existingMessageIds.add(message.id);
              newReceiptsCount++;

              if (win) {
                win.webContents.send("sync-progress", {
                  phase: "processing",
                  total: allMessages.length,
                  current: i + 1,
                  query: query,
                  message: `Found receipt: ${vendor} - ${parsedData.total.toFixed(
                    2
                  )} (${i + 1}/${allMessages.length})`,
                });
              }
            } else {
              // Only increment parse failures if it looked like a receipt
              if (isLikelyReceipt) {
                parseFailures++;
                if (parseFailures <= 5) {
                  console.log(
                    `  ⚠️  Parse failed: "${subject.substring(0, 60)}..."`
                  );
                }
              } else {
                // Count as non-receipt
                skippedCount++;
                if (skippedCount <= 3) {
                  console.log(`  ⊘ Not a receipt: "${subject}"`);
                }
              }
            }
          } else {
            // No vendor detected
            skippedCount++;
            if (skippedCount <= 3) {
              console.log(`  ⊘ No vendor: "${subject}"`);
            }
          }
        }
        processedCount++;
      }

      console.log(`  ✓ Query complete: ${allMessages.length} emails checked`);
      console.log(`    ✅ New receipts: ${newReceiptsCount}`);
      console.log(`    ⊘ Skipped (non-receipts): ${skippedCount}`);
      console.log(`    ⚠️  Parse failures: ${parseFailures}`);
      if (duplicatesSkipped > 0) {
        console.log(`    🔄 Duplicates skipped: ${duplicatesSkipped}`);
      }

      // Reset counters for next query
      skippedCount = 0;
      parseFailures = 0;
      duplicatesSkipped = 0;
    } catch (queryError) {
      console.error(`Error with "${query}":`, queryError.message);
      if (win) {
        win.webContents.send("sync-progress", {
          phase: "error",
          query: query,
          message: `Error with ${query}: ${queryError.message}`,
        });
      }
    }
  }

  store.set("receipts", existingReceipts);
  console.log(
    `\n✅ Sync complete: +${newReceiptsCount} new (${existingReceipts.length} total)`
  );

  if (win) {
    win.webContents.send("sync-complete", {
      newReceipts: newReceiptsCount,
      totalReceipts: existingReceipts.length,
    });
  }

  return {
    newReceipts: newReceiptsCount,
    totalReceipts: existingReceipts.length,
  };
}

app.whenReady().then(() => {
  ipcMain.handle("auth:google", authorize);
  ipcMain.handle("receipts:sync", syncReceipts);
  ipcMain.handle("receipts:get", () => store.get("receipts", []));

  ipcMain.handle("auth:clear", () => {
    store.delete("google-tokens");
    return { success: true };
  });

  ipcMain.handle("receipts:update", (event, messageId, updates) => {
    const receipts = store.get("receipts", []);
    const index = receipts.findIndex((r) => r.messageId === messageId);
    if (index !== -1) {
      receipts[index] = { ...receipts[index], ...updates };
      store.set("receipts", receipts);
      return receipts[index];
    }
    return null;
  });

  ipcMain.handle("receipts:bulkUpdate", (event, messageIds, updates) => {
    const receipts = store.get("receipts", []);
    messageIds.forEach((messageId) => {
      const index = receipts.findIndex((r) => r.messageId === messageId);
      if (index !== -1) {
        receipts[index] = { ...receipts[index], ...updates };
      }
    });
    store.set("receipts", receipts);
    return receipts;
  });

  ipcMain.handle("user:get", async () => {
    try {
      const tokens = store.get("google-tokens");
      if (!tokens) return { email: "Not Logged In" };

      const credentials = JSON.parse(await fs.readFile("credentials.json"));
      const { client_secret, client_id, redirect_uris } = credentials.web;
      const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );

      oAuth2Client.setCredentials(tokens);

      const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
      const profile = await gmail.users.getProfile({ userId: "me" });

      return { email: profile.data.emailAddress };
    } catch (error) {
      console.error("Get user error:", error);
      return { email: "Error fetching email" };
    }
  });

  ipcMain.handle("categories:get", () => {
    return store.get("categories", ["Work", "Personal", "Shared Expenses"]);
  });

  ipcMain.handle("categories:add", (event, category) => {
    const categories = store.get("categories", [
      "Work",
      "Personal",
      "Shared Expenses",
    ]);
    if (!categories.includes(category)) {
      categories.push(category);
      store.set("categories", categories);
    }
    return categories;
  });

  // Settings handlers
  ipcMain.handle("settings:getParserPreference", () => {
    return store.get("parserPreference", "regex-first");
  });

  ipcMain.handle("settings:setParserPreference", (event, preference) => {
    store.set("parserPreference", preference);
    return preference;
  });

  ipcMain.handle("settings:getGeminiKey", () => {
    return store.get("geminiApiKey", process.env.GEMINI_API_KEY || "");
  });

  ipcMain.handle("settings:setGeminiKey", (event, key) => {
    store.set("geminiApiKey", key);
    return key;
  });

  ipcMain.handle("settings:getGeminiModel", () => {
    return store.get("geminiModel", "gemini-2.5-flash");
  });

  ipcMain.handle("settings:setGeminiModel", (event, model) => {
    store.set("geminiModel", model);
    return model;
  });

  ipcMain.handle("settings:getTestModeLimit", () => {
    return store.get("testModeLimit", 0);
  });

  ipcMain.handle("settings:setTestModeLimit", (event, limit) => {
    store.set("testModeLimit", limit);
    return limit;
  });

  ipcMain.handle("receipts:clear", () => {
    store.set("receipts", []);
    return { success: true };
  });

  ipcMain.handle("receipts:openEmail", async (event, messageId) => {
    try {
      const tokens = store.get("google-tokens");
      if (!tokens) return { error: "Not authenticated" };

      const credentials = JSON.parse(await fs.readFile("credentials.json"));
      const { client_secret, client_id, redirect_uris } = credentials.web;
      const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );
      oAuth2Client.setCredentials(tokens);

      const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
      const msgRes = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });

      // Try to get HTML body
      let htmlBody = null;
      const parts = msgRes.data.payload.parts || [];

      // First try to find text/html part
      const htmlPart = parts.find((p) => p.mimeType === "text/html");
      if (htmlPart?.body?.data) {
        htmlBody = Buffer.from(htmlPart.body.data, "base64").toString();
      } else if (msgRes.data.payload.body?.data) {
        // If no parts, try the main body
        htmlBody = Buffer.from(
          msgRes.data.payload.body.data,
          "base64"
        ).toString();
      }

      if (!htmlBody) {
        // Fallback to plain text
        const textPart = parts.find((p) => p.mimeType === "text/plain");
        if (textPart?.body?.data) {
          const textBody = Buffer.from(textPart.body.data, "base64").toString();
          htmlBody = `<pre>${textBody}</pre>`;
        }
      }

      if (htmlBody) {
        // Create a temporary HTML file and open it
        const tempFilePath = path.join(
          app.getPath("temp"),
          `email_${messageId}.html`
        );
        await fs.writeFile(tempFilePath, htmlBody);
        shell.openExternal(`file://${tempFilePath}`);
        return { success: true };
      }

      return { error: "No email content found" };
    } catch (error) {
      console.error("Error opening email:", error);
      return { error: error.message };
    }
  });

  // Subject regex patterns - with defaults
  ipcMain.handle("settings:getUberSubjectRegex", () => {
    return store.get(
      "uberSubjectRegex",
      "Your (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (morning|afternoon|evening|night) trip with Uber"
    );
  });

  ipcMain.handle("settings:setUberSubjectRegex", (event, regex) => {
    store.set("uberSubjectRegex", regex);
    return regex;
  });

  ipcMain.handle("settings:getLyftSubjectRegex", () => {
    return store.get(
      "lyftSubjectRegex",
      "Your ride with .+ on (January|February|March|April|May|June|July|August|September|October|November|December) \\d{1,2}"
    );
  });

  ipcMain.handle("settings:setLyftSubjectRegex", (event, regex) => {
    store.set("lyftSubjectRegex", regex);
    return regex;
  });

  ipcMain.handle("settings:getCurbSubjectRegex", () => {
    return store.get("curbSubjectRegex", "Your Curb Ride Receipt");
  });

  ipcMain.handle("settings:setCurbSubjectRegex", (event, regex) => {
    store.set("curbSubjectRegex", regex);
    return regex;
  });

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
