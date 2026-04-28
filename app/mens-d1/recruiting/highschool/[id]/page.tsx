// app/mens-d1/recruiting/highschool/[id]/page.tsx
//
// Legacy URL handler. Looks up which unified profile contains the given
// source-row id and 308-redirects to the canonical /profile/[slug] URL.
//
// If no unified profile contains that id (shouldn't happen after the
// matching workflow has run), shows a "Player not found" fallback.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import SiteNavigation from '@/components/SiteNavigation';
import unifiedProfiles from '@/lib/recruiting/unified_profiles_men.json';

const MUTED = '#6B7E9A';

type Source = { player_id: number };
type Profile = { unified_id: string; sources: Source[] };

export default async function LegacyProfileRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = parseInt(id, 10);
  if (Number.isFinite(numericId)) {
    const match = (unifiedProfiles.profiles as Profile[]).find(p =>
      p.sources?.some(s => s.player_id === numericId)
    );
    if (match) {
      redirect(`/mens-d1/recruiting/profile/${match.unified_id}`);
    }
  }

  return (
    <>
      <SiteNavigation currentDivision="mens-d1" currentPage="recruiting" divisionPath="/mens-d1" />
      <main style={{ padding: 40, textAlign: 'center', fontFamily: "'Outfit', sans-serif" }}>
        <p style={{ color: MUTED, marginBottom: 16 }}>Player not found.</p>
        <Link href="/mens-d1/recruiting/highschool" style={{ color: '#3B9EFF', textDecoration: 'none' }}>
          ← Back to Recruiting Database
        </Link>
      </main>
    </>
  );
}
