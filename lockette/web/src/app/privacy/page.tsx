import type { Metadata } from "next";
import { LegalPage } from "@/components/ui/legal";

export const metadata: Metadata = { title: "Lockette — privacy" };

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy"
      updated="Oct 2026"
      sections={[
        {
          heading: "The short version",
          body: (
            <>
              <p>
                Lockette is a student prototype. It only listens after its button is pressed. What it hears is used to
                answer, and for nothing else. No ads, and we never sell data.
              </p>
            </>
          ),
        },
        {
          heading: "What happens when you press the button",
          body: (
            <ul>
              <li>
                <strong>Your voice</strong> is turned into text by Google&apos;s speech recognition.
              </li>
              <li>
                <strong>The text</strong> goes to Anthropic&apos;s Claude, which writes the answer.
              </li>
              <li>
                <strong>Weather</strong> comes from Open-Meteo, which is sent the name of your town.
              </li>
              <li>
                <strong>Other lookups</strong> (news, opening hours) use Claude&apos;s web search.
              </li>
              <li>
                <strong>The spoken answer</strong> is made by Google&apos;s text-to-speech.
              </li>
            </ul>
          ),
        },
        {
          heading: "What is kept, and where",
          body: (
            <>
              <p>
                The conversation history and settings (name, town, family names, reminders) are saved on the Lockette
                device itself, in your home. They are not uploaded to a Lockette server, because there isn&apos;t one.
              </p>
              <p>
                Anyone on your home Wi-Fi who opens the Lockette dashboard can see the conversation history. The Clear
                button on the dashboard deletes it.
              </p>
            </>
          ),
        },
        {
          heading: "Recording other people",
          body: (
            <p>
              Lockette does not record doctor visits or phone calls. If that is ever added, it will ask permission
              first and announce itself, because many states require everyone&apos;s consent to be recorded.
            </p>
          ),
        },
        {
          heading: "Questions",
          body: <p>Ask the team that built your Lockette. This page will be replaced by a full policy before launch.</p>,
        },
      ]}
    />
  );
}
