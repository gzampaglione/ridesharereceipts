// src/components/SettingsDialog.jsx
import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Box,
  Tabs,
  Tab,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Divider,
  IconButton,
  Chip,
  FormControlLabel,
  Switch,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import SaveIcon from '@mui/icons-material/Save';

export default function SettingsDialog({
  open,
  onClose,
  settingsTab,
  setSettingsTab,
  parserPreference,
  setParserPreference,
  geminiKey,
  setGeminiKey,
  geminiModel,
  setGeminiModel,
  showGeminiKey,
  setShowGeminiKey,
  testModeLimit,
  setTestModeLimit,
  uberSubjectRegex,
  setUberSubjectRegex,
  lyftSubjectRegex,
  setLyftSubjectRegex,
  curbSubjectRegex,
  setCurbSubjectRegex,
  syncOnStartup,
  setSyncOnStartup,
  categories,
  newCategory,
  setNewCategory,
  onAddCategory,
  onSave,
  onClearReceipts,
  onBackupDatabase,
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <SettingsIcon />
          <Typography variant="h6">Settings</Typography>
        </Stack>
      </DialogTitle>
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={settingsTab} onChange={(e, v) => setSettingsTab(v)}>
          <Tab label="Parser" />
          <Tab label="Categories" />
          <Tab label="Advanced" />
          <Tab label="Backup & Danger" />
        </Tabs>
      </Box>

      <DialogContent dividers>
        {/* Tab 1: Parser Settings */}
        {settingsTab === 0 && (
          <Stack spacing={3}>
            <Typography variant="subtitle1" fontWeight="bold" color="primary">
              Parser Configuration
            </Typography>

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
                <MenuItem value="gemini-subject-filter">Gemini AI with Subject Filtering</MenuItem>
              </Select>
            </FormControl>

            <Paper sx={{ p: 2, bgcolor: 'action.hover' }}>
              <Typography variant="body2" color="text.secondary">
                <strong>Parser Modes:</strong>
                <br />• <strong>Regex First:</strong> Fast pattern matching with AI fallback
                <br />• <strong>Regex Only:</strong> Traditional pattern matching (no API needed)
                <br />• <strong>Gemini AI Only:</strong> AI-powered parsing (requires API key)
                <br />• <strong>Gemini with Subject Filtering:</strong> Most efficient AI mode
              </Typography>
            </Paper>

            <Divider />

            <Typography variant="subtitle1" fontWeight="bold" color="primary">
              Gemini AI Configuration
            </Typography>

            <TextField
              fullWidth
              label="Gemini API Key"
              type={showGeminiKey ? "text" : "password"}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              helperText="Get your API key from https://aistudio.google.com/app/apikey"
              InputProps={{
                endAdornment: (
                  <IconButton
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    edge="end"
                  >
                    {showGeminiKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                )
              }}
            />

            <FormControl fullWidth>
              <InputLabel>Gemini Model</InputLabel>
              <Select
                value={geminiModel}
                label="Gemini Model"
                onChange={(e) => setGeminiModel(e.target.value)}
              >
                <MenuItem value="gemini-2.5-flash">Gemini 2.5 Flash (Fastest, Recommended)</MenuItem>
                <MenuItem value="gemini-2.5-pro">Gemini 2.5 Pro (Most Capable, Slower)</MenuItem>
                <MenuItem value="gemini-2.0-flash">Gemini 2.0 Flash</MenuItem>
              </Select>
            </FormControl>

            <Paper sx={{ p: 2, bgcolor: 'info.light', color: 'info.contrastText' }}>
              <Typography variant="body2" fontWeight="bold" gutterBottom>
                💡 Model Selection:
              </Typography>
              <Typography variant="body2">
                Flash models are recommended. They're fast and cost-effective. 
                Only use Pro if experiencing parsing issues.
              </Typography>
            </Paper>

            <Divider />

            <FormControlLabel
              control={
                <Switch
                  checked={syncOnStartup}
                  onChange={(e) => setSyncOnStartup(e.target.checked)}
                  color="primary"
                />
              }
              label="Sync automatically on startup"
            />
            <Typography variant="caption" color="text.secondary">
              When enabled, the app will check for new receipts every time it starts
            </Typography>
          </Stack>
        )}

        {/* Tab 2: Categories */}
        {settingsTab === 1 && (
          <Stack spacing={3}>
            <Typography variant="subtitle1" fontWeight="bold" color="primary">
              Manage Categories
            </Typography>

            <Typography variant="body2" color="text.secondary">
              Create custom categories to organize your rideshare receipts.
            </Typography>

            <Paper sx={{ p: 2, bgcolor: 'action.hover' }}>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                Current Categories
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" gap={1}>
                {categories.map(cat => (
                  <Chip key={cat} label={cat} color="primary" variant="outlined" />
                ))}
              </Stack>
            </Paper>

            <Divider />

            <Typography variant="subtitle2" fontWeight="bold">
              Add New Category
            </Typography>

            <Stack direction="row" spacing={1}>
              <TextField
                fullWidth
                label="Category Name"
                placeholder="e.g., Client Meetings, Airport Trips"
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && onAddCategory()}
              />
              <Button 
                variant="contained" 
                onClick={onAddCategory}
                disabled={!newCategory.trim()}
                sx={{ minWidth: '100px' }}
              >
                Add
              </Button>
            </Stack>

            <Paper sx={{ p: 2, bgcolor: 'info.light', color: 'info.contrastText' }}>
              <Typography variant="body2" fontWeight="bold" gutterBottom>
                💡 Category Tips:
              </Typography>
              <Typography variant="body2">
                • Use categories to separate work, personal, and shared expenses
                <br />• Makes it easier to generate reports and track spending
                <br />• Bulk-assign categories using the filters sidebar
              </Typography>
            </Paper>
          </Stack>
        )}

        {/* Tab 3: Advanced */}
        {settingsTab === 2 && (
          <Stack spacing={3}>
            <Typography variant="subtitle1" fontWeight="bold" color="primary">
              Advanced Settings
            </Typography>

            <Typography variant="subtitle2" fontWeight="bold">
              Test Mode
            </Typography>

            <TextField
              fullWidth
              label="Test Mode Limit (0 = disabled)"
              type="number"
              value={testModeLimit}
              onChange={(e) => setTestModeLimit(parseInt(e.target.value) || 0)}
              helperText="Limit emails per label for testing. Set to 0 for production."
              InputProps={{
                inputProps: { min: 0, max: 500 }
              }}
            />

            {testModeLimit > 0 && (
              <Paper sx={{ p: 2, bgcolor: 'warning.light', color: 'warning.contrastText' }}>
                <Typography variant="body2" fontWeight="bold">
                  ⚠️ Test Mode Active
                </Typography>
                <Typography variant="body2">
                  Only {testModeLimit} emails per label will be processed.
                </Typography>
              </Paper>
            )}

            <Divider />

            <Typography variant="subtitle2" fontWeight="bold">
              Subject Line Filters
            </Typography>

            <Typography variant="body2" color="text.secondary">
              Regex patterns to identify receipt emails. Leave blank for defaults.
            </Typography>

            <TextField
              fullWidth
              label="Uber Subject Pattern"
              value={uberSubjectRegex}
              onChange={(e) => setUberSubjectRegex(e.target.value)}
              placeholder="Your (Monday|Tuesday|...) trip with Uber"
              helperText="Regex pattern to identify Uber receipts"
              multiline
              rows={2}
            />

            <TextField
              fullWidth
              label="Lyft Subject Pattern"
              value={lyftSubjectRegex}
              onChange={(e) => setLyftSubjectRegex(e.target.value)}
              placeholder="Your ride with .+ on (January|February|...)"
              helperText="Regex pattern to identify Lyft receipts"
              multiline
              rows={2}
            />

            <TextField
              fullWidth
              label="Curb Subject Pattern"
              value={curbSubjectRegex}
              onChange={(e) => setCurbSubjectRegex(e.target.value)}
              placeholder="Your Curb Ride Receipt"
              helperText="Regex pattern to identify Curb receipts"
            />

            <Paper sx={{ p: 2, bgcolor: 'info.light', color: 'info.contrastText' }}>
              <Typography variant="body2" fontWeight="bold" gutterBottom>
                💡 Subject Filter Tips:
              </Typography>
              <Typography variant="body2">
                Use regex syntax (e.g., .+ for any text, | for OR). Ensures only 
                receipt emails are processed, not promotions.
              </Typography>
            </Paper>
          </Stack>
        )}

        {/* Tab 4: Backup & Danger Zone */}
        {settingsTab === 3 && (
          <Stack spacing={3}>
            <Typography variant="subtitle1" fontWeight="bold" color="primary">
              Backup & Data Management
            </Typography>

            <Paper sx={{ p: 2, bgcolor: 'action.hover' }}>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                💾 Database Backup
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Save a backup copy of your receipts database. This exports all your 
                receipts to a JSON file you can restore later.
              </Typography>
              <Button
                variant="contained"
                color="primary"
                fullWidth
                startIcon={<SaveIcon />}
                onClick={onBackupDatabase}
              >
                Save Database Backup
              </Button>
            </Paper>

            <Divider />

            <Typography variant="subtitle1" fontWeight="bold" color="error">
              Danger Zone
            </Typography>

            <Paper sx={{ p: 2, bgcolor: 'error.light', color: 'error.contrastText' }}>
              <Typography variant="body2" fontWeight="bold" gutterBottom>
                ⚠️ Warning
              </Typography>
              <Typography variant="body2">
                This action is permanent and cannot be undone. Please proceed with caution.
              </Typography>
            </Paper>

            <Box>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                Clear All Downloaded Receipts
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Delete all locally stored receipts. You'll need to re-sync from Gmail. 
                Your Gmail emails will not be affected.
              </Typography>
              <Button
                variant="outlined"
                color="error"
                fullWidth
                startIcon={<DeleteForeverIcon />}
                onClick={onClearReceipts}
                size="large"
              >
                Clear All Receipts
              </Button>
            </Box>
          </Stack>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onSave} variant="contained" color="primary">
          Save Settings
        </Button>
      </DialogActions>
    </Dialog>
  );
}