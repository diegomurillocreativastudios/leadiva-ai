import { describe, expect, it } from "vitest";

import {
  HOME_GREETING_COUNT,
  formatHomeGreeting,
  pickHomeGreetingIndex,
} from "@/lib/home-greetings";

describe("home-greetings", () => {
  it("formats greetings that include the user name", () => {
    expect(formatHomeGreeting(0, "Diego")).toBe("Hola Diego. ¿Ya ready?");
    expect(formatHomeGreeting(1, "Diego")).toBe(
      "Hey, que bueno que volviste Diego.",
    );
    expect(formatHomeGreeting(2, "Diego")).toBe(
      "¿En que te puedo hechar la mano, Diego?",
    );
  });

  it("formats greetings without a name placeholder", () => {
    expect(formatHomeGreeting(3, "Diego")).toBe("Demole con todo");
    expect(formatHomeGreeting(4, "Diego")).toBe(
      "¿Que tenes pensado buscar ahora?",
    );
  });

  it("falls back when the name is empty", () => {
    expect(formatHomeGreeting(0, "  ")).toBe("Hola. ¿Ya ready?");
  });

  it("picks an index inside the greeting range", () => {
    expect(pickHomeGreetingIndex(() => 0)).toBe(0);
    expect(pickHomeGreetingIndex(() => 0.999)).toBe(HOME_GREETING_COUNT - 1);
  });
});
