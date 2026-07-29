"use client";

import { useState } from "react";

export function ShareReceipt() {
  const [label, setLabel] = useState("COPY RECEIPT LINK");

  const copy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setLabel("LINK COPIED");
    window.setTimeout(() => setLabel("COPY RECEIPT LINK"), 1800);
  };

  return (
    <button type="button" className="primaryAction" onClick={copy}>
      {label}
    </button>
  );
}
