import { redirect } from "next/navigation";
import OrganisationAssetsClient from "@/components/assets/OrganisationAssetsClient";
import { parseAssetCategorySlug } from "@/lib/assets";

interface PageProps {
  params: Promise<{ category: string }>;
}

export default async function OrganisationAssetCategoryPage({ params }: PageProps) {
  const { category } = await params;
  const parsed = parseAssetCategorySlug(category);
  if (!parsed) {
    redirect("/organisation/assets");
  }

  return <OrganisationAssetsClient initialCategory={parsed} />;
}
