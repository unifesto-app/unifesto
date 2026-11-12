import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import RegisterClient from "@/app/(public)/event/[slug]/register/RegisterClient";
import type { Event } from "@/lib/api/events";
import type { RegTicket } from "@/lib/api/registration";
import { mockApi } from "./api";

const nextWeek = Date.now() + 7 * 86_400_000;
const event = {
  id: "ev1",
  title: "Tech Fest 2026",
  slug: "tech-fest",
  status: "PUBLISHED",
  event_type: "IN_PERSON",
  start_date: new Date(nextWeek).toISOString(),
  end_date: new Date(nextWeek + 3_600_000).toISOString(),
  is_free: false,
} as Event;
const ticket: RegTicket = {
  id: "t1",
  name: "General",
  description: null,
  kind: "INDIVIDUAL",
  price: 499,
  totalQuantity: 100,
  soldCount: 0,
  saleStartsAt: null,
  saleEndsAt: null,
  waitlistEnabled: false,
};

test("a signed-in buyer pays for a ticket through Razorpay and gets it", async () => {
  const { calls } = mockApi({
    "POST /auth/session": { accessToken: "tok", email: "asha@example.com", fullName: "Asha Rao" },
    "GET /users/me": { ageConfirmedAt: "2026-01-01T00:00:00.000Z" },
    "GET /events/ev1/my-registrations": [],
    "GET /legal/pending": [],
    "POST /quote": { basePaise: 49900, couponDiscountPaise: 0, buyerFeePaise: 2000, totalPaise: 51900, feeAbsorbed: false },
    "POST /events/ev1/register/create-order": {
      registrationId: "reg1",
      razorpayOrderId: "order_1",
      razorpayKeyId: "rzp_test_key",
      amount: 51900,
      currency: "INR",
    },
    "POST /events/ev1/register/verify": { success: true },
  });
  // The checkout sheet: pays at once with a signed payment for the order it was opened on.
  const sheet = vi.fn(function (this: unknown, o: { order_id: string; handler: (p: unknown) => void }) {
    return {
      open: () =>
        o.handler({ razorpay_order_id: o.order_id, razorpay_payment_id: "pay_1", razorpay_signature: "sig" }),
    };
  });
  vi.stubGlobal("Razorpay", sheet);

  render(<RegisterClient event={event} tickets={[ticket]} fields={[]} />);

  fireEvent.click(await screen.findByRole("button", { name: "Pay ₹519" }));

  expect(await screen.findByRole("heading", { name: "You're in" })).toBeTruthy();
  expect(sheet).toHaveBeenCalledWith(expect.objectContaining({ key: "rzp_test_key", order_id: "order_1", amount: 51900 }));
  expect(calls.find((c) => c.path === "/events/ev1/register/create-order")?.body).toMatchObject({ ticketTypeId: "t1" });
  expect(calls.find((c) => c.path === "/events/ev1/register/verify")?.body).toEqual({
    registrationId: "reg1",
    razorpayOrderId: "order_1",
    razorpayPaymentId: "pay_1",
    razorpaySignature: "sig",
  });
});

test("an organiser-included fee shows as PF included with the listed total", async () => {
  mockApi({
    "POST /auth/session": { accessToken: "tok", email: "asha@example.com", fullName: "Asha Rao" },
    "GET /users/me": { ageConfirmedAt: "2026-01-01T00:00:00.000Z" },
    "GET /events/ev1/my-registrations": [],
    "GET /legal/pending": [],
    // Included: the quote's base is the price minus the fee, the total is the price.
    "POST /quote": { basePaise: 48019, couponDiscountPaise: 0, buyerFeePaise: 1881, totalPaise: 49900, feeAbsorbed: true },
  });
  render(<RegisterClient event={{ ...event, fee_included: true } as Event} tickets={[ticket]} fields={[]} />);

  expect(await screen.findByRole("button", { name: "Pay ₹499" })).toBeTruthy();
  expect(screen.getByText("PF included")).toBeTruthy();
  expect(screen.queryByText(/%/)).toBeNull();
});
