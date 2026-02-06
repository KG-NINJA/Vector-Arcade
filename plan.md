# PLAN: Stripe Review Pass (Codex CLI Optimized)

## OBJECTIVE
Pass Stripe account review for the Vector Arcade project
with the minimum required public pages and Stripe Dashboard settings.

This plan is optimized for:
- Codex CLI
- Deterministic execution
- Agent browser available
- GitHub Pages deployment

No backend, webhook, API integration, or redeem logic is required.

---

## GLOBAL RULES (STRICT)

- Operate in Stripe **LIVE MODE ONLY**
- Do NOT add subscriptions, webhooks, or custom code
- Do NOT mention rewards, earnings, or exchange value
- Stop execution immediately if a required URL returns non-200

---

## PHASE 1: Repository Preparation (Filesystem Tasks)

### TASK 1.1: Verify Required Files

Ensure the following files exist at repository root:

- privacy.html
- terms.html
- tokusho.html

If any file is missing:
→ CREATE it using minimal legal content (no placeholders).

---

### TASK 1.2: Validate Content (Minimal)

Each file MUST satisfy:
- `<title>` tag present
- Mentions "Vector Arcade"
- Mentions operator name "KGNINJA"
- Plain HTML, no JS required

Legal precision is NOT required.
Accessibility and clarity are required.

---

### TASK 1.3: Commit & Push

git status
git add privacy.html terms.html tokusho.html
git commit -m "Add legal pages for Stripe review"
git push origin main


---

### TASK 1.4: Verify GitHub Pages Deployment

Using agent browser or HTTP check, confirm:

- https://kg-ninja.github.io/Vector-Arcade/privacy.html
- https://kg-ninja.github.io/Vector-Arcade/terms.html
- https://kg-ninja.github.io/Vector-Arcade/tokusho.html

Each must return HTTP 200 and readable HTML.

If any returns 404 or redirect loop:
→ STOP.

---

## PHASE 2: Stripe Dashboard Configuration (Agent Browser Tasks)

⚠️ Switch to **LIVE MODE**  
(toggle "View test data" OFF)

---

### TASK 2.1: Business Information

Navigate to:
Settings → Business → Business Information

Set EXACT values:

- Business name:
KGNINJA


- Business description:
This service provides a browser-based arcade experience.
Users purchase virtual coins to access gameplay time.
No prizes, no gambling, no refunds.


- Business type:
- Individual

- Country:
- Japan

Save changes.

---

### TASK 2.2: Public Legal URLs

In the same section, set:

- Privacy Policy:
https://kg-ninja.github.io/Vector-Arcade/privacy.html


- Terms of Service:
https://kg-ninja.github.io/Vector-Arcade/terms.html


- Legal Disclosure (Japan):
https://kg-ninja.github.io/Vector-Arcade/tokusho.html


Save changes.

If Stripe reports URL validation error:
→ STOP and fix URLs.

---

### TASK 2.3: Branding

Navigate:
Settings → Branding

Set:

- Public business name:
KGNINJA / Vector Arcade


- Logo:
Optional (skip if unavailable)

Save changes.

Goal:
Avoid "GitHub Pages" or ambiguous payer display in Checkout.

---

## PHASE 3: Payment Link Creation (Review Trigger)

Navigate:
Payments → Payment Links → Create

---

### TASK 3.1: Create Payment Link

Set EXACT values:

- Payment type:
- One-time payment

- Product name:
Vector Arcade Coins


- Description:
Virtual coins for browser-based arcade experience.
No prizes. No refunds.


- Price:
- JPY 100–300

- Quantity:
- Fixed (1)

Create and save the Payment Link.

This action triggers Stripe automated review.

---

## PHASE 4: Idle State (Important)

After Payment Link creation:

- Do NOT add webhooks
- Do NOT modify business category
- Do NOT add additional products
- Do NOT test excessive payments

Stripe review runs automatically.

---

## PHASE 5: Clarification Response (If Required)

If Stripe sends a review inquiry email, respond EXACTLY with:

This service provides a browser-based arcade experience.
Users purchase virtual coins only to access gameplay time.
No prizes, no gambling, no refunds, and no transferable value.
All payments are handled by Stripe Checkout.


No additional explanation required.

---

## SUCCESS CONDITIONS

Stripe review is considered successful when:

- Live payments are enabled
- No blocking warnings appear in Dashboard
- Payment Link remains active

---

## TERMINATION CONDITIONS

Immediately stop if:
- Stripe flags restricted business category
- Any legal URL becomes inaccessible
- Business description is rejected

End of plan.