// app/mens-d1/recruiting/page.tsx
//
// Landing page for /mens-d1/recruiting — now that Transfers, JUCO, and
// High School each live at their own URL, this page just redirects to
// the default sub-section (Transfers, mirroring the original default).
//
// Old URLs that included ?tab=highschool also redirect to the right place.

import { redirect } from 'next/navigation';

export default async function RecruitingLanding({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  if (sp.tab === 'highschool') {
    redirect('/mens-d1/recruiting/highschool');
  }
  if (sp.tab === 'juco') {
    redirect('/mens-d1/recruiting/juco');
  }
  redirect('/mens-d1/recruiting/transfers');
}
