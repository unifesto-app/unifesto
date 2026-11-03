import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";
import LoginClient from "@/app/(public)/login/LoginClient";
import { mockApi, status } from "./api";

test("login emails a code, signs in with it and moves on to next", async () => {
  const { calls } = mockApi({
    // Signed out until the code's refresh token is handed over.
    "POST /auth/session": (body) =>
      (body as { refreshToken?: string } | null)?.refreshToken
        ? { accessToken: "tok", email: "asha@example.com", fullName: "Asha Rao" }
        : status(401),
    "POST /auth/email": {},
    "POST /auth/email/verify": { accessToken: "code-tok", refreshToken: "refresh", user: { fullName: "Asha Rao" } },
  });

  // A hash target: jsdom can follow it, so the redirect is observable.
  render(<LoginClient next="#signed-in" />);

  fireEvent.change(await screen.findByRole("textbox", { name: "Email" }), { target: { value: "asha@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Verification code" }), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

  await waitFor(() => expect(location.hash).toBe("#signed-in"));
  expect(calls.find((c) => c.path === "/auth/email")?.body).toEqual({ email: "asha@example.com" });
  expect(calls.find((c) => c.path === "/auth/email/verify")?.body).toEqual({ email: "asha@example.com", otp: "123456" });
});
