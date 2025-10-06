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
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const devServerUrl = "http://localhost:5173";
  const isDev =
    process.env.NODE_ENV === "development" ||
    process.env.ELECTRON_IS_DEV === "1";

  if (isDev) {
    console.log("Loading from Vite dev server:", devServerUrl);
    win.loadURL(devServerUrl);
    win.webContents.openDevTools();
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

async function syncReceipts() {
  const auth = await authorize();
  const gmail = google.gmail({ version: "v1", auth });

  // Get parser preference from settings
  const parserPreference = store.get("parserPreference", "regex-first");

  const queries = [
    "label:Rideshare/Uber",
    "label:Rideshare/Lyft",
    "label:Rideshare/Curb",
    "label:Rideshare",
  ];

  const existingReceipts = store.get("receipts", []);
  const existingMessageIds = new Set(existingReceipts.map((r) => r.messageId));
  let newReceiptsCount = 0;
  let processedCount = 0;

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
          maxResults: 500,
          pageToken: pageToken,
        });

        const messages = res.data.messages || [];
        allMessages = allMessages.concat(messages);
        pageToken = res.data.nextPageToken;
      } while (pageToken);

      console.log(`  Found: ${allMessages.length}`);

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

          let vendor = null;
          if (query.includes("Uber") || subject.toLowerCase().includes("uber"))
            vendor = "Uber";
          else if (
            query.includes("Lyft") ||
            subject.toLowerCase().includes("lyft")
          )
            vendor = "Lyft";
          else if (
            query.includes("Curb") ||
            subject.toLowerCase().includes("curb")
          )
            vendor = "Curb";

          if (vendor) {
            const parsedData = await parseReceipt(
              bodyData,
              vendor,
              subject,
              parserPreference
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
                  message: `Found receipt: ${vendor} - $${parsedData.total.toFixed(
                    2
                  )} (${i + 1}/${allMessages.length})`,
                });
              }
            }
          }
        }
        processedCount++;
      }
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

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
