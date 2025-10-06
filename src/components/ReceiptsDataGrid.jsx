import React from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { Chip, Box } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

export default function ReceiptsDataGrid({ 
  receipts, 
  selectedReceipts, 
  onSelectionChange 
}) {
  const columns = [
    {
      field: 'date',
      headerName: 'Date',
      width: 130,
      valueFormatter: (params) => new Date(params.value).toLocaleDateString(),
    },
    {
      field: 'vendor',
      headerName: 'Vendor',
      width: 110,
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
      field: 'total',
      headerName: 'Total',
      width: 100,
      type: 'number',
      valueFormatter: (params) => `$${params.value.toFixed(2)}`,
    },
    {
      field: 'tip',
      headerName: 'Tip',
      width: 90,
      type: 'number',
      valueFormatter: (params) => `$${params.value.toFixed(2)}`,
    },
    {
      field: 'startLocation',
      headerName: 'From',
      width: 200,
      valueGetter: (params) => {
        const loc = params.row.startLocation;
        return loc?.city ? `${loc.city}, ${loc.state || ''}` : '—';
      },
    },
    {
      field: 'endLocation',
      headerName: 'To',
      width: 200,
      valueGetter: (params) => {
        const loc = params.row.endLocation;
        return loc?.city ? `${loc.city}, ${loc.state || ''}` : '—';
      },
    },
    {
      field: 'category',
      headerName: 'Category',
      width: 150,
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
      width: 90,
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
    <Box sx={{ height: 600, width: '100%' }}>
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
        sx={{
          '& .MuiDataGrid-row:hover': {
            backgroundColor: 'action.hover',
          },
        }}
      />
    </Box>
  );
}