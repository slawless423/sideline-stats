'use client';

import SiteNavigation from '@/components/SiteNavigation';

export default function MensD2TeamPageWithNav({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  return (
    <>
      <SiteNavigation 
        currentDivision="mens-d2"
        currentPage="rankings"
        divisionPath="/mens-d2"
      />
      {children}
    </>
  );
}
