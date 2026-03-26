import { Analytics } from '@vercel/analytics/react';
import Script from 'next/script';

export const metadata = {
  title: "Sideline Stats",
  description: "Advanced college basketball efficiency ratings and data-driven analytics.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui" }}>
        {children}
        <Analytics />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-8E9VLX2LRX"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-8E9VLX2LRX');
          `}
        </Script>
      </body>
    </html>
  );
}
