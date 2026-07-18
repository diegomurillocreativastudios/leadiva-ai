export const NEW_HOME_SEARCH_EVENT = "leadiva:new-search";
/** Set before navigating home so the hero search input can focus after remount. */
export const FOCUS_HOME_SEARCH_FLAG = "leadiva:focus-home-search";

export type HomeGreetingParts = {
  before: string;
  name: string | null;
  after: string;
};

const HOME_GREETING_TEMPLATES = [
  (name: string): HomeGreetingParts =>
    name
      ? { before: "Hola ", name, after: ". ¿Ya ready?" }
      : { before: "Hola. ¿Ya ready?", name: null, after: "" },
  (name: string): HomeGreetingParts =>
    name
      ? { before: "Hey, que bueno que volviste ", name, after: "." }
      : { before: "Hey, que bueno que volviste.", name: null, after: "" },
  (name: string): HomeGreetingParts =>
    name
      ? {
          before: "¿En que te puedo hechar la mano, ",
          name,
          after: "?",
        }
      : { before: "¿En que te puedo hechar la mano?", name: null, after: "" },
  (): HomeGreetingParts => ({
    before: "Demole con todo",
    name: null,
    after: "",
  }),
  (): HomeGreetingParts => ({
    before: "¿Que tenes pensado buscar ahora?",
    name: null,
    after: "",
  }),
] as const;

export const HOME_GREETING_COUNT = HOME_GREETING_TEMPLATES.length;

function joinHomeGreetingParts(parts: HomeGreetingParts): string {
  return `${parts.before}${parts.name ?? ""}${parts.after}`;
}

export function formatHomeGreetingParts(
  index: number,
  userName: string,
): HomeGreetingParts {
  const normalizedName = userName.trim();
  const safeIndex =
    ((index % HOME_GREETING_COUNT) + HOME_GREETING_COUNT) % HOME_GREETING_COUNT;
  return HOME_GREETING_TEMPLATES[safeIndex]!(normalizedName);
}

export function formatHomeGreeting(
  index: number,
  userName: string,
): string {
  return joinHomeGreetingParts(formatHomeGreetingParts(index, userName));
}

export function pickHomeGreetingIndex(
  random: () => number = Math.random,
): number {
  return Math.floor(random() * HOME_GREETING_COUNT);
}

export function pickHomeGreetingParts(userName: string): HomeGreetingParts {
  return formatHomeGreetingParts(pickHomeGreetingIndex(), userName);
}

export function pickHomeGreeting(userName: string): string {
  return joinHomeGreetingParts(pickHomeGreetingParts(userName));
}
