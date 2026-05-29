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
        <ScrollViewStyleReset />
      </head>
      <body style={{ backgroundColor: "black", margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
