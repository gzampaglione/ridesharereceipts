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

async function syncReceipts() {
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
  ];

  const existingReceipts = store.get("receipts", []);
  const existingMessageIds = new Set(existingReceipts.map((r) => r.messageId));
  let newReceiptsCount = 0;
  let alreadyProcessedCount = 0;
  let skippedCount = 0;
  let parseFailures = 0;

  console.log(`📊 Starting with ${existingReceipts.length} existing receipts`);

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
        const message = allMessages[i];

        // Skip if already in database
        if (existingMessageIds.has(message.id)) {
          alreadyProcessedCount++;
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
        }

        if (!vendor) {
          const subjectLower = subject.toLowerCase();
          if (subjectLower.includes("uber")) {
            vendor = "Uber";
          } else if (subjectLower.includes("lyft")) {
            vendor = "Lyft";
          } else if (subjectLower.includes("curb")) {
            vendor = "Curb";
          }
        }

        if (!vendor) {
          console.log(`     ⊘ No vendor`);
          skippedCount++;
          continue;
        }

        console.log(`     🏷️  ${vendor}`);

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
          newReceiptsCount++;

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
        }
      }

      console.log(`\n  ✓ Complete`);
      console.log(`    ✅ New: ${newReceiptsCount}`);
      console.log(`    ⏭️  Skipped (existing): ${alreadyProcessedCount}`);
      console.log(`    ❌ Failed: ${parseFailures}`);
      console.log(`    ⊘ Skipped (other): ${skippedCount}`);

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
