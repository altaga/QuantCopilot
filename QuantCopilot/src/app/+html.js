
import { ScrollViewStyleReset } from "expo-router/html";

export default function Root({ children }) {
  return (
    <html lang="en" style={{ backgroundColor: "black" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        
        {/* Open Graph / Facebook / WhatsApp */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Quant Copilot | HFT Arbitrage Engine" />
        <meta property="og:description" content="Institutional-grade high-frequency trading dashboard. Real-time arbitrage detection and execution with zero latency." />
        <meta property="og:image" content="/assets/logoBN.png" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Quant Copilot | HFT Arbitrage Engine" />
        <meta name="twitter:description" content="Institutional-grade high-frequency trading dashboard. Real-time arbitrage detection and execution with zero latency." />
        <meta name="twitter:image" content="/assets/logoBN.png" />

        <title>Quant Copilot</title>
        <ScrollViewStyleReset />
      </head>
      <body style={{ backgroundColor: "black", margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
