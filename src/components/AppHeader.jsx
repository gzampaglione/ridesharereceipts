import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Stack,
  Chip,
} from '@mui/material';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import SyncIcon from '@mui/icons-material/Sync';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import SettingsIcon from '@mui/icons-material/Settings';
import MenuIcon from '@mui/icons-material/Menu';

export default function AppHeader({
  user,
  themeMode,
  syncing,
  onToggleDrawer,
  onToggleTheme,
  onOpenSettings,
  onReauth,
  onSync,
}) {
  return (
    <AppBar position="static" elevation={2} sx={{ flexShrink: 0 }}>
      <Toolbar>
        <IconButton
          color="inherit"
          aria-label="toggle drawer"
          onClick={onToggleDrawer}
          edge="start"
          sx={{ mr: 2 }}
        >
          <MenuIcon />
        </IconButton>
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
          <IconButton onClick={onOpenSettings} color="inherit" title="Settings">
            <SettingsIcon />
          </IconButton>
          <Button color="inherit" startIcon={<VpnKeyIcon />} onClick={onReauth}>
            Re-auth
          </Button>
          <Button 
            color="inherit" 
            startIcon={<SyncIcon />} 
            onClick={onSync} 
            disabled={syncing}
            variant="outlined"
            sx={{ borderColor: 'rgba(255,255,255,0.5)' }}
          >
            {syncing ? "Syncing..." : "Sync"}
          </Button>
          <IconButton onClick={onToggleTheme} color="inherit" title="Toggle theme">
            {themeMode === "dark" ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}