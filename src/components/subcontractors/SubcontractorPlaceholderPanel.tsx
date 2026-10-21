import { cardClass } from "@/lib/ui-classes";

export default function SubcontractorPlaceholderPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className={`${cardClass} p-8`}>
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </section>
  );
}
