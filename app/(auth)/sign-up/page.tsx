import loginBg from "@/public/images/login-left.png";
import Image from "next/image";
import SignupForm from "../_components/SignupForm";

export default function SignUpPage() {
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
          <h3 className="font-classyvogue mb-8 text-center text-2xl font-bold">Welcome to Join Us</h3>
          <SignupForm />
        </div>
      </div>
    </section>
  );
}
