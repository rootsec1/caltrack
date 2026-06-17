# Caltrack

A mobile-first calorie journal built around barcode scanning. Scan a packaged item, confirm the nutrition label, and save it to a flat daily timeline.

Caltrack keeps the input model intentionally small: barcode scan only. If Open Food Facts does not have nutrition data for the scanned barcode, the same review sheet opens with editable blank fields so the user can fill the label details.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS
- Better Auth for email/password auth
- Drizzle ORM with local SQLite/libSQL for development
- Turso/libSQL for cheap Vercel production storage
- Open Food Facts for free barcode nutrition lookup and product images
- ZXing browser scanner with an opportunistic native `BarcodeDetector` fast path

## Local Development

```bash
npm install
cp .env.example .env.local
openssl rand -base64 32
npm run db:migrate
npm run dev
```

Set the generated secret as `BETTER_AUTH_SECRET` in `.env.local`.

Open [http://localhost:3000](http://localhost:3000).

## Database

Local development uses a libSQL-compatible SQLite file at `.data/caltrack.db`.

```bash
npm run db:generate
npm run db:migrate
```

If you already have cached barcode products or food logs without images, run:

```bash
npm run db:backfill-images
```

## Environment

Required locally:

- `DATABASE_URL=file:./.data/caltrack.db`
- `BETTER_AUTH_URL=http://localhost:3000`
- `BETTER_AUTH_SECRET`
- `OPENFOODFACTS_USER_AGENT=Caltrack/1.0 (you@example.com)`

Required on Vercel with Turso:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL` or `NEXT_PUBLIC_BETTER_AUTH_URL`
- `OPENFOODFACTS_USER_AGENT`

## Deploy

The intended low-cost deployment target is Vercel plus Turso:

1. Create a Turso database.
2. Set the Vercel environment variables listed above.
3. Run migrations against Turso with `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` set.
4. Deploy the Next.js app to Vercel.

## Privacy

- Product photos are not accepted or stored.
- Barcode lookup data is cached locally in `product_cache` to avoid repeated Open Food Facts calls.
- Food logs are scoped to the authenticated user.
- Secrets belong in environment variables only. Do not commit `.env.local`, `.data`, `.next`, or `node_modules`.

## Commands

```bash
npm run lint
npm test
npm run build
npm run db:generate
npm run db:migrate
npm run db:backfill-images
```

## License

MIT
