import type { Lesson } from "../types";
import { bug, lesson, mt, sc, sq, wbk } from "./dsl";

const P = (projectId: string, projectTitle: string) => ({
  kind: "guided_project" as const,
  projectId,
  projectTitle,
});

/** Guided project tracks: an online store, a two-sided marketplace and a booking platform. */
export const projectsCommerce: Lesson[] = [
  // ───────────────────────── Online store ─────────────────────────
  lesson(
    "store-1",
    "specs",
    "Online store, part 1: scope and data",
    "Decide what version one sells, and model products, carts and orders so money is never ambiguous.",
    "Stores fail on details: a price that changed after checkout, stock sold twice, an order nobody can find. Plan the data before the screens.",
    [
      sc(
        "store-1-a",
        1,
        "Which first release of the store is the right size?",
        "A founder wants coupons, reviews, wishlists, subscriptions and a loyalty program at launch.",
        [
          "Browse products, add to cart, check out, see my orders. Everything else is a ranked backlog.",
          "One complete buying loop proves demand and exposes the real problems early.",
        ],
        [
          [
            "Ship all five features so it looks complete.",
            "Large launches hide which part is working and delay learning from real shoppers.",
          ],
          [
            "Only a landing page with an email box.",
            "That tests interest, not whether people will actually buy and whether your checkout works.",
          ],
        ],
        "A store's core loop is browse, cart, pay, track. Launch that loop well, then let real orders tell you which extras matter.",
      ),
      mt(
        "store-1-b",
        2,
        "Which table owns each fact?",
        [
          ["products", "products"],
          ["orders", "orders"],
          ["items", "order_items"],
        ],
        {
          products: ["Current name and description", "Stock count"],
          orders: ["Which customer placed it", "Status: pending, paid, shipped"],
          items: [
            "The price paid for one line at the time of purchase",
            "Quantity bought of one product",
          ],
        },
        "Order lines copy the price at purchase time so later price changes never rewrite history; the product row only holds today's price.",
      ),
      bug(
        "store-1-c",
        2,
        "Tap the column design that will corrupt totals.",
        "schema.sql",
        [
          "create table products (",
          "  id uuid primary key,",
          "  name text not null,",
          "  price real not null,   -- 19.99",
          "  stock integer not null check (stock >= 0)",
          ");",
        ],
        [3],
        "Floating-point numbers cannot represent most decimal prices exactly, so sums drift by fractions of a cent. Store money as integer cents (1999) plus a currency code.",
      ),
      sc(
        "store-1-d",
        2,
        "A shopper changes the quantity in the URL to -3 and the price to 1 cent. What protects you?",
        "The checkout page posts { productId, quantity, price } to your API.",
        [
          "The server ignores any price from the client, looks it up itself, and validates quantity as a positive integer within stock.",
          "Clients are untrusted: only the server knows the real price and what is in stock.",
        ],
        [
          [
            "Hide the fields so users cannot edit them.",
            "Hidden fields and disabled inputs are trivially edited with browser tools or a script.",
          ],
          [
            "Trust the price; shoppers are honest.",
            "Price tampering is one of the oldest and easiest e-commerce attacks.",
          ],
        ],
        "Never accept prices, totals or discounts from the browser. Recompute everything on the server from your own data.",
      ),
      sq(
        "store-1-e",
        2,
        "Order the build plan you give your AI tool.",
        [
          "Tables: products, carts, orders, order_items with integer cents",
          "Row Level Security so shoppers see only their own carts and orders",
          "Server functions: price a cart, create an order",
          "Catalog and cart screens with loading, empty and error states",
          "Tests for pricing, stock and permissions",
        ],
        "Data and rules first, interface last. Each step is verifiable before the next depends on it.",
      ),
      wbk(
        "store-1-f",
        2,
        "Complete the RLS summary for shoppers.",
        "Catalog: readable by {{a}}. Carts and orders: readable and writable only by their {{b}}. Stock changes: only by {{c}} code.",
        { a: "everyone", b: "owner", c: "server" },
        ["admins", "guests"],
        "Public catalog, private customer data, and server-only inventory changes is the standard split for a store.",
      ),
      sc(
        "store-1-g",
        3,
        "How do you accept card payments safely in version one?",
        "You are tempted to collect card numbers in your own form to keep the design consistent.",
        [
          "Use a hosted payment provider's checkout or fields so card data never touches your servers, and learn the result through its verified webhook.",
          "Not handling card data keeps you out of the heaviest security obligations and uses battle-tested software.",
        ],
        [
          [
            "Store card numbers in your database encrypted.",
            "Holding card data creates serious security and compliance duties you do not want in version one.",
          ],
          [
            "Email the card details to the owner.",
            "Email is not secure storage and this would be a breach waiting to happen.",
          ],
        ],
        "Let a specialist handle card data. Your app records order state based on verified provider events, never on card details.",
      ),
    ],
    P("proj-store", "Online store"),
  ),
  lesson(
    "store-2",
    "backend",
    "Online store, part 2: cart, stock and checkout",
    "Build the checkout path so concurrent shoppers, retries and failures cannot oversell or double charge.",
    "Two people click 'Buy' on the last item at the same moment. The database, not hope, decides who gets it.",
    [
      bug(
        "store-2-a",
        3,
        "Tap the lines that let two buyers purchase the last item.",
        "checkout.ts",
        [
          "const p = await db.from('products').select('stock').eq('id', id).single();",
          "if (p.data.stock >= qty) {",
          "  await db.from('products').update({ stock: p.data.stock - qty }).eq('id', id);",
          "  await createOrder(userId, id, qty);",
          "}",
        ],
        [0, 1, 2],
        "Reading stock, checking it and writing it back are separate steps, so two requests can both pass the check. Decrement atomically in one statement (update ... set stock = stock - qty where stock >= qty) and check that a row changed.",
      ),
      sq(
        "store-2-b",
        2,
        "Order a safe checkout transaction.",
        [
          "Verify the session and load the cart from the database",
          "Recompute prices and totals on the server",
          "In one transaction decrement stock for each line (fail if any is short)",
          "Create the order and order lines with the prices used",
          "Hand the shopper to the payment provider with the order id",
        ],
        "Doing the stock change and the order creation in one transaction means a failure leaves nothing half-done.",
      ),
      sc(
        "store-2-c",
        3,
        "A shopper double-clicks Pay and two orders appear. How do you prevent it?",
        "The button disables after click, but a slow network let both requests through.",
        [
          "Give each checkout attempt an idempotency key and make order creation insert-or-return-existing on that key.",
          "The server guarantees one order per attempt no matter how many identical requests arrive.",
        ],
        [
          [
            "Tell shoppers to click once.",
            "Instructions do not prevent duplicate requests from retries and slow networks.",
          ],
          [
            "Delete duplicate orders every night.",
            "Cleaning up afterwards still lets customers see and possibly be charged twice.",
          ],
        ],
        "Anything that creates money-affecting records needs idempotency enforced on the server, ideally with a unique constraint.",
      ),
      mt(
        "store-2-d",
        2,
        "Which events should change an order's status?",
        [
          ["trust", "Trust and act"],
          ["ignore", "Do not act on it alone"],
        ],
        {
          trust: [
            "A signature-verified payment webhook from the provider",
            "An admin marking an order shipped in the admin portal",
          ],
          ignore: [
            "The browser redirecting to /success",
            "A client request claiming { status: 'paid' }",
          ],
        },
        "The success page can be visited by anyone. Only server-verified provider events and authorised staff actions are evidence of payment.",
      ),
      sc(
        "store-2-e",
        2,
        "The AI proposes calculating the cart total in the React component 'for speed'. What do you say?",
        "It also stores the total in the order it creates.",
        [
          "Display it there if you like, but the server must recompute the authoritative total when the order is created.",
          "The browser can show an estimate; only the server's calculation may be charged.",
        ],
        [
          [
            "Fine, the browser total is the source of truth.",
            "A tampered client would choose its own total.",
          ],
          [
            "Remove the cart total from the UI.",
            "Shoppers need to see totals; the fix is where the truth is computed, not hiding it.",
          ],
        ],
        "Separate presentation from authority: UI computes for display, the server computes for money.",
      ),
      wbk(
        "store-2-f",
        2,
        "Write the prompt for the stock rule.",
        "Decrement stock with a single {{a}} statement that only succeeds when stock is at least the quantity, inside a {{b}}, and add a test that runs two {{c}} purchases of the last item.",
        { a: "atomic", b: "transaction", c: "concurrent" },
        ["cosmetic", "daily", "manual"],
        "Naming atomicity, the transaction and a concurrency test in the prompt prevents the AI from writing the racy read-then-write version.",
      ),
      bug(
        "store-2-g",
        2,
        "Tap the line that exposes every customer's orders.",
        "policies.sql",
        [
          "alter table orders enable row level security;",
          'create policy "read orders" on orders for select to authenticated using (true);',
          'create policy "insert own" on orders for insert to authenticated with check (user_id = auth.uid());',
        ],
        [1],
        "using (true) lets any signed-in shopper read every order, including names and addresses. It should be using (user_id = auth.uid()).",
      ),
    ],
    P("proj-store", "Online store"),
  ),
  lesson(
    "store-3",
    "testing-verification",
    "Online store, part 3: prove it, launch it, run it",
    "Gather real evidence, publish the legal basics and watch orders after launch.",
    "Launch day is not the finish line. It is when real money starts depending on your checks.",
    [
      mt(
        "store-3-a",
        2,
        "Which test proves each risk is handled?",
        [
          ["unit", "Unit test"],
          ["db", "Real-database test"],
          ["e2e", "Browser journey"],
        ],
        {
          unit: ["Totals, tax-free rounding and discount maths", "Order status transition rules"],
          db: ["Two shoppers racing for the last item", "Shopper A cannot read shopper B's orders"],
          e2e: ["Browse, add to cart, check out and see the order listed"],
        },
        "Use the cheapest test that can catch the bug: pure logic needs unit tests, concurrency and RLS need a real database, and journeys need a real browser.",
      ),
      sc(
        "store-3-b",
        3,
        "The AI says 'all checkout tests pass'. What counts as evidence?",
        "You did not see a test run.",
        [
          "A CI run on this exact commit showing the checkout, stock and permission tests passing, linked from the project.",
          "Evidence is reproducible and tied to a commit; a claim is not.",
        ],
        [
          ["The AI's message.", "A model can describe results it never produced."],
          [
            "It worked once when I tried it.",
            "One manual success does not cover races, retries or other users.",
          ],
        ],
        "In BuildApps, 'verified' comes from evidence the system checked, not from someone saying it works.",
      ),
      sq(
        "store-3-c",
        2,
        "Order the pre-launch checklist.",
        [
          "Run the full test suite and the scanner on the release commit",
          "Test the whole purchase with the provider's test mode and a second account",
          "Publish privacy policy, terms and refund information",
          "Set up error alerts and an order dashboard",
          "Deploy to production and place a real low-value test order",
        ],
        "Test the journey end to end, publish the policies shoppers and providers expect, and make sure you will see problems before shoppers tell you.",
      ),
      bug(
        "store-3-d",
        2,
        "Tap the launch mistake.",
        "config.ts",
        [
          "export const config = {",
          "  paymentMode: 'test',",
          "  paymentSecret: process.env.PAYMENT_SECRET,",
          "  siteUrl: 'http://localhost:3000',",
          "};",
        ],
        [1, 3],
        "Production must use live mode and the real public URL, or shoppers cannot pay and provider callbacks go nowhere. Keep modes and URLs in environment variables per environment.",
      ),
      sc(
        "store-3-e",
        2,
        "A refund request arrives. What should the system make easy?",
        "Three refunds in the first week were done by editing the database by hand.",
        [
          "An admin action that issues the refund through the provider, updates the order and writes an audit entry.",
          "Auditable, repeatable actions beat manual database edits that nobody can trace.",
        ],
        [
          [
            "Keep editing rows by hand.",
            "Hand edits are error-prone, untracked and impossible to review.",
          ],
          [
            "Refuse refunds.",
            "Refund handling is part of a trustworthy store and often a legal duty.",
          ],
        ],
        "Operational actions that touch money belong in audited admin tools, not ad-hoc SQL.",
      ),
      mt(
        "store-3-f",
        2,
        "Which control detects, limits or recovers?",
        [
          ["detect", "Detect"],
          ["limit", "Limit damage"],
          ["recover", "Recover"],
        ],
        {
          detect: [
            "Alert when paid orders drop to zero for an hour",
            "Alert on a spike of failed payments",
          ],
          limit: [
            "Rate-limit the checkout endpoint per account",
            "Cap how many items one order can contain",
          ],
          recover: [
            "Re-run the verified webhook for a missed payment event",
            "Restore from the latest tested backup",
          ],
        },
        "Mature operations combine early detection, limits that cap the blast radius and rehearsed recovery.",
      ),
      wbk(
        "store-3-g",
        2,
        "Complete the post-launch routine.",
        "Each week review {{a}} errors, check that webhooks are {{b}}, update dependencies in small batches and keep a tested {{c}}.",
        { a: "checkout", b: "arriving", c: "backup" },
        ["cosmetic", "ignored", "screenshot"],
        "A small weekly routine on the money path catches most silent failures long before customers complain.",
      ),
    ],
    P("proj-store", "Online store"),
  ),

  // ───────────────────────── Marketplace ─────────────────────────
  lesson(
    "market-1",
    "specs",
    "Marketplace, part 1: two sides, one platform",
    "Model buyers, sellers and listings, and decide what trust and safety needs to exist on day one.",
    "A marketplace is two products in one: sellers must be able to list, buyers must be able to trust. Both need rules.",
    [
      sc(
        "market-1-a",
        2,
        "What is the hardest early problem in a marketplace?",
        "You are choosing what to build first.",
        [
          "Getting enough quality listings and buyers in one narrow niche, so each side finds value.",
          "Marketplaces fail from empty shelves or empty shoppers, so start narrow and seed one side first.",
        ],
        [
          [
            "Building every category at once.",
            "Spreading thin leaves every category empty and untrustworthy.",
          ],
          [
            "A perfect recommendation algorithm.",
            "Algorithms need data; with no listings or buyers there is nothing to recommend.",
          ],
        ],
        "Start with one niche, seed supply by hand, and add features only when real transactions demand them.",
      ),
      mt(
        "market-1-b",
        2,
        "Which role may do what?",
        [
          ["buyer", "Buyer"],
          ["seller", "Seller"],
          ["admin", "Admin"],
        ],
        {
          buyer: ["Browse and message a seller", "Leave a review after a completed order"],
          seller: ["Create and edit their own listings", "See orders for their own listings"],
          admin: [
            "Remove a listing that breaks the rules (audited)",
            "Suspend an account after a verified report",
          ],
        },
        "Spell out roles before writing policies. Each role gets the least access it needs, and admin actions leave an audit trail.",
      ),
      bug(
        "market-1-c",
        3,
        "Tap the policy that lets sellers edit each other's listings.",
        "policies.sql",
        [
          "alter table listings enable row level security;",
          "create policy \"public read\" on listings for select using (status = 'active');",
          'create policy "seller edit" on listings for update to authenticated using (true) with check (true);',
        ],
        [2],
        "Any signed-in user can update any listing. Restrict with using (seller_id = auth.uid()) and with check (seller_id = auth.uid()) so ownership cannot be changed either.",
      ),
      sc(
        "market-1-d",
        2,
        "Where should the average rating live?",
        "Each review adds a row; listing pages show the average.",
        [
          "Compute or maintain it on the server from the reviews table (a view or a trigger-updated column), never from client input.",
          "A derived number should come from the source rows so it cannot be forged.",
        ],
        [
          [
            "Let the client send the new average with each review.",
            "Anyone could submit any average.",
          ],
          [
            "Calculate it in the browser from the first 20 reviews.",
            "It would be wrong for listings with more reviews and slow on mobile.",
          ],
        ],
        "Derived values belong where the source data lives, computed by trusted code.",
      ),
      sq(
        "market-1-e",
        2,
        "Order the first slice you ask your AI tool to build.",
        [
          "profiles with a role (buyer or seller) set by the server",
          "listings owned by a seller with active and removed states",
          "RLS: public reads active listings, sellers edit only their own",
          "Seller listing form with validation and image upload limits",
          "Two-account tests proving sellers cannot touch each other's listings",
        ],
        "Identity and ownership come first because every other feature depends on them being right.",
      ),
      wbk(
        "market-1-f",
        2,
        "Complete the safety basics.",
        "Users can {{a}} listings and accounts, admins review reports with an {{b}} trail, and listings must follow clear {{c}}.",
        { a: "report", b: "audit", c: "rules" },
        ["delete", "advertising", "colors"],
        "Reporting, auditable moderation and published rules are the minimum trust-and-safety foundation.",
      ),
      sc(
        "market-1-g",
        3,
        "A seller messages a buyer with a link to pay outside the platform. What is the sensible design response?",
        "You want users to feel safe and the platform to learn what is working.",
        [
          "Detect and discourage off-platform payment with clear rules, report tools and gentle warnings, and make on-platform paying easy.",
          "Safety and honesty improve when the safe path is also the easiest path.",
        ],
        [
          [
            "Ignore it; it is not your problem.",
            "Scams hurt buyers and the platform's reputation.",
          ],
          [
            "Read every private message by hand.",
            "That does not scale and raises privacy problems.",
          ],
        ],
        "Combine clear rules, user reporting and product nudges rather than surveillance.",
      ),
    ],
    P("proj-market", "Marketplace"),
  ),
  lesson(
    "market-2",
    "backend",
    "Marketplace, part 2: listings, search and messaging",
    "Build search, images and buyer-seller messages without leaking private data or becoming slow.",
    "Browsing is where marketplaces are won or lost: fast results, honest images and private conversations.",
    [
      sc(
        "market-2-a",
        2,
        "Search is slow with 200,000 listings. What helps most first?",
        "The query filters by title text and category and sorts by newest.",
        [
          "Add indexes matching the filters (category, created_at) and a full-text index on the text, then check the query plan.",
          "Indexes shaped like the query let the database avoid scanning every row.",
        ],
        [
          [
            "Load every listing and filter in the browser.",
            "That transfers huge data and is slower on phones.",
          ],
          [
            "Add more servers.",
            "More hardware speeds up a full scan only a little; the query needs a better plan.",
          ],
        ],
        "Measure with EXPLAIN, then index for the real filters and sort order.",
      ),
      bug(
        "market-2-b",
        2,
        "Tap the line that returns private seller data to every visitor.",
        "api.ts",
        [
          "const { data } = await db",
          "  .from('listings')",
          "  .select('*, seller:profiles(*)')",
          "  .eq('status', 'active');",
          "return Response.json(data);",
        ],
        [2],
        "Selecting every profile column exposes email, phone and other private fields. Select only the public columns (display name, avatar, rating) or expose a public view.",
      ),
      sq(
        "market-2-c",
        2,
        "Order a safe image upload.",
        [
          "Check size and type on the client for quick feedback",
          "Re-check size, type and extension on the server",
          "Store the file in private storage under a random name",
          "Generate resized copies and strip location metadata",
          "Save the file path on the listing and serve through a safe URL",
        ],
        "Never trust the filename or declared type, and remove embedded location data so photos do not reveal where a seller lives.",
      ),
      mt(
        "market-2-d",
        2,
        "Public, buyer-and-seller only, or private to one person?",
        [
          ["public", "Public"],
          ["pair", "The two people in the conversation"],
          ["own", "Only the owner"],
        ],
        {
          public: ["Listing title, price and photos"],
          pair: ["Messages in a conversation about a listing"],
          own: ["A seller's payout details", "A buyer's saved addresses"],
        },
        "Access should match the audience of each fact, and the database policy should enforce it rather than relying on the UI.",
      ),
      sc(
        "market-2-e",
        3,
        "How should messaging policies be written?",
        "Conversations have a buyer_id, seller_id and messages.",
        [
          "Allow reading and sending only when auth.uid() is the buyer or the seller of that conversation.",
          "The row's participants define who can see it, enforced in the database.",
        ],
        [
          [
            "Allow any signed-in user to read messages by id.",
            "Guessing a conversation id would reveal private conversations.",
          ],
          [
            "Hide the conversation list in the UI only.",
            "UI hiding does not stop direct requests.",
          ],
        ],
        "Participant-based RLS is the standard pattern for private conversations.",
      ),
      wbk(
        "market-2-f",
        2,
        "Write the notification rule.",
        "When a buyer sends a message, create an in-app notification for the {{a}}, send push or email only if they {{b}}, and never include the full {{c}} in a push preview.",
        { a: "seller", b: "opted in", c: "message" },
        ["buyer", "admin", "ignored"],
        "Respect the recipient's preferences and keep sensitive content out of previews that appear on lock screens.",
      ),
      bug(
        "market-2-g",
        2,
        "Tap the line that allows someone to spam messages.",
        "route.ts",
        [
          "export async function POST(req) {",
          "  const { conversationId, text } = await req.json();",
          "  await db.from('messages').insert({ conversation_id: conversationId, sender_id: user.id, text });",
          "  return Response.json({ ok: true });",
          "}",
        ],
        [2],
        "There is no length limit, rate limit or participant check on insert. Validate length, rate-limit per user and confirm the sender belongs to the conversation (or rely on an RLS check).",
      ),
    ],
    P("proj-market", "Marketplace"),
  ),
  lesson(
    "market-3",
    "testing-verification",
    "Marketplace, part 3: moderation, proof and launch",
    "Prove access control with two real accounts, build moderation tools and launch to a small group first.",
    "A marketplace launch is a trust launch. Test the worst-case user as carefully as the happy one.",
    [
      sq(
        "market-3-a",
        3,
        "Order a permissions regression test for listings.",
        [
          "Create seller A, seller B and a buyer",
          "Seller A creates a listing",
          "As seller B, try to edit and delete it and expect refusal",
          "As the buyer, try to edit it and expect refusal",
          "Keep the test in CI against a real database",
        ],
        "Testing refusals as well as successes, with real identities in CI, is the only way to keep ownership rules from regressing.",
      ),
      sc(
        "market-3-b",
        2,
        "What does a good moderation tool record?",
        "Admins can remove listings and suspend users.",
        [
          "Who acted, on what, when and why, in an append-only audit log, with a way for the affected user to appeal.",
          "Accountability and fairness make moderation credible and defensible.",
        ],
        [
          ["Nothing; admins are trusted.", "Unrecorded power cannot be reviewed or corrected."],
          [
            "Only a delete button.",
            "Irreversible actions without a record or an appeal harm trust.",
          ],
        ],
        "Audit logs and appeals are the foundation of fair moderation.",
      ),
      mt(
        "market-3-c",
        2,
        "Soft launch or full launch?",
        [
          ["soft", "Soft launch first"],
          ["full", "Wait for full launch"],
        ],
        {
          soft: [
            "Testing seller onboarding with 20 invited sellers",
            "Checking that reports reach an admin",
          ],
          full: ["Paid advertising to thousands of visitors", "Press announcement"],
        },
        "Small invite-only launches reveal real problems while they are cheap to fix. Announce loudly only when the basics hold.",
      ),
      bug(
        "market-3-d",
        2,
        "Tap the line that makes the rating system gameable.",
        "reviews.sql",
        [
          "create table reviews (",
          "  id uuid primary key,",
          "  listing_id uuid references listings(id),",
          "  reviewer_id uuid references auth.users(id),",
          "  rating int check (rating between 1 and 5)",
          ");",
          "-- no link to a completed order, no uniqueness",
        ],
        [2, 3, 4],
        "Anyone can post unlimited ratings for any listing. Tie each review to a completed order and add a unique constraint on (order_id, reviewer_id).",
      ),
      sc(
        "market-3-e",
        3,
        "An abuse report names a seller. What is the right order of actions?",
        "The report says the seller is a scammer.",
        [
          "Preserve evidence, hide the listings pending review, ask the seller to respond, decide, record the action and notify both parties.",
          "Fair process protects honest sellers and stops harm quickly.",
        ],
        [
          [
            "Permanently ban immediately.",
            "Mistakes happen; a pause with review is safer than a permanent action on one report.",
          ],
          ["Wait until more reports arrive.", "Delay may let a real scammer keep harming buyers."],
        ],
        "Moderation balances speed with fairness, and every step is recorded.",
      ),
      wbk(
        "market-3-f",
        2,
        "Complete the readiness statement.",
        "We are ready for a soft launch when {{a}} tests pass in CI on this commit, the scanner shows no open {{b}} findings and an admin can handle a {{c}} end to end.",
        { a: "permission", b: "critical", c: "report" },
        ["cosmetic", "optional", "holiday"],
        "Readiness is a short, checkable list tied to evidence.",
      ),
      sc(
        "market-3-g",
        2,
        "How do you decide what to build after launch?",
        "Users ask for twenty different features.",
        [
          "Watch where listings and conversations stall, talk to sellers and buyers, and pick the change that unblocks the most transactions.",
          "Transactions are the marketplace's heartbeat; follow the drop-offs.",
        ],
        [
          ["Build whatever was requested loudest.", "Loud is not the same as common or valuable."],
          [
            "Add every request to keep users happy.",
            "Feature sprawl slows everything and weakens focus.",
          ],
        ],
        "Let completed transactions and funnel drop-offs guide the roadmap.",
      ),
    ],
    P("proj-market", "Marketplace"),
  ),

  // ───────────────────────── Booking platform ─────────────────────────
  lesson(
    "bookplat-1",
    "specs",
    "Booking platform, part 1: services, staff and time",
    "Model services, providers, availability and time zones so a booking is always unambiguous.",
    "Time is the hard part of booking apps: time zones, overlaps, buffers and cancellations.",
    [
      sc(
        "bookplat-1-a",
        2,
        "How should appointment times be stored?",
        "A clinic in London serves patients who travel.",
        [
          "As UTC timestamps (timestamptz) with the venue's time zone stored separately for display.",
          "UTC is unambiguous; local time is a presentation concern.",
        ],
        [
          [
            "As text like '3pm tomorrow'.",
            "Text cannot be compared, sorted or converted reliably.",
          ],
          [
            "As local time without a zone.",
            "Daylight-saving changes make local times ambiguous or nonexistent twice a year.",
          ],
        ],
        "Store instants in UTC, display in the user's or venue's zone, and test across daylight-saving changes.",
      ),
      mt(
        "bookplat-1-b",
        2,
        "Which table holds each fact?",
        [
          ["svc", "services"],
          ["prov", "providers"],
          ["bk", "bookings"],
          ["avail", "availability_rules"],
        ],
        {
          svc: ["Name, duration and buffer after the appointment"],
          prov: ["Display name, time zone and which services they offer"],
          bk: ["Customer, provider, service, start and status"],
          avail: ["Provider works Monday to Friday 09:00-17:00"],
        },
        "Separating what is offered, who offers it, when they are free and what is booked keeps each rule simple to change.",
      ),
      bug(
        "bookplat-1-c",
        3,
        "Tap the schema gap that allows double booking a provider.",
        "schema.sql",
        [
          "create table bookings (",
          "  id uuid primary key,",
          "  provider_id uuid not null,",
          "  starts_at timestamptz not null,",
          "  ends_at timestamptz not null",
          ");",
          "-- nothing prevents overlapping rows for one provider",
        ],
        [6],
        "Two overlapping bookings for the same provider can both be inserted. Add an exclusion constraint on (provider_id, tstzrange(starts_at, ends_at)) so the database rejects overlaps.",
      ),
      sc(
        "bookplat-1-d",
        2,
        "What should happen when a customer cancels 2 hours before an appointment that has a 24-hour policy?",
        "The business wants a fair, predictable rule.",
        [
          "Apply the published policy automatically and show it clearly before booking, with an admin override that is audited.",
          "Rules shown up front and applied consistently feel fair; exceptions are recorded.",
        ],
        [
          ["Decide case by case with no written policy.", "Inconsistent decisions cause disputes."],
          [
            "Block cancellations entirely.",
            "Customers will no-show instead, which is worse for everyone.",
          ],
        ],
        "Make policy visible, automatic and overridable with accountability.",
      ),
      sq(
        "bookplat-1-e",
        2,
        "Order the spec you write before prompting.",
        [
          "Who books, who provides, and what is a booking",
          "The rules: duration, buffers, lead time, cancellation window",
          "Data model with time zones and overlap protection",
          "Screens: pick service, pick time, confirm, manage",
          "How we will test overlaps, time zones and cancellations",
        ],
        "A spec that names the rules and how they will be tested keeps the AI from inventing its own.",
      ),
      wbk(
        "bookplat-1-f",
        2,
        "Complete the availability rule.",
        "A slot is bookable when it is inside the provider's {{a}}, does not {{b}} an existing booking and is at least the minimum {{c}} time ahead.",
        { a: "working hours", b: "overlap", c: "lead" },
        ["holiday", "break", "color"],
        "Availability is the intersection of working hours, existing bookings and lead-time rules.",
      ),
      sc(
        "bookplat-1-g",
        3,
        "Which reminder design is best for no-shows?",
        "Many customers forget appointments.",
        [
          "Opt-in reminders by push or email at sensible times, with one-tap confirm or cancel that frees the slot.",
          "Reminders that make cancelling easy reduce no-shows and free slots for others.",
        ],
        [
          [
            "Text everyone five times a day.",
            "Over-messaging annoys people and gets switched off.",
          ],
          [
            "No reminders; customers should remember.",
            "Forgotten appointments cost the business real money.",
          ],
        ],
        "Useful, optional, actionable reminders respect people and improve outcomes.",
      ),
    ],
    P("proj-bookplat", "Booking platform"),
  ),
  lesson(
    "bookplat-2",
    "backend",
    "Booking platform, part 2: the booking engine",
    "Build slot search, atomic booking and rescheduling that survive concurrency and retries.",
    "The engine must be right even when ten people want the same 3 pm slot.",
    [
      sq(
        "bookplat-2-a",
        3,
        "Order a safe booking request.",
        [
          "Verify the session and validate service, provider and requested time",
          "Check the time is inside availability and the lead-time rules",
          "Insert the booking; the exclusion constraint rejects overlaps",
          "On conflict return friendly alternatives",
          "Send confirmation and schedule the reminder",
        ],
        "The database is the final judge of overlaps; the code turns a rejection into a helpful answer.",
      ),
      bug(
        "bookplat-2-b",
        3,
        "Tap the lines with the check-then-insert race.",
        "book.ts",
        [
          "const clash = await db.from('bookings').select('id').eq('provider_id', p).gte('ends_at', start).lte('starts_at', end);",
          "if (clash.data.length === 0) {",
          "  await db.from('bookings').insert({ provider_id: p, starts_at: start, ends_at: end });",
          "}",
        ],
        [0, 1],
        "Two simultaneous requests both see no clash and both insert. Insert directly and let the constraint decide, then handle the conflict error.",
      ),
      sc(
        "bookplat-2-c",
        3,
        "A customer reschedules. What is the safest implementation?",
        "They move from Tuesday 10:00 to Wednesday 14:00.",
        [
          "Create the new booking and cancel the old one in one transaction, so the customer never ends up with none or two.",
          "Atomic change keeps the schedule consistent even if something fails midway.",
        ],
        [
          [
            "Cancel first, then try to book the new time.",
            "If the new time is taken the customer loses their original slot.",
          ],
          [
            "Edit the start time in place without checks.",
            "That bypasses availability and overlap rules.",
          ],
        ],
        "Multi-step changes that must succeed together belong in one transaction.",
      ),
      mt(
        "bookplat-2-d",
        2,
        "Server or client?",
        [
          ["server", "Server decides"],
          ["client", "Client can show"],
        ],
        {
          server: ["Whether a slot is truly free", "Whether the cancellation window has passed"],
          client: ["A countdown to the slot hold expiring", "A greyed-out button for taken times"],
        },
        "The UI may hint and pre-filter, but only the server can guarantee rules at the moment of booking.",
      ),
      wbk(
        "bookplat-2-e",
        2,
        "Write the prompt for the conflict message.",
        "If the booking violates the {{a}} constraint, return HTTP {{b}} with code {{c}} and the three nearest free slots.",
        { a: "exclusion", b: "409", c: "slot_taken" },
        ["unique", "500", "unknown"],
        "A conflict is an expected outcome, so it deserves a precise status, code and helpful alternatives.",
      ),
      sc(
        "bookplat-2-f",
        2,
        "How should time zones appear in the UI?",
        "A provider in New York lists availability for customers in Tokyo.",
        [
          "Show times in the customer's zone with the venue's zone noted, and confirm both in the email.",
          "Clarity about whose clock it is prevents missed appointments.",
        ],
        [
          [
            "Always show the provider's local time without saying so.",
            "Customers will miss or mis-time bookings.",
          ],
          ["Show raw UTC.", "Almost nobody thinks in UTC."],
        ],
        "Always say which time zone a time is in, and default to the viewer's.",
      ),
      bug(
        "bookplat-2-g",
        2,
        "Tap the daylight-saving bug.",
        "slots.ts",
        [
          "function addDay(d: Date) {",
          "  return new Date(d.getTime() + 24 * 60 * 60 * 1000);",
          "}",
          "// used to generate 'same time tomorrow' slots in a local time zone",
        ],
        [1],
        "On a day when clocks change, 24 hours later is not the same local time. Use a date library with time-zone support to add a calendar day in the venue's zone.",
      ),
    ],
    P("proj-bookplat", "Booking platform"),
  ),
  lesson(
    "bookplat-3",
    "shipping",
    "Booking platform, part 3: reminders, proof and operations",
    "Verify the engine under load, run reminders reliably and give staff safe tools.",
    "A booking system earns trust by being boring: every reminder arrives, no one is double booked.",
    [
      sq(
        "bookplat-3-a",
        2,
        "Order the reminder pipeline.",
        [
          "A scheduler finds bookings starting in about 24 hours",
          "It enqueues one reminder per booking with a unique key",
          "A worker sends push or email according to preferences",
          "Failures retry with backoff, then alert a human",
          "The customer can confirm or cancel from the message",
        ],
        "Unique keys make the scheduler safe to run repeatedly, and retries with alerts make failures visible.",
      ),
      sc(
        "bookplat-3-b",
        3,
        "How do you test that two people cannot book the same slot?",
        "A teammate suggests mocking the database.",
        [
          "Fire two simultaneous booking requests at a real database and assert exactly one succeeds.",
          "Only a real database with real concurrency exercises the constraint.",
        ],
        [
          [
            "Mock the database to return a conflict.",
            "A mock proves your code handles a conflict, not that conflicts are prevented.",
          ],
          ["Try it by hand a few times.", "Races rarely show up when a human clicks."],
        ],
        "Concurrency bugs need concurrent tests against the real system.",
      ),
      mt(
        "bookplat-3-c",
        2,
        "Which staff action needs an audit entry?",
        [
          ["audit", "Audit it"],
          ["no", "Routine"],
        ],
        {
          audit: [
            "Overriding the cancellation policy for a customer",
            "Cancelling a customer's booking on their behalf",
          ],
          no: ["Viewing today's schedule", "Searching for a service"],
        },
        "Actions that change money, commitments or other people's data deserve a permanent record of who did what and why.",
      ),
      bug(
        "bookplat-3-d",
        2,
        "Tap the line that will send the same reminder repeatedly.",
        "reminders.ts",
        [
          "const due = await findBookingsStartingSoon();",
          "for (const b of due) {",
          "  await sendReminder(b);",
          "}",
          "// runs every 5 minutes; nothing records that a reminder was sent",
        ],
        [2, 4],
        "Each run re-finds the same bookings and re-sends. Record a reminder row with a unique key per booking and skip when it exists.",
      ),
      sc(
        "bookplat-3-e",
        2,
        "What belongs on the operations dashboard?",
        "Staff and owners need to see health at a glance.",
        [
          "Today's bookings, failed reminders, no-show rate and anything needing attention, with links to fix it.",
          "Actionable signals beat vanity numbers.",
        ],
        [
          [
            "Total page views.",
            "That does not tell you whether bookings and reminders are working.",
          ],
          ["A raw database table viewer.", "Too easy to break things and hard to read."],
        ],
        "Show what is wrong and what to do about it.",
      ),
      wbk(
        "bookplat-3-f",
        2,
        "Complete the launch gate.",
        "Launch when overlap and {{a}} tests pass in CI, reminders have {{b}} unique keys, and a staff member can {{c}} a booking from the admin view.",
        { a: "time-zone", b: "retry-safe", c: "reschedule" },
        ["colorful", "optional", "delete"],
        "The gate lists behaviors that, if broken, hurt real customers immediately.",
      ),
      sc(
        "bookplat-3-g",
        3,
        "A clinic asks to store appointment notes in the app. What is the first question?",
        "The notes could contain health details.",
        [
          "What rules apply to this data where you operate, and do you need a professional's advice before storing it?",
          "Sensitive categories of data carry legal duties; find out before building.",
        ],
        [
          [
            "Store it; it is just text.",
            "Health information is among the most protected kinds of data.",
          ],
          [
            "Store it in logs for debugging.",
            "Logs spread sensitive data to many systems and are rarely deleted.",
          ],
        ],
        "Know your obligations before collecting sensitive data, and collect only what you need.",
      ),
    ],
    P("proj-bookplat", "Booking platform"),
  ),
];
