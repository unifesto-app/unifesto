import CaseThread from "./CaseThread";

export default async function SupportCasePage({ params }: { params: Promise<{ id: string }> }) {
  return <CaseThread id={(await params).id} />;
}
