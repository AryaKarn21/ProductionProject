import { useState } from "react";
import { cn, getInitials, getFileUrl } from "@/lib/utils";

// Size classes for the avatar circle
const sizeMap = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-20 h-20 text-2xl",
};

export default function Avatar({ src, name = "", size = "md", className }) {
  const [imgError, setImgError] = useState(false);
  const dimensions = sizeMap[size] || sizeMap.md;
  const resolvedSrc = getFileUrl(src);
  const showImage = resolvedSrc && !imgError;

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full overflow-hidden font-semibold shrink-0 select-none",
        dimensions,
        className
      )}
      style={
        showImage
          ? undefined
          : { background: "var(--primary-bg, #e0e7ff)", color: "var(--primary, #4f46e5)" }
      }
    >
      {showImage ? (
        <img
          src={resolvedSrc}
          alt={name || "avatar"}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}