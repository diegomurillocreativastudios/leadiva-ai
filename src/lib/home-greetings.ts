export const NEW_HOME_SEARCH_EVENT = "leadiva:new-search";
/** Set before navigating home so the hero search input can focus after remount. */
export const FOCUS_HOME_SEARCH_FLAG = "leadiva:focus-home-search";

const HOME_GREETING_TEMPLATES = [
  (name: string) => (name ? `Hola ${name}. ¿Ya ready?` : "Hola. ¿Ya ready?"),
  (name: string) =>
    name
      ? `Hey, que bueno que volviste ${name}.`
      : "Hey, que bueno que volviste.",
  (name: string) =>
    name
      ? `¿En que te puedo hechar la mano, ${name}?`
      : "¿En que te puedo hechar la mano?",
  () => "Demole con todo",
  () => "¿Que tenes pensado buscar ahora?",
] as const;

export const HOME_GREETING_COUNT = HOME_GREETING_TEMPLATES.length;

export function formatHomeGreeting(
  index: number,
  userName: string,
): string {
  const normalizedName = userName.trim();
  const safeIndex =
    ((index % HOME_GREETING_COUNT) + HOME_GREETING_COUNT) % HOME_GREETING_COUNT;
  return HOME_GREETING_TEMPLATES[safeIndex]!(normalizedName);
}

export function pickHomeGreetingIndex(
  random: () => number = Math.random,
): number {
  return Math.floor(random() * HOME_GREETING_COUNT);
}

export function pickHomeGreeting(userName: string): string {
  return formatHomeGreeting(pickHomeGreetingIndex(), userName);
}
