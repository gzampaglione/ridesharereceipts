// electron.js

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
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const devServerUrl = "http://localhost:5173";

  if (
    process.env.VITE_DEV_SERVER_URL ||
    process.env.NODE_ENV === "development"
  ) {
    win.loadURL(devServerUrl);
    win.webContents.openDevTools();
  } else {
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
        const startMatch = tripLines[0]._match(
          /(\d{1,2}:\d{2}\s*(?:AM|PM))(.+)/
        );
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
    };
  } catch (error) {
    console.error("An error occurred during Uber email parsing:", error);
    return null;
  }
}

async function authorize() {
  const credentials = JSON.parse(await fs.readFile("credentials.json"));
  const { client_secret, client_id, redirect_uris } = credentials.web;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  const tokens = store.get("google-tokens");
  if (tokens) {
    oAuth2Client.setCredentials(tokens);
    return oAuth2Client;
  } else {
    return getNewToken(oAuth2Client);
  }
}

function getNewToken(oAuth2Client) {
  return new Promise((resolve, reject) => {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/gmail.readonly"],
    });

    shell.openExternal(authUrl);

    const server = http
      .createServer(async (req, res) => {
        try {
          const code = new url.URL(
            req.url,
            "http://localhost:3000"
          ).searchParams.get("code");
          res.end("Authentication successful! You can close this tab.");
          server.close();

          const { tokens } = await oAuth2Client.getToken(code);
          oAuth2Client.setCredentials(tokens);
          store.set("google-tokens", tokens);
          resolve(oAuth2Client);
        } catch (err) {
          reject(err);
        }
      })
      .listen(3000);
  });
}

async function syncReceipts() {
  const auth = await authorize();
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.messages.list({
    userId: "me",
    q: 'from:uber.com subject:"Your trip receipt"',
  });
  const messages = res.data.messages || [];
  const existingReceipts = store.get("receipts", []);
  const existingMessageIds = new Set(existingReceipts.map((r) => r.messageId));
  let newReceiptsCount = 0;

  for (const message of messages.slice(0, 10)) {
    if (existingMessageIds.has(message.id)) continue;
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
      const parsedData = parseUberEmail(bodyData);
      if (parsedData) {
        existingReceipts.push({ ...parsedData, messageId: message.id });
        newReceiptsCount++;
      }
    }
  }
  store.set("receipts", existingReceipts);
  return {
    newReceipts: newReceiptsCount,
    totalReceipts: existingReceipts.length,
  };
}

app.whenReady().then(() => {
  ipcMain.handle("auth:google", authorize);
  ipcMain.handle("receipts:sync", syncReceipts);
  ipcMain.handle("receipts:get", () => store.get("receipts", []));
  ipcMain.handle("user:get", async () => {
    try {
      const tokens = store.get("google-tokens");
      if (!tokens) return { email: "Not Logged In" };
      const response = await fetch(
        `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${tokens.access_token}`
      );
      const userInfo = await response.json();
      return { email: userInfo.email };
    } catch (fetchError) {
      console.error("Could not fetch user info:", fetchError);
      return { email: "Error fetching email" };
    }
  });

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
