import Logo from "@/components/icons/logo";
import { Button } from "@/components/ui/button";
import decoTexture from "@/public/images/deco-text.png";
import landingPageBg from "@/public/images/landing-page-bg.png";
import landingPageText from "@/public/images/landing-title.svg";
import { ArrowRightIcon } from "lucide-react";
import Image from "next/image";

export default function LandingScreen() {
  return (
    <div className="fixed inset-0 flex h-screen w-screen flex-col items-center justify-center">
      <Logo className="absolute top-7 left-1/2 z-2 size-22 -translate-x-1/2 fill-white" />
      <Image
        src={decoTexture}
        alt="all layers"
        width={1247}
        height={200}
        className="absolute top-20 left-1/2 z-2 -translate-x-1/2"
      />
      <div className="relative z-2">
        <Image src={landingPageText} alt="landing-page-text" width={1200} height={200} className="" />
        <p className="mt-20 text-center text-3xl leading-[1.5] text-white">
          All layers are welcome, <br />
          because design knows no limits
        </p>
        <div className="mx-auto mt-12 flex justify-center">
          <Button className="font-suit bg-background text-foreground hover:bg-background/80 h-22 w-full max-w-[565px] cursor-pointer rounded-none text-2xl font-bold">
            WALK WITH US <ArrowRightIcon className="size-6" />
          </Button>
        </div>
      </div>
      <Image src={landingPageBg} alt="landing-page-bg" sizes="100vw" fill className="z-1 object-cover" />
    </div>
  );
}
