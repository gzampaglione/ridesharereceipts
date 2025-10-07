import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Typography,
  CircularProgress,
  Box,
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';

export default function ForwardEmailDialog({
  open,
  onClose,
  email,
  setEmail,
  sending,
  selectedCount,
  onSend,
}) {
  return (
    <Dialog open={open} onClose={() => !sending && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <EmailIcon />
          <Typography variant="h6">Forward Receipts via Gmail</Typography>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Email Address"
          type="email"
          fullWidth
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          helperText={`Forward ${selectedCount} selected receipt${selectedCount !== 1 ? 's' : ''} via Gmail API`}
          disabled={sending}
        />
        {sending && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <CircularProgress size={24} />
            <Typography variant="body2" sx={{ ml: 2 }}>
              Sending email...
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={sending}>
          Cancel
        </Button>
        <Button 
          onClick={onSend} 
          variant="contained" 
          startIcon={<EmailIcon />}
          disabled={sending || !email.trim()}
        >
          {sending ? "Sending..." : "Send via Gmail"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}