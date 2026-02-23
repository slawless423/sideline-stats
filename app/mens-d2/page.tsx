'use client';

import SiteNavigation from "@/components/SiteNavigation";

export default function MensD2HomePage() {
  return (
    <>
      <SiteNavigation 
        currentDivision="mens-d2"
        currentPage="rankings"
        divisionPath="/mens-d2"
      />
      
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 16 }}>
          Men's D2 Basketball Rankings
        </h1>
        
        <div style={{ 
          padding: 40, 
          textAlign: "center", 
          background: "#f9fafb", 
          borderRadius: 8,
          border: "2px dashed #d1d5db"
        }}>
          <p style={{ fontSize: 18, color: "#666", marginBottom: 16 }}>
            Coming Soon!
          </p>
          <p style={{ fontSize: 14, color: "#9ca3af" }}>
            Men's D2 basketball data will be added here. The structure is ready - just need to connect the data source.
          </p>
        </div>
      </main>
    </>
  );
}
