import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Data, loadData } from "./data";
import "./styles.css";

function Root() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadData().then(setData, (e: unknown) => setError(String(e)));
  }, []);
  if (error)
    return (
      <div className="boot">
        <h1>Semantic Studio could not load its data</h1>
        <p>{error}</p>
        <p>
          The site reads <code>data/*.json</code> next to this page. Build them with <code>make studio</code> at the
          repository root, then reload.
        </p>
      </div>
    );
  if (!data)
    return (
      <div className="boot" aria-busy="true">
        <p>Loading the semantic layer&hellip;</p>
      </div>
    );
  return <App data={data} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
