import React, { useState, useEffect, useMemo } from 'react';
import { AppBar, Toolbar, Typography, Button, Container, Box, CircularProgress, LinearProgress, Grid } from '@mui/material';

import FiltersSidebar from './components/FiltersSidebar';
import ReceiptsDataGrid from './components/ReceiptsDataGrid';

function App() {
    const [receipts, setReceipts] = useState([]);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(null);
    const [selectedReceipts, setSelectedReceipts] = useState(new Set());
    const [categories, setCategories] = useState([]);
    const [newCategory, setNewCategory] = useState('');

    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        location: '',
        vendors: { Uber: true, Lyft: true, Curb: true },
        category: 'all',
        billedStatus: 'all'
    });

    const uniqueLocations = useMemo(() => {
        const locations = new Set();
        receipts.forEach(r => {
            if (r.startLocation?.city) locations.add(`${r.startLocation.city}, ${r.startLocation.state || ''}`);
            if (r.endLocation?.city) locations.add(`${r.endLocation.city}, ${r.endLocation.state || ''}`);
        });
        return Array.from(locations).sort();
    }, [receipts]);

    const filteredReceipts = useMemo(() => {
        let filtered = [...receipts];
        if (filters.startDate) {
            filtered = filtered.filter(r => new Date(r.date) >= new Date(filters.startDate));
        }
        if (filters.endDate) {
            filtered = filtered.filter(r => new Date(r.date) <= new Date(filters.endDate));
        }
        const activeVendors = Object.keys(filters.vendors).filter(v => filters.vendors[v]);
        if (activeVendors.length > 0 && activeVendors.length < 3) {
             filtered = filtered.filter(r => activeVendors.includes(r.vendor));
        }
        // ... add other filter logic here
        return filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [receipts, filters]);

    useEffect(() => {
        const initialize = async () => {
            try {
                const initialUser = await window.electronAPI.getUser();
                if (!initialUser || !initialUser.email.includes('@')) {
                    await window.electronAPI.authenticate();
                    const authenticatedUser = await window.electronAPI.getUser();
                    setUser(authenticatedUser);
                } else {
                    setUser(initialUser);
                }
                const [initialReceipts, initialCategories] = await Promise.all([
                    window.electronAPI.getReceipts(),
                    window.electronAPI.getCategories(),
                ]);
                setReceipts(initialReceipts);
                setCategories(initialCategories);
            } catch (error) {
                console.error("Initialization failed:", error);
            } finally {
                setLoading(false);
            }
        };
        initialize();
    }, []);

    const handleSync = async () => {
        setSyncing(true);
        setSyncProgress(null); // Reset progress
        try {
            const result = await window.electronAPI.syncReceipts();
            alert(`Sync complete! ${result.newReceipts} new receipts found. Total: ${result.totalReceipts}`);
            const updatedReceipts = await window.electronAPI.getReceipts();
            setReceipts(updatedReceipts);
        } catch (error) {
            console.error("Sync failed:", error);
            alert("Sync failed: " + error.message);
        } finally {
            setSyncing(false);
            setSyncProgress(null);
        }
    };
    
    // Placeholder for other handlers...
    const handleReauth = async () => { /* ... */ };
    const handleBulkCategory = async (category) => { /* ... */ };
    const handleBulkBilled = async (billed) => { /* ... */ };
    const handleAddCategory = async () => { /* ... */ };
    const exportToCSV = () => { /* ... */ };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
                <CircularProgress />
                <Typography sx={{ mt: 2 }}>Initializing and authenticating...</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                        Rideshare Receipts
                    </Typography>
                    <Typography sx={{ mr: 2 }}>{user?.email || 'Not logged in'}</Typography>
                    <Button color="inherit" onClick={handleReauth}>Re-authenticate</Button>
                    <Button color="inherit" onClick={handleSync} disabled={syncing}>
                        {syncing ? 'Syncing...' : 'Sync Receipts'}
                    </Button>
                </Toolbar>
                {syncing && <LinearProgress />}
            </AppBar>
            
            <Grid container sx={{ flexGrow: 1, overflow: 'hidden' }}>
                <Grid item xs={3} sx={{ height: '100%', overflowY: 'auto', borderRight: '1px solid', borderColor: 'divider' }}>
                    <FiltersSidebar
                        filters={filters}
                        setFilters={setFilters}
                        categories={categories}
                        uniqueLocations={uniqueLocations}
                        selectedCount={selectedReceipts.size}
                        onBulkCategory={handleBulkCategory}
                        onBulkBilled={handleBulkBilled}
                        onExportCSV={exportToCSV}
                        newCategory={newCategory}
                        setNewCategory={setNewCategory}
                        onAddCategory={handleAddCategory}
                    />
                </Grid>
                <Grid item xs={9} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ p: 2, flexGrow: 1 }}>
                        <ReceiptsDataGrid
                            receipts={filteredReceipts}
                            selectedReceipts={selectedReceipts}
                            onSelectionChange={setSelectedReceipts}
                        />
                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
}

export default App;