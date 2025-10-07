import { useState, useCallback } from "react";

export function useReceipts() {
  const [receipts, setReceipts] = useState([]);
  const [selectedReceipts, setSelectedReceipts] = useState(new Set());

  const loadReceipts = useCallback(async () => {
    const data = await window.electronAPI.getReceipts();
    setReceipts(data);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedReceipts(new Set());
  }, []);

  const bulkUpdate = useCallback(
    async (update) => {
      if (selectedReceipts.size === 0) {
        throw new Error("No receipts selected");
      }
      await window.electronAPI.bulkUpdateReceipts(
        Array.from(selectedReceipts),
        update
      );
      await loadReceipts();
      clearSelection();
    },
    [selectedReceipts, loadReceipts, clearSelection]
  );

  return {
    receipts,
    selectedReceipts,
    setSelectedReceipts,
    loadReceipts,
    clearSelection,
    bulkUpdate,
  };
}
