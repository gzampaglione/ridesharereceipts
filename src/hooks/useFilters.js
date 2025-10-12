import { useState, useMemo } from "react";

export function useFilters(receipts) {
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    location: "",
    vendors: { Uber: true, Lyft: true, Curb: true, Amtrak: true },
    category: "all",
    billedStatus: "all",
  });

  const uniqueLocations = useMemo(() => {
    const locations = new Set();
    receipts.forEach((r) => {
      if (r.startLocation?.city)
        locations.add(
          `${r.startLocation.city}, ${r.startLocation.state || ""}`
        );
      if (r.endLocation?.city)
        locations.add(`${r.endLocation.city}, ${r.endLocation.state || ""}`);
    });
    return Array.from(locations).sort();
  }, [receipts]);

  const filteredReceipts = useMemo(() => {
    let filtered = [...receipts];

    if (filters.startDate) {
      filtered = filtered.filter(
        (r) => new Date(r.date) >= new Date(filters.startDate)
      );
    }

    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((r) => new Date(r.date) <= endDate);
    }

    if (filters.location) {
      const loc = filters.location.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          `${r.startLocation?.city}, ${
            r.startLocation?.state || ""
          }`.toLowerCase() === loc ||
          `${r.endLocation?.city}, ${
            r.endLocation?.state || ""
          }`.toLowerCase() === loc
      );
    }

    const activeVendors = Object.keys(filters.vendors).filter(
      (v) => filters.vendors[v]
    );
    if (activeVendors.length < 4) {
      filtered = filtered.filter((r) => activeVendors.includes(r.vendor));
    }

    if (filters.category !== "all") {
      filtered = filtered.filter(
        (r) => r.category === (filters.category || null)
      );
    }

    if (filters.billedStatus !== "all") {
      filtered = filtered.filter(
        (r) => r.billed === (filters.billedStatus === "billed")
      );
    }

    return filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [receipts, filters]);

  return {
    filters,
    setFilters,
    uniqueLocations,
    filteredReceipts,
  };
}
