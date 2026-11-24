import { Suspense } from "react";
import { WatchClient } from "./WatchClient";

export const metadata = { title: "Watching — Death in the Family" };

export default function WatchPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
      <WatchClient />
    </Suspense>
  );
}
