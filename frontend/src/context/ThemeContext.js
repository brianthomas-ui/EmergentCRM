import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

const ThemeContext = createContext();
export const useTheme = () => useContext(ThemeContext);

const STORAGE_KEY = "crm_theme";

function readInitial() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch (e) {
    return "dark";
  }
}

// Apply ASAP (on module import) to minimize first-paint flash.
const _initial = readInitial();
document.documentElement.setAttribute("data-theme", _initial);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(_initial);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { console.warn("Theme persist failed:", e); }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme, setTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
