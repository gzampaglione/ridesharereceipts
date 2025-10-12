import React, { useState, useEffect, useMemo } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  CircularProgress,
  Backdrop,
  Modal,
  Snackbar,
  Alert,
  useMediaQuery,
  IconButton,
  Paper,
  Drawer,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import { lightTheme, darkTheme } from "./theme";
import { useReceipts } from "./hooks/useReceipts";
import { useSettings } from "./hooks/useSettings";
import { useFilters } from "./hooks/useFilters";
import { useCategories } from "./hooks/useCategories";
import { forwardReceipts, exportReceiptsToCSV } from "./utils/emailHelpers";
import { calculateTotals } from "./utils/receiptCalculations";

import AppHeader from "./components/AppHeader";
import SummaryCards from "./components/SummaryCards";
import ReceiptsDataGrid from "./components/ReceiptsDataGrid";
import FiltersSidebar from "./components/FiltersSidebar";
import SyncProgressPane from "./components/SyncProgressPane";
import SettingsDialog from "./components/SettingsDialog";
import ForwardEmailDialog from "./components/ForwardEmailDialog";

const DRAWER_WIDTH = 350;

const modalStyle = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: 700,
  maxWidth: "90vw",
  bgcolor: "background.paper",
  boxShadow: 24,
  borderRadius: 2,
  p: 0,
  maxHeight: "80vh",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

function App() {
  // State management hooks
  const receiptsState = useReceipts();
  const settingsState = useSettings();
  const categoriesState = useCategories();
  const filtersState = useFilters(receiptsState.receipts);

  // UI state
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({
    phase: "idle",
    message: "",
  });
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState(0);
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [forwardEmail, setForwardEmail] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [receiptsToDelete, setReceiptsToDelete] = useState([]);

  // Theme
  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
  const [themeMode, setThemeMode] = useState("light");

  useEffect(() => {
    setThemeMode(prefersDarkMode ? "dark" : "light");
  }, [prefersDarkMode]);

  const theme = useMemo(
    () => (themeMode === "light" ? lightTheme : darkTheme),
    [themeMode]
  );

  // Calculations
  const { totalAmount, totalTips } = useMemo(
    () => calculateTotals(filtersState.filteredReceipts),
    [filtersState.filteredReceipts]
  );

  // Calculate totals for selected receipts
  const { totalAmount: selectedAmount, totalTips: selectedTips } =
    useMemo(() => {
      const selectedReceiptsList = filtersState.filteredReceipts.filter((r) =>
        receiptsState.selectedReceipts.has(r.id || r.messageId)
      );
      return calculateTotals(selectedReceiptsList);
    }, [filtersState.filteredReceipts, receiptsState.selectedReceipts]);

  // Snackbar helper
  const showSnackbar = (message, severity = "info") => {
    setSnackbar({ open: true, message, severity });
  };

  // Initialize app
  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      try {
        const initialUser = await window.electronAPI.getUser();
        if (
          !initialUser ||
          !initialUser.email ||
          initialUser.email.includes("Not Logged In") ||
          initialUser.email.includes("Error")
        ) {
          await window.electronAPI.authenticate();
          const authenticatedUser = await window.electronAPI.getUser();
          setUser(authenticatedUser);
        } else {
          setUser(initialUser);
        }

        await receiptsState.loadReceipts();
        await categoriesState.loadCategories();
        await settingsState.loadSettings();

        const syncStartup = await window.electronAPI.getSyncOnStartup();
        if (syncStartup) {
          console.log("🔄 Sync on startup enabled - starting sync...");
          handleSync();
        }
      } catch (error) {
        console.error("Initialization failed:", error);
        showSnackbar(
          "Could not authenticate with Google: " + error.message,
          "error"
        );
      } finally {
        setLoading(false);
      }
    };
    initialize();
  }, []);

  // Sync progress listeners
  useEffect(() => {
    const handleProgress = (data) => setSyncProgress(data);
    const handleComplete = (data) => {
      setSyncing(false);
      setSyncProgress({ phase: "complete", message: "Sync complete!" });
      receiptsState.loadReceipts();
      if (data.cancelled) {
        showSnackbar(
          `Sync cancelled. ${data.newReceipts} new receipts saved.`,
          "warning"
        );
      } else {
        showSnackbar(
          `Sync complete! ${data.newReceipts} new receipts added.`,
          "success"
        );
      }
    };
    const handleCancelled = () => {
      setSyncing(false);
      setSyncProgress({ phase: "cancelled", message: "Sync cancelled" });
      receiptsState.loadReceipts();
      showSnackbar("Sync cancelled by user", "info");
    };

    window.electronAPI.onSyncProgress(handleProgress);
    window.electronAPI.onSyncComplete(handleComplete);
    window.electronAPI.onSyncCancelled(handleCancelled);

    return () => window.electronAPI.removeSyncListeners();
  }, [receiptsState.loadReceipts]);

  // Handlers
  const handleReauth = async () => {
    setLoading(true);
    try {
      await window.electronAPI.clearAuth();
      await window.electronAPI.authenticate();
      const newUser = await window.electronAPI.getUser();
      setUser(newUser);
      showSnackbar(
        "Re-authentication successful! Logged in as: " + newUser.email,
        "success"
      );
    } catch (error) {
      showSnackbar("Re-authentication failed: " + error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncProgress({ phase: "starting", message: "Starting sync..." });
    try {
      await window.electronAPI.syncReceipts();
    } catch (error) {
      console.error("Sync failed:", error);
      showSnackbar("Sync failed: " + error.message, "error");
      setSyncing(false);
      setSyncProgress({ phase: "idle", message: "" });
    }
  };

  const handleCancelSync = async () => {
    await window.electronAPI.cancelSync();
    showSnackbar("Cancelling sync...", "info");
  };

  const handleBulkUpdate = async (update) => {
    try {
      await receiptsState.bulkUpdate(update);
      showSnackbar(
        `${receiptsState.selectedReceipts.size} receipts updated.`,
        "success"
      );
    } catch (error) {
      showSnackbar(error.message, "warning");
    }
  };

  const handleAddCategory = async () => {
    const success = await categoriesState.addCategory();
    if (success) {
      showSnackbar(
        `Category "${categoriesState.newCategory}" added.`,
        "success"
      );
    }
  };

  const handleOpenSettings = async () => {
    await settingsState.loadSettings();
    setSettingsOpen(true);
  };

  const handleSaveSettings = async () => {
    await settingsState.saveSettings();
    setSettingsOpen(false);
    showSnackbar("Settings saved successfully!", "success");
  };

  const handleClearReceipts = async () => {
    if (
      window.confirm(
        "Are you sure you want to clear all downloaded receipts? This cannot be undone."
      )
    ) {
      await window.electronAPI.clearReceipts();
      await receiptsState.loadReceipts();
      receiptsState.clearSelection();
      showSnackbar("All receipts cleared!", "success");
    }
  };

  const handleBackupDatabase = async () => {
    const result = await window.electronAPI.backupDatabase();
    if (result.success) {
      showSnackbar(
        `Database backed up successfully to: ${result.path}`,
        "success"
      );
    } else {
      showSnackbar(`Backup failed: ${result.error}`, "error");
    }
  };

  const handleForwardToEmail = () => {
    if (receiptsState.selectedReceipts.size === 0) {
      showSnackbar("Please select one or more receipts first.", "warning");
      return;
    }
    setForwardDialogOpen(true);
  };

  const handleSendForwardEmail = async () => {
    if (!forwardEmail.trim()) {
      showSnackbar("Please enter an email address.", "warning");
      return;
    }

    setSendingEmail(true);
    const receiptsToForward = filtersState.filteredReceipts.filter((r) =>
      receiptsState.selectedReceipts.has(r.id || r.messageId)
    );

    try {
      const result = await forwardReceipts(receiptsToForward, forwardEmail);

      if (result.success) {
        showSnackbar(`Email sent successfully to ${forwardEmail}!`, "success");
        setForwardDialogOpen(false);
        setForwardEmail("");
      } else {
        showSnackbar(`Failed to send email: ${result.error}`, "error");
      }
    } catch (error) {
      showSnackbar(`Error sending email: ${error.message}`, "error");
    } finally {
      setSendingEmail(false);
    }
  };

  const handleExportCSV = () => {
    const receiptsToExport =
      receiptsState.selectedReceipts.size > 0
        ? filtersState.filteredReceipts.filter((r) =>
            receiptsState.selectedReceipts.has(r.id || r.messageId)
          )
        : filtersState.filteredReceipts;

    if (receiptsToExport.length === 0) {
      showSnackbar("No receipts to export.", "warning");
      return;
    }

    exportReceiptsToCSV(receiptsToExport);
    showSnackbar(`${receiptsToExport.length} receipts exported.`, "success");
  };

  const handleDeleteSelected = () => {
    if (receiptsState.selectedReceipts.size === 0) {
      showSnackbar("Please select one or more receipts to delete.", "warning");
      return;
    }

    const receiptsToRemove = filtersState.filteredReceipts.filter((r) =>
      receiptsState.selectedReceipts.has(r.id || r.messageId)
    );

    setReceiptsToDelete(receiptsToRemove);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    try {
      const messageIdsToDelete = receiptsToDelete.map((r) => r.messageId);
      const result = await window.electronAPI.deleteReceipts(
        messageIdsToDelete
      );

      if (result.success) {
        await receiptsState.loadReceipts();
        receiptsState.clearSelection();
        showSnackbar(
          `${receiptsToDelete.length} receipt${
            receiptsToDelete.length !== 1 ? "s" : ""
          } deleted successfully.`,
          "success"
        );
      } else {
        showSnackbar(`Failed to delete receipts: ${result.error}`, "error");
      }
    } catch (error) {
      showSnackbar(`Error deleting receipts: ${error.message}`, "error");
    } finally {
      setDeleteDialogOpen(false);
      setReceiptsToDelete([]);
    }
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setReceiptsToDelete([]);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <Backdrop
        sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 1 }}
        open={loading}
      >
        <CircularProgress color="inherit" />
      </Backdrop>

      {/* Sync Progress Modal */}
      <Modal open={syncing}>
        <Box sx={modalStyle}>
          <Box sx={{ p: 3, borderBottom: 1, borderColor: "divider" }}>
            <Typography variant="h5" fontWeight="bold">
              Syncing Receipts
            </Typography>
          </Box>
          <Box sx={{ p: 3, flexGrow: 1, overflow: "auto" }}>
            <SyncProgressPane
              progress={syncProgress}
              onCancel={handleCancelSync}
            />
          </Box>
        </Box>
      </Modal>

      {/* Settings Dialog */}
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settingsTab={settingsTab}
        setSettingsTab={setSettingsTab}
        parserPreference={settingsState.settings.parserPreference}
        setParserPreference={settingsState.setters.setParserPreference}
        geminiKey={settingsState.settings.geminiKey}
        setGeminiKey={settingsState.setters.setGeminiKey}
        geminiModel={settingsState.settings.geminiModel}
        setGeminiModel={settingsState.setters.setGeminiModel}
        showGeminiKey={settingsState.settings.showGeminiKey}
        setShowGeminiKey={settingsState.setters.setShowGeminiKey}
        testModeLimit={settingsState.settings.testModeLimit}
        setTestModeLimit={settingsState.setters.setTestModeLimit}
        uberSubjectRegex={settingsState.settings.uberSubjectRegex}
        setUberSubjectRegex={settingsState.setters.setUberSubjectRegex}
        lyftSubjectRegex={settingsState.settings.lyftSubjectRegex}
        setLyftSubjectRegex={settingsState.setters.setLyftSubjectRegex}
        curbSubjectRegex={settingsState.settings.curbSubjectRegex}
        setCurbSubjectRegex={settingsState.setters.setCurbSubjectRegex}
        amtrakSubjectRegex={settingsState.settings.amtrakSubjectRegex}
        setAmtrakSubjectRegex={settingsState.setters.setAmtrakSubjectRegex}
        syncOnStartup={settingsState.settings.syncOnStartup}
        setSyncOnStartup={settingsState.setters.setSyncOnStartup}
        addressDisplayMode={settingsState.settings.addressDisplayMode}
        setAddressDisplayMode={settingsState.setters.setAddressDisplayMode}
        categories={categoriesState.categories}
        newCategory={categoriesState.newCategory}
        setNewCategory={categoriesState.setNewCategory}
        onAddCategory={handleAddCategory}
        onSave={handleSaveSettings}
        onClearReceipts={handleClearReceipts}
        onBackupDatabase={handleBackupDatabase}
      />

      {/* Forward Email Dialog */}
      <ForwardEmailDialog
        open={forwardDialogOpen}
        onClose={() => setForwardDialogOpen(false)}
        email={forwardEmail}
        setEmail={setForwardEmail}
        sending={sendingEmail}
        selectedCount={receiptsState.selectedReceipts.size}
        onSend={handleSendForwardEmail}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleCancelDelete}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Delete {receiptsToDelete.length} Receipt
          {receiptsToDelete.length !== 1 ? "s" : ""}?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete {receiptsToDelete.length} selected
            receipt{receiptsToDelete.length !== 1 ? "s" : ""} from your local
            database? This action cannot be undone.
          </DialogContentText>
          {receiptsToDelete.length > 0 && receiptsToDelete.length <= 5 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                Receipts to delete:
              </Typography>
              {receiptsToDelete.map((receipt, idx) => (
                <Typography key={idx} variant="body2" color="text.secondary">
                  • {receipt.vendor} -{" "}
                  {new Date(receipt.date).toLocaleDateString()} - $
                  {receipt.total.toFixed(2)}
                </Typography>
              ))}
            </Box>
          )}
          <Box sx={{ mt: 2, p: 2, bgcolor: "warning.light", borderRadius: 1 }}>
            <Typography variant="body2" color="warning.contrastText">
              ⚠️ Note: This only deletes from your local database. The original
              emails in Gmail will not be affected.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>Cancel</Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
          >
            Delete {receiptsToDelete.length} Receipt
            {receiptsToDelete.length !== 1 ? "s" : ""}
          </Button>
        </DialogActions>
      </Dialog>

      <Box sx={{ display: "flex", height: "100vh", flexDirection: "column" }}>
        {/* App Header */}
        <AppHeader
          user={user}
          themeMode={themeMode}
          syncing={syncing}
          onToggleDrawer={() => setDrawerOpen(!drawerOpen)}
          onToggleTheme={() =>
            setThemeMode((prev) => (prev === "light" ? "dark" : "light"))
          }
          onOpenSettings={handleOpenSettings}
          onReauth={handleReauth}
          onSync={handleSync}
        />

        <Box sx={{ display: "flex", flexGrow: 1, overflow: "hidden" }}>
          {/* Sidebar Drawer */}
          <Drawer
            variant="persistent"
            anchor="left"
            open={drawerOpen}
            sx={{
              width: drawerOpen ? DRAWER_WIDTH : 0,
              flexShrink: 0,
              "& .MuiDrawer-paper": {
                width: DRAWER_WIDTH,
                boxSizing: "border-box",
                position: "relative",
                height: "100%",
                borderRight: 1,
                borderColor: "divider",
              },
            }}
          >
            <FiltersSidebar
              filters={filtersState.filters}
              setFilters={filtersState.setFilters}
              categories={categoriesState.categories}
              uniqueLocations={filtersState.uniqueLocations}
              selectedCount={receiptsState.selectedReceipts.size}
              onBulkCategory={(cat) => handleBulkUpdate({ category: cat })}
              onBulkBilled={(billed) => handleBulkUpdate({ billed })}
              onForwardToEmail={handleForwardToEmail}
              onExportCSV={handleExportCSV}
              onDeleteSelected={handleDeleteSelected}
            />
          </Drawer>

          {/* Toggle Button when drawer is closed */}
          {!drawerOpen && (
            <Box
              sx={{
                position: "absolute",
                left: 0,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 1200,
              }}
            >
              <IconButton
                onClick={() => setDrawerOpen(true)}
                sx={{
                  bgcolor: "primary.main",
                  color: "white",
                  borderRadius: "0 8px 8px 0",
                  "&:hover": {
                    bgcolor: "primary.dark",
                  },
                }}
              >
                <ChevronRightIcon />
              </IconButton>
            </Box>
          )}

          {/* Main Content */}
          <Box
            component="main"
            sx={{
              flexGrow: 1,
              p: 3,
              overflow: "auto",
              bgcolor: "background.default",
              transition: "margin 225ms cubic-bezier(0, 0, 0.2, 1)",
            }}
          >
            {/* Summary Cards */}
            <SummaryCards
              totalReceipts={receiptsState.receipts.length}
              filteredCount={filtersState.filteredReceipts.length}
              totalAmount={totalAmount}
              totalTips={totalTips}
              selectedCount={receiptsState.selectedReceipts.size}
              selectedAmount={selectedAmount}
              selectedTips={selectedTips}
            />

            {/* Data Grid */}
            <Paper elevation={2} sx={{ height: "calc(100vh - 280px)", p: 2 }}>
              <ReceiptsDataGrid
                receipts={filtersState.filteredReceipts}
                selectedReceipts={receiptsState.selectedReceipts}
                onSelectionChange={receiptsState.setSelectedReceipts}
                addressDisplayMode={settingsState.settings.addressDisplayMode}
              />
            </Paper>
          </Box>
        </Box>
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={(event, reason) => {
          if (reason === "clickaway") return;
          setSnackbar({ ...snackbar, open: false });
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: "100%" }}
          elevation={6}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </ThemeProvider>
  );
}

export default App;
