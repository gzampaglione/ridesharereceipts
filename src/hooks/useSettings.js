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

  const loadSettings = useCallback(async () => {
    const preference = await window.electronAPI.getParserPreference();
    const key = await window.electronAPI.getGeminiKey();
    const model = await window.electronAPI.getGeminiModel();
    const limit = await window.electronAPI.getTestModeLimit();
    const uberRegex = await window.electronAPI.getUberSubjectRegex();
    const lyftRegex = await window.electronAPI.getLyftSubjectRegex();
    const curbRegex = await window.electronAPI.getCurbSubjectRegex();
    const syncStartup = await window.electronAPI.getSyncOnStartup();

    setParserPreference(preference);
    setGeminiKey(key);
    setGeminiModel(model || "gemini-2.5-flash");
    setTestModeLimit(limit);
    setUberSubjectRegex(uberRegex);
    setLyftSubjectRegex(lyftRegex);
    setCurbSubjectRegex(curbRegex);
    setSyncOnStartup(syncStartup);
  }, []);

  const saveSettings = useCallback(async () => {
    await window.electronAPI.setParserPreference(parserPreference);
    await window.electronAPI.setGeminiKey(geminiKey);
    await window.electronAPI.setGeminiModel(geminiModel);
    await window.electronAPI.setTestModeLimit(testModeLimit);
    await window.electronAPI.setUberSubjectRegex(uberSubjectRegex);
    await window.electronAPI.setLyftSubjectRegex(lyftSubjectRegex);
    await window.electronAPI.setCurbSubjectRegex(curbSubjectRegex);
    await window.electronAPI.setSyncOnStartup(syncOnStartup);
  }, [
    parserPreference,
    geminiKey,
    geminiModel,
    testModeLimit,
    uberSubjectRegex,
    lyftSubjectRegex,
    curbSubjectRegex,
    syncOnStartup,
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
    },
    loadSettings,
    saveSettings,
  };
}
