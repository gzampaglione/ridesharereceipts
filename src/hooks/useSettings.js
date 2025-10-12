import { useState, useCallback } from "react";

export function useSettings() {
  const [parserPreference, setParserPreference] = useState("regex-first");
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("gemini-2.5-flash");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [testModeLimit, setTestModeLimit] = useState(0);
  const [syncOnStartup, setSyncOnStartup] = useState(false);
  const [uberSubjectRegex, setUberSubjectRegex] = useState("");
  const [lyftSubjectRegex, setLyftSubjectRegex] = useState("");
  const [curbSubjectRegex, setCurbSubjectRegex] = useState("");
  const [amtrakSubjectRegex, setAmtrakSubjectRegex] = useState("");
  const [addressDisplayMode, setAddressDisplayMode] = useState("city"); // NEW

  const loadSettings = useCallback(async () => {
    const preference = await window.electronAPI.getParserPreference();
    const key = await window.electronAPI.getGeminiKey();
    const model = await window.electronAPI.getGeminiModel();
    const limit = await window.electronAPI.getTestModeLimit();
    const uberRegex = await window.electronAPI.getUberSubjectRegex();
    const lyftRegex = await window.electronAPI.getLyftSubjectRegex();
    const curbRegex = await window.electronAPI.getCurbSubjectRegex();
    const amtrakRegex = await window.electronAPI.getAmtrakSubjectRegex();
    const syncStartup = await window.electronAPI.getSyncOnStartup();
    const addressMode = await window.electronAPI.getAddressDisplayMode(); // NEW

    setParserPreference(preference);
    setGeminiKey(key);
    setGeminiModel(model || "gemini-2.5-flash");
    setTestModeLimit(limit);
    setUberSubjectRegex(uberRegex);
    setLyftSubjectRegex(lyftRegex);
    setCurbSubjectRegex(curbRegex);
    setAmtrakSubjectRegex(amtrakRegex);
    setSyncOnStartup(syncStartup);
    setAddressDisplayMode(addressMode || "city"); // NEW
  }, []);

  const saveSettings = useCallback(async () => {
    await window.electronAPI.setParserPreference(parserPreference);
    await window.electronAPI.setGeminiKey(geminiKey);
    await window.electronAPI.setGeminiModel(geminiModel);
    await window.electronAPI.setTestModeLimit(testModeLimit);
    await window.electronAPI.setUberSubjectRegex(uberSubjectRegex);
    await window.electronAPI.setLyftSubjectRegex(lyftSubjectRegex);
    await window.electronAPI.setCurbSubjectRegex(curbSubjectRegex);
    await window.electronAPI.setAmtrakSubjectRegex(amtrakSubjectRegex);
    await window.electronAPI.setSyncOnStartup(syncOnStartup);
    await window.electronAPI.setAddressDisplayMode(addressDisplayMode); // NEW
  }, [
    parserPreference,
    geminiKey,
    geminiModel,
    testModeLimit,
    uberSubjectRegex,
    lyftSubjectRegex,
    curbSubjectRegex,
    amtrakSubjectRegex,
    syncOnStartup,
    addressDisplayMode, // NEW
  ]);

  return {
    settings: {
      parserPreference,
      geminiKey,
      geminiModel,
      showGeminiKey,
      testModeLimit,
      syncOnStartup,
      uberSubjectRegex,
      lyftSubjectRegex,
      curbSubjectRegex,
      amtrakSubjectRegex,
      addressDisplayMode, // NEW
    },
    setters: {
      setParserPreference,
      setGeminiKey,
      setGeminiModel,
      setShowGeminiKey,
      setTestModeLimit,
      setSyncOnStartup,
      setUberSubjectRegex,
      setLyftSubjectRegex,
      setCurbSubjectRegex,
      setAmtrakSubjectRegex,
      setAddressDisplayMode, // NEW
    },
    loadSettings,
    saveSettings,
  };
}
