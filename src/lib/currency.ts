/** Currencies offered in org settings and transaction forms. */
export const CURRENCIES = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "NIO", symbol: "C$", name: "Córdoba" },
  { code: "GTQ", symbol: "Q", name: "Quetzal" },
  { code: "HNL", symbol: "L", name: "Lempira" },
  { code: "CRC", symbol: "₡", name: "Colón" },
  { code: "MXN", symbol: "$", name: "Peso mexicano" },
  { code: "COP", symbol: "$", name: "Peso colombiano" },
  { code: "EUR", symbol: "€", name: "Euro" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);
