import ScanAssetPageClient from "@/components/assets/ScanAssetPageClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ScanAssetPage({ params }: PageProps) {
  const { id } = await params;
  return <ScanAssetPageClient assetId={id} />;
}
