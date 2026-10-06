import type { Metadata } from "next";
import { LegalPage } from "@/components/ui/legal";

export const metadata: Metadata = { title: "Lockette — terms" };

export default function Terms() {
  return (
    <LegalPage
      title="Terms"
      updated="Oct 2026"
      sections={[
        {
          heading: "A prototype",
          body: (
            <p>
              Lockette is a working prototype made for a student entrepreneurship competition. It may get things wrong,
              go offline, or change without notice.
            </p>
          ),
        },
        {
          heading: "Not a medical device",
          body: (
            <p>
              Lockette reminds you of things you or your family set up. It does not give medical advice, check your
              health or manage medication. Always follow your doctor and pharmacist.
            </p>
          ),
        },
        {
          heading: "Not an emergency service",
          body: (
            <p>
              Lockette cannot call 911 and does not detect falls. In an emergency, call 911 from a phone or use a
              medical alert device.
            </p>
          ),
        },
        {
          heading: "Answers come from AI",
          body: (
            <p>
              Answers are written by an AI model and looked up online. They can be wrong or out of date, so check
              anything important.
            </p>
          ),
        },
      ]}
    />
  );
}
