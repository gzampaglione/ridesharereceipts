// electron.js - Enhanced version with all features

const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("fs").promises;
const http = require("http");
const url = require("url");
const { google } = require("googleapis");
const Store = require("electron-store");

const store = new Store();
let win;

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
    console.log("Loading from dist folder");
    win.loadFile(path.join(__dirname, "dist", "index.html"));
  }
}

function parseAddressString(addressString) {
  if (!addressString) return null;
  const parts = addressString.split(",").map((p) => p.trim());
  if (parts.length < 3) return null;
  try {
    const country = parts.length > 3 ? parts[parts.length - 1] : "US";
    const stateZipPart = parts[parts.length - 2];
    const stateZipMatch = stateZipPart.match(/([A-Z]{2})\s*(\d{5})?/);
    const state = stateZipMatch ? stateZipMatch[1] : null;
    const city = parts[parts.length - 3];
    const address = parts.slice(0, parts.length - 3).join(", ");
    return { address, city, state, country };
  } catch (parseError) {
    console.error("Failed to parse address string:", addressString, parseError);
    return { address: addressString, city: null, state: null, country: null };
  }
}

function parseUberEmail(emailBody) {
  try {
    const totalMatch = emailBody.match(/Total\s*\$([\d.]+)/);
    const total = totalMatch ? parseFloat(totalMatch[1]) : null;
    if (total === null) return null;
    const tipMatch = emailBody.match(/Tip\s*\$([\d.]+)/);
    const tip = tipMatch ? parseFloat(tipMatch[1]) : 0.0;
    const dateMatch = emailBody.match(
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/
    );
    const date = dateMatch ? new Date(dateMatch[0]) : null;
    if (!date) return null;
    const tripBlockMatch = emailBody.match(
      /\d+\.\d+\s*miles\s*\|\s*\d+\s*minutes\s*([\s\S]*)/
    );
    let startLocation = null,
      endLocation = null,
      startTime = null,
      endTime = null;
    if (tripBlockMatch) {
      const tripLines = tripBlockMatch[1].trim().split(/\r?\n/);
      if (tripLines.length >= 2) {
        const startMatch = tripLines[0].match(
          /(\d{1,2}:\d{2}\s*(?:AM|PM))(.+)/
        ); // FIXED
        if (startMatch) {
          startTime = startMatch[1].trim();
          startLocation = parseAddressString(startMatch[2].trim());
        }
        const endMatch = tripLines[1].match(/(\d{1,2}:\d{2}\s*(?:AM|PM))(.+)/);
        if (endMatch) {
          endTime = endMatch[1].trim();
          endLocation = parseAddressString(endMatch[2].trim());
        }
      }
    }
    return {
      vendor: "Uber",
      total,
      tip,
      date: date.toISOString(),
      startTime,
      endTime,
      startLocation,
      endLocation,
      category: null,
      billed: false,
    };
  } catch (error) {
    console.error("An error occurred during Uber email parsing:", error);
    return null;
  }
}

function parseLyftEmail(emailBody) {
  try {
    console.log("Parsing Lyft email...");

    // Extract total - Lyft format: "Visa *1336$34.00"
    const totalMatch =
      emailBody.match(/\$(\d+\.\d{2})/) ||
      emailBody.match(/Total.*?\$(\d+\.\d{2})/);
    const total = totalMatch ? parseFloat(totalMatch[1]) : null;
    if (total === null) {
      console.log("Could not find total in Lyft email");
      return null;
    }

    // Extract tip - Lyft shows it inline sometimes
    const tipMatch = emailBody.match(/Tip.*?\$(\d+\.\d{2})/i);
    const tip = tipMatch ? parseFloat(tipMatch[1]) : 0.0;

    // Extract date - multiple formats
    const dateMatch =
      emailBody.match(
        /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/
      ) ||
      emailBody.match(
        /on\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/
      );
    const date = dateMatch ? new Date(dateMatch[0].replace("on ", "")) : null;
    if (!date) {
      console.log("Could not find date in Lyft email");
      return null;
    }

    // Extract locations - Lyft format: "Pickup   9:22 AM1519 Cambridge St, Philadelphia, PA"
    let startLocation = null,
      endLocation = null,
      startTime = null,
      endTime = null;

    const pickupMatch = emailBody.match(
      /Pickup\s+(\d{1,2}:\d{2}\s*(?:AM|PM))([^\n]+?)(?=Drop-off|$)/s
    );
    const dropoffMatch = emailBody.match(
      /Drop-off\s+(\d{1,2}:\d{2}\s*(?:AM|PM))([^\n]+?)(?=Committed|$)/s
    );

    if (pickupMatch) {
      startTime = pickupMatch[1].trim();
      startLocation = parseAddressString(pickupMatch[2].trim());
    }

    if (dropoffMatch) {
      endTime = dropoffMatch[1].trim();
      endLocation = parseAddressString(dropoffMatch[2].trim());
    }

    console.log(`Parsed Lyft: ${total} on ${date.toLocaleDateString()}`);
    console.log(`  Start: ${startTime} - ${startLocation?.city || "N/A"}`);
    console.log(`  End: ${endTime} - ${endLocation?.city || "N/A"}`);

    return {
      vendor: "Lyft",
      total,
      tip,
      date: date.toISOString(),
      startTime,
      endTime,
      startLocation,
      endLocation,
      category: null,
      billed: false,
    };
  } catch (error) {
    console.error("An error occurred during Lyft email parsing:", error);
    return null;
  }
}

let authorizationPromise = null;

async function authorize() {
  // Return existing promise if authorization is already in progress
  if (authorizationPromise) {
    console.log("Authorization already in progress, waiting...");
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
        console.log("Found existing tokens, testing Gmail API access...");

        // Test with Gmail API instead
        try {
          oAuth2Client.setCredentials(tokens);
          const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
          await gmail.users.getProfile({ userId: "me" });

          console.log("Existing tokens are valid - Gmail API works!");
          authorizationPromise = null;
          return oAuth2Client;
        } catch (validationError) {
          console.error("Token validation failed:", validationError.message);
          console.log("Deleting invalid tokens and re-authenticating");
          store.delete("google-tokens");
        }
      }

      console.log("No valid tokens found, starting OAuth flow");
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

let authServer = null;
let authInProgress = false;

function getNewToken(oAuth2Client) {
  return new Promise((resolve, reject) => {
    // Prevent multiple simultaneous auth attempts
    if (authInProgress) {
      console.log("Auth already in progress, skipping...");
      return reject(new Error("Authentication already in progress"));
    }

    authInProgress = true;

    // Close any existing server first
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
        // Ignore favicon requests
        if (req.url.includes("favicon.ico")) {
          res.writeHead(404);
          res.end();
          return;
        }

        // Only process once
        if (hasResponded) {
          console.log(
            "Already processed auth callback, ignoring duplicate request"
          );
          res.end("Already processed. You can close this tab.");
          return;
        }

        try {
          const parsedUrl = new url.URL(req.url, "http://localhost:3001");
          const code = parsedUrl.searchParams.get("code");

          if (!code) {
            console.error("No authorization code in callback URL:", req.url);
            res.end("No authorization code received. Please try again.");
            return;
          }

          hasResponded = true;
          console.log("Received authorization code, exchanging for tokens...");
          res.end(
            "Authentication successful! You can close this tab and return to the app."
          );

          // Close server
          if (authServer) {
            authServer.close();
            authServer = null;
          }

          // Exchange code for tokens
          const { tokens } = await oAuth2Client.getToken(code);
          console.log("Tokens received from Google:");
          console.log("- Has access_token:", !!tokens.access_token);
          console.log("- Has refresh_token:", !!tokens.refresh_token);
          console.log("- Access token length:", tokens.access_token?.length);

          oAuth2Client.setCredentials(tokens);
          store.set("google-tokens", tokens);
          console.log("Tokens saved to store");

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
      .listen(3001, () => {
        console.log("OAuth callback server listening on port 3001");
      });

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

async function syncReceipts() {
  const auth = await authorize();
  const gmail = google.gmail({ version: "v1", auth });

  // Search for receipts using nested labels
  const queries = [
    "label:Rideshare/Uber",
    "label:Rideshare/Lyft",
    "label:Rideshare/Curb",
    "label:Rideshare",
  ];

  const existingReceipts = store.get("receipts", []);
  const existingMessageIds = new Set(existingReceipts.map((r) => r.messageId));
  let newReceiptsCount = 0;
  let totalProcessed = 0;

  for (const query of queries) {
    console.log(`Searching with query: ${query}`);

    try {
      // Get all message IDs (pagination to get more than 500)
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

        console.log(
          `Fetched ${messages.length} messages (total so far: ${allMessages.length})`
        );
      } while (pageToken);

      console.log(
        `Found ${allMessages.length} total messages for query: ${query}`
      );

      // Send progress update to renderer
      if (win) {
        win.webContents.send("sync-progress", {
          total: allMessages.length,
          current: 0,
          query: query,
        });
      }

      for (let i = 0; i < allMessages.length; i++) {
        const message = allMessages[i];

        // Skip if already processed
        if (existingMessageIds.has(message.id)) {
          totalProcessed++;
          continue;
        }

        // Send progress update every 10 messages
        if (i % 10 === 0 && win) {
          win.webContents.send("sync-progress", {
            total: allMessages.length,
            current: i,
            query: query,
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

        if (bodyPart && bodyPart.body.data) {
          const bodyData = Buffer.from(bodyPart.body.data, "base64").toString();

          // Determine vendor from query or subject
          let parsedData = null;
          const subject =
            msgRes.data.payload.headers.find((h) => h.name === "Subject")
              ?.value || "";

          if (
            query.includes("Uber") ||
            subject.toLowerCase().includes("uber")
          ) {
            parsedData = parseUberEmail(bodyData);
          } else if (
            query.includes("Lyft") ||
            subject.toLowerCase().includes("lyft")
          ) {
            parsedData = parseLyftEmail(bodyData);
          } else if (
            query.includes("Curb") ||
            subject.toLowerCase().includes("curb")
          ) {
            parsedData = parseCurbEmail(bodyData);
          }

          if (parsedData) {
            console.log(
              `Successfully parsed ${parsedData.vendor} receipt from ${parsedData.date}`
            );
            existingReceipts.push({ ...parsedData, messageId: message.id });
            existingMessageIds.add(message.id); // Add to set to prevent duplicates
            newReceiptsCount++;
          } else {
            console.log(`Failed to parse email with subject: ${subject}`);
          }
        }

        totalProcessed++;
      }
    } catch (queryError) {
      console.error(`Error with query "${query}":`, queryError.message);
    }
  }

  store.set("receipts", existingReceipts);
  console.log(
    `Sync complete: ${newReceiptsCount} new receipts, ${existingReceipts.length} total`
  );

  // Send completion signal
  if (win) {
    win.webContents.send("sync-complete");
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

  // Clear tokens (for debugging)
  ipcMain.handle("auth:clear", () => {
    store.delete("google-tokens");
    return { success: true };
  });

  // Debug: Check tokens
  ipcMain.handle("auth:debug", () => {
    const tokens = store.get("google-tokens");
    console.log("=== DEBUG TOKEN INFO ===");
    console.log("Tokens exist:", !!tokens);
    if (tokens) {
      console.log("Has access_token:", !!tokens.access_token);
      console.log("Has refresh_token:", !!tokens.refresh_token);
      console.log(
        "Access token preview:",
        tokens.access_token
          ? tokens.access_token.substring(0, 20) + "..."
          : "none"
      );
    }
    console.log("=======================");
    return {
      exists: !!tokens,
      hasAccess: tokens ? !!tokens.access_token : false,
      hasRefresh: tokens ? !!tokens.refresh_token : false,
    };
  });

  // Update receipt (for category/billed status)
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

  // Bulk update receipts
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
      console.log("=== USER:GET DEBUG ===");
      console.log("Tokens in store:", !!tokens);

      if (!tokens) {
        console.log("No tokens found");
        return { email: "Not Logged In" };
      }

      console.log("Token details:");
      console.log("- access_token exists:", !!tokens.access_token);
      console.log("- access_token length:", tokens.access_token?.length);
      console.log(
        "- access_token preview:",
        tokens.access_token?.substring(0, 30) + "..."
      );
      console.log("- refresh_token exists:", !!tokens.refresh_token);
      console.log("- expiry_date:", tokens.expiry_date);

      console.log("Testing Gmail API access...");

      // Use Gmail API to get user profile (which includes email)
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

      console.log("SUCCESS! Gmail API works!");
      console.log("Email:", profile.data.emailAddress);
      console.log("===================");
      return { email: profile.data.emailAddress };
    } catch (fetchError) {
      console.error("=== USER:GET ERROR ===");
      console.error("Error message:", fetchError.message);
      console.error("Error code:", fetchError.code);
      console.error("Error status:", fetchError.status);
      if (fetchError.response?.data) {
        console.error(
          "Response data:",
          JSON.stringify(fetchError.response.data, null, 2)
        );
      }
      console.error("Full error object:", fetchError);
      console.error("===================");
      return { email: "Error fetching email" };
    }
  });

  // Get user categories
  ipcMain.handle("categories:get", () => {
    return store.get("categories", ["Work", "Personal", "Shared Expenses"]);
  });

  // Add category
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

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
