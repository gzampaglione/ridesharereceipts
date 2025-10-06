import React from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  Stack,
  Chip,
  Paper,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';

const getPhaseInfo = (phase) => {
  switch(phase) {
    case 'starting':
      return { icon: <CloudSyncIcon />, color: 'info', label: 'Starting' };
    case 'searching':
      return { icon: <SearchIcon />, color: 'primary', label: 'Searching' };
    case 'processing':
      return { icon: <CloudSyncIcon />, color: 'primary', label: 'Processing' };
    case 'complete':
      return { icon: <CheckCircleIcon />, color: 'success', label: 'Complete' };
    case 'error':
      return { icon: <ErrorIcon />, color: 'error', label: 'Error' };
    default:
      return { icon: <CloudSyncIcon />, color: 'default', label: 'Idle' };
  }
};

export default function SyncProgressPane({ progress }) {
  const phaseInfo = getPhaseInfo(progress.phase);
  const hasProgress = progress.total && progress.current !== undefined;
  const progressPercent = hasProgress ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <Box>
      <Stack spacing={3}>
        {/* Status Header */}
        <Paper sx={{ p: 2, bgcolor: 'action.hover' }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Box sx={{ color: `${phaseInfo.color}.main` }}>
              {phaseInfo.icon}
            </Box>
            <Box flexGrow={1}>
              <Typography variant="h6" fontWeight="bold">
                {phaseInfo.label}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {progress.message || 'Syncing receipts from Gmail...'}
              </Typography>
            </Box>
            <Chip 
              label={phaseInfo.label} 
              color={phaseInfo.color} 
              size="small" 
              variant="outlined"
            />
          </Stack>
        </Paper>

        {/* Progress Bar */}
        {hasProgress && (
          <Box>
            <Stack direction="row" justifyContent="space-between" mb={1}>
              <Typography variant="body2" color="text.secondary">
                Progress
              </Typography>
              <Typography variant="body2" fontWeight="bold">
                {progress.current} / {progress.total} emails
              </Typography>
            </Stack>
            <LinearProgress 
              variant="determinate" 
              value={progressPercent} 
              sx={{ height: 8, borderRadius: 1 }}
            />
            <Typography variant="caption" color="text.secondary" display="block" mt={1} textAlign="center">
              {progressPercent}% complete
            </Typography>
          </Box>
        )}

        {/* Query Information */}
        {progress.query && (
          <Paper sx={{ p: 2, bgcolor: 'background.default', border: 1, borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
              Current Query:
            </Typography>
            <Typography variant="body2" fontFamily="monospace" fontWeight="600">
              {progress.query}
            </Typography>
          </Paper>
        )}

        {/* Phase-specific information */}
        {progress.phase === 'searching' && (
          <Box sx={{ p: 2, bgcolor: 'info.main', color: 'info.contrastText', borderRadius: 1 }}>
            <Typography variant="body2">
              🔍 Searching Gmail for rideshare receipts...
            </Typography>
          </Box>
        )}

        {progress.phase === 'processing' && (
          <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 1 }}>
            <Typography variant="body2">
              ⚙️ Processing and parsing email receipts...
            </Typography>
          </Box>
        )}

        {progress.phase === 'complete' && (
          <Box sx={{ p: 2, bgcolor: 'success.main', color: 'success.contrastText', borderRadius: 1 }}>
            <Typography variant="body2">
              ✅ Sync completed successfully!
            </Typography>
          </Box>
        )}

        {progress.phase === 'error' && (
          <Box sx={{ p: 2, bgcolor: 'error.main', color: 'error.contrastText', borderRadius: 1 }}>
            <Typography variant="body2">
              ❌ An error occurred during sync
            </Typography>
          </Box>
        )}

        {/* Tips */}
        <Paper sx={{ p: 2, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary" display="block" mb={1} fontWeight="bold">
            💡 Sync Tips:
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            • Large mailboxes may take several minutes
            <br />
            • Already synced receipts are skipped automatically
            <br />
            • You can close this window and continue working
          </Typography>
        </Paper>
      </Stack>
    </Box>
  );
}