// start-electron.js

const { spawn } = require("child_process");

// Get the path to the electron executable
const electronPath = require("electron");

// Set environment to development
process.env.NODE_ENV = "development";

// Spawn the electron process with environment variables
const child = spawn(electronPath, ["electron.js"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    NODE_ENV: "development",
    ELECTRON_IS_DEV: "1",
  },
});

child.on("close", (code) => {
  process.exit(code);
});
