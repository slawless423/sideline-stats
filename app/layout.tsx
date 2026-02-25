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
      </body>
    </html>
  );
}
