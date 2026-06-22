"use client";

import { ScanBarcode } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

export type FoodAvatarLog = {
  imageUrl?: string | null;
};

export function FoodAvatar({ log }: { log: FoodAvatarLog }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = failed ? null : log.imageUrl;

  return (
    <div className="food-thumb grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[8px] bg-[var(--surface-strong)]">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          width={48}
          height={48}
          unoptimized
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain p-0.5"
        />
      ) : (
        <ScanBarcode className="h-5 w-5" />
      )}
    </div>
  );
}
