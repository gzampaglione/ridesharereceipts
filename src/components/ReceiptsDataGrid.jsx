import React from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { Chip, Box, IconButton, Tooltip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

export default function ReceiptsDataGrid({ 
  receipts, 
  selectedReceipts, 
  onSelectionChange 
}) {
  const handleOpenEmail = async (messageId) => {
    const result = await window.electronAPI.openEmail(messageId);
    if (result.error) {
      alert(`Error opening email: ${result.error}`);
    }
  };

  const columns = [
    {
      field: 'actions',
      headerName: '',
      width: 60,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (params) => (
        <Tooltip title="Open email in browser">
          <IconButton
            size="small"
            onClick={() => handleOpenEmail(params.row.messageId)}
            color="primary"
          >
            <OpenInNewIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
    {
      field: 'total',
      headerName: 'Total',
      width: 90,
      type: 'number',
      valueFormatter: (params) => `$${params.value.toFixed(2)}`,
    },
    {
      field: 'date',
      headerName: 'Date',
      width: 110,
      valueFormatter: (params) => new Date(params.value).toLocaleDateString(),
    },
    {
      field: 'startTime',
      headerName: 'Pickup',
      width: 90,
      valueGetter: (params) => params.row.startTime || '—',
    },
    {
      field: 'endTime',
      headerName: 'Dropoff',
      width: 90,
      valueGetter: (params) => params.row.endTime || '—',
    },
    {
      field: 'vendor',
      headerName: 'Vendor',
      width: 90,
      renderCell: (params) => (
        <Chip 
          label={params.value}
          size="small"
          sx={{
            backgroundColor: 
              params.value === 'Uber' ? '#000' : 
              params.value === 'Lyft' ? '#ff00e6' : 
              '#ffc107',
            color: params.value === 'Uber' ? '#fff' : 
                   params.value === 'Lyft' ? '#fff' : 
                   '#000',
            fontWeight: 600,
          }}
        />
      ),
    },
    {
      field: 'fromLocation',
      headerName: 'From',
      flex: 1,
      minWidth: 150,
      valueGetter: (params) => {
        const loc = params.row.startLocation;
        if (!loc || !loc.city) return '—';
        return `${loc.city}, ${loc.state || ''}`.trim().replace(/,\s*$/, '');
      },
    },
    {
      field: 'toLocation',
      headerName: 'To',
      flex: 1,
      minWidth: 150,
      valueGetter: (params) => {
        const loc = params.row.endLocation;
        if (!loc || !loc.city) return '—';
        return `${loc.city}, ${loc.state || ''}`.trim().replace(/,\s*$/, '');
      },
    },
    {
      field: 'category',
      headerName: 'Category',
      width: 130,
      renderCell: (params) => 
        params.value ? (
          <Chip label={params.value} size="small" variant="outlined" />
        ) : (
          <span style={{ color: '#999' }}>—</span>
        ),
    },
    {
      field: 'billed',
      headerName: 'Billed',
      width: 70,
      type: 'boolean',
      renderCell: (params) => 
        params.value ? (
          <CheckCircleIcon sx={{ color: 'success.main' }} />
        ) : (
          <span style={{ color: '#999' }}>—</span>
        ),
    },
  ];

  const rows = receipts.map((receipt, index) => ({
    id: receipt.messageId || index,
    ...receipt,
  }));

  return (
    <Box sx={{ height: '100%', width: '100%' }}>
      <DataGrid
        rows={rows}
        columns={columns}
        checkboxSelection
        disableRowSelectionOnClick
        onRowSelectionModelChange={(newSelection) => {
          onSelectionChange(new Set(newSelection));
        }}
        rowSelectionModel={Array.from(selectedReceipts)}
        initialState={{
          sorting: {
            sortModel: [{ field: 'date', sort: 'desc' }],
          },
          pagination: {
            paginationModel: { pageSize: 25 },
          },
        }}
        pageSizeOptions={[10, 25, 50, 100]}
        autoHeight={false}
        density="comfortable"
        sx={{
          '& .MuiDataGrid-row:hover': {
            backgroundColor: 'action.hover',
          },
          '& .MuiDataGrid-cell:focus': {
            outline: 'none',
          },
          '& .MuiDataGrid-cell:focus-within': {
            outline: 'none',
          },
        }}
      />
    </Box>
  );
}