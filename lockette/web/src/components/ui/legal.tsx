"use client";

import Link from "next/link";
import { CornerControls, CornerName, DevGrid, LoginButton, useGridToggle } from "./chrome";

/** A plain, readable page for Privacy and Terms, in the site's frame. */
export function LegalPage({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: { heading: string; body: React.ReactNode }[];
}) {
  const [grid, setGrid] = useGridToggle();
  return (
    <>
      <CornerControls action={<LoginButton />} />
      <CornerName grid={grid} onGrid={() => setGrid((g) => !g)} />
      <DevGrid on={grid} />
      <main className="mx-auto grid max-w-6xl grid-cols-12 gap-x-6 px-4 pt-32 pb-24 md:px-6">
        <div className="col-span-12 md:col-span-4">
          <p className="caption">last updated {updated}</p>
          <h1 className="display mt-3 text-[3.5rem] md:text-[4.5rem]">{title}</h1>
          <Link href="/" className="mt-6 inline-block text-base underline underline-offset-4 hover:text-accent">
            ← Back to Lockette
          </Link>
        </div>
        <div className="col-span-12 mt-10 flex flex-col gap-10 md:col-span-7 md:col-start-6 md:mt-0">
          {sections.map((s, i) => (
            <section key={s.heading} className="border-t border-ink pt-5">
              <p className="caption">{String(i + 1).padStart(2, "0")}</p>
              <h2 className="mt-1 text-[1.5rem] font-semibold">{s.heading}</h2>
              <div className="mt-3 flex flex-col gap-3 text-[1.125rem] leading-relaxed text-dim [&_li]:ml-5 [&_li]:list-[square] [&_strong]:text-ink">
                {s.body}
              </div>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
