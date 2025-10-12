import React, { useState, useMemo } from "react";
import { DataGrid } from "@mui/x-data-grid";
import {
  Chip,
  Box,
  IconButton,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  Stack,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ViewComfyIcon from "@mui/icons-material/ViewComfy";
import ViewCompactIcon from "@mui/icons-material/ViewCompact";
import DensitySmallIcon from "@mui/icons-material/DensitySmall";
import {
  groupReceiptsWithCancellations,
  calculateGroupedTotal,
} from "../utils/receiptGrouping";

export default function ReceiptsDataGrid({
  receipts,
  selectedReceipts,
  onSelectionChange,
  addressDisplayMode = "city",
}) {
  const [density, setDensity] = useState("standard"); // 'comfortable', 'standard', 'compact'

  // Group receipts with their cancellations
  const groupedReceipts = useMemo(
    () => groupReceiptsWithCancellations(receipts),
    [receipts]
  );

  const handleOpenEmail = async (messageId) => {
    const result = await window.electronAPI.openEmail(messageId);
    if (result.error) {
      alert(`Error opening email: ${result.error}`);
    }
  };

  const getLocationDisplay = (location, mode) => {
    if (!location || !location.city) return "—";

    if (mode === "city") {
      return `${location.city}, ${location.state || ""}`
        .trim()
        .replace(/,\s*$/, "");
    } else {
      return (
        location.address ||
        `${location.city}, ${location.state || ""}`.trim().replace(/,\s*$/, "")
      );
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const dayOfWeek = days[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear().toString().slice(-2);

    return `${dayOfWeek} ${day} ${month} ${year}`;
  };

  const columns = [
    {
      field: "actions",
      headerName: "",
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
      field: "total",
      headerName: "Total",
      width: 120,
      type: "number",
      renderCell: (params) => {
        const receipt = params.row;
        if (receipt.isRefund) {
          return (
            <span style={{ color: "#d32f2f", fontWeight: 600 }}>
              -${Math.abs(receipt.total).toFixed(2)}
            </span>
          );
        }
        if (receipt.isGroup && receipt.hasRefund) {
          const netAmount = calculateGroupedTotal(receipt);
          return (
            <Box>
              <Typography variant="body2" fontWeight={600}>
                ${receipt.total.toFixed(2)}
              </Typography>
              <Typography variant="caption" color="error.main">
                Net: ${netAmount.toFixed(2)}
              </Typography>
            </Box>
          );
        }
        return `$${receipt.total.toFixed(2)}`;
      },
    },
    {
      field: "date",
      headerName: "Date",
      width: 120,
      valueFormatter: (params) => formatDate(params.value),
    },
    {
      field: "startTime",
      headerName: "Pickup",
      width: 90,
      valueGetter: (params) => params.row.startTime || "—",
    },
    {
      field: "endTime",
      headerName: "Dropoff",
      width: 90,
      valueGetter: (params) => params.row.endTime || "—",
    },
    {
      field: "vendor",
      headerName: "Vendor",
      width: 110,
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Chip
            label={params.value}
            size="small"
            sx={{
              backgroundColor:
                params.value === "Uber"
                  ? "#000"
                  : params.value === "Lyft"
                  ? "#ff00e6"
                  : params.value === "Curb"
                  ? "#ffc107"
                  : params.value === "Amtrak"
                  ? "#003d7a"
                  : "#999",
              color:
                params.value === "Uber"
                  ? "#fff"
                  : params.value === "Lyft"
                  ? "#fff"
                  : params.value === "Curb"
                  ? "#000"
                  : params.value === "Amtrak"
                  ? "#fff"
                  : "#fff",
              fontWeight: 600,
              height: density === "compact" ? "20px" : "24px",
              fontSize: density === "compact" ? "0.7rem" : "0.8125rem",
            }}
          />
          {params.row.isRefund && (
            <Tooltip title="Refund">
              <Chip
                label="R"
                size="small"
                color="error"
                sx={{ height: "18px", fontSize: "0.65rem" }}
              />
            </Tooltip>
          )}
          {params.row.isGroup && params.row.hasRefund && (
            <Tooltip title="Has refund">
              <Chip
                label="!"
                size="small"
                color="warning"
                sx={{ height: "18px", fontSize: "0.65rem" }}
              />
            </Tooltip>
          )}
        </Box>
      ),
    },
    {
      field: "fromLocation",
      headerName: "From",
      flex: 1,
      minWidth: addressDisplayMode === "city" ? 150 : 250,
      valueGetter: (params) =>
        getLocationDisplay(params.row.startLocation, addressDisplayMode),
    },
    {
      field: "toLocation",
      headerName: "To",
      flex: 1,
      minWidth: addressDisplayMode === "city" ? 150 : 250,
      valueGetter: (params) =>
        getLocationDisplay(params.row.endLocation, addressDisplayMode),
    },
    {
      field: "category",
      headerName: "Category",
      width: 130,
      renderCell: (params) =>
        params.value ? (
          <Chip
            label={params.value}
            size="small"
            variant="outlined"
            sx={{
              height: density === "compact" ? "20px" : "24px",
              fontSize: density === "compact" ? "0.7rem" : "0.8125rem",
            }}
          />
        ) : (
          <span style={{ color: "#999" }}>—</span>
        ),
    },
    {
      field: "billed",
      headerName: "Billed",
      width: 70,
      type: "boolean",
      renderCell: (params) =>
        params.value ? (
          <CheckCircleIcon
            sx={{
              color: "success.main",
              fontSize: density === "compact" ? "1.2rem" : "1.5rem",
            }}
          />
        ) : (
          <span style={{ color: "#999" }}>—</span>
        ),
    },
  ];

  const rows = groupedReceipts.map((receipt, index) => ({
    id: receipt.messageId || index,
    ...receipt,
  }));

  return (
    <Box sx={{ height: "100%", width: "100%" }}>
      {/* Density Controls */}
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary" fontWeight="500">
          Row Density:
        </Typography>
        <ToggleButtonGroup
          value={density}
          exclusive
          onChange={(e, newDensity) => {
            if (newDensity !== null) {
              setDensity(newDensity);
            }
          }}
          size="small"
        >
          <ToggleButton value="comfortable" aria-label="comfortable density">
            <Tooltip title="Comfortable (Most spacing)">
              <ViewComfyIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="standard" aria-label="standard density">
            <Tooltip title="Standard (Default)">
              <ViewCompactIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="compact" aria-label="compact density">
            <Tooltip title="Compact (Most rows visible)">
              <DensitySmallIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ ml: "auto" }}
        >
          {rows.length} receipt{rows.length !== 1 ? "s" : ""}
        </Typography>
      </Stack>

      {/* Data Grid */}
      <DataGrid
        rows={rows}
        columns={columns}
        checkboxSelection
        disableRowSelectionOnClick
        onRowSelectionModelChange={(newSelection) => {
          onSelectionChange(new Set(newSelection));
        }}
        rowSelectionModel={Array.from(selectedReceipts)}
        getRowClassName={(params) => {
          if (params.row.isChildRow) {
            return "child-row";
          }
          if (params.row.isGroup && params.row.hasRefund) {
            return "parent-row-with-refund";
          }
          return "";
        }}
        initialState={{
          sorting: {
            sortModel: [{ field: "date", sort: "desc" }],
          },
          pagination: {
            paginationModel: {
              pageSize:
                density === "compact"
                  ? 50
                  : density === "comfortable"
                  ? 10
                  : 25,
            },
          },
        }}
        pageSizeOptions={
          density === "compact" ? [25, 50, 100] : [10, 25, 50, 100]
        }
        autoHeight={false}
        density={density}
        sx={{
          "& .MuiDataGrid-row:hover": {
            backgroundColor: "action.hover",
          },
          "& .MuiDataGrid-cell:focus": {
            outline: "none",
          },
          "& .MuiDataGrid-cell:focus-within": {
            outline: "none",
          },
          // Child row styling (indented and lighter)
          "& .child-row": {
            backgroundColor: "action.hover",
            borderLeft: "3px solid",
            borderLeftColor: "error.main",
            paddingLeft: "20px",
            fontStyle: "italic",
            opacity: 0.9,
          },
          "& .child-row:hover": {
            backgroundColor: "action.selected",
          },
          // Parent row with refund styling
          "& .parent-row-with-refund": {
            borderLeft: "3px solid",
            borderLeftColor: "warning.main",
            fontWeight: 500,
          },
          // Additional compact mode styling
          ...(density === "compact" && {
            "& .MuiDataGrid-cell": {
              padding: "4px 8px",
              fontSize: "0.8125rem",
            },
            "& .MuiDataGrid-columnHeader": {
              padding: "4px 8px",
              fontSize: "0.8125rem",
            },
            "& .MuiDataGrid-columnHeaderTitle": {
              fontWeight: 600,
            },
          }),
        }}
      />
    </Box>
  );
}
