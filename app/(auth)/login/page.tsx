"use client";

import Logo from "@/components/icons/logo";
import loginBg from "@/public/images/login-left.png";
import Image from "next/image";
import { useState } from "react";
import LoginForm from "../_components/LoginForm";

export default function LoginPage() {
  const [isFirstVisit, setIsFirstVisit] = useState(false);

  return (
    <section className="flex min-h-screen">
      <div className="relative w-[calc(100vw-48rem)] overflow-hidden bg-black">
        <Image
          src={loginBg}
          alt="login-bg"
          width={1200}
          height={1000}
          className="absolute bottom-0 left-1/2 -translate-x-1/2"
        />
      </div>
      <div className="flex w-3xl items-center justify-center">
        <div className="w-full max-w-[492px]">
          <Logo className="fill-foreground mx-auto size-22" />
          <LoginForm />
        </div>
      </div>
    </section>
  );
}
