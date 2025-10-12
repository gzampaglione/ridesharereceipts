# Rideshare Receipts

An Electron desktop app for syncing and managing rideshare and train receipts from Gmail.

## Features

- 🚗 **Multi-vendor support**: Uber, Lyft, Curb, and Amtrak
- 📧 **Gmail integration**: Automatically syncs receipts from labeled emails
- 🤖 **Smart parsing**: Regex + AI-powered receipt extraction (Gemini)
- 🚂 **Amtrak refunds**: Automatically groups Amtrak purchases with cancellations
- 📊 **Rich filtering**: Filter by date, location, vendor, category, and billing status
- 💼 **Bulk actions**: Categorize, mark as billed, export to CSV, or forward via email
- 🗂️ **Categories**: Organize receipts (Work, Personal, Shared Expenses, etc.)
- 🎨 **Modern UI**: Dark/light mode with Material-UI

## Setup

### 1. Gmail API Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API
4. Create OAuth 2.0 credentials (Desktop app)
5. Download the credentials as `credentials.json` and place in the project root

### 2. Gmail Labels

Create the following labels in Gmail and assign them to your receipt emails:
- `rideshare-uber` - for Uber receipts
- `rideshare-lyft` - for Lyft receipts  
- `rideshare-curb` - for Curb receipts
- `rideshare-amtrak` - for Amtrak tickets and refunds

**Tip**: Use Gmail filters to automatically label incoming receipts.

### 3. Install Dependencies

```bash
npm install
```

### 4. Optional: Gemini AI API Key

For improved parsing accuracy, get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey) and configure it in the app settings.

## Running the App

```bash
npm run dev
```

This starts both the Vite dev server and Electron.

## Amtrak Features

The app automatically:
- ✅ Parses Amtrak purchase receipts (trip date, total, route)
- ✅ Parses Amtrak refund receipts
- ✅ Groups purchases with their cancellations by reservation number
- ✅ Shows net amount after refunds
- ✅ Visual indicators for refunded trips

Amtrak receipts with matching reservation numbers are automatically grouped, with:
- 🟡 Orange border for purchases that have been refunded
- 🔴 Red border for refund entries
- Indented refund rows for easy identification

## Tech Stack

- **Electron** - Desktop app framework
- **React** - UI framework
- **Vite** - Build tool
- **Material-UI** - Component library
- **Gmail API** - Email syncing
- **Gemini AI** - Smart receipt parsing
