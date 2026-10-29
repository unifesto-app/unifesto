import { ImageResponse } from "next/og";
import { verifyCertificate } from "@/lib/api/certificates";
import { OG_SIZE, OgCard, fetchImageAsDataUrl, loadOgBase } from "@/lib/og";

export const alt = "Certificate on Unifesto";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;

interface Props {
  params: Promise<{ code: string }>;
}

export default async function Image({ params }: Props) {
  const { code } = await params;
  const cert = await verifyCertificate(code).catch(() => null);
  const [art, base] = await Promise.all([fetchImageAsDataUrl(cert?.imageUrl), loadOgBase()]);

  return new ImageResponse(
    (
      <OgCard
        wordmark={base.wordmark}
        kind={!cert ? "Certificate" : cert.valid ? "Verified certificate" : "Revoked certificate"}
        title={cert?.recipientName ?? "Certificate not found"}
        subtitle={cert ? cert.eventTitle : null}
        meta={[cert && `Issued by ${cert.issuer}`, cert && `No. ${cert.certificateNumber}`]}
        // Certificates are landscape A4-ish; letterbox rather than crop.
        image={cert ? art : undefined}
        imageFit="contain"
      />
    ),
    { ...size, fonts: base.fonts },
  );
}
