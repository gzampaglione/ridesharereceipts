// src/App.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  CircularProgress,
  Backdrop,
  Modal,
  Snackbar,
  Alert,
  useMediaQuery,
  IconButton,
  Stack,
  Paper,
} from "@mui/material";
import { lightTheme, darkTheme } from "./theme";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import SyncIcon from "@mui/icons-material/Sync";
import VpnKeyIcon from '@mui/icons-material/VpnKey';

import ReceiptsDataGrid from "./components/ReceiptsDataGrid";
import FiltersSidebar from "./components/FiltersSidebar";
import SyncProgressPane from "./components/SyncProgressPane";

const modalStyle = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 600,
  bgcolor: 'background.paper',
  border: '2px solid #000',
  boxShadow: 24,
  p: 4,
};


function App() {
  const [receipts, setReceipts] = useState([]);
  const [filteredReceipts, setFilteredReceipts] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState([]);
  const [selectedReceipts, setSelectedReceipts] = useState(new Set());
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState("");

  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "info" });

  // Theme and dark mode setup
  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
  const [themeMode, setThemeMode] = useState("light");

  useEffect(() => {
    setThemeMode(prefersDarkMode ? "dark" : "light");
  }, [prefersDarkMode]);

  const theme = useMemo(
    () => (themeMode === "light" ? lightTheme : darkTheme),
    [themeMode]
  );
  
  const toggleTheme = () => {
    setThemeMode((prev) => (prev === "light" ? "dark" : "light"));
  };

  // Filters state
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    location: "",
    vendors: { Uber: true, Lyft: true, Curb: true },
    category: "all",
    billedStatus: "all",
  });

  const uniqueLocations = useMemo(() => {
    const locations = new Set();
    receipts.forEach((r) => {
      if (r.startLocation?.city)
        locations.add(`${r.startLocation.city}, ${r.startLocation.state || ""}`);
      if (r.endLocation?.city)
        locations.add(`${r.endLocation.city}, ${r.endLocation.state || ""}`);
    });
    return Array.from(locations).sort();
  }, [receipts]);

  const showSnackbar = (message, severity = "info") => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') return;
    setSnackbar({ ...snackbar, open: false });
  };

  const loadData = useCallback(async () => {
    const initialReceipts = await window.electronAPI.getReceipts();
    const initialCategories = await window.electronAPI.getCategories();
    setReceipts(initialReceipts);
    setCategories(initialCategories);
  }, []);

  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      try {
        const initialUser = await window.electronAPI.getUser();
        if (!initialUser || !initialUser.email || initialUser.email.includes("Not Logged In") || initialUser.email.includes("Error")) {
          await window.electronAPI.authenticate();
          const authenticatedUser = await window.electronAPI.getUser();
          setUser(authenticatedUser);
        } else {
          setUser(initialUser);
        }
        await loadData();
      } catch (error) {
        console.error("Initialization failed:", error);
        showSnackbar("Could not authenticate with Google: " + error.message, "error");
      } finally {
        setLoading(false);
      }
    };
    initialize();
  }, [loadData]);

  // IPC listeners for sync progress
  useEffect(() => {
    const handleProgress = (data) => {
        setSyncLogs(prevLogs => {
            const existingLogIndex = prevLogs.findIndex(log => log.id === data.query);
            if (existingLogIndex !== -1) {
                const newLogs = [...prevLogs];
                newLogs[existingLogIndex] = { ...newLogs[existingLogIndex], status: `Processing ${data.current}/${data.total}` };
                return newLogs;
            } else {
                return [...prevLogs, { id: data.query, subject: `Query: ${data.query}`, status: `Processing ${data.current}/${data.total}` }];
            }
        });
    };

    const handleComplete = () => {
        setSyncing(false);
        setSyncLogs([]);
        loadData();
        showSnackbar("Sync complete!", "success");
    };

    window.electronAPI.onSyncProgress(handleProgress);
    window.electronAPI.onSyncComplete(handleComplete);

    return () => {
        window.electronAPI.removeSyncListeners();
    };
  }, [loadData]);


  useEffect(() => {
    let filtered = [...receipts];
    if (filters.startDate) {
      filtered = filtered.filter(r => new Date(r.date) >= new Date(filters.startDate));
    }
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999); // Include the entire end day
      filtered = filtered.filter(r => new Date(r.date) <= endDate);
    }
    if (filters.location) {
      const loc = filters.location.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          `${r.startLocation?.city}, ${r.startLocation?.state || ""}`.toLowerCase() === loc ||
          `${r.endLocation?.city}, ${r.endLocation?.state || ""}`.toLowerCase() === loc
      );
    }
    const activeVendors = Object.keys(filters.vendors).filter((v) => filters.vendors[v]);
    if (activeVendors.length < 3) {
      filtered = filtered.filter((r) => activeVendors.includes(r.vendor));
    }
    if (filters.category !== "all") {
      filtered = filtered.filter((r) => r.category === (filters.category || null));
    }
    if (filters.billedStatus !== "all") {
      filtered = filtered.filter((r) => r.billed === (filters.billedStatus === "billed"));
    }
    setFilteredReceipts(filtered.sort((a, b) => new Date(b.date) - new Date(a.date)));
  }, [receipts, filters]);

  const handleReauth = async () => {
    setLoading(true);
    try {
      await window.electronAPI.clearAuth();
      await window.electronAPI.authenticate();
      const newUser = await window.electronAPI.getUser();
      setUser(newUser);
      showSnackbar("Re-authentication successful! Logged in as: " + newUser.email, "success");
    } catch (error) {
      showSnackbar("Re-authentication failed: " + error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncLogs([]);
    try {
      const result = await window.electronAPI.syncReceipts();
      showSnackbar(`${result.newReceipts} new receipts found.`, "success");
    } catch (error) {
      console.error("Sync failed:", error);
      showSnackbar("Sync failed: " + error.message, "error");
      setSyncing(false);
    }
  };

  const handleBulkUpdate = async (update) => {
    if (selectedReceipts.size === 0) {
      showSnackbar("Please select one or more receipts first.", "warning");
      return;
    }
    await window.electronAPI.bulkUpdateReceipts(Array.from(selectedReceipts), update);
    await loadData();
    setSelectedReceipts(new Set());
    showSnackbar(`${selectedReceipts.size} receipts updated.`, "success");
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return;
    const updated = await window.electronAPI.addCategory(newCategory.trim());
    setCategories(updated);
    setNewCategory("");
    showSnackbar(`Category "${newCategory.trim()}" added.`, "success");
  };

  const exportToCSV = () => {
    const receiptsToExport = selectedReceipts.size > 0
      ? filteredReceipts.filter(r => selectedReceipts.has(r.id))
      : filteredReceipts;

    if (receiptsToExport.length === 0) {
        showSnackbar("No receipts to export.", "warning");
        return;
    }

    const headers = ['Date', 'Vendor', 'Total', 'Tip', 'Start Location', 'End Location', 'Category', 'Billed'];
    const rows = receiptsToExport.map(r => [
        new Date(r.date).toLocaleDateString(),
        `"${r.vendor}"`,
        r.total.toFixed(2),
        r.tip.toFixed(2),
        `"${r.startLocation?.address || 'N/A'}"`,
        `"${r.endLocation?.address || 'N/A'}"`,
        `"${r.category || 'Uncategorized'}"`,
        r.billed ? 'Yes' : 'No'
    ]);

    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipts_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showSnackbar(`${receiptsToExport.length} receipts exported.`, "success");
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Backdrop sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 1 }} open={loading}>
        <CircularProgress color="inherit" />
      </Backdrop>

      <Modal open={syncing}>
        <Box sx={modalStyle}>
          <SyncProgressPane logs={syncLogs} />
        </Box>
      </Modal>

      <Box sx={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>
        <AppBar position="static" sx={{ flexShrink: 0 }}>
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              Rideshare Receipts
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2">
                {user?.email || "Not logged in"}
              </Typography>
              <Button color="inherit" startIcon={<VpnKeyIcon />} onClick={handleReauth}>
                Re-authenticate
              </Button>
              <Button color="inherit" startIcon={<SyncIcon />} onClick={handleSync} disabled={syncing}>
                {syncing ? "Syncing..." : "Sync Receipts"}
              </Button>
              <IconButton onClick={toggleTheme} color="inherit">
                {themeMode === "dark" ? <Brightness7Icon /> : <Brightness4Icon />}
              </IconButton>
            </Stack>
          </Toolbar>
        </AppBar>
        
        <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
            <Paper elevation={2} sx={{ width: '350px', flexShrink: 0, overflowY: 'auto' }}>
                <FiltersSidebar
                    filters={filters}
                    setFilters={setFilters}
                    categories={categories}
                    uniqueLocations={uniqueLocations}
                    selectedCount={selectedReceipts.size}
                    onBulkCategory={(cat) => handleBulkUpdate({ category: cat })}
                    onBulkBilled={(billed) => handleBulkUpdate({ billed })}
                    onExportCSV={exportToCSV}
                    newCategory={newCategory}
                    setNewCategory={setNewCategory}
                    onAddCategory={handleAddCategory}
                />
            </Paper>

            <Box component="main" sx={{ flexGrow: 1, p: 2, overflow: 'auto' }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                    Showing {filteredReceipts.length} of {receipts.length} receipts.
                </Typography>
                <ReceiptsDataGrid
                    receipts={filteredReceipts}
                    selectedReceipts={selectedReceipts}
                    onSelectionChange={setSelectedReceipts}
                />
            </Box>
        </Box>
      </Box>

      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </ThemeProvider>
  );
}

export default App;