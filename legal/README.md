# Legal pages — draft

`policies.html` is a single self-contained page covering the Privacy Policy, Terms of Service, and Refund/Cancellation Policy for Realtime AI Translator. Everything in it is grounded in what the app actually does (see the code it's based on — the retention sweep, `settings.mjs`'s `plan`/`razorpay_subscription_*` fields, `billing.mjs`'s cancel-at-cycle-end behavior, the third-party processors actually wired up).

**Not ready to publish yet.** Every field shown with a dashed amber border (`[Your business or legal name]`, `support@yourdomain.com`, etc.) is a placeholder — search the file for `class="fill"` to find them all. Fill in:

1. Your business/legal name (or your own name, if publishing as an individual)
2. A support contact email
3. A grievance-officer name + address (India's IT Rules 2021 — §7 of the Privacy Policy)
4. The effective date
5. Confirm or change the refund stance in §3 of the Refund Policy — as written it matches exactly what the cancel-subscription code does (cancel-at-cycle-end, no proration), not a made-up policy

**Where this lives:**
- Live draft: see the Artifact link shared in chat — edit there and republish, or edit this file and ask for a republish.
- This file — same content, version-controlled, ready to self-host (GitHub Pages, your own domain, etc.) once finalized. Whichever URL you settle on, that's what goes into the Play Store listing, the app's Settings screen, and Razorpay's merchant profile.
