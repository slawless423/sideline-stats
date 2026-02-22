'use client';

import SiteNavigation from '@/components/SiteNavigation';

export default function TeamPageWithNav({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  return (
    <>
      <SiteNavigation 
        currentDivision="womens-d1"
        currentPage="rankings"
        divisionPath="/"
      />
      {children}
    </>
  );
}
