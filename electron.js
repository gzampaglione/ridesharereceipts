// electron.js
const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("node:path");
const fs = require("fs").promises;
const http = require("http");
const url = require("url");
const { google } = require("googleapis");
const Store = require("electron-store");
const { parseReceipt } = require("./src/services/receiptParser");
const { sendEmailViaGmail } = require("./src/services/gmailService");

// Load environment variables
require("dotenv").config();

const store = new Store();
let win;
let authServer = null;
let authInProgress = false;
let authorizationPromise = null;

// Configuration: number of consecutive duplicates before prompting
const DUPLICATE_THRESHOLD = 10;

// Sync cancellation flag
let syncCancelled = false;

async function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
    show: false,
  });

  win.maximize();
  win.show();

  const devServerUrl = "http://localhost:5173";
  const isDev =
    process.env.NODE_ENV === "development" ||
    process.env.ELECTRON_IS_DEV === "1";

  if (isDev) {
    console.log("Loading from Vite dev server:", devServerUrl);
    win.loadURL(devServerUrl);
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
      scope: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
      ],
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

// Helper functions for HTML stripping and body extraction
function stripHtmlSimple(html) {
  if (!html) return "";
  let text = html;
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<\/(div|p|br|tr|h[1-6]|li)>/gi, "\n");
  text = text.replace(/<(br|hr)[^>]*>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/&nbsp;/gi, " ");
  text = text.replace(/&amp;/gi, "&");
  text = text.replace(/&lt;/gi, "<");
  text = text.replace(/&gt;/gi, ">");
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/^\s+|\s+$/gm, "");
  return text.trim();
}

function extractEmailBody(msgRes) {
  const parts = msgRes.data.payload.parts || [];

  const textPart = parts.find((p) => p.mimeType === "text/plain");
  if (textPart?.body?.data) {
    const text = Buffer.from(textPart.body.data, "base64").toString();
    console.log(`     ✓ text/plain (${text.length} chars)`);
    return text;
  }

  if (msgRes.data.payload.body?.data) {
    const text = Buffer.from(
      msgRes.data.payload.body.data,
      "base64"
    ).toString();

    if (
      text.includes("<html") ||
      text.includes("<body") ||
      text.includes("<!DOCTYPE")
    ) {
      console.log(`     ⚠️  HTML (${text.length} chars), stripping...`);
      const stripped = stripHtmlSimple(text);
      console.log(`     ✓ Stripped to ${stripped.length} chars`);
      return stripped;
    }

    console.log(`     ✓ main body (${text.length} chars)`);
    return text;
  }

  const htmlPart = parts.find((p) => p.mimeType === "text/html");
  if (htmlPart?.body?.data) {
    const html = Buffer.from(htmlPart.body.data, "base64").toString();
    console.log(`     ⚠️  HTML only (${html.length} chars), stripping...`);
    const stripped = stripHtmlSimple(html);
    console.log(`     ✓ Stripped to ${stripped.length} chars`);
    return stripped;
  }

  return null;
}

function getEmailReceivedDate(msgRes) {
  if (msgRes.data.internalDate) {
    return new Date(parseInt(msgRes.data.internalDate));
  }

  const dateHeader = msgRes.data.payload.headers.find((h) => h.name === "Date");
  if (dateHeader) {
    return new Date(dateHeader.value);
  }

  return new Date();
}

// Quick duplicate check function (runs before parsing)
function quickDuplicateCheck(emailBody, vendor, existingReceiptMap) {
  const totalMatch = emailBody.match(/Total[:\s]*\$?([\d,]+\.?\d{0,2})/i);
  const dateMatch = emailBody.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i
  );

  if (!totalMatch || !dateMatch) return false;

  const total = parseFloat(totalMatch[1].replace(/,/g, ""));
  const date = new Date(dateMatch[0]).toISOString().split("T")[0];
  const key = `${vendor}|${date}|${Math.round(total * 100)}`;

  return existingReceiptMap.has(key);
}

// Show dialog asking user if they want to continue syncing
async function askContinueSync(vendor, consecutiveDuplicates) {
  if (!win) return true; // Default to continue if no window

  const result = await dialog.showMessageBox(win, {
    type: "question",
    buttons: ["Skip Remaining", "Continue Syncing"],
    defaultId: 1,
    title: "Many Duplicates Found",
    message: `Found ${consecutiveDuplicates} consecutive duplicate receipts for ${vendor}`,
    detail: `It appears most remaining ${vendor} receipts have already been synced. Would you like to:\n\n• Skip Remaining: Move to next vendor\n• Continue Syncing: Keep checking all emails`,
  });

  // result.response: 0 = Skip, 1 = Continue
  return result.response === 1;
}

async function syncReceipts() {
  // Reset cancellation flag
  syncCancelled = false;

  const auth = await authorize();
  const gmail = google.gmail({ version: "v1", auth });

  const parserPreference = store.get("parserPreference", "regex-first");

  let testModeLimit = store.get("testModeLimit", 0);
  if (!testModeLimit && process.env.TEST_MODE_LIMIT) {
    testModeLimit = parseInt(process.env.TEST_MODE_LIMIT);
  }

  if (testModeLimit && testModeLimit > 0) {
    console.log(`⚠️  TEST MODE: Limiting to ${testModeLimit} emails per label`);
  }

  const queries = [
    "label:rideshare-uber",
    "label:rideshare-lyft",
    "label:rideshare-curb",
    "label:rideshare-amtrak",
  ];

  const existingReceipts = store.get("receipts", []);
  const existingMessageIds = new Set(existingReceipts.map((r) => r.messageId));

  // Create fast lookup map for duplicates
  const existingReceiptMap = new Map();
  existingReceipts.forEach((r) => {
    const dateStr = new Date(r.date).toISOString().split("T")[0];
    const key = `${r.vendor}|${dateStr}|${Math.round(r.total * 100)}`;
    existingReceiptMap.set(key, true);
  });

  let newReceiptsCount = 0;
  let alreadyProcessedCount = 0;
  let skippedCount = 0;
  let parseFailures = 0;

  console.log(`📊 Starting with ${existingReceipts.length} existing receipts`);

  for (const query of queries) {
    // Check if sync was cancelled
    if (syncCancelled) {
      console.log("\n🛑 Sync cancelled by user");
      if (win) {
        win.webContents.send("sync-cancelled");
      }
      break;
    }

    console.log(`\n🔍 ${query}`);

    if (win) {
      win.webContents.send("sync-progress", {
        phase: "searching",
        query: query,
        message: `Searching: ${query}`,
      });
    }

    // Reset counters for this vendor
    let consecutiveDuplicates = 0;
    let skipRemainingForVendor = false;

    try {
      let allMessages = [];
      let pageToken = null;

      do {
        // Check cancellation during message fetching
        if (syncCancelled) break;

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

      console.log(`  Found: ${allMessages.length} emails`);

      if (win) {
        win.webContents.send("sync-progress", {
          phase: "processing",
          total: allMessages.length,
          current: 0,
          query: query,
          message: `Processing ${allMessages.length} emails (newest first)`,
        });
      }

      for (let i = 0; i < allMessages.length; i++) {
        // Check if sync was cancelled
        if (syncCancelled) {
          console.log("\n🛑 Sync cancelled by user");
          break;
        }

        const message = allMessages[i];

        // Check if user chose to skip remaining emails for this vendor
        if (skipRemainingForVendor) {
          console.log(`  ⏭️  Skipping remaining emails (user choice)`);
          break;
        }

        // Skip if already in database (by messageId)
        if (existingMessageIds.has(message.id)) {
          alreadyProcessedCount++;
          consecutiveDuplicates++;
          continue;
        }

        console.log(`\n  📧 Email ${i + 1}/${allMessages.length} (NEW)`);

        if (i % 5 === 0 && win) {
          win.webContents.send("sync-progress", {
            phase: "processing",
            total: allMessages.length,
            current: i,
            query: query,
            message: `Email ${i + 1}/${
              allMessages.length
            } (${newReceiptsCount} new)`,
          });
        }

        const msgRes = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
          format: "full",
        });

        const subject =
          msgRes.data.payload.headers.find((h) => h.name === "Subject")
            ?.value || "";
        console.log(`     Subject: "${subject.substring(0, 60)}..."`);

        // Get email received date
        const emailReceivedDate = getEmailReceivedDate(msgRes);
        console.log(`     Received: ${emailReceivedDate.toLocaleDateString()}`);

        // Extract body
        const bodyData = extractEmailBody(msgRes);

        if (!bodyData) {
          console.log(`     ❌ No body`);
          skippedCount++;
          continue;
        }

        // Determine vendor
        let vendor = null;
        if (query.includes("uber")) {
          vendor = "Uber";
        } else if (query.includes("lyft")) {
          vendor = "Lyft";
        } else if (query.includes("curb")) {
          vendor = "Curb";
        } else if (query.includes("amtrak")) {
          vendor = "Amtrak";
        }

        if (!vendor) {
          const subjectLower = subject.toLowerCase();
          if (subjectLower.includes("uber")) {
            vendor = "Uber";
          } else if (subjectLower.includes("lyft")) {
            vendor = "Lyft";
          } else if (subjectLower.includes("curb")) {
            vendor = "Curb";
          } else if (
            subjectLower.includes("amtrak") ||
            subjectLower.includes("eticket")
          ) {
            vendor = "Amtrak";
          }
        }

        if (!vendor) {
          console.log(`     ⊘ No vendor`);
          skippedCount++;
          continue;
        }

        console.log(`     🏷️  ${vendor}`);

        // Quick duplicate check BEFORE parsing
        if (quickDuplicateCheck(bodyData, vendor, existingReceiptMap)) {
          console.log(`     🔄 Quick duplicate check - skipping parse`);
          alreadyProcessedCount++;
          consecutiveDuplicates++;

          // Check if we've hit the threshold
          if (consecutiveDuplicates >= DUPLICATE_THRESHOLD) {
            console.log(
              `\n  ⚠️  ${consecutiveDuplicates} consecutive duplicates found`
            );
            const shouldContinue = await askContinueSync(
              vendor,
              consecutiveDuplicates
            );

            if (!shouldContinue) {
              skipRemainingForVendor = true;
              console.log(`  🛑 User chose to skip remaining ${vendor} emails`);
              break;
            } else {
              console.log(`  ✓ User chose to continue syncing`);
              // Reset counter after user confirms they want to continue
              consecutiveDuplicates = 0;
            }
          }

          continue;
        }

        // Parse with email received date for validation
        const parsedData = await parseReceipt(
          bodyData,
          vendor,
          subject,
          parserPreference,
          existingReceipts,
          emailReceivedDate
        );

        if (parsedData) {
          console.log(`     ✅ SUCCESS: $${parsedData.total.toFixed(2)}`);
          existingReceipts.push({ ...parsedData, messageId: message.id });
          existingMessageIds.add(message.id);

          // Add to quick lookup map
          const dateStr = new Date(parsedData.date).toISOString().split("T")[0];
          const key = `${parsedData.vendor}|${dateStr}|${Math.round(
            parsedData.total * 100
          )}`;
          existingReceiptMap.set(key, true);

          newReceiptsCount++;
          consecutiveDuplicates = 0; // Reset on success

          if (win) {
            win.webContents.send("sync-progress", {
              phase: "processing",
              total: allMessages.length,
              current: i + 1,
              query: query,
              message: `${vendor} $${parsedData.total.toFixed(2)}`,
            });
          }
        } else {
          console.log(`     ❌ Parse failed`);
          parseFailures++;
          // Don't increment consecutiveDuplicates on parse failure
        }
      }

      console.log(`\n  ✓ Complete`);
      console.log(`    ✅ New: ${newReceiptsCount}`);
      console.log(`    ⏭️  Skipped (existing): ${alreadyProcessedCount}`);
      console.log(`    ❌ Failed: ${parseFailures}`);
      console.log(`    ⊘ Skipped (other): ${skippedCount}`);

      // Reset for next vendor
      alreadyProcessedCount = 0;
      skippedCount = 0;
      parseFailures = 0;
    } catch (queryError) {
      console.error(`Error with "${query}":`, queryError.message);
      if (win) {
        win.webContents.send("sync-progress", {
          phase: "error",
          query: query,
          message: `Error: ${queryError.message}`,
        });
      }
    }
  }

  store.set("receipts", existingReceipts);

  if (syncCancelled) {
    console.log(
      `\n🛑 Sync cancelled: ${newReceiptsCount} new receipts saved before cancellation`
    );
  } else {
    console.log(
      `\n✅ Sync complete: +${newReceiptsCount} new (${existingReceipts.length} total)`
    );
  }

  if (win) {
    win.webContents.send("sync-complete", {
      newReceipts: newReceiptsCount,
      totalReceipts: existingReceipts.length,
      cancelled: syncCancelled,
    });
  }

  return {
    newReceipts: newReceiptsCount,
    totalReceipts: existingReceipts.length,
    cancelled: syncCancelled,
  };
}

app.whenReady().then(() => {
  ipcMain.handle("auth:google", authorize);
  ipcMain.handle("receipts:sync", syncReceipts);
  ipcMain.handle("receipts:get", () => store.get("receipts", []));

  // Cancel sync handler
  ipcMain.handle("receipts:cancelSync", () => {
    syncCancelled = true;
    console.log("🛑 Sync cancellation requested");
    return { success: true };
  });

  // Add this with the other receipt handlers
  ipcMain.handle("receipts:getEmailHtml", async (event, messageId) => {
    try {
      const tokens = store.get("google-tokens");
      if (!tokens) return { success: false, error: "Not authenticated" };

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

      let htmlBody = null;
      const parts = msgRes.data.payload.parts || [];

      // Try to find HTML part
      const htmlPart = parts.find((p) => p.mimeType === "text/html");
      if (htmlPart?.body?.data) {
        htmlBody = Buffer.from(htmlPart.body.data, "base64").toString();
      } else if (msgRes.data.payload.body?.data) {
        const bodyData = Buffer.from(
          msgRes.data.payload.body.data,
          "base64"
        ).toString();

        // Check if it's HTML
        if (
          bodyData.includes("<html") ||
          bodyData.includes("<body") ||
          bodyData.includes("<!DOCTYPE")
        ) {
          htmlBody = bodyData;
        }
      }

      // Fallback to plain text if no HTML found
      if (!htmlBody) {
        const textPart = parts.find((p) => p.mimeType === "text/plain");
        if (textPart?.body?.data) {
          const textBody = Buffer.from(textPart.body.data, "base64").toString();
          htmlBody = `<html><body><pre style="font-family: Arial, sans-serif; white-space: pre-wrap; word-wrap: break-word;">${textBody}</pre></body></html>`;
        }
      }

      if (htmlBody) {
        return { success: true, html: htmlBody };
      }

      return { success: false, error: "No email content found" };
    } catch (error) {
      console.error("Error getting email HTML:", error);
      return { success: false, error: error.message };
    }
  });

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

  ipcMain.handle("settings:getAddressDisplayMode", () => {
    return store.get("addressDisplayMode", "city");
  });

  ipcMain.handle("settings:setAddressDisplayMode", (event, mode) => {
    store.set("addressDisplayMode", mode);
    return mode;
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
        id: message,
        format: "full",
      });

      let htmlBody = null;
      const parts = msgRes.data.payload.parts || [];

      const htmlPart = parts.find((p) => p.mimeType === "text/html");
      if (htmlPart?.body?.data) {
        htmlBody = Buffer.from(htmlPart.body.data, "base64").toString();
      } else if (msgRes.data.payload.body?.data) {
        htmlBody = Buffer.from(
          msgRes.data.payload.body.data,
          "base64"
        ).toString();
      }

      if (!htmlBody) {
        const textPart = parts.find((p) => p.mimeType === "text/plain");
        if (textPart?.body?.data) {
          const textBody = Buffer.from(textPart.body.data, "base64").toString();
          htmlBody = `<pre>${textBody}</pre>`;
        }
      }

      if (htmlBody) {
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
      "Your ride with .+ on (January|February|March|April|May|June|July|August|September|October|November|December) \\d{1,2}|Your (receipt|total charges) for rides on (January|February|March|April|May|June|July|August|September|October|November|December) \\d{1,2}"
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

  ipcMain.handle("settings:getAmtrakSubjectRegex", () => {
    return store.get(
      "amtrakSubjectRegex",
      "eTicket and Receipt for Your|Amtrak: Refund Receipt"
    );
  });

  ipcMain.handle("settings:setAmtrakSubjectRegex", (event, regex) => {
    store.set("amtrakSubjectRegex", regex);
    return regex;
  });

  // Sync on startup setting
  ipcMain.handle("settings:getSyncOnStartup", () => {
    return store.get("syncOnStartup", false);
  });

  ipcMain.handle("settings:setSyncOnStartup", (event, value) => {
    store.set("syncOnStartup", value);
    return value;
  });

  // Add this with the other receipt handlers in electron.js
  ipcMain.handle("receipts:delete", (event, messageIds) => {
    const receipts = store.get("receipts", []);
    const filteredReceipts = receipts.filter(
      (r) => !messageIds.includes(r.messageId)
    );
    store.set("receipts", filteredReceipts);
    console.log(`🗑️  Deleted ${messageIds.length} receipts from database`);
    return { success: true, deleted: messageIds.length };
  });

  // Send email via Gmail API
  ipcMain.handle(
    "email:send",
    async (event, to, subject, body, isHtml = false) => {
      try {
        const auth = await authorize();
        const result = await sendEmailViaGmail(auth, to, subject, body, isHtml);
        return result;
      } catch (error) {
        console.error("Send email error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  // Backup database
  ipcMain.handle("database:backup", async () => {
    try {
      const receipts = store.get("receipts", []);
      const categories = store.get("categories", []);
      const settings = {
        parserPreference: store.get("parserPreference"),
        geminiModel: store.get("geminiModel"),
        testModeLimit: store.get("testModeLimit"),
        syncOnStartup: store.get("syncOnStartup"),
        uberSubjectRegex: store.get("uberSubjectRegex"),
        lyftSubjectRegex: store.get("lyftSubjectRegex"),
        curbSubjectRegex: store.get("curbSubjectRegex"),
      };

      const backup = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        receipts,
        categories,
        settings,
      };

      // Show save dialog
      const { filePath } = await dialog.showSaveDialog({
        title: "Save Database Backup",
        defaultPath: `receipts-backup-${
          new Date().toISOString().split("T")[0]
        }.json`,
        filters: [
          { name: "JSON Files", extensions: ["json"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });

      if (filePath) {
        await fs.writeFile(filePath, JSON.stringify(backup, null, 2));
        console.log(`✅ Database backed up to: ${filePath}`);
        return { success: true, path: filePath };
      }

      return { success: false, error: "Save cancelled" };
    } catch (error) {
      console.error("Backup error:", error);
      return { success: false, error: error.message };
    }
  });

  // Restore database
  ipcMain.handle("database:restore", async () => {
    try {
      const { filePaths } = await dialog.showOpenDialog({
        title: "Restore Database Backup",
        filters: [
          { name: "JSON Files", extensions: ["json"] },
          { name: "All Files", extensions: ["*"] },
        ],
        properties: ["openFile"],
      });

      if (filePaths && filePaths[0]) {
        const backupData = await fs.readFile(filePaths[0], "utf8");
        const backup = JSON.parse(backupData);

        // Validate backup structure
        if (!backup.receipts || !Array.isArray(backup.receipts)) {
          throw new Error("Invalid backup file format");
        }

        // Restore data
        store.set("receipts", backup.receipts);
        if (backup.categories) store.set("categories", backup.categories);
        if (backup.settings) {
          Object.keys(backup.settings).forEach((key) => {
            if (backup.settings[key] !== undefined) {
              store.set(key, backup.settings[key]);
            }
          });
        }

        console.log(`✅ Database restored from: ${filePaths[0]}`);
        return { success: true, receiptsCount: backup.receipts.length };
      }

      return { success: false, error: "Restore cancelled" };
    } catch (error) {
      console.error("Restore error:", error);
      return { success: false, error: error.message };
    }
  });

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
