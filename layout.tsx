export const metadata = {
  title: "Women’s KenPom (Beta)",
  description: "Women’s college basketball efficiency ratings (beta).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui" }}>{children}</body>
    </html>
  );
}
