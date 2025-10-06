import React from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Button,
  Divider,
  Stack,
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import BoltIcon from '@mui/icons-material/Bolt';
import LabelIcon from '@mui/icons-material/Label';

export default function FiltersSidebar({ 
  filters, 
  setFilters, 
  categories, 
  uniqueLocations,
  selectedCount,
  onBulkCategory,
  onBulkBilled,
  onExportCSV,
  newCategory,
  setNewCategory,
  onAddCategory
}) {
  return (
    <Box sx={{ width: 350, p: 2, overflowY: 'auto', height: '100%' }}>
      {/* Filters Section */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} mb={2}>
          <FilterListIcon />
          <Typography variant="h6">Filters</Typography>
        </Stack>

        <Stack spacing={2}>
          <TextField
            label="Start Date"
            type="date"
            size="small"
            value={filters.startDate}
            onChange={e => setFilters({...filters, startDate: e.target.value})}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />

          <TextField
            label="End Date"
            type="date"
            size="small"
            value={filters.endDate}
            onChange={e => setFilters({...filters, endDate: e.target.value})}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />

          <FormControl size="small" fullWidth>
            <InputLabel>Location</InputLabel>
            <Select
              value={filters.location}
              label="Location"
              onChange={e => setFilters({...filters, location: e.target.value})}
            >
              <MenuItem value="">All Locations</MenuItem>
              {uniqueLocations.map(loc => (
                <MenuItem key={loc} value={loc}>{loc}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box>
            <Typography variant="subtitle2" mb={1}>Vendors</Typography>
            <FormGroup>
              <FormControlLabel
                control={
                  <Checkbox 
                    checked={filters.vendors.Uber}
                    onChange={e => setFilters({...filters, vendors: {...filters.vendors, Uber: e.target.checked}})}
                  />
                }
                label="Uber"
              />
              <FormControlLabel
                control={
                  <Checkbox 
                    checked={filters.vendors.Lyft}
                    onChange={e => setFilters({...filters, vendors: {...filters.vendors, Lyft: e.target.checked}})}
                  />
                }
                label="Lyft"
              />
              <FormControlLabel
                control={
                  <Checkbox 
                    checked={filters.vendors.Curb}
                    onChange={e => setFilters({...filters, vendors: {...filters.vendors, Curb: e.target.checked}})}
                  />
                }
                label="Curb"
              />
            </FormGroup>
          </Box>

          <FormControl size="small" fullWidth>
            <InputLabel>Category</InputLabel>
            <Select
              value={filters.category}
              label="Category"
              onChange={e => setFilters({...filters, category: e.target.value})}
            >
              <MenuItem value="all">All Categories</MenuItem>
              {categories.map(cat => <MenuItem key={cat} value={cat}>{cat}</MenuItem>)}
              <MenuItem value="">Uncategorized</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel>Billing Status</InputLabel>
            <Select
              value={filters.billedStatus}
              label="Billing Status"
              onChange={e => setFilters({...filters, billedStatus: e.target.value})}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="billed">Billed</MenuItem>
              <MenuItem value="unbilled">Not Billed</MenuItem>
            </Select>
          </FormControl>

          <Button 
            variant="outlined"
            fullWidth
            onClick={() => setFilters({
              startDate: '', 
              endDate: '', 
              location: '', 
              vendors: { Uber: true, Lyft: true, Curb: true }, 
              category: 'all', 
              billedStatus: 'all'
            })}
          >
            Clear All Filters
          </Button>
        </Stack>
      </Paper>

      {/* Bulk Actions Section */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} mb={2}>
          <BoltIcon />
          <Typography variant="h6">Bulk Actions</Typography>
          <Typography variant="caption" color="text.secondary">
            ({selectedCount} selected)
          </Typography>
        </Stack>

        <Stack spacing={1.5}>
          <FormControl size="small" fullWidth>
            <InputLabel>Assign Category</InputLabel>
            <Select
              value=""
              label="Assign Category"
              onChange={e => {
                if (e.target.value) onBulkCategory(e.target.value);
              }}
            >
              <MenuItem value="" disabled>Select category...</MenuItem>
              {categories.map(cat => <MenuItem key={cat} value={cat}>{cat}</MenuItem>)}
            </Select>
          </FormControl>

          <Button 
            variant="contained" 
            fullWidth 
            onClick={() => onBulkBilled(true)}
            disabled={selectedCount === 0}
          >
            Mark as Billed
          </Button>

          <Button 
            variant="outlined" 
            fullWidth 
            onClick={() => onBulkBilled(false)}
            disabled={selectedCount === 0}
          >
            Mark as Not Billed
          </Button>

          <Button 
            variant="contained" 
            color="secondary"
            fullWidth 
            onClick={onExportCSV}
          >
            Export to CSV
          </Button>
        </Stack>
      </Paper>

      {/* Category Management Section */}
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} mb={2}>
          <LabelIcon />
          <Typography variant="h6">Manage Categories</Typography>
        </Stack>

        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            placeholder="New category"
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && onAddCategory()}
            fullWidth
          />
          <Button variant="contained" onClick={onAddCategory}>
            Add
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}