"use client";

import { useState } from "react";

export function ShareReceipt() {
  const [label, setLabel] = useState("COPY RECEIPT LINK");

  const copy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setLabel("LINK COPIED");
    window.setTimeout(() => setLabel("COPY RECEIPT LINK"), 1800);
  };

  const share = async () => {
    if (navigator.share)
      await navigator.share({
        title: "Saved by the Bell receipt",
        url: window.location.href,
      });
    else await copy();
  };

  const download = async () => {
    const response = await fetch(`${window.location.pathname}/opengraph-image`);
    if (!response.ok) throw new Error("Receipt image unavailable.");
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "saved-by-the-bell-receipt.png";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="shareReceiptActions">
      <button type="button" className="primaryAction" onClick={share}>
        SHARE RECEIPT
      </button>
      <button type="button" className="secondaryAction" onClick={copy}>
        {label}
      </button>
      <button
        type="button"
        className="secondaryAction"
        onClick={() => void download()}
      >
        DOWNLOAD IMAGE
      </button>
    </div>
  );
}
