import type { LedState } from "@/components/device/device";

/**
 * Everything the page says, in one place. It describes what the prototype
 * really does today; anything planned is marked as planned. Quotes are the
 * team's own design rules, not made-up reviews.
 */

export const FEATURES: { title: string; body: string; quote: string; led: LedState; ledName: string }[] = [
  {
    title: "One button",
    body: "Press it and talk. No screen, no menus, no app to learn, no phone needed.",
    quote: "If it needs a manual, we haven't finished it.",
    led: "listening",
    ledName: "listening",
  },
  {
    title: "Ask it anything",
    body: "The weather, the news, what day it is, how to spell a word. It answers out loud, in plain words, and says where it looked.",
    quote: "Short answers, said kindly, every time.",
    led: "thinking",
    ledName: "thinking",
  },
  {
    title: "Reminders that speak",
    body: "Pills and appointments, said out loud at the right time. Family can set them from their own computer.",
    quote: "It reminds. It never gives medical advice.",
    led: "reminder",
    ledName: "reminder",
  },
  {
    title: "Speaks their language",
    body: "English, Mandarin, Cantonese and Spanish today, with more on the way. It listens and answers in the same one.",
    quote: "Nobody should have to switch languages to be helped.",
    led: "speaking",
    ledName: "speaking",
  },
  {
    title: "Family in the loop",
    body: "Family can see the conversations and change the settings from home. It gently warns about calls that sound like scams. Calling family with a long press is coming soon.",
    quote: "Peace of mind for them. Independence for you.",
    led: "allgood",
    ledName: "all good",
  },
];

export const INSIDE: { anchor: string; title: string; note: string }[] = [
  { anchor: "button", title: "One big button", note: "ringed with a soft light that shows what it's doing" },
  { anchor: "shell", title: "Smooth porcelain shell", note: "rounded all over, nothing sharp to catch" },
  { anchor: "board", title: "Two microphones, one clear speaker", note: "loud enough for a busy kitchen" },
  { anchor: "battery", title: "Battery", note: "days on a charge (design target)" },
  { anchor: "back", title: "Magnetic back", note: "clips to a cord, a lanyard, or the fridge" },
];

export const SPECS: { label: string; value: string; note: string }[] = [
  { label: "Size", value: "52 × 52 × 14 mm", note: "about a matchbox (design target)" },
  { label: "Weight", value: "About 40 g", note: "lighter than a set of keys (design target)" },
  { label: "Battery", value: "Days, not hours", note: "the desk prototype runs plugged in" },
  { label: "Connection", value: "Home Wi-Fi", note: "a version with its own mobile signal is planned" },
  { label: "Languages", value: "English · 普通话 · 粵語 · Español", note: "more on the way" },
  { label: "Listening", value: "Only after a press", note: "nothing leaves the device until you press the button" },
  { label: "In the box", value: "Lockette, cord, clip, charger", note: "planned for the first run" },
  { label: "Price", value: "Announced at launch", note: "with a simple family plan" },
];
