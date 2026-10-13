import { connection } from "next/server";
import { Suspense } from "react";
import { ContentCalendar } from "./content-calendar";

// The calendar depends on today's date, so it renders at request time.
async function Live() {
  await connection();
  return <ContentCalendar />;
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="glass h-96 animate-pulse rounded-3xl" />}>
      <Live />
    </Suspense>
  );
}
