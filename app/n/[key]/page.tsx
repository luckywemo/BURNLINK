import { Suspense } from "react";
import NoteClient from "./NoteClient";

async function Inner({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <NoteClient noteKey={key} />;
}

export default function NotePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-16">
          <p className="text-zinc-400">Loading…</p>
        </main>
      }
    >
      <Inner params={params} />
    </Suspense>
  );
}
