import Image from "next/image";
import { SITE } from "@/lib/site";
import GooglePlayBadge from "@/app/assets/svg/GetItOnGooglePlay_Badge_Web_color_English.svg";
import AppStoreBadge from "@/app/assets/svg/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg";

/* The two official store badges, linking to the Unifesto app. */
export default function StoreBadges({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-4 ${className}`}>
      <a href={SITE.appStore} aria-label="Download Unifesto on the App Store">
        <Image src={AppStoreBadge} alt="" className="h-11 w-auto" />
      </a>
      <a href={SITE.playStore} aria-label="Get Unifesto on Google Play">
        <Image src={GooglePlayBadge} alt="" className="h-11 w-auto" />
      </a>
    </div>
  );
}
