// This would go in electron.js or a separate service file
// Extract Gmail-related functions for better organization

const { google } = require("googleapis");
const Store = require("electron-store");
const store = new Store();

// Import parsers
const { parseUberEmail, parseLyftEmail, parseCurbEmail } = require("./parsers");

async function syncReceiptsFromGmail(auth, win) {
  const gmail = google.gmail({ version: "v1", auth });

  const queries = [
    "label:Rideshare/Uber",
    "label:Rideshare/Lyft",
    "label:Rideshare/Curb",
    "label:Rideshare",
  ];

  const existingReceipts = store.get("receipts", []);
  const existingMessageIds = new Set(existingReceipts.map((r) => r.messageId));
  let newReceiptsCount = 0;

  for (const query of queries) {
    console.log(`\n🔍 Searching: ${query}`);

    try {
      let allMessages = [];
      let pageToken = null;

      // Paginate through all results
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

        if (messages.length > 0) {
          console.log(`  Found ${allMessages.length} messages so far...`);
        }
      } while (pageToken);

      console.log(`  ✓ Total: ${allMessages.length} messages`);

      // Send progress update
      if (win) {
        win.webContents.send("sync-progress", {
          total: allMessages.length,
          current: 0,
          query: query,
        });
      }

      // Process each message
      for (let i = 0; i < allMessages.length; i++) {
        const message = allMessages[i];

        if (existingMessageIds.has(message.id)) continue;

        // Progress update every 10 messages
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

        if (bodyPart?.body?.data) {
          const bodyData = Buffer.from(bodyPart.body.data, "base64").toString();
          const subject =
            msgRes.data.payload.headers.find((h) => h.name === "Subject")
              ?.value || "";

          let parsedData = null;

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
            existingReceipts.push({ ...parsedData, messageId: message.id });
            existingMessageIds.add(message.id);
            newReceiptsCount++;
          } else {
            console.log(`  ⚠ Failed to parse: ${subject}`);
          }
        }
      }
    } catch (queryError) {
      console.error(`❌ Error with "${query}":`, queryError.message);
    }
  }

  store.set("receipts", existingReceipts);
  console.log(
    `\n✅ Sync complete: ${newReceiptsCount} new, ${existingReceipts.length} total`
  );

  if (win) {
    win.webContents.send("sync-complete");
  }

  return {
    newReceipts: newReceiptsCount,
    totalReceipts: existingReceipts.length,
  };
}

module.exports = {
  syncReceiptsFromGmail,
};
