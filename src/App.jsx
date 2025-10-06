import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
    const [receipts, setReceipts] = useState([]);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        const initialize = async () => {
            try {
                await window.electronAPI.authenticate();
                const initialUser = await window.electronAPI.getUser();
                const initialReceipts = await window.electronAPI.getReceipts();
                setUser(initialUser);
                setReceipts(initialReceipts);
            } catch (error) {
                console.error("Initialization failed:", error);
                alert("Could not authenticate with Google.");
            } finally {
                setLoading(false);
            }
        };
        initialize();
    }, []);

    const handleSync = async () => {
        setSyncing(true);
        try {
            const result = await window.electronAPI.syncReceipts();
            alert(`Sync complete! ${result.newReceipts} new receipts found.`);
            const updatedReceipts = await window.electronAPI.getReceipts();
            setReceipts(updatedReceipts);
        } catch (error) {
            console.error("Sync failed:", error);
            alert("Sync failed. Please check your connection and try again.");
        } finally {
            setSyncing(false);
        }
    };

    if (loading) {
        return <div className="loading-screen"><h1>Rideshare Receipts</h1><p>Initializing and authenticating...</p></div>;
    }

    return (
        <div className="container">
            <header className="app-header">
                <h1>Rideshare Receipts</h1>
                <div className="header-controls">
                    <span>Logged in as: <strong>{user?.email}</strong></span>
                    <button onClick={handleSync} disabled={syncing}>
                        {syncing ? 'Syncing...' : 'Sync Receipts'}
                    </button>
                </div>
            </header>
            <main>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Vendor</th>
                            <th>Total</th>
                            <th>Tip</th>
                            <th>Start Location</th>
                            <th>End Location</th>
                        </tr>
                    </thead>
                    <tbody>
                        {receipts.length > 0 ? (
                            receipts
                                .sort((a, b) => new Date(b.date) - new Date(a.date))
                                .map((receipt, index) => (
                                    <tr key={receipt.messageId || index}>
                                        <td>{new Date(receipt.date).toLocaleDateString()}</td>
                                        <td>{receipt.vendor}</td>
                                        <td>${receipt.total.toFixed(2)}</td>
                                        <td>${receipt.tip.toFixed(2)}</td>
                                        <td>{receipt.startLocation?.city || 'N/A'}</td>
                                        <td>{receipt.endLocation?.city || 'N/A'}</td>
                                    </tr>
                                ))
                        ) : (
                            <tr>
                                <td colSpan="6">No receipts found. Click "Sync Receipts" to get started.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </main>
        </div>
    );
}

export default App;