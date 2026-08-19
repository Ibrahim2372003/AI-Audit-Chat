import "./globals.css";

export const metadata = {
  title: "SEO Audit — Chat",
  description: "Paste a URL or page content and get a streamed SEO audit.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="h-dvh overflow-hidden">{children}</body>
    </html>
  );
}
