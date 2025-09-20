"use client";

import type { SignupFormData } from "@/app/api/auth/signup/route";
import { confirm } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1),
  role: z.enum(["USER", "COMPANY"]),
  companyName: z.string().optional(),
  passwordConfirm: z.string().min(6)
});

const ROLES = [
  { value: "USER", label: "User" },
  { value: "COMPANY", label: "Company" }
];

export default function SignupForm() {
  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      password: "",
      displayName: "",
      role: "USER",
      companyName: undefined,
      passwordConfirm: ""
    }
  });

  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();

  const handleSignup = async (data: SignupFormData) => {
    const ok = await confirm({
      title: "Signup Confirm",
      desc: "Are you sure you want to signup?",
      confirmText: "Signup",
      cancelBtnText: "Cancel"
    });

    if (!ok) return;

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error("Signup failed");
      }

      const result = await response.json();

      toast.success(`Signup has been successfully completed`);
      router.push("/company");
    } catch {
      toast.error("An error occurred while signing up.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Form {...form}>
        <form className="space-y-6">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="email">
                  Email <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input id="email" type="email" placeholder="Email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="password">
                  Password <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input id="password" type="password" placeholder="Password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="passwordConfirm"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="passwordConfirm">
                  Password Confirm <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input id="passwordConfirm" type="password" placeholder="Password Confirm" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="displayName"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="displayName">
                  Display Name <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input id="displayName" type="text" placeholder="Display Name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="role">
                  Role <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Select
                    value={form.watch("role") || ""}
                    onValueChange={(value) => form.setValue("role", value as "USER" | "COMPANY")}
                  >
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {form.watch("role") === "COMPANY" && (
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="companyName">
                    Company Name <span className="text-red-500">*</span> (Only for Company)
                  </FormLabel>
                  <FormControl>
                    <Input id="companyName" type="text" placeholder="Company Name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <Button
            type="button"
            className="w-full"
            onClick={() => {
              form.handleSubmit((data) => {
                handleSignup(data);
              })();
            }}
            disabled={isLoading}
          >
            {isLoading ? "Signing up..." : "Sign up"}
          </Button>
        </form>
      </Form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link href="/login" className="text-blue-500">
          Login
        </Link>
      </p>
    </>
  );
}
