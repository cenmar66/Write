import { connection } from "next/server";
import { Suspense } from "react";
import { PostsHome } from "./posts-home";

// Shows what's due now, so it renders at request time.
async function Live({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await connection();
  const { tab } = await searchParams;
  return <PostsHome initialTab={tab} />;
}

export default function PostsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  return (
    <Suspense fallback={<div className="glass h-96 animate-pulse rounded-3xl" />}>
      <Live searchParams={searchParams} />
    </Suspense>
  );
}
