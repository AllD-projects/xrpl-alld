"use client";

import Eye from "@/components/icons/Eye";
import EyeSlash from "@/components/icons/EyeSlash";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

const EyeIcon = ({ visible }: { visible: boolean }) => {
  return visible ? <EyeSlash className="size-5 text-gray-500" /> : <Eye className="size-5 text-gray-500" />;
};

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1)
});

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        throw new Error("Login failed");
      }

      const result = await response.json();

      if (result?.ok) {
        toast.success(`Welcome!`);
        router.push("/company");
      } else {
        console.log("Login failed:", result);
        toast.error("Login failed");
      }
    } catch (error) {
      toast.error("Please check your login info");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="mt-8 space-y-6">
      <div className="space-y-3">
        <div className="group relative flex flex-col space-y-1 rounded-xl border border-gray-200 px-4 py-3 transition-all duration-150 focus-within:border-blue-500 focus-within:shadow-md">
          <label htmlFor="email" className="text-xs font-medium text-gray-500">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-none bg-transparent p-0 text-sm outline-none"
            placeholder="Email"
            autoComplete="email"
            required
          />
        </div>

        <div className="group relative flex flex-col space-y-1 rounded-xl border border-gray-200 px-4 py-3 transition-all duration-150 focus-within:border-blue-500 focus-within:shadow-md">
          <label htmlFor="password" className="text-xs font-medium text-gray-500">
            Password
          </label>
          <div className="flex items-center">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex-1 border-none bg-transparent p-0 text-sm outline-none"
              placeholder="Password"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-gray-400 hover:text-gray-600"
            >
              <EyeIcon visible={showPassword} />
            </button>
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Logging in..." : "Login"}
      </Button>
      <p className="text-center text-sm text-gray-500">
        Don't have an account?{" "}
        <Link href="/sign-up" className="text-blue-500">
          Sign up
        </Link>
      </p>
    </form>
  );
}
