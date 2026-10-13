import { connection } from "next/server";
import { Suspense } from "react";
import { PostsHome } from "./posts-home";

// Shows what's due now, so it renders at request time.
async function Live() {
  await connection();
  return <PostsHome />;
}

export default function PostsPage() {
  return (
    <Suspense fallback={<div className="glass h-96 animate-pulse rounded-3xl" />}>
      <Live />
    </Suspense>
  );
}
