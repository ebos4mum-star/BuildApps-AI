import type { Lesson } from "../types";
import { bug, lesson, mt, sc, sq, wbk } from "./dsl";

const P = (projectId: string, projectTitle: string) => ({
  kind: "guided_project" as const,
  projectId,
  projectTitle,
});

/** Guided project tracks: a social network, a fitness and wellness app, and business management software. */
export const projectsSocialWellness: Lesson[] = [
  // ───────────────────────── Social network ─────────────────────────
  lesson(
    "social-1",
    "specs",
    "Social network, part 1: people, posts and privacy",
    "Model profiles, follows and posts, and decide who can see what before writing a feed.",
    "A social app is a privacy system with a feed on top. Visibility rules come first.",
    [
      mt(
        "social-1-a",
        2,
        "Which visibility rule fits each item?",
        [
          ["pub", "Public"],
          ["fol", "Followers only"],
          ["own", "Only the owner"],
        ],
        {
          pub: ["A profile's display name and avatar"],
          fol: ["Posts from a private account"],
          own: ["Blocked-users list", "Draft posts"],
        },
        "Decide visibility per item up front. Defaults should be the most private option a feature can reasonably have.",
      ),
      sc(
        "social-1-b",
        2,
        "How should 'follow' be modelled?",
        "Users follow each other; some accounts are private and need approval.",
        [
          "A follows table (follower_id, followee_id, status) with a unique pair and status pending or accepted.",
          "A join table with a status captures both open and approval-required accounts.",
        ],
        [
          [
            "A comma-separated list of ids in the profile row.",
            "Lists in a column cannot be indexed, constrained or queried cleanly.",
          ],
          [
            "Copy the followee's posts into the follower's table.",
            "Duplicating data makes edits, deletes and privacy changes nearly impossible to keep consistent.",
          ],
        ],
        "Relationships between users are rows in a join table with constraints.",
      ),
      bug(
        "social-1-c",
        3,
        "Tap the policy flaw that exposes private accounts' posts.",
        "policies.sql",
        [
          "alter table posts enable row level security;",
          'create policy "read posts" on posts for select to authenticated using (true);',
          "-- profiles.is_private exists but is never consulted",
        ],
        [1],
        "using (true) ignores private accounts. The policy should allow the author, accepted followers, or anyone when the author is public.",
      ),
      sc(
        "social-1-d",
        2,
        "A user blocks another. What must change?",
        "Blocking should feel immediate and reliable.",
        [
          "The blocked user can no longer see the blocker's content or contact them, enforced in database policies and queries.",
          "Safety features must be enforced on the server, not just hidden in the UI.",
        ],
        [
          [
            "Hide the block button's result in the UI only.",
            "A script or older client could still read the content.",
          ],
          [
            "Delete the blocked user's account.",
            "Blocking is a personal boundary, not a punishment decision.",
          ],
        ],
        "Blocks are access rules enforced where the data lives.",
      ),
      sq(
        "social-1-e",
        2,
        "Order the first build slices.",
        [
          "profiles with public/private setting",
          "follows with approval flow",
          "posts with visibility rules in RLS",
          "feed query limited to people you follow",
          "reporting and blocking",
        ],
        "Identity and relationships come before content, and safety tools are part of the foundation rather than an afterthought.",
      ),
      wbk(
        "social-1-f",
        2,
        "Complete the safety baseline.",
        "Every post can be {{a}}, every user can be {{b}} or reported, and moderators act through an {{c}} tool.",
        { a: "reported", b: "blocked", c: "audited" },
        ["hidden", "sold", "ignored"],
        "Reporting, blocking and auditable moderation are the minimum for any app where people interact.",
      ),
      sc(
        "social-1-g",
        3,
        "A teenager signs up. What should the design consider?",
        "Your audience might include minors.",
        [
          "Check the rules that apply where you operate, collect less data, default accounts to private and avoid features that expose location or contact to strangers.",
          "Younger users need stronger defaults and legal care.",
        ],
        [
          [
            "Nothing special; everyone is the same.",
            "Rules about minors can be strict and the risks are real.",
          ],
          [
            "Ask for their address to verify age.",
            "Collecting more sensitive data creates new risks.",
          ],
        ],
        "Know the legal duties for your audience early, and default to privacy.",
      ),
    ],
    P("proj-social", "Social network"),
  ),
  lesson(
    "social-2",
    "backend",
    "Social network, part 2: feed, media and real-time",
    "Build a fast feed with pagination, safe uploads and live updates that respect privacy.",
    "The feed is the product. It must be fast, correct about who may see what, and kind to phones.",
    [
      bug(
        "social-2-a",
        2,
        "Tap the line that will not scale to a million posts.",
        "feed.ts",
        [
          "const posts = await db.from('posts').select('*').order('created_at', { ascending: false });",
          "return posts.data.slice(0, 20);",
        ],
        [1],
        "It loads every post and then trims in memory. Query with limit and a cursor (created_at, id) so the database returns only one page.",
      ),
      sc(
        "social-2-b",
        3,
        "Offset or cursor pagination for an infinite feed?",
        "New posts arrive while people scroll.",
        [
          "Cursor pagination using the last item's created_at and id.",
          "Offsets shift when new rows arrive, causing duplicates and skips; cursors stay stable.",
        ],
        [
          [
            "Offset pagination because it is simpler.",
            "Simple until new posts shift every page and users see repeats.",
          ],
          [
            "Load everything and scroll locally.",
            "Unbounded data kills mobile memory and network.",
          ],
        ],
        "Cursor pagination is the standard answer for feeds that change while being read.",
      ),
      sq(
        "social-2-c",
        2,
        "Order a safe photo post.",
        [
          "Pick the image and show a preview",
          "Validate type and size on the server",
          "Strip location and camera metadata",
          "Store under a random name in storage with the right access rules",
          "Create the post pointing at the stored file",
        ],
        "Metadata can reveal where a photo was taken, so removing it protects people who post from home.",
      ),
      mt(
        "social-2-d",
        2,
        "Realtime, or fetch on demand?",
        [
          ["rt", "Realtime update"],
          ["pull", "Fetch when needed"],
        ],
        {
          rt: [
            "New message arriving in an open conversation",
            "A like count on the post you are looking at",
          ],
          pull: ["The profile page of someone you rarely visit", "Search results"],
        },
        "Realtime costs connections and battery, so use it where freshness matters to what is on screen right now.",
      ),
      sc(
        "social-2-e",
        3,
        "Realtime subscriptions are sending posts from private accounts. What is wrong?",
        "The subscription listens to the posts table.",
        [
          "Realtime must respect the same row-level policies as queries; fix the policies and test subscriptions as a non-follower.",
          "A leak through realtime is still a leak, and policies are the single source of truth.",
        ],
        [
          [
            "Realtime ignores permissions by design.",
            "With policies enforced it should not leak; if it does, that is a configuration bug.",
          ],
          ["Filter in the client.", "The data has already reached the untrusted device."],
        ],
        "Test every channel (REST, realtime, exports) with a user who should see nothing.",
      ),
      wbk(
        "social-2-f",
        2,
        "Write the notification prompt.",
        "When someone {{a}} you, create an in-app notification, batch push messages so one person gets at most {{b}} per hour, and respect {{c}} hours.",
        { a: "follows", b: "three", c: "quiet" },
        ["blocks", "fifty", "business"],
        "Batching and quiet hours stop notifications from becoming the reason people uninstall.",
      ),
      bug(
        "social-2-g",
        2,
        "Tap the line that lets users post as someone else.",
        "route.ts",
        [
          "export async function POST(req) {",
          "  const { authorId, text } = await req.json();",
          "  await db.from('posts').insert({ author_id: authorId, text });",
          "}",
        ],
        [2],
        "The author comes from the request body. Take it from the verified session (and enforce it in an RLS check) so nobody can impersonate another user.",
      ),
    ],
    P("proj-social", "Social network"),
  ),
  lesson(
    "social-3",
    "security",
    "Social network, part 3: abuse, proof and launch",
    "Defend against spam and harassment, prove privacy rules with tests and launch in stages.",
    "Every open text box will be tested by someone looking for a way to misuse it.",
    [
      mt(
        "social-3-a",
        2,
        "Which control stops which abuse?",
        [
          ["rate", "Rate limiting"],
          ["report", "Reporting and moderation"],
          ["valid", "Input validation"],
        ],
        {
          rate: ["A bot posting 1,000 comments a minute"],
          report: ["A user harassing another in replies"],
          valid: ["A 5 MB 'username' that crashes a screen", "Script tags in a bio"],
        },
        "Different abuse needs different controls; combine automatic limits with human review.",
      ),
      sc(
        "social-3-b",
        3,
        "How do you stop script injection through posts?",
        "Posts support emoji and links.",
        [
          "Render user text as text (frameworks escape by default), sanitise any rich content with a vetted library and send a strict Content-Security-Policy.",
          "Layered defences make one mistake survivable.",
        ],
        [
          ["Strip the word 'script' from posts.", "Blocklists are bypassed by trivial variations."],
          ["Trust users not to try it.", "Someone always will."],
        ],
        "Encode output, sanitise allowed HTML with a proven library and add browser-level protections.",
      ),
      sq(
        "social-3-c",
        3,
        "Order a privacy regression test.",
        [
          "Create a private account A, an accepted follower B and a stranger C",
          "A posts",
          "B can read it",
          "C gets nothing through REST, realtime and search",
          "Keep it in CI against a real database",
        ],
        "Test the allow and deny sides across every way data can leave the system.",
      ),
      bug(
        "social-3-d",
        2,
        "Tap the line that makes the search endpoint leak private accounts.",
        "search.ts",
        [
          "const { data } = await db.from('profiles').select('id, display_name, bio, email').ilike('display_name', `%${q}%`);",
          "return Response.json(data);",
        ],
        [0],
        "It returns every matching profile including emails and private accounts. Search a public view with only safe columns, apply visibility rules and escape the pattern.",
      ),
      sc(
        "social-3-e",
        2,
        "How should you roll the app out?",
        "You have 50 friends and a waiting list of 5,000.",
        [
          "Invite small cohorts, watch reports and performance, fix what you find and widen gradually.",
          "Staged growth reveals abuse patterns and scaling limits while they are manageable.",
        ],
        [
          [
            "Open to everyone at once.",
            "A flood of unmoderated users is how communities start badly.",
          ],
          [
            "Never launch until it is perfect.",
            "Perfect never ships; staged launches learn faster.",
          ],
        ],
        "Stage the launch to protect users and your team.",
      ),
      wbk(
        "social-3-f",
        2,
        "Complete the moderation promise.",
        "Reports are reviewed within a stated {{a}}, actions are recorded with a {{b}}, and affected users can {{c}} a decision.",
        { a: "timeframe", b: "reason", c: "appeal" },
        ["colour", "prize", "ignore"],
        "Clear timelines, recorded reasons and appeals make moderation fair and credible.",
      ),
      sc(
        "social-3-g",
        3,
        "Your app removes a user's account on request. What about their old posts and replies?",
        "Others replied to their posts.",
        [
          "Delete or anonymise according to a published policy, keep the thread readable where possible and record the erasure in the audit log.",
          "Deletion must be real, predictable and explainable.",
        ],
        [
          [
            "Keep everything and just hide the profile.",
            "That may not satisfy the user's request or the rules you operate under.",
          ],
          [
            "Delete every thread they touched.",
            "That destroys other people's content unnecessarily.",
          ],
        ],
        "Decide the policy before launch and implement it in the deletion workflow.",
      ),
    ],
    P("proj-social", "Social network"),
  ),

  // ───────────────────────── Fitness & wellness ─────────────────────────
  lesson(
    "fit-1",
    "specs",
    "Fitness and wellness app, part 1: goals, logs and sensitive data",
    "Model workouts, habits and goals, and treat health-related data with extra care.",
    "Wellness data is personal. Great fitness apps are motivating and careful at the same time.",
    [
      sc(
        "fit-1-a",
        2,
        "What is the smallest first release of a fitness tracker?",
        "The idea list includes meal plans, coaching, wearables and social leaderboards.",
        [
          "Log a workout, see a weekly summary, set one goal and get a gentle reminder.",
          "A tight loop of log, see progress and return builds the habit you can then enrich.",
        ],
        [
          [
            "Meal plans, coaching and wearables at launch.",
            "Each is a product on its own; together they delay learning.",
          ],
          ["Only a leaderboard.", "Competition without a personal loop pushes away beginners."],
        ],
        "Build the habit loop first and add features that serve it.",
      ),
      mt(
        "fit-1-b",
        2,
        "Which fitness-app table holds each fact?",
        [
          ["w", "workouts"],
          ["s", "workout_sets"],
          ["g", "goals"],
        ],
        {
          w: ["Date, type and duration of a session"],
          s: ["Exercise, reps and weight for one set"],
          g: ["Target: run 3 times a week until 30 June"],
        },
        "Model sessions, their parts and goals separately so summaries can be computed from the raw log.",
      ),
      sc(
        "fit-1-c",
        3,
        "How should weekly totals be stored?",
        "The summary shows total minutes and sessions.",
        [
          "Compute them from workouts with a query or view, optionally cached, so they stay correct when entries are edited.",
          "Derived numbers should come from source rows to avoid drift.",
        ],
        [
          [
            "Store a counter that the client increments.",
            "A client-owned counter can be wrong, doubled or forged.",
          ],
          ["Type the totals in by hand.", "Manual totals are wrong the moment anything changes."],
        ],
        "Derive, do not duplicate, whenever you can.",
      ),
      bug(
        "fit-1-d",
        2,
        "Tap the line that mixes up units and time zones.",
        "schema.sql",
        [
          "create table workouts (",
          "  id uuid primary key,",
          "  user_id uuid not null,",
          "  worked_out_on text,        -- '03/04/2026'",
          "  weight numeric             -- kg or lb?",
          ");",
        ],
        [3, 4],
        "Ambiguous date text and a unit-less weight make data unreliable. Store a date type (plus the user's time zone for 'today') and fix a unit in the column name or a separate unit column.",
      ),
      sc(
        "fit-1-e",
        3,
        "What should you do about health-related data?",
        "The app collects weight, heart rate and sleep.",
        [
          "Collect only what features need, protect it with strict access rules and encryption in transit and at rest, explain the use plainly and check the legal rules for your market.",
          "Health data is highly sensitive and often specially regulated.",
        ],
        [
          ["Treat it like any other data.", "Regulators and users do not."],
          [
            "Share it with partners for revenue.",
            "Selling or sharing health data without clear consent is a serious breach of trust and often law.",
          ],
        ],
        "Minimise, protect and explain. Never repurpose sensitive data silently.",
      ),
      sq(
        "fit-1-f",
        2,
        "Order the prompt sequence for version one.",
        [
          "Tables and RLS for workouts and goals",
          "Tests that one user never sees another's workouts",
          "Log-a-workout screen with validation",
          "Weekly summary with empty, loading and error states",
          "Reminders using notification preferences",
        ],
        "Private-by-default data and tests for it come before the screens that display it.",
      ),
      wbk(
        "fit-1-g",
        2,
        "Complete the motivation rule.",
        "Celebrate {{a}} and consistency, never shame {{b}} days, and let people choose their own {{c}}.",
        { a: "progress", b: "missed", c: "goals" },
        ["failure", "scores", "rivals"],
        "Kind, autonomy-supporting design keeps people coming back; shame drives them away.",
      ),
    ],
    P("proj-fitness", "Fitness and wellness app"),
  ),
  lesson(
    "fit-2",
    "mobile",
    "Fitness and wellness app, part 2: phone-first features",
    "Build offline logging, reminders and charts that work in a gym basement with one thumb.",
    "People log workouts between sets, with sweaty hands and no signal. Design for that.",
    [
      sq(
        "fit-2-a",
        2,
        "Order offline logging.",
        [
          "Save the set locally the moment it is entered",
          "Show it immediately with a small 'syncing' marker",
          "Sync when the connection returns, with a unique id per entry",
          "Server ignores duplicates by id",
          "Marker disappears on confirmation",
        ],
        "Unique client-generated ids make retries safe, so offline entries never duplicate or vanish.",
      ),
      mt(
        "fit-2-b",
        2,
        "Which input suits the gym?",
        [
          ["good", "Good"],
          ["bad", "Frustrating"],
        ],
        {
          good: ["Large steppers for reps and weight", "Repeat last set with one tap"],
          bad: [
            "Tiny text fields requiring a keyboard each time",
            "A form that loses data if the screen locks",
          ],
        },
        "Reduce typing, enlarge targets and never lose input when the screen sleeps.",
      ),
      sc(
        "fit-2-c",
        3,
        "Two devices edit the same workout offline. Whose edit wins?",
        "A phone and a tablet both changed the weight on set 2.",
        [
          "Define a rule (for example last-write-wins per field with timestamps from the server) and tell the user when something was overwritten.",
          "Conflicts are unavoidable; a clear, visible rule is better than silent loss.",
        ],
        [
          ["Whichever syncs first, silently.", "Users lose edits without knowing."],
          [
            "Block editing on a second device.",
            "That makes the app unusable for people who own two devices.",
          ],
        ],
        "Choose a conflict policy deliberately and make outcomes visible.",
      ),
      bug(
        "fit-2-d",
        2,
        "Tap the line that will drain the battery.",
        "tracker.ts",
        [
          "setInterval(async () => {",
          "  const pos = await getPreciseLocation();",
          "  await uploadPoint(pos);",
          "}, 1000);",
          "// runs for the whole workout, even in the background",
        ],
        [0, 1],
        "Precise location every second plus an upload each time wastes battery and data. Sample less often, batch uploads and use the platform's activity-tracking APIs.",
      ),
      sc(
        "fit-2-e",
        2,
        "When should the app ask for location permission?",
        "Outdoor runs can be mapped.",
        [
          "When the user starts their first outdoor run, explaining that it draws the route.",
          "Permission asked in context, with a reason, is granted far more often.",
        ],
        [
          [
            "At first launch, before any explanation.",
            "No context makes refusal likely and hard to undo.",
          ],
          ["Never ask; use the IP address.", "That is inaccurate and sidesteps the user's choice."],
        ],
        "Ask at the moment the benefit is obvious.",
      ),
      wbk(
        "fit-2-f",
        2,
        "Complete the chart accessibility rule.",
        "Every chart has a text {{a}}, does not rely on {{b}} alone and supports larger {{c}}.",
        { a: "summary", b: "colour", c: "text" },
        ["animation", "sound", "borders"],
        "Charts must be understandable to people who cannot see colour differences or small text.",
      ),
      sc(
        "fit-2-g",
        3,
        "Reminders keep being turned off. What is the likely fix?",
        "Users disable notifications after a week.",
        [
          "Make them rarer, more useful and adjustable: time of day, days of week and a calm weekly summary instead of daily nagging.",
          "Reminders that feel respectful survive.",
        ],
        [
          ["Send more of them.", "More noise accelerates uninstalls."],
          ["Add guilt messages.", "Shame-based copy harms wellbeing and retention."],
        ],
        "Control and relevance keep notifications welcome.",
      ),
    ],
    P("proj-fitness", "Fitness and wellness app"),
  ),
  lesson(
    "fit-3",
    "testing-verification",
    "Fitness and wellness app, part 3: prove, protect, publish",
    "Verify privacy and data correctness, then prepare honest store listings for a wellness app.",
    "Health-adjacent apps get extra scrutiny from users and from stores. Be accurate and careful.",
    [
      mt(
        "fit-3-a",
        2,
        "Which test fits?",
        [
          ["unit", "Unit"],
          ["db", "Real database"],
          ["e2e", "Journey"],
        ],
        {
          unit: [
            "Weekly totals across a daylight-saving change",
            "Streak counting with a missed day",
          ],
          db: ["Another user cannot read your workouts"],
          e2e: ["Log a workout offline, reconnect and see it once"],
        },
        "Match the test to the risk: pure logic, real access control and real user journeys each need their own layer.",
      ),
      sc(
        "fit-3-b",
        3,
        "A store listing says 'cures anxiety'. What is wrong?",
        "Marketing wants a strong headline.",
        [
          "Medical claims need evidence and regulators and stores restrict them; describe what the app does (tracking, reminders, routines) honestly.",
          "Overclaiming risks rejection, legal trouble and harm.",
        ],
        [
          ["Nothing; it is just marketing.", "Health claims are closely policed."],
          [
            "Add a tiny disclaimer in the footer.",
            "A disclaimer does not make a false claim acceptable.",
          ],
        ],
        "Say what the product does, not what it cannot prove.",
      ),
      sq(
        "fit-3-c",
        2,
        "Order the privacy checklist before launch.",
        [
          "List every piece of data collected and why",
          "Remove anything not needed",
          "Write the privacy policy to match reality",
          "Provide export and account deletion",
          "Fill in the store's data-collection questionnaire accurately",
        ],
        "The policy and store answers must describe what the code actually does, so inventory the data first.",
      ),
      bug(
        "fit-3-d",
        2,
        "Tap the lines that will make the store questionnaire inaccurate.",
        "analytics.ts",
        [
          "track('workout_logged', {",
          "  userEmail: user.email,",
          "  weight: workout.weight,",
          "  heartRate: workout.heartRate,",
          "});",
          "// sent to a third-party analytics service",
        ],
        [1, 2, 3],
        "Sending email and health metrics to a third party is a major data disclosure. Track events without personal or health values, or get explicit consent and disclose it.",
      ),
      sc(
        "fit-3-e",
        2,
        "How should you handle a user who wants their data deleted?",
        "They ask in a support message.",
        [
          "Point them to self-service deletion, which cancels in a cooling-off period, then erases data through the audited workflow.",
          "A consistent, auditable process is safer than one-off manual deletions.",
        ],
        [
          [
            "Delete it by hand tonight.",
            "Rushed, untracked deletions are error-prone and skip verification.",
          ],
          ["Say it cannot be done.", "Users often have a legal right to deletion."],
        ],
        "Self-service deletion plus an audited erasure process serves users and your compliance.",
      ),
      wbk(
        "fit-3-f",
        2,
        "Complete the store-readiness statement.",
        "Ready to publish when privacy tests pass on this {{a}}, the listing makes only {{b}} claims and the data questionnaire matches {{c}}.",
        { a: "commit", b: "supportable", c: "the code" },
        ["colour", "bold", "the logo"],
        "Evidence for each claim is what turns 'we think it is ready' into 'it is ready'.",
      ),
      sc(
        "fit-3-g",
        3,
        "Reviewers reject the app: 'insufficient information about data use'. What next?",
        "The policy is two sentences.",
        [
          "Expand the policy and in-app disclosures to match actual collection, record the response and resubmit.",
          "Fix the cause and explain the change; the rejection history is tracked in the Publishing Center.",
        ],
        [
          ["Resubmit unchanged.", "The same problem will get the same result."],
          ["Remove the policy link.", "That makes it worse."],
        ],
        "Treat rejections as specific, fixable feedback.",
      ),
    ],
    P("proj-fitness", "Fitness and wellness app"),
  ),

  // ───────────────────────── Business management ─────────────────────────
  lesson(
    "biz-1",
    "specs",
    "Business management app, part 1: inventory, jobs and teams",
    "Model customers, jobs, inventory and staff roles for a small business tool.",
    "Small-business software wins by replacing a spreadsheet nobody trusts. Start with the one that hurts most.",
    [
      sc(
        "biz-1-a",
        2,
        "Where should a business tool start?",
        "A cleaning company wants invoices, payroll, scheduling, inventory and reporting.",
        [
          "Pick the biggest daily pain (for example scheduling jobs and staff), replace that spreadsheet first and expand.",
          "Solving one painful workflow earns trust and teaches you the real data.",
        ],
        [
          [
            "Build everything before anyone uses it.",
            "Without real use you will build the wrong things.",
          ],
          [
            "Copy a large competitor's feature list.",
            "Their product reflects years of customers you do not have.",
          ],
        ],
        "Replace one painful spreadsheet well before adding modules.",
      ),
      mt(
        "biz-1-b",
        2,
        "Who may see or do what?",
        [
          ["owner", "Owner"],
          ["manager", "Manager"],
          ["staff", "Staff"],
        ],
        {
          owner: ["Change roles and see all reports"],
          manager: ["Create and assign jobs"],
          staff: ["See and update only their own assigned jobs"],
        },
        "Role-based access is the heart of business software. Define roles first, then write the policies.",
      ),
      bug(
        "biz-1-c",
        3,
        "Tap the policy that lets staff see all customers' contact details.",
        "policies.sql",
        [
          "alter table customers enable row level security;",
          'create policy "staff read" on customers for select to authenticated using (true);',
          "-- staff should only see customers for jobs assigned to them",
        ],
        [1],
        "Any signed-in staff member can read every customer. Scope reads to customers linked to jobs assigned to the user, plus managers and owners.",
      ),
      sc(
        "biz-1-d",
        2,
        "Several people edit the same job. How do you avoid overwriting each other?",
        "Two managers update the notes at the same time.",
        [
          "Add a version column and reject updates based on a stale version, telling the user to refresh.",
          "Optimistic concurrency stops silent overwrites cheaply.",
        ],
        [
          ["Last save wins silently.", "Someone's work disappears without notice."],
          [
            "Lock the job for everyone while one person views it.",
            "Locks left behind block the whole team.",
          ],
        ],
        "Version checks give safe collaboration without heavy locking.",
      ),
      sq(
        "biz-1-e",
        2,
        "Order the data build.",
        [
          "organisations and members with roles",
          "customers and jobs owned by an organisation",
          "inventory items and stock movements",
          "RLS that scopes everything to the organisation and role",
          "Tests with two organisations proving nothing crosses over",
        ],
        "Multi-tenant apps put the organisation on every row and test that organisations cannot see each other.",
      ),
      sc(
        "biz-1-f",
        3,
        "Why a stock_movements table instead of a single quantity column?",
        "You track supplies used on jobs.",
        [
          "Movements record each change with who, when and why, so quantity is derived and every discrepancy can be traced.",
          "An audit trail beats a number that nobody can explain.",
        ],
        [
          ["A single number is simpler and enough.", "It cannot explain shrinkage or errors."],
          ["Count by hand each week and overwrite.", "Overwriting erases the evidence you need."],
        ],
        "An event log (a stock_movements table) makes inventory trustworthy because every change is explained and traceable.",
      ),
      wbk(
        "biz-1-g",
        2,
        "Complete the tenancy rule.",
        "Every row carries an {{a}} id, every policy checks the user's {{b}} in it, and tests use {{c}} organisations.",
        { a: "organisation", b: "membership", c: "two" },
        ["colour", "price", "one"],
        "Tenant isolation is only proven when two real tenants are tested against each other.",
      ),
    ],
    P("proj-business", "Business management app"),
  ),
  lesson(
    "biz-2",
    "backend",
    "Business management app, part 2: scheduling, files and reports",
    "Build job scheduling, document uploads and reports that stay fast and permission-correct.",
    "Real businesses live in schedules, photos of completed work and monthly reports.",
    [
      sc(
        "biz-2-a",
        2,
        "How do you schedule recurring jobs (weekly cleaning)?",
        "A customer wants every Tuesday.",
        [
          "Store the rule (frequency, weekday, start, end) and generate upcoming job rows ahead of time with a unique key per date.",
          "Generated rows are easy to assign and edit individually, and the unique key prevents duplicates.",
        ],
        [
          ["Create 500 future jobs by hand.", "Unmaintainable and error-prone."],
          [
            "Compute occurrences in the browser each time.",
            "Assignments and exceptions have nowhere to live.",
          ],
        ],
        "Separate the rule from the generated occurrences.",
      ),
      bug(
        "biz-2-b",
        3,
        "Tap the line that allows anyone with the link to read any job photo.",
        "storage.ts",
        [
          "const { data } = supabase.storage.from('job-photos').getPublicUrl(path);",
          "return data.publicUrl;",
        ],
        [0],
        "A public URL has no access control. Use a private bucket with policies tied to the organisation, and issue short-lived signed URLs.",
      ),
      sq(
        "biz-2-c",
        2,
        "Order a report that stays fast.",
        [
          "Decide the question the report answers",
          "Write a query that aggregates in the database",
          "Add indexes for the filters",
          "Limit the date range and paginate rows",
          "Cache the result briefly if many people open it",
        ],
        "Aggregation belongs in the database, and bounded ranges keep reports quick as data grows.",
      ),
      mt(
        "biz-2-d",
        2,
        "Do it now or in the background?",
        [
          ["now", "In the request"],
          ["bg", "Background job"],
        ],
        {
          now: ["Marking a job complete"],
          bg: ["Generating a 12-month PDF report", "Sending 200 reminder emails"],
        },
        "Quick, essential work happens in the request; slow or bulk work goes to a queue with retries.",
      ),
      sc(
        "biz-2-e",
        3,
        "A manager exports all customers to a spreadsheet. What should the app do?",
        "Exports could leak the whole customer list.",
        [
          "Allow it for authorised roles only, record it in the audit log and limit columns to what is needed.",
          "Bulk exports are a common data-leak path and deserve accountability.",
        ],
        [
          [
            "Allow any staff member to export everything.",
            "One unhappy employee could take the entire list.",
          ],
          ["Disable exports forever.", "Legitimate work needs exports; control them instead."],
        ],
        "Make powerful actions possible but accountable.",
      ),
      wbk(
        "biz-2-f",
        2,
        "Write the prompt.",
        "Add a signed-URL download for job photos that expires in {{a}} minutes, checks {{b}} membership and logs the {{c}}.",
        { a: "ten", b: "organisation", c: "access" },
        ["seven days", "nothing", "colour"],
        "Short-lived, membership-checked, logged access is the safe default for private files.",
      ),
      bug(
        "biz-2-g",
        2,
        "Tap the line that makes the dashboard slow.",
        "dashboard.ts",
        [
          "const jobs = await db.from('jobs').select('*');",
          "const total = jobs.data.filter((j) => j.status === 'done').length;",
          "return { total };",
        ],
        [0, 1],
        "It downloads every job to count some of them. Use a count query with a filter (and an index on status and organisation).",
      ),
    ],
    P("proj-business", "Business management app"),
  ),
  lesson(
    "biz-3",
    "shipping",
    "Business management app, part 3: onboarding, proof and support",
    "Verify tenant isolation, onboard the first customer organisation and plan support and backups.",
    "B2B trust is built in the first month: nothing leaks, nothing is lost, questions are answered.",
    [
      sq(
        "biz-3-a",
        3,
        "Order a tenant-isolation test.",
        [
          "Create organisation A and B with users in each",
          "Create customers and jobs in A",
          "As B, attempt to read, update and delete A's rows",
          "Expect every attempt to be refused or return nothing",
          "Run it in CI after every migration",
        ],
        "The test must run after every migration, because policy mistakes usually arrive with schema changes.",
      ),
      sc(
        "biz-3-b",
        2,
        "What should first-customer onboarding look like?",
        "A small company is about to switch from spreadsheets.",
        [
          "A guided import of their data with a preview, validation errors explained plainly and a way to undo.",
          "Migration is the riskiest moment; make it visible, reversible and kind.",
        ],
        [
          [
            "Ask them to email a spreadsheet and wait.",
            "Slow, manual and error-prone for both sides.",
          ],
          ["Import silently and hope.", "Unreported errors corrupt their records."],
        ],
        "Show a preview, validate every row with plain explanations and offer an undo so the first import is safe to try.",
      ),
      mt(
        "biz-3-c",
        2,
        "Which backup practice is real?",
        [
          ["real", "Real protection"],
          ["hope", "Hope"],
        ],
        {
          real: [
            "Automated backups plus a periodic restore test",
            "Point-in-time recovery for the database",
          ],
          hope: ["Backups never tested", "Copies stored in the same account as the originals only"],
        },
        "A backup you have never restored is a guess. Test restores on a schedule.",
      ),
      bug(
        "biz-3-d",
        2,
        "Tap the line that will cause a surprise outage.",
        "ci.yml",
        [
          "on: push",
          "jobs:",
          "  deploy:",
          "    steps:",
          "      - run: ./deploy-production.sh",
          "# no tests, no staging, no approval",
        ],
        [4, 5],
        "Every push deploys straight to production with no checks. Run tests first, deploy to staging and require approval for production.",
      ),
      sc(
        "biz-3-e",
        3,
        "A customer reports they cannot see yesterday's jobs. How do you investigate without breaking privacy?",
        "Support needs to see what they see.",
        [
          "Use an audited, read-only support view scoped to that organisation, with the customer's permission, and record the access.",
          "Support access should be limited, logged and consented.",
        ],
        [
          ["Log in with the customer's password.", "Never share or request passwords."],
          ["Give support full database access.", "Broad access invites mistakes and misuse."],
        ],
        "Support tooling must be least-privilege and audited.",
      ),
      wbk(
        "biz-3-f",
        2,
        "Complete the first-customer launch gate.",
        "Launch to the first customer when isolation tests pass, a {{a}} has been tested, the import has {{b}} and support access is {{c}}.",
        { a: "restore", b: "undo", c: "audited" },
        ["colour", "price", "public"],
        "A short, evidence-based gate keeps early customers from becoming test subjects.",
      ),
      sc(
        "biz-3-g",
        2,
        "How do you keep improving after launch?",
        "The first customer asks for five features.",
        [
          "Watch which workflow they use daily, ask what slows them and ship the smallest change that removes it.",
          "Real daily friction is the best roadmap.",
        ],
        [
          ["Build all five immediately.", "You will outrun your testing and quality."],
          ["Ignore feedback until a big redesign.", "You lose the trust early customers give you."],
        ],
        "Prioritise by daily pain and ship small, verified changes.",
      ),
    ],
    P("proj-business", "Business management app"),
  ),
];
