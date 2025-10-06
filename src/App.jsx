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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Divider,
} from "@mui/material";
import { lightTheme, darkTheme } from "./theme";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import SyncIcon from "@mui/icons-material/Sync";
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import SettingsIcon from '@mui/icons-material/Settings';
import EmailIcon from '@mui/icons-material/Email';

import ReceiptsDataGrid from "./components/ReceiptsDataGrid";
import FiltersSidebar from "./components/FiltersSidebar";
import SyncProgressPane from "./components/SyncProgressPane";

const modalStyle = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 700,
  maxWidth: '90vw',
  bgcolor: 'background.paper',
  boxShadow: 24,
  borderRadius: 2,
  p: 0,
  maxHeight: '80vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

function App() {
  const [receipts, setReceipts] = useState([]);
  const [filteredReceipts, setFilteredReceipts] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ phase: 'idle', message: '' });
  const [selectedReceipts, setSelectedReceipts] = useState(new Set());
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState("");

  // Settings dialog
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [parserPreference, setParserPreference] = useState("regex-first");
  const [geminiKey, setGeminiKey] = useState("");
  const [testModeLimit, setTestModeLimit] = useState(0);

  // Forward email dialog
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [forwardEmail, setForwardEmail] = useState("");

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

  const loadSettings = useCallback(async () => {
    const preference = await window.electronAPI.getParserPreference();
    const key = await window.electronAPI.getGeminiKey();
    const limit = await window.electronAPI.getTestModeLimit();
    setParserPreference(preference);
    setGeminiKey(key);
    setTestModeLimit(limit);
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
        await loadSettings();
      } catch (error) {
        console.error("Initialization failed:", error);
        showSnackbar("Could not authenticate with Google: " + error.message, "error");
      } finally {
        setLoading(false);
      }
    };
    initialize();
  }, [loadData, loadSettings]);

  // IPC listeners for sync progress
  useEffect(() => {
    const handleProgress = (data) => {
      setSyncProgress(data);
    };

    const handleComplete = (data) => {
      setSyncing(false);
      setSyncProgress({ phase: 'complete', message: 'Sync complete!' });
      loadData();
      showSnackbar(`Sync complete! ${data.newReceipts} new receipts added.`, "success");
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
      endDate.setHours(23, 59, 59, 999);
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
    setSyncProgress({ phase: 'starting', message: 'Starting sync...' });
    try {
      await window.electronAPI.syncReceipts();
    } catch (error) {
      console.error("Sync failed:", error);
      showSnackbar("Sync failed: " + error.message, "error");
      setSyncing(false);
      setSyncProgress({ phase: 'idle', message: '' });
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

  const handleOpenSettings = async () => {
    await loadSettings();
    setSettingsOpen(true);
  };

  const handleSaveSettings = async () => {
    await window.electronAPI.setParserPreference(parserPreference);
    await window.electronAPI.setGeminiKey(geminiKey);
    await window.electronAPI.setTestModeLimit(testModeLimit);
    setSettingsOpen(false);
    showSnackbar("Settings saved successfully!", "success");
  };

  const handleForwardToEmail = () => {
    if (selectedReceipts.size === 0) {
      showSnackbar("Please select one or more receipts first.", "warning");
      return;
    }
    setForwardDialogOpen(true);
  };

  const handleSendForwardEmail = () => {
    if (!forwardEmail.trim()) {
      showSnackbar("Please enter an email address.", "warning");
      return;
    }

    const receiptsToForward = filteredReceipts.filter(r => selectedReceipts.has(r.id || r.messageId));
    
    // Create email body
    const emailBody = receiptsToForward.map(r => {
      return `Date: ${new Date(r.date).toLocaleDateString()}
Vendor: ${r.vendor}
Total: $${r.total.toFixed(2)}
Tip: $${r.tip.toFixed(2)}
From: ${r.startLocation?.address || 'N/A'}
To: ${r.endLocation?.address || 'N/A'}
Category: ${r.category || 'Uncategorized'}
Billed: ${r.billed ? 'Yes' : 'No'}
---`;
    }).join('\n\n');

    const subject = `Rideshare Receipts - ${receiptsToForward.length} receipts`;
    const mailtoLink = `mailto:${forwardEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
    
    window.open(mailtoLink);
    setForwardDialogOpen(false);
    setForwardEmail("");
    showSnackbar(`Opening email client to forward ${receiptsToForward.length} receipts...`, "info");
  };

  const exportToCSV = () => {
    const receiptsToExport = selectedReceipts.size > 0
      ? filteredReceipts.filter(r => selectedReceipts.has(r.id || r.messageId))
      : filteredReceipts;

    if (receiptsToExport.length === 0) {
      showSnackbar("No receipts to export.", "warning");
      return;
    }

    const headers = ['Date', 'Vendor', 'Total', 'Tip', 'Start Location', 'End Location', 'Category', 'Billed', 'Parsed By'];
    const rows = receiptsToExport.map(r => [
      new Date(r.date).toLocaleDateString(),
      `"${r.vendor}"`,
      r.total.toFixed(2),
      r.tip.toFixed(2),
      `"${r.startLocation?.address || 'N/A'}"`,
      `"${r.endLocation?.address || 'N/A'}"`,
      `"${r.category || 'Uncategorized'}"`,
      r.billed ? 'Yes' : 'No',
      `"${r.parsedBy || 'unknown'}"`
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

  const totalAmount = useMemo(() => {
    return filteredReceipts.reduce((sum, r) => sum + r.total, 0);
  }, [filteredReceipts]);

  const totalTips = useMemo(() => {
    return filteredReceipts.reduce((sum, r) => sum + r.tip, 0);
  }, [filteredReceipts]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Backdrop sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 1 }} open={loading}>
        <CircularProgress color="inherit" />
      </Backdrop>

      {/* Sync Progress Modal */}
      <Modal open={syncing}>
        <Box sx={modalStyle}>
          <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="h5" fontWeight="bold">
              Syncing Receipts
            </Typography>
          </Box>
          <Box sx={{ p: 3, flexGrow: 1, overflow: 'auto' }}>
            <SyncProgressPane progress={syncProgress} />
          </Box>
        </Box>
      </Modal>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <SettingsIcon />
            <Typography variant="h6">Settings</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3}>
            <FormControl fullWidth>
              <InputLabel>Parser Preference</InputLabel>
              <Select
                value={parserPreference}
                label="Parser Preference"
                onChange={(e) => setParserPreference(e.target.value)}
              >
                <MenuItem value="regex-first">Regex First (Gemini Fallback)</MenuItem>
                <MenuItem value="regex-only">Regex Only</MenuItem>
                <MenuItem value="gemini-only">Gemini AI Only</MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="Gemini API Key"
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              helperText="Get your API key from https://makersuite.google.com/app/apikey"
            />

            <Divider />

            <TextField
              fullWidth
              label="Test Mode Limit (0 = disabled)"
              type="number"
              value={testModeLimit}
              onChange={(e) => setTestModeLimit(parseInt(e.target.value) || 0)}
              helperText="Limit emails per label for faster testing. Set to 0 to process all emails."
              InputProps={{
                inputProps: { min: 0, max: 500 }
              }}
            />

            <Paper sx={{ p: 2, bgcolor: 'action.hover' }}>
              <Typography variant="body2" color="text.secondary">
                <strong>Parser Modes:</strong>
                <br />• <strong>Regex First:</strong> Fast pattern matching with AI fallback for complex receipts
                <br />• <strong>Regex Only:</strong> Traditional pattern matching only (fastest, no API needed)
                <br />• <strong>Gemini AI Only:</strong> AI-powered parsing (requires API key, slower but more flexible)
              </Typography>
            </Paper>

            {testModeLimit > 0 && (
              <Paper sx={{ p: 2, bgcolor: 'warning.light', color: 'warning.contrastText' }}>
                <Typography variant="body2" fontWeight="bold">
                  ⚠️ Test Mode Active
                </Typography>
                <Typography variant="body2">
                  Only {testModeLimit} emails per label will be processed. Disable for production use!
                </Typography>
              </Paper>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveSettings} variant="contained">Save Settings</Button>
        </DialogActions>
      </Dialog>

      {/* Forward Email Dialog */}
      <Dialog open={forwardDialogOpen} onClose={() => setForwardDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <EmailIcon />
            <Typography variant="h6">Forward Receipts to Email</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Email Address"
            type="email"
            fullWidth
            value={forwardEmail}
            onChange={(e) => setForwardEmail(e.target.value)}
            helperText={`Forward ${selectedReceipts.size} selected receipts`}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForwardDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSendForwardEmail} variant="contained" startIcon={<EmailIcon />}>
            Forward
          </Button>
        </DialogActions>
      </Dialog>

      <Box sx={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>
        {/* App Bar */}
        <AppBar position="static" elevation={2} sx={{ flexShrink: 0 }}>
          <Toolbar>
            <Typography variant="h5" component="div" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
              🚗 Rideshare Receipts
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip 
                label={user?.email || "Not logged in"} 
                variant="outlined" 
                sx={{ 
                  color: 'white', 
                  borderColor: 'rgba(255,255,255,0.5)',
                  fontWeight: 500 
                }}
              />
              <IconButton onClick={handleOpenSettings} color="inherit" title="Settings">
                <SettingsIcon />
              </IconButton>
              <Button color="inherit" startIcon={<VpnKeyIcon />} onClick={handleReauth}>
                Re-auth
              </Button>
              <Button 
                color="inherit" 
                startIcon={<SyncIcon />} 
                onClick={handleSync} 
                disabled={syncing}
                variant="outlined"
                sx={{ borderColor: 'rgba(255,255,255,0.5)' }}
              >
                {syncing ? "Syncing..." : "Sync"}
              </Button>
              <IconButton onClick={toggleTheme} color="inherit" title="Toggle theme">
                {themeMode === "dark" ? <Brightness7Icon /> : <Brightness4Icon />}
              </IconButton>
            </Stack>
          </Toolbar>
        </AppBar>
        
        <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
          {/* Filters Sidebar */}
          <Paper elevation={3} sx={{ width: '350px', flexShrink: 0, overflowY: 'auto', borderRadius: 0 }}>
            <FiltersSidebar
              filters={filters}
              setFilters={setFilters}
              categories={categories}
              uniqueLocations={uniqueLocations}
              selectedCount={selectedReceipts.size}
              onBulkCategory={(cat) => handleBulkUpdate({ category: cat })}
              onBulkBilled={(billed) => handleBulkUpdate({ billed })}
              onForwardToEmail={handleForwardToEmail}
              onExportCSV={exportToCSV}
              newCategory={newCategory}
              setNewCategory={setNewCategory}
              onAddCategory={handleAddCategory}
            />
          </Paper>

          {/* Main Content */}
          <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: 'background.default' }}>
            {/* Summary Cards */}
            <Stack direction="row" spacing={2} mb={3}>
              <Paper sx={{ p: 2, flexGrow: 1, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Total Receipts</Typography>
                <Typography variant="h4" fontWeight="bold">
                  {filteredReceipts.length}
                </Typography>
                <Typography variant="caption">
                  of {receipts.length} total
                </Typography>
              </Paper>
              
              <Paper sx={{ p: 2, flexGrow: 1, bgcolor: 'success.main', color: 'success.contrastText' }}>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Total Amount</Typography>
                <Typography variant="h4" fontWeight="bold">
                  ${totalAmount.toFixed(2)}
                </Typography>
                <Typography variant="caption">
                  Tips: ${totalTips.toFixed(2)}
                </Typography>
              </Paper>

              <Paper sx={{ p: 2, flexGrow: 1, bgcolor: 'secondary.main', color: 'secondary.contrastText' }}>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Selected</Typography>
                <Typography variant="h4" fontWeight="bold">
                  {selectedReceipts.size}
                </Typography>
                <Typography variant="caption">
                  {selectedReceipts.size > 0 ? 'receipts selected' : 'no selection'}
                </Typography>
              </Paper>
            </Stack>

            {/* Data Grid */}
            <Paper elevation={2} sx={{ height: 'calc(100vh - 280px)', p: 2 }}>
              <ReceiptsDataGrid
                receipts={filteredReceipts}
                selectedReceipts={selectedReceipts}
                onSelectionChange={setSelectedReceipts}
              />
            </Paper>
          </Box>
        </Box>
      </Box>

      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }} elevation={6}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </ThemeProvider>
  );
}

export default App;