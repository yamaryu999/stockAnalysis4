import messages from "@/i18n/ja.json";

type Messages = typeof messages;

type Path<T> = T extends string
  ? []
  : {
      [K in keyof T]: [K, ...Path<T[K]>];
    }[keyof T];

function getValue(obj: unknown, path: string[]): string | undefined {
  return path.reduce<unknown>((acc, key) => {
    if (typeof acc === "object" && acc && key in acc) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (acc as any)[key];
    }
    return undefined;
  }, obj) as string | undefined;
}

export function t(path: string): string {
  const parts = path.split(".");
  const value = getValue(messages, parts);
  if (typeof value === "string") {
    return value;
  }
  return path;
}

export type TranslationPath = Path<Messages> extends Array<infer P>
  ? P extends string
    ? P
    : string
  : string;
