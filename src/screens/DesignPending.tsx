import { useI18n } from "../i18n";
import { Callout, EmptyState, PageHeader } from "../ui/kit";

/** Shown while the design runs in the worker, or if it failed. */
export function DesignPending({ title, subtitle, error }: { title: string; subtitle: string; error?: string }) {
  const { lang } = useI18n();
  const bn = lang === "bn";
  return (
    <div className="screen">
      <PageHeader title={title} subtitle={subtitle} />
      {error !== undefined ? (
        <Callout tone="bad" title={bn ? "হিসাব করা যায়নি" : "The design could not be computed"}>{error}</Callout>
      ) : (
        <div role="status" aria-live="polite">
          <EmptyState title={bn ? "হিসাব চলছে…" : "Computing the design…"}>{bn ? "কাঠামো, রিবার ও পরিমাণ হিসাব করা হচ্ছে।" : "Working out the structure, bars and quantities."}</EmptyState>
        </div>
      )}
    </div>
  );
}
