"use client";

import { NeonAuthUIProvider } from "@neondatabase/auth/react/ui";
import { authClient } from "@/lib/auth/client";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NeonAuthUIProvider
      authClient={authClient}
      basePath="/auth"
      redirectTo="/"
      defaultTheme="light"
      credentials={{ forgotPassword: true }}
      emailVerification
      signUp={{ fields: ["name"] }}
      account={{ fields: ["image", "name"] }}
    >
      {children}
    </NeonAuthUIProvider>
  );
}
