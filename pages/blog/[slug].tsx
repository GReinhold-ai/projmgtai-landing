// pages/blog/[slug].tsx
// ProjMgtAI Blog — individual post pages
import Head from "next/head";
import { useRouter } from "next/router";

interface Post {
  title: string;
  metaDescription: string;
  date: string;
  sections: { heading?: string; body: string }[];
  cta: { heading: string; body: string };
}

const posts: Record<string, Post> = {

  "missing-scope-construction": {
    title: "Why Construction Bids Miss Scope (And How to Catch It)",
    metaDescription: "Most construction bids miss scope — not on price. Learn where scope gaps hide in architectural plan sets and how millwork contractors can catch them before bid day.",
    date: "March 2026",
    sections: [
      {
        body: `Most construction bids don't fail because of pricing. They fail because of missing scope.

A millwork contractor submits a number based on what they can see in the drawings. But architectural plan sets — even well-drawn ones — routinely leave things out, bury details across disconnected sheets, or contradict themselves between elevations and floor plans.

By the time the gap shows up, it's during installation. The RFIs start. The change orders follow. Margin disappears.`
      },
      {
        heading: "Where scope hides in a typical plan set",
        body: `After analyzing dozens of commercial millwork plan sets, the most common scope gaps fall into five categories:

1. Hardware not specified. The cabinet sections are drawn. The hardware schedule references a code. The code is never defined in the drawings. The estimator guesses — or omits.

2. Missing backing and blocking. Architectural drawings show what goes on the wall. They rarely show what needs to go inside the wall first. Blocking for a 200-pound millwork assembly doesn't appear in the casework sheets — it's buried in a structural note on a sheet the millwork contractor never sees.

3. Conflicts between plan view and elevation. The floor plan shows a 10-foot cabinet run. The interior elevation shows 8 feet. One of them is wrong. The estimator picks one, often without flagging it.

4. Incomplete finish schedules. Material codes reference a finish legend. The finish legend is on a separate sheet. The sheet wasn't included in the bid set. The estimator leaves the material field blank and moves on.

5. Scope not clearly assigned. "By millwork contractor" vs "by GC" vs "by owner" — often left ambiguous. The millwork contractor assumes it's not their scope. So does the GC. Nobody prices it. It shows up as a change order.`
      },
      {
        heading: "Why this keeps happening",
        body: `Architectural drawings are designed to communicate design intent — not to define construction scope. The people who draw them aren't bidding the job. The people bidding the job are working under time pressure across a 50-page set, trying to extract a complete scope in a few hours.

The math doesn't work. A careful estimator on a complex millwork job might find 85–90% of the scope. The other 10–15% is the job's risk profile.`
      },
      {
        heading: "How to catch it before bid day",
        body: `The answer isn't reading faster — it's reading differently. A structured review process that specifically looks for these five gap types, on every project, every time:

- Cross-reference every hardware callout against the hardware schedule
- Flag every dimension that appears on one sheet but not the other
- Identify every "by others" notation and confirm responsibility in writing
- Check that every material code in the casework sheets appears in the finish legend
- Verify blocking requirements are covered, either in scope or in a formal exclusion

This is tedious to do manually. It's exactly what AI is well-suited for — reading every page, flagging every gap, generating a structured RFI log before the bid goes out.`
      },
      {
        heading: "What a structured plan review looks like in practice",
        body: `On a recent 24 Hour Fitness project, an automated review of a 100-page plan set identified 30 RFIs before bid day — missing dimensions, undefined material codes, scope exclusions that needed confirmation, and sheet references that pointed to details not included in the bid set.

A human estimator working the same set found most of the same items. But not all of them. And it took 6 hours instead of 2 minutes.

That's the gap worth closing.`
      },
    ],
    cta: {
      heading: "See what's missing in your plan set",
      body: "Upload your millwork plan set and get a complete scope extraction with auto-generated RFI log in under 2 minutes. Free to try.",
    }
  },

  "rfi-examples-construction": {
    title: "Top RFIs That Should Be Caught Before Bidding",
    metaDescription: "The most common RFIs in millwork construction — and how to catch them before bid day. Missing hardware specs, undefined dimensions, blocking requirements, and more.",
    date: "March 2026",
    sections: [
      {
        body: `RFIs are supposed to clarify design intent. In practice, most construction RFIs exist because something was missing or ambiguous in the original drawings — and nobody caught it before the job started.

For millwork contractors, the cost of a field RFI isn't just the paperwork. It's the crew standing by, the fabrication schedule disrupted, and the change order negotiation that follows. Every RFI that reaches the field is a scope gap that should have been caught at bid.`
      },
      {
        heading: "The most common millwork RFIs — and where they come from",
        body: `After reviewing dozens of commercial millwork plan sets, these are the RFI categories that appear most consistently:

1. Missing hardware specifications
The plan shows a cabinet with doors. The hardware schedule says "concealed hinge — see spec." The spec section isn't in the bid set. What hinge? What quantity? The estimator guesses or omits. The installer guesses or waits.

2. Undefined cabinet dimensions
Interior elevations show cabinet sections with section labels (18A, 4B, etc.) but no dimension strings. The dimensions are on a separate detail sheet — which wasn't issued with the bid set. The estimator builds to a standard size. The custom dimension shows up at installation.

3. Conflicting wall conditions
The floor plan shows a 12-foot continuous wall available for millwork. The structural drawings show a column at 8 feet that wasn't reflected in the architectural set. The cabinet run doesn't fit.

4. Missing blocking and backing requirements
A heavy wall-mounted cabinet assembly needs blocking. The casework drawings don't specify it. The structural drawings reference it on a sheet labeled "interior partitions" that the millwork contractor never received. Change order.

5. Finish inconsistencies
The material legend shows PL-01 as the cabinet finish. Three cabinet sections in the Team Room reference WC-4B. WC-4B isn't in the legend. The estimator picks a finish. It's wrong.

6. Scope boundary ambiguity
"Millwork by others — coordinate with GC." What does that mean? The GC thinks the millwork contractor is pricing it. The millwork contractor thinks it's excluded. Nobody prices it.`
      },
      {
        heading: "The cost of a field RFI vs a pre-bid RFI",
        body: `A pre-bid RFI — sent during the bid period — costs almost nothing. The architect answers it. The estimator updates the number. The job gets bid accurately.

A field RFI costs: crew downtime, fabrication rework, schedule extension, and a change order negotiation where the contractor is in a weak position because the work is already half-done.

The difference between the two is when the question gets asked. Structured plan review at bid time is what moves the question from the field to the desk.`
      },
      {
        heading: "How many RFIs are typical in a millwork bid set?",
        body: `On a standard commercial millwork project — fitness center, restaurant, office buildout — a thorough review of the plan set typically surfaces 15–40 legitimate RFIs before bid day. Most of these are never formally asked. The estimator makes assumptions, prices to the assumption, and the assumption is wrong.

The projects where those assumptions surface as change orders are the ones that kill margin.`
      },
      {
        heading: "Automating the RFI catch",
        body: `The same information that a human estimator uses to generate an RFI — a cross-reference between sheet references, dimension strings, material codes, and hardware schedules — can be read systematically by AI across every page of a plan set in minutes.

The output is a structured RFI log: category, priority, room, description, reference. Every gap documented before the bid goes out. Every assumption converted into a question.`
      },
    ],
    cta: {
      heading: "Generate your RFI log before bid day",
      body: "Upload your plan set and get a structured RFI log with missing dimensions, undefined materials, scope exclusions, and sheet reference gaps — automatically. Free to try.",
    }
  },

  "millwork-estimating-checklist": {
    title: "Millwork Estimating Checklist: What Experienced Estimators Check Before Submitting",
    metaDescription: "A complete pre-bid checklist for millwork contractors. Hardware, blocking, ADA, dimensions, material specs, and scope exclusions — what to check before every bid.",
    date: "March 2026",
    sections: [
      {
        body: `Experienced millwork estimators don't just read plans — they check plans. There's a difference. Reading is passive. Checking is systematic: looking for specific things in a specific order, every time, regardless of how tight the schedule is.

This is the checklist. Print it. Use it on every bid.`
      },
      {
        heading: "1. Scope inventory — what's in, what's out",
        body: `□ Every room with millwork scope identified and listed
□ Every "by others" / "NIC" / "by GC" notation found and documented
□ Scope boundary ambiguities flagged as RFIs before bid submission
□ Vendor-supplied items (lockers, benches, fixtures) confirmed as supply-only or supply-and-install
□ ADA-required items identified (grab bar blocking, knee-space clearances, accessible countertop heights)`
      },
      {
        heading: "2. Dimensions — cross-reference across sheets",
        body: `□ Every cabinet section has a width dimension — either extracted from elevation or noted from plan
□ All plan-view dimensions reconciled against elevation dimensions (conflicts = RFI)
□ Countertop runs measured and confirmed against floor plan dimensions
□ Cabinet heights confirmed against reflected ceiling plan (conflicts at HVAC, sprinklers, soffits)
□ Depth dimensions confirmed — standard 24" base, 12" upper, or custom per spec
□ All dimension strings in imperial converted to consistent units for takeoff`
      },
      {
        heading: "3. Materials — verify every code",
        body: `□ Every material code in casework sheets (PL-01, SS-1B, WC-4B, etc.) appears in the finish legend
□ Every material code in the finish legend has a manufacturer, product name, and catalog number
□ Solid surface / stone countertop materials confirmed with color/pattern specification
□ FRP panel material codes confirmed (WC-4A, WC-4B) with height and waterproofing requirements
□ Rubber base material code confirmed with color and profile type
□ Missing material codes flagged as RFIs`
      },
      {
        heading: "4. Hardware — the most commonly missed category",
        body: `□ Hardware schedule located and confirmed complete
□ Every cabinet type matched to a hardware specification (concealed hinge, drawer slide, pull, lock)
□ Hinge quantities calculated (doors × hinges per door)
□ Drawer slide quantities confirmed
□ Lock cylinder quantities confirmed — especially file drawers and secure storage
□ Grommet quantities confirmed for desktop cable management
□ Piano hinge vs concealed hinge confirmed per detail
□ ADA hardware requirements confirmed (lever pulls, accessible hardware)`
      },
      {
        heading: "5. Blocking and substrate — what's behind the wall",
        body: `□ Blocking requirements for wall-mounted cabinets identified and assigned (millwork or GC)
□ FRP panel backing (plywood substrate) confirmed in scope
□ Handrail blocking confirmed if handrails are in millwork scope
□ TV/monitor mount blocking confirmed if in millwork scope
□ Blocking specifications (size, species, treatment) confirmed where heavy loads are involved`
      },
      {
        heading: "6. Sheet completeness — is the set complete?",
        body: `□ All casework detail sheets referenced in the floor plan are included in the bid set
□ All interior elevation sheets for rooms with millwork are included
□ Hardware schedule sheet is included
□ Finish schedule / material legend sheet is included
□ Any addenda issued after original bid set are included and reviewed
□ Any RFIs or clarifications issued during bid period are incorporated`
      },
      {
        heading: "7. Pre-submission RFI log",
        body: `□ All flagged items compiled into a formal RFI log
□ Every RFI assigned a category: Missing Scope / Missing Dimension / Missing Material / Scope Exclusion / Sheet Reference
□ RFI log submitted to GC with bid or held for post-award clarification (document the choice)
□ Assumptions made in the absence of RFI responses documented in the bid cover letter`
      },
    ],
    cta: {
      heading: "Run this checklist automatically on your next bid",
      body: "ProjMgtAI reads your plan set and generates a complete scope extraction, RFI log, and bid checklist in under 2 minutes. Free to try.",
    }
  },

};

export default function BlogPost() {
  const router = useRouter();
  const { slug } = router.query;
  const post = posts[slug as string];

  if (!post) return (
    <div style={{ padding: 40, fontFamily: "system-ui, sans-serif", textAlign: "center", color: "#64748b" }}>
      Loading...
    </div>
  );

  return (
    <>
      <Head>
        <title>{post.title} — ProjMgtAI</title>
        <meta name="description" content={post.metaDescription} />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.metaDescription} />
        <meta property="og:type" content="article" />
        <link rel="canonical" href={`https://projmgt.ai/blog/${slug}`} />
      </Head>
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "60px 24px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1e293b", lineHeight: 1.7 }}>

        {/* Nav */}
        <div style={{ display: "flex", gap: 16, marginBottom: 48, fontSize: 13, color: "#94a3b8" }}>
          <a href="/" style={{ color: "#94a3b8", textDecoration: "none" }}>projmgt.ai</a>
          <span>›</span>
          <a href="/blog" style={{ color: "#94a3b8", textDecoration: "none" }}>Blog</a>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 8, fontSize: 12, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{post.date}</div>
        <h1 style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.2, marginBottom: 40, color: "#0f172a" }}>{post.title}</h1>

        {/* Sections */}
        {post.sections.map((section, i) => (
          <div key={i} style={{ marginBottom: 32 }}>
            {section.heading && (
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: "#0f172a" }}>{section.heading}</h2>
            )}
            {section.body.split("\n\n").map((para, j) => (
              <p key={j} style={{ marginBottom: 16, fontSize: 16, color: "#334155", whiteSpace: "pre-line" }}>{para}</p>
            ))}
          </div>
        ))}

        {/* CTA */}
        <div style={{ marginTop: 56, padding: "36px 40px", background: "#f0f9ff", borderRadius: 16, border: "1px solid #bae6fd" }}>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 10, color: "#0c4a6e" }}>{post.cta.heading}</div>
          <p style={{ fontSize: 15, color: "#0369a1", marginBottom: 24, lineHeight: 1.6 }}>{post.cta.body}</p>
          <a href="/scope-extractor"
            style={{ display: "inline-block", padding: "14px 28px", background: "#0ea5e9", color: "#fff", borderRadius: 8, fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
            Try Scope Extractor Free →
          </a>
        </div>

        {/* Footer nav */}
        <div style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid #e2e8f0" }}>
          <a href="/blog" style={{ fontSize: 14, color: "#64748b", textDecoration: "none" }}>← All articles</a>
        </div>

      </main>
    </>
  );
}
