import './globals.css';

export const metadata = {
  title: 'Keller — Browser-Native RTL Compiler',
  description: 'Zero-installation, browser-based RTL synthesis and simulation sandbox. Write Verilog, synthesize with Yosys, simulate with Icarus — entirely in your browser.',
  keywords: ['RTL', 'Verilog', 'synthesis', 'simulation', 'EDA', 'Yosys', 'ASIC', 'FPGA'],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-keller-bg text-keller-text font-mono antialiased">
        {children}
      </body>
    </html>
  );
}
