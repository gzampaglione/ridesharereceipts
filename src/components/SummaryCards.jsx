import React from "react";
import { Stack, Paper, Typography } from "@mui/material";

export default function SummaryCards({
  totalReceipts,
  filteredCount,
  totalAmount,
  totalTips,
  selectedCount,
  selectedAmount,
  selectedTips,
}) {
  return (
    <Stack direction="row" spacing={2} mb={3}>
      <Paper
        sx={{
          p: 2,
          flexGrow: 1,
          bgcolor: "primary.main",
          color: "primary.contrastText",
        }}
      >
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          Total Receipts
        </Typography>
        <Typography variant="h4" fontWeight="bold">
          {filteredCount}
        </Typography>
        <Typography variant="caption">of {totalReceipts} total</Typography>
      </Paper>

      <Paper
        sx={{
          p: 2,
          flexGrow: 1,
          bgcolor: "success.main",
          color: "success.contrastText",
        }}
      >
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          Total Amount
        </Typography>
        <Typography variant="h4" fontWeight="bold">
          ${totalAmount.toFixed(2)}
        </Typography>
        <Typography variant="caption">Tips: ${totalTips.toFixed(2)}</Typography>
      </Paper>

      <Paper
        sx={{
          p: 2,
          flexGrow: 1,
          bgcolor: "secondary.main",
          color: "secondary.contrastText",
        }}
      >
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          Selected
        </Typography>
        <Typography variant="h4" fontWeight="bold">
          {selectedCount > 0 ? `$${selectedAmount.toFixed(2)}` : "—"}
        </Typography>
        <Typography variant="caption">
          {selectedCount > 0
            ? `${selectedCount} receipt${
                selectedCount !== 1 ? "s" : ""
              } • Tips: $${selectedTips.toFixed(2)}`
            : "no selection"}
        </Typography>
      </Paper>
    </Stack>
  );
}
