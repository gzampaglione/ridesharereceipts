import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import DoNotDisturbOnIcon from '@mui/icons-material/DoNotDisturbOn';

const getStatusIcon = (status) => {
  if (status.startsWith('Success')) return <CheckCircleIcon color="success" fontSize="small" />;
  if (status === 'Processing') return <HourglassTopIcon color="info" fontSize="small" />;
  if (status.startsWith('Failed')) return <ErrorIcon color="error" fontSize="small" />;
  return <DoNotDisturbOnIcon color="disabled" fontSize="small" />;
};

const getStatusChip = (status) => {
    let color = 'default';
    if (status.startsWith('Success')) color = 'success';
    else if (status.startsWith('Failed')) color = 'error';
    else if (status === 'Processing') color = 'info';
    
    return <Chip label={status} color={color} size="small" variant="outlined" sx={{ minWidth: 120, justifyContent: 'center' }} />;
};


export default function SyncProgressPane({ logs }) {
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Syncing Receipts...
      </Typography>
      <List
        sx={{
          height: 400,
          overflowY: 'auto',
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
        }}
      >
        {logs.length === 0 && (
          <ListItem>
            <ListItemText primary="Waiting for sync to start..." />
          </ListItem>
        )}
        {logs.map((log) => (
          <ListItem key={log.id} divider>
            <ListItemIcon>{getStatusIcon(log.status)}</ListItemIcon>
            <ListItemText
              primary={log.subject}
              primaryTypographyProps={{
                noWrap: true,
                style: {
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '400px',
                },
              }}
            />
            {getStatusChip(log.status)}
          </ListItem>
        ))}
      </List>
    </Box>
  );
}