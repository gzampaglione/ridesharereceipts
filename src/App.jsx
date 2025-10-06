import React, { useState, useEffect, useMemo } from 'react';
import './App.css';

function App() {
    const [receipts, setReceipts] = useState([]);
    const [filteredReceipts, setFilteredReceipts] = useState([]);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(null);
    const [selectedReceipts, setSelectedReceipts] = useState(new Set());
    const [categories, setCategories] = useState([]);
    const [newCategory, setNewCategory] = useState('');

    // Filters
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        location: '',
        vendors: { Uber: true, Lyft: true, Curb: true },
        category: 'all',
        billedStatus: 'all'
    });

    // Get unique locations from receipts, memoized for performance
    const uniqueLocations = useMemo(() => {
        const locations = new Set();
        receipts.forEach(r => {
            if (r.startLocation?.city) locations.add(`${r.startLocation.city}, ${r.startLocation.state || ''}`);
            if (r.endLocation?.city) locations.add(`${r.endLocation.city}, ${r.endLocation.state || ''}`);
        });
        return Array.from(locations).sort();
    }, [receipts]);

    useEffect(() => {
        const initialize = async () => {
            try {
                console.log("Checking for existing authentication...");
                const initialUser = await window.electronAPI.getUser();
                console.log("Initial user check:", initialUser);

                if (!initialUser || !initialUser.email || initialUser.email === "Not Logged In" || initialUser.email === "Error fetching email") {
                    console.log("No valid authentication found, starting OAuth flow...");
                    await window.electronAPI.authenticate();
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const authenticatedUser = await window.electronAPI.getUser();
                    console.log("User after authentication:", authenticatedUser);
                    setUser(authenticatedUser);
                } else {
                    console.log("Already authenticated:", initialUser.email);
                    setUser(initialUser);
                }

                const initialReceipts = await window.electronAPI.getReceipts();
                const initialCategories = await window.electronAPI.getCategories();
                setReceipts(initialReceipts);
                setFilteredReceipts(initialReceipts);
                setCategories(initialCategories);
            } catch (error) {
                console.error("Initialization failed:", error);
                alert("Could not authenticate with Google. Error: " + error.message);
            } finally {
                setLoading(false);
            }
        };
        initialize();
    }, []);

    useEffect(() => {
        const applyFilters = () => {
            let filtered = [...receipts];

            if (filters.startDate) {
                filtered = filtered.filter(r => new Date(r.date) >= new Date(filters.startDate));
            }
            if (filters.endDate) {
                filtered = filtered.filter(r => new Date(r.date) <= new Date(filters.endDate));
            }

            if (filters.location) {
                const loc = filters.location.toLowerCase();
                filtered = filtered.filter(r =>
                    r.startLocation?.city?.toLowerCase().includes(loc) ||
                    r.endLocation?.city?.toLowerCase().includes(loc) ||
                    r.startLocation?.state?.toLowerCase().includes(loc) ||
                    r.endLocation?.state?.toLowerCase().includes(loc)
                );
            }

            const activeVendors = Object.keys(filters.vendors).filter(v => filters.vendors[v]);
            if (activeVendors.length > 0) {
                filtered = filtered.filter(r => activeVendors.includes(r.vendor));
            }

            if (filters.category !== 'all') {
                filtered = filtered.filter(r => r.category === filters.category);
            }

            if (filters.billedStatus !== 'all') {
                const isBilled = filters.billedStatus === 'billed';
                filtered = filtered.filter(r => r.billed === isBilled);
            }

            setFilteredReceipts(filtered);
        };

        applyFilters();
    }, [receipts, filters]);

    const handleReauth = async () => {
        setLoading(true);
        try {
            console.log("Clearing existing auth...");
            await window.electronAPI.clearAuth();
            console.log("Starting new authentication...");
            await window.electronAPI.authenticate();
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log("Fetching user info after auth...");
            const newUser = await window.electronAPI.getUser();
            console.log("New user info:", newUser);
            setUser(newUser);
            if (newUser && newUser.email && newUser.email !== "Not Logged In") {
                alert("Re-authentication successful! Logged in as: " + newUser.email);
            } else {
                alert("Authentication completed but couldn't fetch user info. Please try clicking 'Sync Receipts'.");
            }
        } catch (error) {
            console.error("Re-authentication failed:", error);
            alert("Re-authentication failed: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            const currentUser = await window.electronAPI.getUser();
            setUser(currentUser);
            if (!currentUser || currentUser.email === "Not Logged In") {
                alert("Please authenticate first by clicking 'Re-authenticate'");
                return;
            }
            console.log("Starting receipt sync...");
            const result = await window.electronAPI.syncReceipts();
            alert(`Sync complete! ${result.newReceipts} new receipts found. Total: ${result.totalReceipts}`);
            const updatedReceipts = await window.electronAPI.getReceipts();
            setReceipts(updatedReceipts);
        } catch (error) {
            console.error("Sync failed:", error);
            alert("Sync failed: " + error.message + "\n\nPlease check your connection and try re-authenticating.");
        } finally {
            setSyncing(false);
        }
    };

    const handleSelectReceipt = (messageId) => {
        const newSelected = new Set(selectedReceipts);
        if (newSelected.has(messageId)) {
            newSelected.delete(messageId);
        } else {
            newSelected.add(messageId);
        }
        setSelectedReceipts(newSelected);
    };

    const handleSelectAll = () => {
        if (selectedReceipts.size === filteredReceipts.length) {
            setSelectedReceipts(new Set());
        } else {
            setSelectedReceipts(new Set(filteredReceipts.map(r => r.messageId)));
        }
    };

    const handleBulkCategory = async (category) => {
        if (selectedReceipts.size === 0) {
            alert("Please select receipts first");
            return;
        }
        await window.electronAPI.bulkUpdateReceipts(Array.from(selectedReceipts), { category });
        const updated = await window.electronAPI.getReceipts();
        setReceipts(updated);
        setSelectedReceipts(new Set());
    };

    const handleBulkBilled = async (billed) => {
        if (selectedReceipts.size === 0) {
            alert("Please select receipts first");
            return;
        }
        await window.electronAPI.bulkUpdateReceipts(Array.from(selectedReceipts), { billed });
        const updated = await window.electronAPI.getReceipts();
        setReceipts(updated);
        setSelectedReceipts(new Set());
    };

    const handleAddCategory = async () => {
        if (!newCategory.trim()) return;
        const updated = await window.electronAPI.addCategory(newCategory.trim());
        setCategories(updated);
        setNewCategory('');
    };

    const exportToCSV = () => {
        const receiptsToExport = selectedReceipts.size > 0
            ? filteredReceipts.filter(r => selectedReceipts.has(r.messageId))
            : filteredReceipts;

        if (receiptsToExport.length === 0) {
            alert("No receipts to export");
            return;
        }

        const headers = ['Date', 'Vendor', 'Total', 'Tip', 'Start Location', 'End Location', 'Category', 'Billed'];
        const rows = receiptsToExport.map(r => [
            new Date(r.date).toLocaleDateString(),
            r.vendor,
            r.total.toFixed(2),
            r.tip.toFixed(2),
            `${r.startLocation?.city || ''} ${r.startLocation?.state || ''}`.trim() || 'N/A',
            `${r.endLocation?.city || ''} ${r.endLocation?.state || ''}`.trim() || 'N/A',
            r.category || 'Uncategorized',
            r.billed ? 'Yes' : 'No'
        ]);

        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `receipts_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return <div className="loading-screen"><h1>Rideshare Receipts</h1><p>Initializing and authenticating...</p></div>;
    }

    return (
        <div className="container">
            <header className="app-header">
                <h1>Rideshare Receipts</h1>
                <div className="header-controls">
                    <span>Logged in as: <strong>{user?.email || 'Not logged in'}</strong></span>
                    <button onClick={handleReauth}>Re-authenticate</button>
                    <button onClick={handleSync} disabled={syncing}>
                        {syncing ? 'Syncing...' : 'Sync Receipts'}
                    </button>
                </div>
            </header>

            {syncProgress && (
                <div className="sync-progress-bar">
                    <div className="progress-info">
                        <span>Syncing {syncProgress.query}: {syncProgress.current} / {syncProgress.total}</span>
                        <span>{Math.round((syncProgress.current / syncProgress.total) * 100)}%</span>
                    </div>
                    <div className="progress-bar-container">
                        <div
                            className="progress-bar-fill"
                            style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                        ></div>
                    </div>
                </div>
            )}

            <main className="main-content">
                <aside className="sidebar">
                    <div className="filters-section">
                        <h3>Filters</h3>
                        <div className="filters-grid">
                            <div className="filter-group">
                                <label>Start Date:</label>
                                <input
                                    type="date"
                                    value={filters.startDate}
                                    onChange={e => setFilters({ ...filters, startDate: e.target.value })}
                                />
                            </div>
                            <div className="filter-group">
                                <label>End Date:</label>
                                <input
                                    type="date"
                                    value={filters.endDate}
                                    onChange={e => setFilters({ ...filters, endDate: e.target.value })}
                                />
                            </div>
                            <div className="filter-group">
                                <label>Location:</label>
                                <select
                                    value={filters.location}
                                    onChange={e => setFilters({ ...filters, location: e.target.value })}
                                >
                                    <option value="">All Locations</option>
                                    {uniqueLocations.map(loc => (
                                        <option key={loc} value={loc}>{loc}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="filter-group">
                                <label>Vendors:</label>
                                <div className="checkbox-group">
                                    <div className="checkbox-item">
                                        <input
                                            type="checkbox"
                                            id="vendor-uber"
                                            checked={filters.vendors.Uber}
                                            onChange={e => setFilters({ ...filters, vendors: { ...filters.vendors, Uber: e.target.checked } })}
                                        />
                                        <label htmlFor="vendor-uber">Uber</label>
                                    </div>
                                    <div className="checkbox-item">
                                        <input
                                            type="checkbox"
                                            id="vendor-lyft"
                                            checked={filters.vendors.Lyft}
                                            onChange={e => setFilters({ ...filters, vendors: { ...filters.vendors, Lyft: e.target.checked } })}
                                        />
                                        <label htmlFor="vendor-lyft">Lyft</label>
                                    </div>
                                    <div className="checkbox-item">
                                        <input
                                            type="checkbox"
                                            id="vendor-curb"
                                            checked={filters.vendors.Curb}
                                            onChange={e => setFilters({ ...filters, vendors: { ...filters.vendors, Curb: e.target.checked } })}
                                        />
                                        <label htmlFor="vendor-curb">Curb</label>
                                    </div>
                                </div>
                            </div>
                            <div className="filter-group">
                                <label>Category:</label>
                                <select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })}>
                                    <option value="all">All</option>
                                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    <option value="">Uncategorized</option>
                                </select>
                            </div>
                            <div className="filter-group">
                                <label>Status:</label>
                                <select value={filters.billedStatus} onChange={e => setFilters({ ...filters, billedStatus: e.target.value })}>
                                    <option value="all">All</option>
                                    <option value="billed">Billed</option>
                                    <option value="unbilled">Not Billed</option>
                                </select>
                            </div>
                        </div>
                        <button onClick={() => setFilters({ startDate: '', endDate: '', location: '', vendors: { Uber: true, Lyft: true, Curb: true }, category: 'all', billedStatus: 'all' })}>
                            Clear Filters
                        </button>
                    </div>

                    <div className="actions-section">
                        <h3>Bulk Actions ({selectedReceipts.size} selected)</h3>
                        <div className="actions-grid">
                            <select onChange={e => handleBulkCategory(e.target.value)} value="">
                                <option value="">Assign Category...</option>
                                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                            <button onClick={() => handleBulkBilled(true)}>Mark as Billed</button>
                            <button onClick={() => handleBulkBilled(false)}>Mark as Not Billed</button>
                            <button onClick={exportToCSV}>Export to CSV</button>
                        </div>
                        <div className="category-manager">
                            <input
                                type="text"
                                placeholder="New category name"
                                value={newCategory}
                                onChange={e => setNewCategory(e.target.value)}
                                onKeyPress={e => e.key === 'Enter' && handleAddCategory()}
                            />
                            <button onClick={handleAddCategory}>Add Category</button>
                        </div>
                    </div>
                </aside>

                <div className="content-area">
                    <p>Showing {filteredReceipts.length} of {receipts.length} receipts</p>
                    <table>
                        <thead>
                            <tr>
                                <th>
                                    <input
                                        type="checkbox"
                                        checked={selectedReceipts.size === filteredReceipts.length && filteredReceipts.length > 0}
                                        onChange={handleSelectAll}
                                    />
                                </th>
                                <th>Date</th>
                                <th>Vendor</th>
                                <th>Total</th>
                                <th>Tip</th>
                                <th>Start Location</th>
                                <th>End Location</th>
                                <th>Category</th>
                                <th>Billed</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredReceipts.length > 0 ? (
                                filteredReceipts
                                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                                    .map((receipt) => (
                                        <tr key={receipt.messageId} className={selectedReceipts.has(receipt.messageId) ? 'selected' : ''}>
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedReceipts.has(receipt.messageId)}
                                                    onChange={() => handleSelectReceipt(receipt.messageId)}
                                                />
                                            </td>
                                            <td>{new Date(receipt.date).toLocaleDateString()}</td>
                                            <td>{receipt.vendor}</td>
                                            <td>${receipt.total.toFixed(2)}</td>
                                            <td>${receipt.tip.toFixed(2)}</td>
                                            <td>{receipt.startLocation?.city || 'N/A'}, {receipt.startLocation?.state || ''}</td>
                                            <td>{receipt.endLocation?.city || 'N/A'}, {receipt.endLocation?.state || ''}</td>
                                            <td>{receipt.category || '-'}</td>
                                            <td>{receipt.billed ? '✓' : '-'}</td>
                                        </tr>
                                    ))
                            ) : (
                                <tr>
                                    <td colSpan="9">No receipts found. Click "Sync Receipts" to get started.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
}

export default App;