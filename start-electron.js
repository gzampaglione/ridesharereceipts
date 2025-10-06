// start-electron.js

const { spawn } = require("child_process");

// Get the path to the electron executable
// This is the most reliable way to find it
const electronPath = require("electron");

// Spawn the electron process
const child = spawn(electronPath, ["electron.js"], {
  stdio: "inherit",
  shell: true,
});

child.on("close", (code) => {
  process.exit(code);
});
