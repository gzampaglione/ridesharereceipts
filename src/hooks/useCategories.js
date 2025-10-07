import { useState, useCallback } from "react";

export function useCategories() {
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState("");

  const loadCategories = useCallback(async () => {
    const data = await window.electronAPI.getCategories();
    setCategories(data);
  }, []);

  const addCategory = useCallback(async () => {
    if (!newCategory.trim()) return false;
    const updated = await window.electronAPI.addCategory(newCategory.trim());
    setCategories(updated);
    setNewCategory("");
    return true;
  }, [newCategory]);

  return {
    categories,
    newCategory,
    setNewCategory,
    loadCategories,
    addCategory,
  };
}
