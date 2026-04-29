import { useEffect, useState } from "react";
import { getSystemResolvedThemeAppearance } from "../../../../theme/utils/themeAppearance";

export const useSystemResolvedTheme = (): "light" | "dark" => {
  const [systemResolvedTheme, setSystemResolvedTheme] = useState<"light" | "dark">(
    getSystemResolvedThemeAppearance,
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => {
      const nextTheme = media.matches ? "dark" : "light";
      setSystemResolvedTheme((currentTheme) =>
        currentTheme === nextTheme ? currentTheme : nextTheme,
      );
    };
    syncTheme();
    media.addEventListener("change", syncTheme);
    return () => media.removeEventListener("change", syncTheme);
  }, []);

  return systemResolvedTheme;
};
