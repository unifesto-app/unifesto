/*
 * T11 one-off backfill: Razorpay's fee and GST (gateway_fee_paise,
 * gateway_tax_paise) on sales paid before the payment.captured webhook started
 * stamping them. Reads each payment from Razorpay's payments API and stamps it
 * through the same stampGatewayFee the webhook and reconcile use, which only
 * fills empty columns: safe to re-run, and to run while the app is live.
 *
 * Dry run by default — prints what it would stamp and the totals:
 *   npx ts-node -T scripts/backfill-gateway-fees.ts
 * Do it:
 *   npx ts-node -T scripts/backfill-gateway-fees.ts --apply
 * Options:
 *   --concurrency=5   parallel Razorpay reads (default 5)
 *
 * Needs DATABASE_URL, RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (read from
 * backend/.env if present).
 */
import 'dotenv/config';
import { PaymentStatus, PrismaClient } from '@prisma/client';
import Razorpay from 'razorpay';
import { razorpayErrorText, stampGatewayFee } from '../src/payments/payments.service';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const concurrency = Number(args.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? 5) || 5;

/** Captured sales whose payment has no gateway fee yet. */
const UNSTAMPED = {
  paymentId: { startsWith: 'pay_' },
  gatewayFeePaise: null,
  paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED] },
};

async function main() {
  const prisma = new PrismaClient();
  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });
  try {
    const select = { paymentId: true } as const;
    const [regs, seats] = await Promise.all([
      prisma.eventRegistration.findMany({ where: UNSTAMPED, select }),
      prisma.groupSeatPurchase.findMany({ where: UNSTAMPED, select }),
    ]);
    const ids = [...new Set([...regs, ...seats].map((r) => r.paymentId!))];
    console.log(`${ids.length} paid sales without a gateway fee${apply ? '' : ' (dry run, --apply to write)'}`);

    let stamped = 0;
    let feePaise = 0;
    let taxPaise = 0;
    const skipped: string[] = [];
    for (let i = 0; i < ids.length; i += concurrency) {
      await Promise.all(
        ids.slice(i, i + concurrency).map(async (id) => {
          try {
            const p = await razorpay.payments.fetch(id);
            if (p.fee == null) {
              skipped.push(`${id}: no fee on Razorpay (${p.status})`);
              return;
            }
            // Razorpay's fee includes its GST, so the fee total is the whole charge.
            feePaise += Number(p.fee);
            taxPaise += Number(p.tax ?? 0);
            stamped += apply ? await stampGatewayFee(prisma, { id, fee: p.fee, tax: p.tax }) : 1;
          } catch (err) {
            skipped.push(`${id}: ${razorpayErrorText(err) ?? (err instanceof Error ? err.message : String(err))}`);
          }
        }),
      );
      console.log(`  ${Math.min(i + concurrency, ids.length)}/${ids.length}`);
    }

    console.log(`${apply ? 'Stamped' : 'Would stamp'} ${stamped} sales`);
    console.log(`  Razorpay charged ₹${(feePaise / 100).toFixed(2)}, of which GST ₹${(taxPaise / 100).toFixed(2)}`);
    if (skipped.length) {
      console.log(`Skipped ${skipped.length} (left empty; a re-run retries them):`);
      for (const s of skipped) console.log(`  ${s}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
